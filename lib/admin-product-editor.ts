import "server-only";
import type { ConnectionPool, IResult, Transaction } from "mssql";
import { getConnection, sql } from "@/lib/db";
import {
  getLegacyArticleId,
  getLegacyArticleGroupingParentId,
  getLegacyArticleGroupingRelationKey,
} from "@/lib/legacy-article-id";
import { getServerSettings } from "@/lib/store-config";

type Executor = ConnectionPool | Transaction;

type LookupRow = {
  RawId: string | null;
  Description: string | null;
};

type ArticleGroupingRow = {
  RawId: string | null;
  Procedencia: string | null;
};

export type AdminArticleLookupOption = {
  id: string;
  rawId: string;
  label: string;
};

export type AdminArticleVariantUpdate = {
  productId: string;
  size: string;
  color: string;
  price: number | null;
};

const PRODUCT_OVERRIDE_TABLE = "dbo.WEB_MA_ARTICULOS_OVERRIDES";
const SQL_IN_PARAMETER_CHUNK_SIZE = 1500;

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}

function normalizeId(value: string | null | undefined) {
  return getLegacyArticleId(value);
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function normalizeLabel(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
) {
  const normalized = normalizeLabel(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function resolveLookupLabel(id: string, description: string | null | undefined) {
  const normalizedDescription = normalizeLabel(description);
  return normalizedDescription || `ID ${id}`;
}

function mapLookupRows(rows: LookupRow[]) {
  return rows
    .map((row) => {
      const id = normalizeId(row.RawId);

      if (!id) {
        return null;
      }

      return {
        id,
        rawId: row.RawId || id,
        label: resolveLookupLabel(id, row.Description),
      } satisfies AdminArticleLookupOption;
    })
    .filter((value): value is AdminArticleLookupOption => Boolean(value))
    .sort((left, right) => left.label.localeCompare(right.label, "es", { sensitivity: "base" }));
}

async function listLookupOptions(input: {
  tableName: "dbo.V_TA_TipoArticulo" | "dbo.V_TA_Rubros";
  idColumn: "IdTipo" | "IdRubro";
}, executor?: Executor) {
  const connection = executor || (await getConnection());
  const request = createRequest(connection);
  const result: IResult<LookupRow> = await request.query(`
    SELECT
      ${input.idColumn} AS RawId,
      Descripcion AS Description
    FROM ${input.tableName} WITH (NOLOCK)
    ORDER BY Descripcion ASC, ${input.idColumn} ASC;
  `);

  return mapLookupRows(result.recordset);
}

function resolveLookupRawId(
  selectedId: string,
  options: AdminArticleLookupOption[],
  errorMessage: string,
) {
  const normalizedId = normalizeId(selectedId);
  const match = options.find((option) => option.id === normalizedId);

  if (!match) {
    throw new Error(errorMessage);
  }

  return match.rawId;
}

function getParentArticleCode(
  productId: string,
  procedencia?: string | null,
) {
  return getLegacyArticleGroupingParentId({
    articleId: productId,
    procedencia,
  });
}

function getParentArticleRelationKey(
  productId: string,
  procedencia?: string | null,
) {
  return getLegacyArticleGroupingRelationKey({
    articleId: productId,
    procedencia,
  });
}

async function getArticleGroupingMap(
  productIds: string[],
  executor?: Executor,
) {
  const normalizedIds = Array.from(new Set(productIds.filter(Boolean)));

  if (normalizedIds.length === 0) {
    return new Map<string, { productId: string; procedencia: string }>();
  }

  const connection = executor || (await getConnection());
  const map = new Map<string, { productId: string; procedencia: string }>();

  for (const chunk of chunkValues(normalizedIds, SQL_IN_PARAMETER_CHUNK_SIZE)) {
    const request = createRequest(connection);

    chunk.forEach((productId, index) => {
      request.input(`productId${index}`, productId);
    });

    const result: IResult<ArticleGroupingRow> = await request.query(`
      SELECT
        IDARTICULO AS RawId,
        Procedencia
      FROM dbo.V_MA_ARTICULOS WITH (NOLOCK)
      WHERE IDARTICULO IN (
        ${chunk.map((_, index) => `@productId${index}`).join(", ")}
      );
    `);

    for (const row of result.recordset) {
      const productId = normalizeId(row.RawId);

      if (!productId) {
        continue;
      }

      map.set(productId, {
        productId,
        procedencia: normalizeId(row.Procedencia),
      });
    }
  }

  return map;
}

export async function listAdminArticleBrandOptions() {
  return listLookupOptions({
    tableName: "dbo.V_TA_TipoArticulo",
    idColumn: "IdTipo",
  });
}

export async function listAdminArticleCategoryOptions() {
  return listLookupOptions({
    tableName: "dbo.V_TA_Rubros",
    idColumn: "IdRubro",
  });
}

export async function saveAdminArticleEdits(input: {
  productId: string;
  parentCode: string;
  description: string;
  price: number;
  size: string;
  color: string;
  brandId: string;
  categoryId: string;
  variants: AdminArticleVariantUpdate[];
}) {
  const productId = normalizeId(input.productId);
  const requestedParentCode = normalizeId(input.parentCode);
  const description = normalizeOptionalText(input.description, 250);
  const size = normalizeOptionalText(input.size, 60);
  const color = normalizeOptionalText(input.color, 60);

  if (!productId) {
    throw new Error("Articulo invalido.");
  }

  if (!description) {
    throw new Error("La descripcion es obligatoria.");
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("El precio debe ser mayor a cero.");
  }

  const variants = input.variants
    .map((variant) => {
      const variantId = normalizeId(variant.productId);

      if (!variantId) {
        return null;
      }

      if (variant.price !== null && (!Number.isFinite(variant.price) || variant.price <= 0)) {
        throw new Error("El precio de la variante debe ser mayor a cero.");
      }

      return {
        productId: variantId,
        size: normalizeOptionalText(variant.size, 60),
        color: normalizeOptionalText(variant.color, 60),
        price: variant.price === null ? null : Math.round(variant.price * 100) / 100,
      } satisfies {
        productId: string;
        size: string | null;
        color: string | null;
        price: number | null;
      };
    })
    .filter(
      (
        variant,
      ): variant is AdminArticleVariantUpdate & { size: string | null; color: string | null } =>
        Boolean(variant),
    );

  const [settings, pool, brandOptions, categoryOptions] = await Promise.all([
    getServerSettings(),
    getConnection(),
    listAdminArticleBrandOptions(),
    listAdminArticleCategoryOptions(),
  ]);

  const brandRawId = resolveLookupRawId(input.brandId, brandOptions, "Marca invalida.");
  const categoryRawId = resolveLookupRawId(
    input.categoryId,
    categoryOptions,
    "Categoria invalida.",
  );

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const groupingById = await getArticleGroupingMap(
      [productId, requestedParentCode, ...variants.map((variant) => variant.productId)],
      transaction,
    );
    const resolvedParentCode =
      requestedParentCode ||
      getParentArticleCode(productId, groupingById.get(productId)?.procedencia || "");
    const parentRelationKey = getParentArticleRelationKey(
      resolvedParentCode,
      groupingById.get(resolvedParentCode)?.procedencia || "",
    );

    if (!resolvedParentCode || !parentRelationKey) {
      throw new Error("Articulo invalido.");
    }

    for (const variant of variants) {
      const variantGrouping = groupingById.get(variant.productId);

      if (!variantGrouping) {
        throw new Error("No se encontro una variante seleccionada.");
      }

      if (
        getParentArticleRelationKey(
          variant.productId,
          variantGrouping.procedencia,
        ) !== parentRelationKey
      ) {
        throw new Error("Las variantes no pertenecen al articulo activo.");
      }
    }

    const mainRequest = createRequest(transaction);
    mainRequest.input("productId", productId);
    mainRequest.input("description", description);
    mainRequest.input("price", Math.round(input.price * 100) / 100);
    mainRequest.input("size", size);
    mainRequest.input("color", color);
    mainRequest.input("brandId", brandRawId);
    mainRequest.input("categoryId", categoryRawId);

    const mainResult = await mainRequest.query<{ affected: number }>(`
      UPDATE dbo.V_MA_ARTICULOS
      SET
        DESCRIPCION = @description,
        ${settings.priceColumn} = @price,
        TalleDefault = @size,
        ColorDefault = @color,
        IDTIPO = @brandId,
        IDRUBRO = @categoryId
      WHERE IDARTICULO = @productId;

      SELECT @@ROWCOUNT AS affected;
    `);

    if ((mainResult.recordset[0]?.affected || 0) === 0) {
      throw new Error("No se encontro el articulo seleccionado.");
    }

    for (const variant of variants) {
      const variantRequest = createRequest(transaction);
      variantRequest.input("productId", variant.productId);
      variantRequest.input("size", variant.size);
      variantRequest.input("color", variant.color);
      variantRequest.input("price", variant.price);

      const variantResult = await variantRequest.query<{ affected: number }>(`
        UPDATE dbo.V_MA_ARTICULOS
        SET
          TalleDefault = @size,
          ColorDefault = @color,
          ${settings.priceColumn} = COALESCE(@price, ${settings.priceColumn})
        WHERE IDARTICULO = @productId;

        SELECT @@ROWCOUNT AS affected;
      `);

      if ((variantResult.recordset[0]?.affected || 0) === 0) {
        throw new Error("No se pudo guardar una de las variantes.");
      }
    }

    const overrideIds = Array.from(
      new Set([productId, ...variants.map((variant) => variant.productId)].filter(Boolean)),
    );

    if (overrideIds.length > 0) {
      for (const chunk of chunkValues(overrideIds, SQL_IN_PARAMETER_CHUNK_SIZE)) {
        const overrideRequest = createRequest(transaction);

        chunk.forEach((overrideId, index) => {
          overrideRequest.input(`overrideId${index}`, overrideId);
        });

        await overrideRequest.query(`
          IF OBJECT_ID('${PRODUCT_OVERRIDE_TABLE}', 'U') IS NOT NULL
          BEGIN
            DELETE FROM ${PRODUCT_OVERRIDE_TABLE}
            WHERE IDARTICULO IN (
              ${chunk.map((_, index) => `@overrideId${index}`).join(", ")}
            );
          END
        `);
      }
    }

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // noop
    }

    throw error;
  }
}
