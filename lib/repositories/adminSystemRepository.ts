import "server-only";
import type { DbExecutor } from "@/lib/db";
import {
  escapeLikePattern,
  executeStatement,
  queryOne,
  queryRows,
  withTransaction,
} from "@/lib/db";
import { normalizeBranch, normalizeNumber } from "@/lib/commerce";
import type {
  AdminSystemArticleRecord,
  AdminSystemLookupOption,
  AdminSystemSummary,
} from "@/lib/admin-system";

const WEB_BLOCKED_ARTICLES_TABLE = "dbo_WEB_V_MA_ARTICULOS_BLOQUEADOS";

declare global {
  var __diezDeportesAdminSystemSchemaReady: Promise<void> | undefined;
}

type RawArticleRow = {
  ID: number;
  IDARTICULO: string;
  DESCRIPCION: string;
  CODIGOBARRA: string | null;
  CODIGOARTPROVEEDOR: string | null;
  RUTAIMAGEN: string | null;
  IDUNIDAD: string | null;
  UNIDAD_DESCRIPCION: string | null;
  IDRUBRO: string | null;
  RUBRO_DESCRIPCION: string | null;
  IDTIPO: string | null;
  TIPO_DESCRIPCION: string | null;
  PRECIO1: number | null;
  COSTO: number | null;
  TASAIVA: number | null;
  CUENTAPROVEEDOR: string | null;
  EXENTO: number | boolean | null;
  PESABLE: number | boolean | null;
  SUSPENDIDO: number | boolean | null;
  SUSPENDIDOV: number | boolean | null;
  WEB_BLOQUEADO: number | boolean | null;
  STOCKACTUAL: number | null;
};

type RawLookupRow = {
  VALUE: string | null;
  CODE: string | null;
  LABEL: string | null;
};

type RawSummaryRow = {
  ARTICLE_COUNT: number | null;
  BLOCKED_COUNT: number | null;
  BRAND_COUNT: number | null;
  CATEGORY_COUNT: number | null;
};

type RawDepositRow = {
  VALUE: string | null;
  LABEL: string | null;
};

type RawCountRow = {
  TOTAL_COUNT: number | null;
};

type RawStockRow = {
  STOCKACTUAL: number | null;
};

type RawArticleWriteRow = {
  IDARTICULO: string;
  DESCRIPCION: string;
  IDUNIDAD: string | null;
  COSTO: number | null;
  PRECIO1: number | null;
  CUENTAPROVEEDOR: string | null;
};

type AdminSystemArticleSortMode = "default" | "stock_asc";

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function mapLookupRow(row: RawLookupRow): AdminSystemLookupOption {
  return {
    value: row.VALUE || "",
    code: normalizeText(row.CODE),
    label: normalizeText(row.LABEL),
  };
}

function mapArticleRow(row: RawArticleRow): AdminSystemArticleRecord {
  return {
    id: Number(row.ID || 0),
    code: normalizeText(row.IDARTICULO),
    description: normalizeText(row.DESCRIPCION),
    barcode: normalizeText(row.CODIGOBARRA) || null,
    supplierProductCode: normalizeText(row.CODIGOARTPROVEEDOR) || null,
    imagePath: normalizeText(row.RUTAIMAGEN) || null,
    unitId: row.IDUNIDAD || "",
    unitLabel: normalizeText(row.UNIDAD_DESCRIPCION) || null,
    brandId: row.IDTIPO || "",
    brandName: normalizeText(row.TIPO_DESCRIPCION),
    categoryId: row.IDRUBRO || "",
    categoryName: normalizeText(row.RUBRO_DESCRIPCION),
    price: Number(row.PRECIO1 || 0),
    cost: Number(row.COSTO || 0),
    taxRate: Number(row.TASAIVA || 0),
    supplierAccount: normalizeText(row.CUENTAPROVEEDOR),
    exempt: Boolean(row.EXENTO),
    weighable: Boolean(row.PESABLE),
    suspended: Boolean(row.SUSPENDIDO),
    suspendedForSales: Boolean(row.SUSPENDIDOV),
    webBlocked: Boolean(row.WEB_BLOQUEADO),
    stock: Number(row.STOCKACTUAL || 0),
  };
}

