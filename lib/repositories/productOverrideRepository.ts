import "server-only";
import { getConnection } from "@/lib/db";

const PRODUCT_OVERRIDES_TABLE = "dbo.WEB_MA_ARTICULOS_OVERRIDES";
const PRODUCT_OVERRIDES_SCHEMA_VERSION = 1;

declare global {
  var __diezDeportesProductOverridesSchemaReady:
    | { version: number; promise: Promise<void> }
    | undefined;
}

type ProductOverrideRow = {
  IDARTICULO: string;
  DESCRIPCION_OVERRIDE: string | null;
  PRECIO_OVERRIDE: number | null;
  MARCA_OVERRIDE: string | null;
  CATEGORIA_OVERRIDE: string | null;
  ACTUALIZADO_POR: string | null;
  FECHA_CREACION: Date | null;
  FECHA_ACTUALIZACION: Date | null;
};

export type ProductAdminOverride = {
  productId: string;
  description: string | null;
  price: number | null;
  brand: string | null;
  category: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalizeProductId(value: string) {
  return value.trim();
}

function toIsoString(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizePrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("El precio debe ser un numero mayor a cero.");
  }

  return Math.round(value * 100) / 100;
}

function mapOverrideRow(row: ProductOverrideRow): ProductAdminOverride {
  return {
    productId: normalizeProductId(row.IDARTICULO || ""),
    description: normalizeOptionalText(row.DESCRIPCION_OVERRIDE, 250),
    price: row.PRECIO_OVERRIDE !== null && Number.isFinite(row.PRECIO_OVERRIDE)
      ? Math.round(row.PRECIO_OVERRIDE * 100) / 100
      : null,
    brand: normalizeOptionalText(row.MARCA_OVERRIDE, 120),
    category: normalizeOptionalText(row.CATEGORIA_OVERRIDE, 120),
    updatedBy: normalizeOptionalText(row.ACTUALIZADO_POR, 120),
    createdAt: toIsoString(row.FECHA_CREACION),
    updatedAt: toIsoString(row.FECHA_ACTUALIZACION),
  };
}

function setInput(
  request: import("mssql").Request,
  values: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(values)) {
    request.input(key, value);
  }
}

async function ensureSchema() {
  if (
    global.__diezDeportesProductOverridesSchemaReady &&
    global.__diezDeportesProductOverridesSchemaReady.version ===
      PRODUCT_OVERRIDES_SCHEMA_VERSION
  ) {
    return global.__diezDeportesProductOverridesSchemaReady.promise;
  }

  const promise = (async () => {
    const pool = await getConnection();

    await pool.request().query(`
      IF OBJECT_ID('${PRODUCT_OVERRIDES_TABLE}', 'U') IS NULL
      BEGIN
        CREATE TABLE ${PRODUCT_OVERRIDES_TABLE} (
          IDARTICULO nvarchar(120) NOT NULL PRIMARY KEY,
          DESCRIPCION_OVERRIDE nvarchar(250) NULL,
          PRECIO_OVERRIDE decimal(18, 2) NULL,
          MARCA_OVERRIDE nvarchar(120) NULL,
          CATEGORIA_OVERRIDE nvarchar(120) NULL,
          ACTUALIZADO_POR nvarchar(120) NULL,
          FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_OVERRIDES_FECHA_CREACION DEFAULT SYSDATETIME(),
          FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_OVERRIDES_FECHA_ACTUALIZACION DEFAULT SYSDATETIME()
        );
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'DESCRIPCION_OVERRIDE') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD DESCRIPCION_OVERRIDE nvarchar(250) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'PRECIO_OVERRIDE') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD PRECIO_OVERRIDE decimal(18, 2) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'MARCA_OVERRIDE') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD MARCA_OVERRIDE nvarchar(120) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'CATEGORIA_OVERRIDE') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD CATEGORIA_OVERRIDE nvarchar(120) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'ACTUALIZADO_POR') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD ACTUALIZADO_POR nvarchar(120) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'FECHA_CREACION') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_OVERRIDES_FECHA_CREACION DEFAULT SYSDATETIME();
      END;

      IF COL_LENGTH('${PRODUCT_OVERRIDES_TABLE}', 'FECHA_ACTUALIZACION') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_OVERRIDES_TABLE} ADD FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_OVERRIDES_FECHA_ACTUALIZACION DEFAULT SYSDATETIME();
      END;
    `);
  })();

  global.__diezDeportesProductOverridesSchemaReady = {
    version: PRODUCT_OVERRIDES_SCHEMA_VERSION,
    promise,
  };

  try {
    await promise;
  } catch (error) {
    global.__diezDeportesProductOverridesSchemaReady = undefined;
    throw error;
  }
}

export async function ensureProductOverrideSchemaReady() {
  await ensureSchema();
}

export async function getProductAdminOverridesByProductIds(productIds: string[]) {
  const normalizedIds = Array.from(
    new Set(productIds.map((productId) => normalizeProductId(productId)).filter(Boolean)),
  );

  if (normalizedIds.length === 0) {
    return new Map<string, ProductAdminOverride>();
  }

  const pool = await getConnection();
  const request = pool.request();

  normalizedIds.forEach((productId, index) => {
    request.input(`productId${index}`, productId);
  });

  const placeholders = normalizedIds.map((_, index) => `@productId${index}`).join(", ");
  const result = await request.query<ProductOverrideRow>(`
    IF OBJECT_ID('${PRODUCT_OVERRIDES_TABLE}', 'U') IS NOT NULL
    BEGIN
      SELECT
        LTRIM(RTRIM(IDARTICULO)) AS IDARTICULO,
        DESCRIPCION_OVERRIDE,
        CAST(PRECIO_OVERRIDE AS float) AS PRECIO_OVERRIDE,
        MARCA_OVERRIDE,
        CATEGORIA_OVERRIDE,
        ACTUALIZADO_POR,
        FECHA_CREACION,
        FECHA_ACTUALIZACION
      FROM ${PRODUCT_OVERRIDES_TABLE} WITH (NOLOCK)
      WHERE LTRIM(RTRIM(IDARTICULO)) IN (${placeholders});
    END
    ELSE
    BEGIN
      SELECT
        CAST('' AS nvarchar(120)) AS IDARTICULO,
        CAST(NULL AS nvarchar(250)) AS DESCRIPCION_OVERRIDE,
        CAST(NULL AS float) AS PRECIO_OVERRIDE,
        CAST(NULL AS nvarchar(120)) AS MARCA_OVERRIDE,
        CAST(NULL AS nvarchar(120)) AS CATEGORIA_OVERRIDE,
        CAST(NULL AS nvarchar(120)) AS ACTUALIZADO_POR,
        CAST(NULL AS datetime2) AS FECHA_CREACION,
        CAST(NULL AS datetime2) AS FECHA_ACTUALIZACION
      WHERE 1 = 0;
    END
  `);

  return new Map(
    result.recordset.map((row) => {
      const mapped = mapOverrideRow(row);
      return [mapped.productId, mapped];
    }),
  );
}

export async function saveProductAdminOverride(input: {
  productId: string;
  description?: string | null;
  price?: number | null;
  brand?: string | null;
  category?: string | null;
  updatedBy?: string | null;
}) {
  const productId = normalizeProductId(input.productId);
  if (!productId) {
    throw new Error("Articulo invalido.");
  }

  const description = normalizeOptionalText(input.description, 250);
  const price = normalizePrice(input.price);
  const brand = normalizeOptionalText(input.brand, 120);
  const category = normalizeOptionalText(input.category, 120);
  const updatedBy = normalizeOptionalText(input.updatedBy, 120);

  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  setInput(request, {
    productId,
    description,
    price,
    brand,
    category,
    updatedBy,
  });

  if (!description && price === null && !brand && !category) {
    await request.query(`
      DELETE FROM ${PRODUCT_OVERRIDES_TABLE}
      WHERE LTRIM(RTRIM(IDARTICULO)) = @productId;
    `);

    return null;
  }

  await request.query(`
    IF EXISTS (
      SELECT 1
      FROM ${PRODUCT_OVERRIDES_TABLE}
      WHERE LTRIM(RTRIM(IDARTICULO)) = @productId
    )
    BEGIN
      UPDATE ${PRODUCT_OVERRIDES_TABLE}
      SET
        DESCRIPCION_OVERRIDE = @description,
        PRECIO_OVERRIDE = @price,
        MARCA_OVERRIDE = @brand,
        CATEGORIA_OVERRIDE = @category,
        ACTUALIZADO_POR = @updatedBy,
        FECHA_ACTUALIZACION = SYSDATETIME()
      WHERE LTRIM(RTRIM(IDARTICULO)) = @productId;
    END
    ELSE
    BEGIN
      INSERT INTO ${PRODUCT_OVERRIDES_TABLE} (
        IDARTICULO,
        DESCRIPCION_OVERRIDE,
        PRECIO_OVERRIDE,
        MARCA_OVERRIDE,
        CATEGORIA_OVERRIDE,
        ACTUALIZADO_POR
      )
      VALUES (
        @productId,
        @description,
        @price,
        @brand,
        @category,
        @updatedBy
      );
    END
  `);

  const overrides = await getProductAdminOverridesByProductIds([productId]);
  return overrides.get(productId) || null;
}