function buildArticleFromSql() {
  return `
    FROM dbo_V_MA_ARTICULOS a
    LEFT JOIN (
      SELECT
        TRIM(IDArticulo) AS IDArticulo,
        SUM(COALESCE(CantidadUD, 0)) AS StockActual
      FROM dbo_V_MV_Stock
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (:depositId IS NULL OR TRIM(COALESCE(IdDeposito, '')) = TRIM(:depositId))
      GROUP BY TRIM(IDArticulo)
    ) s
      ON s.IDArticulo = TRIM(a.IDARTICULO)
    LEFT JOIN dbo_V_TA_TipoArticulo t
      ON TRIM(t.IdTipo) = TRIM(a.IDTIPO)
    LEFT JOIN dbo_V_TA_Rubros r
      ON TRIM(r.IdRubro) = TRIM(a.IDRUBRO)
    LEFT JOIN dbo_V_TA_Unidad u
      ON TRIM(u.IdUnidad) = TRIM(a.IDUNIDAD)
    LEFT JOIN ${WEB_BLOCKED_ARTICLES_TABLE} wb
      ON TRIM(wb.IDARTICULO) = TRIM(a.IDARTICULO)
  `;
}

function buildArticleColumnsSql() {
  return `
    a.ID,
    a.IDARTICULO,
    a.DESCRIPCION,
    a.CODIGOBARRA,
    a.CodigoArtProveedor AS CODIGOARTPROVEEDOR,
    a.RutaImagen AS RUTAIMAGEN,
    a.IDUNIDAD,
    u.Descripcion AS UNIDAD_DESCRIPCION,
    a.IDRUBRO,
    r.Descripcion AS RUBRO_DESCRIPCION,
    a.IDTIPO,
    t.Descripcion AS TIPO_DESCRIPCION,
    COALESCE(a.PRECIO1, 0) AS PRECIO1,
    COALESCE(a.COSTO, 0) AS COSTO,
    COALESCE(a.TasaIVA, 0) AS TASAIVA,
    a.CUENTAPROVEEDOR,
    COALESCE(a.Exento, 0) AS EXENTO,
    COALESCE(a.Pesable, 0) AS PESABLE,
    COALESCE(a.SUSPENDIDO, 0) AS SUSPENDIDO,
    COALESCE(a.SuspendidoV, 0) AS SUSPENDIDOV,
    CASE WHEN wb.ID IS NULL THEN 0 ELSE 1 END AS WEB_BLOQUEADO,
    COALESCE(s.StockActual, 0) AS STOCKACTUAL
  `;
}

function buildAdminSystemArticlesQueryParts(input: {
  query?: string | null;
  sort?: AdminSystemArticleSortMode;
}) {
  const whereClauses = ["1 = 1"];
  const orderClauses: string[] = [];
  const params: Record<string, unknown> = {};
  const sortMode = input.sort || "default";
  const normalizedQuery = normalizeText(input.query);

  if (normalizedQuery) {
    const searchTokens = normalizedQuery
      .split(/\s+/)
      .map((token) => normalizeText(token))
      .filter(Boolean)
      .slice(0, 8);

    params.rawQuery = normalizedQuery;
    params.rawPrefix = `${normalizedQuery}%`;
    params.rawContains = `%${escapeLikePattern(normalizedQuery)}%`;

    for (const [index, token] of searchTokens.entries()) {
      const tokenParam = `token${index}`;
      params[tokenParam] = `%${escapeLikePattern(token)}%`;
      whereClauses.push(`
        (
          TRIM(a.IDARTICULO) LIKE :${tokenParam} ESCAPE '\\'
          OR TRIM(COALESCE(a.CODIGOBARRA, '')) LIKE :${tokenParam} ESCAPE '\\'
          OR TRIM(COALESCE(a.CodigoArtProveedor, '')) LIKE :${tokenParam} ESCAPE '\\'
          OR COALESCE(a.DESCRIPCION, '') LIKE :${tokenParam} ESCAPE '\\'
          OR COALESCE(t.Descripcion, '') LIKE :${tokenParam} ESCAPE '\\'
          OR COALESCE(r.Descripcion, '') LIKE :${tokenParam} ESCAPE '\\'
        )
      `);
    }

    orderClauses.push(`
      CASE
        WHEN TRIM(a.IDARTICULO) = :rawQuery THEN 0
        WHEN TRIM(COALESCE(a.CODIGOBARRA, '')) = :rawQuery THEN 1
        WHEN TRIM(COALESCE(a.CodigoArtProveedor, '')) = :rawQuery THEN 2
        WHEN COALESCE(a.DESCRIPCION, '') LIKE :rawPrefix THEN 3
        WHEN COALESCE(t.Descripcion, '') LIKE :rawPrefix THEN 4
        WHEN COALESCE(r.Descripcion, '') LIKE :rawPrefix THEN 5
        WHEN COALESCE(a.DESCRIPCION, '') LIKE :rawContains ESCAPE '\\' THEN 6
        WHEN COALESCE(t.Descripcion, '') LIKE :rawContains ESCAPE '\\' THEN 7
        WHEN COALESCE(r.Descripcion, '') LIKE :rawContains ESCAPE '\\' THEN 8
        ELSE 9
      END
    `);
    orderClauses.push("CHAR_LENGTH(TRIM(COALESCE(a.DESCRIPCION, ''))) ASC");
  }

  if (sortMode === "stock_asc") {
    orderClauses.push("COALESCE(s.StockActual, 0) ASC");
    orderClauses.push("a.DESCRIPCION ASC");
    orderClauses.push("a.ID DESC");
  } else {
    orderClauses.push("CASE WHEN wb.ID IS NULL THEN 0 ELSE 1 END DESC");
    orderClauses.push("a.DESCRIPCION ASC");
    orderClauses.push("a.ID DESC");
  }

  return {
    whereClause: whereClauses.join(" AND "),
    orderClause: orderClauses.join(",\n      "),
    params,
  };
}

async function ensureBlockedArticleIndex(executor?: DbExecutor) {
  const indexRow = await queryOne<{ index_name: string }>(
    `
      SELECT index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = :tableName
        AND index_name = 'IX_WEB_V_MA_ARTICULOS_BLOQUEADOS_IDARTICULO'
      LIMIT 1;
    `,
    { tableName: WEB_BLOCKED_ARTICLES_TABLE },
    executor,
  );

  if (indexRow) {
    return;
  }

  try {
    await executeStatement(
      `ALTER TABLE ${WEB_BLOCKED_ARTICLES_TABLE} ADD UNIQUE KEY IX_WEB_V_MA_ARTICULOS_BLOQUEADOS_IDARTICULO (IDARTICULO);`,
      undefined,
      executor,
    );
  } catch {
    // Ignore duplicate/index creation races.
  }
}

async function resolveCanonicalDepositId(
  depositId: string,
  executor?: DbExecutor,
) {
  const row = await queryOne<{ IDDEPOSITO: string | null }>(
    `
      SELECT IdDeposito AS IDDEPOSITO
      FROM dbo_V_TA_DEPOSITO
      WHERE TRIM(IdDeposito) = TRIM(:depositId)
      ORDER BY IdDeposito
      LIMIT 1;
    `,
    { depositId: normalizeText(depositId) },
    executor,
  );

  const canonical = row?.IDDEPOSITO || null;

  if (!canonical) {
    throw new Error(`No se encontro el deposito ${normalizeText(depositId)}.`);
  }

  return canonical;
}

async function resolveCanonicalStockReasonId(
  reasonId: string,
  executor?: DbExecutor,
) {
  const row = await queryOne<{ IDMOTIVOSTOCK: string | null }>(
    `
      SELECT IdMotivoStock AS IDMOTIVOSTOCK
      FROM dbo_V_TA_MotivoStock
      WHERE TRIM(IdMotivoStock) = TRIM(:reasonId)
      ORDER BY IdMotivoStock
      LIMIT 1;
    `,
    { reasonId: normalizeText(reasonId) },
    executor,
  );

  const canonical = row?.IDMOTIVOSTOCK || null;

  if (!canonical) {
    throw new Error(`No se encontro el motivo de stock ${normalizeText(reasonId)}.`);
  }

  return canonical;
}

async function getNextStockMovementComprobante(input: {
  tc: string;
  branch?: string | null;
  executor?: DbExecutor;
}) {
  const branch = normalizeBranch(input.branch || "0");
  const row = await queryOne<{ NEXT_NUMBER: number | null }>(
    `
      SELECT
        COALESCE(
          MAX(
            CASE
              WHEN TRIM(COALESCE(TC, '')) = TRIM(:tc)
                AND CHAR_LENGTH(TRIM(COALESCE(IDCOMPROBANTE, ''))) >= 12
                AND SUBSTRING(TRIM(IDCOMPROBANTE), 1, 4) = :branch
                AND SUBSTRING(TRIM(IDCOMPROBANTE), 5, 8) REGEXP '^[0-9]+$'
              THEN CAST(SUBSTRING(TRIM(IDCOMPROBANTE), 5, 8) AS UNSIGNED)
              ELSE 0
            END
          ),
          0
        ) + 1 AS NEXT_NUMBER
      FROM dbo_V_MV_Stock;
    `,
    {
      tc: input.tc,
      branch,
    },
    input.executor,
  );

  return `${branch}${normalizeNumber(Number(row?.NEXT_NUMBER || 1))}`;
}

async function getArticleForWrite(articleCode: string, executor?: DbExecutor) {
  return queryOne<RawArticleWriteRow>(
    `
      SELECT
        IDARTICULO,
        DESCRIPCION,
        IDUNIDAD,
        COSTO,
        PRECIO1,
        CUENTAPROVEEDOR
      FROM dbo_V_MA_ARTICULOS
      WHERE TRIM(IDARTICULO) = TRIM(:articleCode)
      LIMIT 1;
    `,
    { articleCode: normalizeText(articleCode) },
    executor,
  );
}

export async function ensureSchema() {
  if (global.__diezDeportesAdminSystemSchemaReady) {
    return global.__diezDeportesAdminSystemSchemaReady;
  }

  global.__diezDeportesAdminSystemSchemaReady = (async () => {
    await executeStatement(`
      CREATE TABLE IF NOT EXISTS ${WEB_BLOCKED_ARTICLES_TABLE} (
        ID BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        IDARTICULO VARCHAR(50) NOT NULL,
        MOTIVO VARCHAR(250) NULL,
        USUARIO VARCHAR(80) NULL,
        FECHA_BLOQUEO DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await ensureBlockedArticleIndex();
  })().catch((error) => {
    global.__diezDeportesAdminSystemSchemaReady = undefined;
    throw error;
  });

  return global.__diezDeportesAdminSystemSchemaReady;
}

export async function listAdminSystemArticles(input: {
  query?: string | null;
  depositId?: string | null;
  limit?: number | null;
  sort?: AdminSystemArticleSortMode;
}) {
  const page = await listAdminSystemArticlesPage({
    query: input.query,
    depositId: input.depositId,
    page: 1,
    pageSize:
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? input.limit
        : 80,
    sort: input.sort,
  });

  return page.items;
}

export async function listAdminSystemArticlesPage(input: {
  query?: string | null;
  depositId?: string | null;
  page?: number | null;
  pageSize?: number | null;
  sort?: AdminSystemArticleSortMode;
}) {
  await ensureSchema();
  const requestedPage =
    typeof input.page === "number" && Number.isFinite(input.page)
      ? Math.max(1, Math.trunc(input.page))
      : 1;
  const safePageSize =
    typeof input.pageSize === "number" && Number.isFinite(input.pageSize)
      ? Math.max(1, Math.min(200, Math.trunc(input.pageSize)))
      : 100;
  const queryParts = buildAdminSystemArticlesQueryParts(input);
  const countRow = await queryOne<RawCountRow>(
    `
      SELECT COUNT(*) AS TOTAL_COUNT
      ${buildArticleFromSql()}
      WHERE ${queryParts.whereClause};
    `,
    {
      depositId: input.depositId || null,
      ...queryParts.params,
    },
  );
  const totalCount = Number(countRow?.TOTAL_COUNT || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const rows = await queryRows<RawArticleRow>(
    `
      SELECT
        ${buildArticleColumnsSql()}
      ${buildArticleFromSql()}
      WHERE ${queryParts.whereClause}
      ORDER BY
        ${queryParts.orderClause}
      LIMIT :limit OFFSET :offset;
    `,
    {
      depositId: input.depositId || null,
      limit: safePageSize,
      offset,
      ...queryParts.params,
    },
  );

  return {
    items: rows.map(mapArticleRow),
    totalCount,
    currentPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function getAdminSystemArticleByCode(
  articleCode: string,
  depositId?: string | null,
) {
  await ensureSchema();
  const row = await queryOne<RawArticleRow>(
    `
      SELECT
        ${buildArticleColumnsSql()}
      ${buildArticleFromSql()}
      WHERE TRIM(a.IDARTICULO) = TRIM(:articleCode)
      LIMIT 1;
    `,
    {
      articleCode: normalizeText(articleCode),
      depositId: depositId || null,
    },
  );

  return row ? mapArticleRow(row) : null;
}

export async function getAdminSystemSummary(
  preferredDepositId?: string | null,
): Promise<AdminSystemSummary> {
  await ensureSchema();
  const [summaryRow, depositRow] = await Promise.all([
    queryOne<RawSummaryRow>(`
      SELECT
        COUNT(*) AS ARTICLE_COUNT,
        (SELECT COUNT(*) FROM ${WEB_BLOCKED_ARTICLES_TABLE}) AS BLOCKED_COUNT,
        (SELECT COUNT(*) FROM dbo_V_TA_TipoArticulo) AS BRAND_COUNT,
        (SELECT COUNT(*) FROM dbo_V_TA_Rubros) AS CATEGORY_COUNT
      FROM dbo_V_MA_ARTICULOS;
    `),
    queryOne<RawDepositRow>(
      `
        SELECT
          IdDeposito AS VALUE,
          Descripcion AS LABEL
        FROM dbo_V_TA_DEPOSITO
        WHERE :preferredDepositId IS NULL
           OR TRIM(IdDeposito) = TRIM(:preferredDepositId)
        ORDER BY
          CASE
            WHEN :preferredDepositId IS NOT NULL
             AND TRIM(IdDeposito) = TRIM(:preferredDepositId)
            THEN 0
            ELSE 1
          END,
          IdDeposito
        LIMIT 1;
      `,
      { preferredDepositId: preferredDepositId || null },
    ),
  ]);

  return {
    articleCount: Number(summaryRow?.ARTICLE_COUNT || 0),
    blockedArticleCount: Number(summaryRow?.BLOCKED_COUNT || 0),
    brandCount: Number(summaryRow?.BRAND_COUNT || 0),
    categoryCount: Number(summaryRow?.CATEGORY_COUNT || 0),
    defaultDepositId: depositRow?.VALUE || "",
    defaultDepositLabel: normalizeText(depositRow?.LABEL) || null,
  };
}

export async function listAdminSystemBrands() {
  await ensureSchema();
  const rows = await queryRows<RawLookupRow>(`
    SELECT
      IdTipo AS VALUE,
      IdTipo AS CODE,
      Descripcion AS LABEL
    FROM dbo_V_TA_TipoArticulo
    ORDER BY IdTipo;
  `);

  return rows.map(mapLookupRow);
}

export async function listAdminSystemCategories() {
  await ensureSchema();
  const rows = await queryRows<RawLookupRow>(`
    SELECT
      IdRubro AS VALUE,
      IdRubro AS CODE,
      Descripcion AS LABEL
    FROM dbo_V_TA_Rubros
    ORDER BY IdRubro;
  `);

  return rows.map(mapLookupRow);
}

export async function listAdminSystemUnits() {
  await ensureSchema();
  const rows = await queryRows<RawLookupRow>(`
    SELECT
      IdUnidad AS VALUE,
      IdUnidad AS CODE,
      Descripcion AS LABEL
    FROM dbo_V_TA_Unidad
    ORDER BY IdUnidad;
  `);

  return rows.map(mapLookupRow);
}

async function getNextNumericCode(input: {
  tableName: string;
  columnName: string;
  width?: number;
}) {
  const rows = await queryRows<{ CODE: string | null }>(
    `
      SELECT TRIM(${input.columnName}) AS CODE
      FROM ${input.tableName}
      WHERE TRIM(COALESCE(${input.columnName}, '')) REGEXP '^[0-9]+$'
      ORDER BY CAST(TRIM(${input.columnName}) AS UNSIGNED) ASC;
    `,
  );
  const usedCodes = rows
    .map((row) => Number(row.CODE || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  let nextCode = 1;
  for (const value of usedCodes) {
    if (value === nextCode) {
      nextCode += 1;
      continue;
    }

    if (value > nextCode) {
      break;
    }
  }

  if (input.width) {
    return String(nextCode).padStart(input.width, "0");
  }

  return String(nextCode);
}

export async function getNextAdminSystemBrandCode() {
  return getNextNumericCode({
    tableName: "dbo_V_TA_TipoArticulo",
    columnName: "IdTipo",
    width: 3,
  });
}

export async function getNextAdminSystemCategoryCode() {
  return getNextNumericCode({
    tableName: "dbo_V_TA_Rubros",
    columnName: "IdRubro",
    width: 3,
  });
}

export async function getNextAdminSystemArticleCode() {
  return getNextNumericCode({
    tableName: "dbo_V_MA_ARTICULOS",
    columnName: "IDARTICULO",
  });
}

export async function listAdminSystemStockReasons() {
  await ensureSchema();
  const rows = await queryRows<RawLookupRow>(`
    SELECT
      IdMotivoStock AS VALUE,
      IdMotivoStock AS CODE,
      Descripcion AS LABEL
    FROM dbo_V_TA_MotivoStock
    ORDER BY IdMotivoStock;
  `);

  return rows.map(mapLookupRow);
}

export async function createAdminSystemBrand(input: {
  code: string;
  description: string;
}) {
  await ensureSchema();
  await executeStatement(
    `
      INSERT INTO dbo_V_TA_TipoArticulo (
        IdTipo,
        Descripcion
      )
      VALUES (
        :code,
        :description
      );
    `,
    {
      code: input.code,
      description: input.description,
    },
  );

  return {
    value: input.code,
    code: input.code,
    label: input.description,
  } satisfies AdminSystemLookupOption;
}

export async function createAdminSystemCategory(input: {
  code: string;
  description: string;
}) {
  await ensureSchema();
  await executeStatement(
    `
      INSERT INTO dbo_V_TA_Rubros (
        IdRubro,
        Descripcion
      )
      VALUES (
        :code,
        :description
      );
    `,
    {
      code: input.code,
      description: input.description,
    },
  );

  return {
    value: input.code,
    code: input.code,
    label: input.description,
  } satisfies AdminSystemLookupOption;
}

export async function createAdminSystemArticle(input: {
  code: string;
  description: string;
  barcode?: string | null;
  supplierAccount?: string | null;
  supplierProductCode?: string | null;
  imagePath?: string | null;
  unitId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  exempt?: boolean;
  weighable?: boolean;
  suspended?: boolean;
  suspendedForSales?: boolean;
  price: number;
  cost: number;
  taxRate: number;
  username?: string | null;
}) {
  await ensureSchema();
  await executeStatement(
    `
      INSERT INTO dbo_V_MA_ARTICULOS (
        IDARTICULO,
        DESCRIPCION,
        CODIGOBARRA,
        CUENTAPROVEEDOR,
        CodigoArtProveedor,
        RutaImagen,
        IDUNIDAD,
        IDTIPO,
        IDRUBRO,
        Exento,
        Pesable,
        SUSPENDIDO,
        SuspendidoV,
        PRECIO1,
        COSTO,
        TasaIVA,
        Usuario
      )
      VALUES (
        :code,
        :description,
        :barcode,
        :supplierAccount,
        :supplierProductCode,
        :imagePath,
        :unitId,
        :brandId,
        :categoryId,
        :exempt,
        :weighable,
        :suspended,
        :suspendedForSales,
        :price,
        :cost,
        :taxRate,
        :username
      );
    `,
    {
      code: input.code,
      description: input.description,
      barcode: input.barcode || null,
      supplierAccount: input.supplierAccount || null,
      supplierProductCode: input.supplierProductCode || null,
      imagePath: input.imagePath || null,
      unitId: input.unitId || null,
      brandId: input.brandId || null,
      categoryId: input.categoryId || null,
      exempt: input.exempt ? 1 : 0,
      weighable: input.weighable ? 1 : 0,
      suspended: input.suspended ? 1 : 0,
      suspendedForSales: input.suspendedForSales ? 1 : 0,
      price: input.price,
      cost: input.cost,
      taxRate: input.taxRate,
      username: input.username || null,
    },
  );

  return getAdminSystemArticleByCode(input.code);
}

export async function updateAdminSystemArticle(input: {
  code: string;
  description: string;
  barcode?: string | null;
  supplierAccount?: string | null;
  supplierProductCode?: string | null;
  imagePath?: string | null;
  unitId?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  exempt?: boolean;
  weighable?: boolean;
  suspended?: boolean;
  suspendedForSales?: boolean;
  price: number;
  cost: number;
  taxRate: number;
  username?: string | null;
}) {
  await ensureSchema();
  await executeStatement(
    `
      UPDATE dbo_V_MA_ARTICULOS
      SET
        DESCRIPCION = :description,
        CODIGOBARRA = :barcode,
        CUENTAPROVEEDOR = :supplierAccount,
        CodigoArtProveedor = :supplierProductCode,
        RutaImagen = :imagePath,
        IDUNIDAD = :unitId,
        IDTIPO = :brandId,
        IDRUBRO = :categoryId,
        Exento = :exempt,
        Pesable = :weighable,
        SUSPENDIDO = :suspended,
        SuspendidoV = :suspendedForSales,
        PRECIO1 = :price,
        COSTO = :cost,
        TasaIVA = :taxRate,
        Usuario = :username
      WHERE TRIM(IDARTICULO) = TRIM(:code);
    `,
    {
      code: input.code,
      description: input.description,
      barcode: input.barcode || null,
      supplierAccount: input.supplierAccount || null,
      supplierProductCode: input.supplierProductCode || null,
      imagePath: input.imagePath || null,
      unitId: input.unitId || null,
      brandId: input.brandId || null,
      categoryId: input.categoryId || null,
      exempt: input.exempt ? 1 : 0,
      weighable: input.weighable ? 1 : 0,
      suspended: input.suspended ? 1 : 0,
      suspendedForSales: input.suspendedForSales ? 1 : 0,
      price: input.price,
      cost: input.cost,
      taxRate: input.taxRate,
      username: input.username || null,
    },
  );

  return getAdminSystemArticleByCode(input.code);
}

export async function isAdminSystemArticleWebBlocked(articleCode: string) {
  await ensureSchema();
  const row = await queryOne<{ ID: number | null }>(
    `
      SELECT ID
      FROM ${WEB_BLOCKED_ARTICLES_TABLE}
      WHERE TRIM(IDARTICULO) = TRIM(:articleCode)
      LIMIT 1;
    `,
    { articleCode: normalizeText(articleCode) },
  );

  return Boolean(row?.ID);
}

export async function setAdminSystemArticleWebBlocked(input: {
  articleCode: string;
  blocked: boolean;
  username?: string | null;
  reason?: string | null;
}) {
  await ensureSchema();

  if (input.blocked) {
    const existing = await queryOne<{ ID: number | null }>(
      `
        SELECT ID
        FROM ${WEB_BLOCKED_ARTICLES_TABLE}
        WHERE TRIM(IDARTICULO) = TRIM(:articleCode)
        LIMIT 1;
      `,
      { articleCode: normalizeText(input.articleCode) },
    );

    if (existing?.ID) {
      await executeStatement(
        `
          UPDATE ${WEB_BLOCKED_ARTICLES_TABLE}
          SET MOTIVO = :reason,
              USUARIO = :username,
              FECHA_BLOQUEO = NOW()
          WHERE ID = :id;
        `,
        {
          id: existing.ID,
          reason: input.reason || null,
          username: input.username || null,
        },
      );
    } else {
      await executeStatement(
        `
          INSERT INTO ${WEB_BLOCKED_ARTICLES_TABLE} (
            IDARTICULO,
            MOTIVO,
            USUARIO,
            FECHA_BLOQUEO
          )
          VALUES (
            :articleCode,
            :reason,
            :username,
            NOW()
          );
        `,
        {
          articleCode: normalizeText(input.articleCode),
          reason: input.reason || null,
          username: input.username || null,
        },
      );
    }

    return true;
  }

  await executeStatement(
    `
      DELETE FROM ${WEB_BLOCKED_ARTICLES_TABLE}
      WHERE TRIM(IDARTICULO) = TRIM(:articleCode);
    `,
    { articleCode: normalizeText(input.articleCode) },
  );

  return false;
}

export async function getAdminSystemStockReasonId(preferredReasonId?: string | null) {
  await ensureSchema();
  const row = await queryOne<{ VALUE: string | null }>(
    `
      SELECT IdMotivoStock AS VALUE
      FROM dbo_V_TA_MotivoStock
      WHERE :preferredReasonId IS NULL
         OR TRIM(IdMotivoStock) = TRIM(:preferredReasonId)
      ORDER BY
        CASE
          WHEN :preferredReasonId IS NOT NULL
           AND TRIM(IdMotivoStock) = TRIM(:preferredReasonId)
          THEN 0
          ELSE 1
        END,
        IdMotivoStock
      LIMIT 1;
    `,
    { preferredReasonId: preferredReasonId || null },
  );

  return row?.VALUE || "";
}

async function insertAdminSystemStockAdjustmentWithExecutor(
  input: {
    articleCode: string;
    depositId: string;
    reasonId: string;
    quantityDelta: number;
    username?: string | null;
  },
  executor: DbExecutor,
): Promise<string | null> {
  const canonicalDepositId = await resolveCanonicalDepositId(
    input.depositId,
    executor,
  );
  const canonicalReasonId = await resolveCanonicalStockReasonId(
    input.reasonId,
    executor,
  );
  const article = await getArticleForWrite(input.articleCode, executor);

  if (!article) {
    return null;
  }

  const adjustmentCode = "WEBSTK";
  const adjustmentNumber = `WEB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`.slice(
    0,
    26,
  );

  await executeStatement(
    `
      INSERT INTO dbo_V_MV_Stock (
        TC,
        IDCOMPROBANTE,
        IDCOMPLEMENTO,
        SECUENCIA,
        FECHA,
        IDArticulo,
        Descripcion,
        IDUnidad,
        CantidadUD,
        Cantidad,
        Costo,
        PrecioVenta,
        ClasePrecio,
        CuentaProveedor,
        IdDeposito,
        IdMotivoStock
      )
      VALUES (
        :tc,
        :idComprobante,
        0,
        0,
        :fecha,
        :articleCode,
        :description,
        :unitId,
        :quantityDelta,
        :quantityDelta,
        :cost,
        :price,
        1,
        :supplierAccount,
        :depositId,
        :reasonId
      );
    `,
    {
      tc: adjustmentCode,
      idComprobante: adjustmentNumber,
      fecha: new Date(),
      articleCode: article.IDARTICULO,
      description: article.DESCRIPCION,
      unitId: article.IDUNIDAD || null,
      quantityDelta: input.quantityDelta,
      cost: Number(article.COSTO || 0),
      price: Number(article.PRECIO1 || 0),
      supplierAccount: normalizeText(article.CUENTAPROVEEDOR) || "*",
      depositId: canonicalDepositId,
      reasonId: canonicalReasonId,
    },
    executor,
  );

  return adjustmentNumber;
}

export async function insertAdminSystemStockAdjustment(
  input: {
    articleCode: string;
    depositId: string;
    reasonId: string;
    quantityDelta: number;
    username?: string | null;
  },
  executor?: DbExecutor,
): Promise<string | null> {
  await ensureSchema();

  if (executor) {
    return insertAdminSystemStockAdjustmentWithExecutor(input, executor);
  }

  return withTransaction((transaction) =>
    insertAdminSystemStockAdjustmentWithExecutor(input, transaction),
  );
}

export async function insertAdminSystemStockMovement(input: {
  depositId: string;
  reasonId: string;
  branch?: string | null;
  observation?: string | null;
  username?: string | null;
  lines: Array<{
    articleCode: string;
    quantityDelta: number;
  }>;
}) {
  await ensureSchema();

  return withTransaction(async (transaction) => {
    const movementTc = "EGWB";
    const canonicalDepositId = await resolveCanonicalDepositId(
      input.depositId,
      transaction,
    );
    const canonicalReasonId = await resolveCanonicalStockReasonId(
      input.reasonId,
      transaction,
    );
    const movementNumber = await getNextStockMovementComprobante({
      tc: movementTc,
      branch: input.branch || null,
      executor: transaction,
    });
    const movementDate = new Date();
    const observation = normalizeText(input.observation).slice(0, 50) || null;

    for (const [index, line] of input.lines.entries()) {
      const article = await getArticleForWrite(line.articleCode, transaction);

      if (!article) {
        throw new Error(`No se encontro el articulo ${normalizeText(line.articleCode)}.`);
      }

      await executeStatement(
        `
          INSERT INTO dbo_V_MV_Stock (
            TC,
            IDCOMPROBANTE,
            IDCOMPLEMENTO,
            SECUENCIA,
            FECHA,
            IDArticulo,
            Descripcion,
            IDUnidad,
            CantidadUD,
            Cantidad,
            Costo,
            PrecioVenta,
            ClasePrecio,
            CuentaProveedor,
            ControladoPor,
            IdDeposito,
            IdMotivoStock
          )
          VALUES (
            :tc,
            :idComprobante,
            0,
            :secuencia,
            :fecha,
            :articleCode,
            :description,
            :unitId,
            :quantityDelta,
            :quantityDelta,
            :cost,
            :price,
            1,
            :supplierAccount,
            :observation,
            :depositId,
            :reasonId
          );
        `,
        {
          tc: movementTc,
          idComprobante: movementNumber,
          secuencia: index + 1,
          fecha: movementDate,
          articleCode: article.IDARTICULO,
          description: article.DESCRIPCION,
          unitId: article.IDUNIDAD || null,
          quantityDelta: line.quantityDelta,
          cost: Number(article.COSTO || 0),
          price: Number(article.PRECIO1 || 0),
          supplierAccount: normalizeText(article.CUENTAPROVEEDOR) || "*",
          observation,
          depositId: canonicalDepositId,
          reasonId: canonicalReasonId,
        },
        transaction,
      );
    }

    return movementNumber;
  });
}

export async function getAdminSystemCurrentStock(input: {
  articleCode: string;
  depositId?: string | null;
}) {
  await ensureSchema();
  const row = await queryOne<RawStockRow>(
    `
      SELECT
        SUM(COALESCE(CantidadUD, 0)) AS STOCKACTUAL
      FROM dbo_V_MV_Stock
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND TRIM(IDArticulo) = TRIM(:articleCode)
        AND (:depositId IS NULL OR TRIM(COALESCE(IdDeposito, '')) = TRIM(:depositId));
    `,
    {
      articleCode: normalizeText(input.articleCode),
      depositId: input.depositId || null,
    },
  );

  return Number(row?.STOCKACTUAL || 0);
}
