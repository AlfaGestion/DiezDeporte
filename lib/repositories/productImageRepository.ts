import "server-only";
import { getConnection } from "@/lib/db";
import {
  collectDistinctLegacyArticleIds,
  getLegacyArticleId,
} from "@/lib/legacy-article-id";
import type { ProductImageMode } from "@/lib/types";

const PRODUCT_IMAGES_TABLE = "dbo.WEB_MA_ARTICULOS_IMAGENES";
const PRODUCT_IMAGES_SCHEMA_VERSION = 2;
const MAX_PRODUCT_IMAGE_URLS = 12;

declare global {
  var __diezDeportesProductImagesSchemaReady:
    | { version: number; promise: Promise<void> }
    | undefined;
}

type ProductImageOverrideRow = {
  IDARTICULO: string;
  IMAGEN_PRINCIPAL_URL: string | null;
  GALERIA_JSON: string | null;
  IMAGEN_TIPO: string | null;
  IMAGEN_NOTA: string | null;
  IMAGEN_SOURCE_URL: string | null;
  ACTUALIZADO_POR: string | null;
  FECHA_CREACION: Date | null;
  FECHA_ACTUALIZACION: Date | null;
};

export type ProductImageOverride = {
  productId: string;
  imageUrl: string | null;
  imageGalleryUrls: string[];
  imageMode: ProductImageMode;
  imageNote: string | null;
  imageSourceUrl: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function toIsoString(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeProductId(value: string) {
  return getLegacyArticleId(value);
}

function normalizeImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  throw new Error(
    "Cada imagen debe ser una URL http(s) o una ruta local que empiece con /.",
  );
}

function normalizeImageMode(value: string | null | undefined): ProductImageMode {
  return value?.trim().toLowerCase() === "illustrative" ? "illustrative" : "exact";
}

function normalizeImageNote(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed ? trimmed.slice(0, 250) : null;
}

function normalizeImageSourceUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("La fuente de la imagen debe ser una URL http(s).");
  }

  return trimmed.slice(0, 1500);
}

export function normalizeProductImageUrls(values: string[]) {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const normalized = normalizeImageUrl(rawValue);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    urls.push(normalized);
  }

  if (urls.length > MAX_PRODUCT_IMAGE_URLS) {
    throw new Error(
      `Solo se permiten hasta ${MAX_PRODUCT_IMAGE_URLS} imagenes por articulo.`,
    );
  }

  return urls;
}

function parseGalleryJson(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function mapOverrideRow(row: ProductImageOverrideRow): ProductImageOverride {
  const storedGallery = parseGalleryJson(row.GALERIA_JSON);
  const galleryUrls: string[] = [];
  let imageSourceUrl: string | null = null;

  for (const rawValue of [row.IMAGEN_PRINCIPAL_URL || "", ...storedGallery]) {
    try {
      const normalized = normalizeImageUrl(rawValue);
      if (normalized && !galleryUrls.includes(normalized)) {
        galleryUrls.push(normalized);
      }
    } catch {
      continue;
    }
  }

  const imageUrl = galleryUrls[0] || null;

  try {
    imageSourceUrl = normalizeImageSourceUrl(row.IMAGEN_SOURCE_URL);
  } catch {
    imageSourceUrl = null;
  }

  return {
    productId: normalizeProductId(row.IDARTICULO || ""),
    imageUrl,
    imageGalleryUrls: galleryUrls,
    imageMode: normalizeImageMode(row.IMAGEN_TIPO),
    imageNote: normalizeImageNote(row.IMAGEN_NOTA),
    imageSourceUrl,
    updatedBy: row.ACTUALIZADO_POR?.trim() || null,
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
    global.__diezDeportesProductImagesSchemaReady &&
    global.__diezDeportesProductImagesSchemaReady.version ===
      PRODUCT_IMAGES_SCHEMA_VERSION
  ) {
    return global.__diezDeportesProductImagesSchemaReady.promise;
  }

  const promise = (async () => {
    const pool = await getConnection();

    await pool.request().query(`
      IF OBJECT_ID('${PRODUCT_IMAGES_TABLE}', 'U') IS NULL
      BEGIN
        CREATE TABLE ${PRODUCT_IMAGES_TABLE} (
          IDARTICULO nvarchar(120) NOT NULL PRIMARY KEY,
          IMAGEN_PRINCIPAL_URL nvarchar(1500) NULL,
          GALERIA_JSON nvarchar(max) NULL,
          IMAGEN_TIPO nvarchar(20) NULL,
          IMAGEN_NOTA nvarchar(250) NULL,
          IMAGEN_SOURCE_URL nvarchar(1500) NULL,
          ACTUALIZADO_POR nvarchar(120) NULL,
          FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_IMAGENES_FECHA_CREACION DEFAULT SYSDATETIME(),
          FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_IMAGENES_FECHA_ACTUALIZACION DEFAULT SYSDATETIME()
        );
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'IMAGEN_PRINCIPAL_URL') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD IMAGEN_PRINCIPAL_URL nvarchar(1500) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'GALERIA_JSON') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD GALERIA_JSON nvarchar(max) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'IMAGEN_TIPO') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD IMAGEN_TIPO nvarchar(20) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'IMAGEN_NOTA') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD IMAGEN_NOTA nvarchar(250) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'IMAGEN_SOURCE_URL') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD IMAGEN_SOURCE_URL nvarchar(1500) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'ACTUALIZADO_POR') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD ACTUALIZADO_POR nvarchar(120) NULL;
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'FECHA_CREACION') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD FECHA_CREACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_IMAGENES_FECHA_CREACION DEFAULT SYSDATETIME();
      END;

      IF COL_LENGTH('${PRODUCT_IMAGES_TABLE}', 'FECHA_ACTUALIZACION') IS NULL
      BEGIN
        ALTER TABLE ${PRODUCT_IMAGES_TABLE} ADD FECHA_ACTUALIZACION datetime2 NOT NULL CONSTRAINT DF_WEB_MA_ARTICULOS_IMAGENES_FECHA_ACTUALIZACION DEFAULT SYSDATETIME();
      END;
    `);
  })();

  global.__diezDeportesProductImagesSchemaReady = {
    version: PRODUCT_IMAGES_SCHEMA_VERSION,
    promise,
  };

  try {
    await promise;
  } catch (error) {
    global.__diezDeportesProductImagesSchemaReady = undefined;
    throw error;
  }
}

export async function ensureProductImageSchemaReady() {
  await ensureSchema();
}

export async function getProductImageOverridesByProductIds(productIds: string[]) {
  const normalizedIds = collectDistinctLegacyArticleIds(
    productIds.map((productId) => normalizeProductId(productId)),
  );

  if (normalizedIds.length === 0) {
    return new Map<string, ProductImageOverride>();
  }

  const pool = await getConnection();
  const request = pool.request();

  normalizedIds.forEach((productId, index) => {
    request.input(`productId${index}`, productId);
  });

  const placeholders = normalizedIds.map((_, index) => `@productId${index}`).join(", ");
  const result = await request.query<ProductImageOverrideRow>(`
    IF OBJECT_ID('${PRODUCT_IMAGES_TABLE}', 'U') IS NOT NULL
    BEGIN
      SELECT
        IDARTICULO,
        IMAGEN_PRINCIPAL_URL,
        GALERIA_JSON,
        IMAGEN_TIPO,
        IMAGEN_NOTA,
        IMAGEN_SOURCE_URL,
        ACTUALIZADO_POR,
        FECHA_CREACION,
        FECHA_ACTUALIZACION
      FROM ${PRODUCT_IMAGES_TABLE} WITH (NOLOCK)
      WHERE IDARTICULO IN (${placeholders});
    END
    ELSE
    BEGIN
      SELECT
        CAST('' AS nvarchar(120)) AS IDARTICULO,
        CAST(NULL AS nvarchar(1500)) AS IMAGEN_PRINCIPAL_URL,
        CAST(NULL AS nvarchar(max)) AS GALERIA_JSON,
        CAST(NULL AS nvarchar(20)) AS IMAGEN_TIPO,
        CAST(NULL AS nvarchar(250)) AS IMAGEN_NOTA,
        CAST(NULL AS nvarchar(1500)) AS IMAGEN_SOURCE_URL,
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

export async function saveProductImageOverride(input: {
  productId: string;
  imageUrls: string[];
  imageMode?: ProductImageMode;
  imageNote?: string | null;
  imageSourceUrl?: string | null;
  updatedBy?: string | null;
}) {
  const productId = normalizeProductId(input.productId);
  if (!productId) {
    throw new Error("Articulo invalido.");
  }

  const imageUrls = normalizeProductImageUrls(input.imageUrls);
  const imageMode =
    imageUrls.length > 0 ? input.imageMode || "exact" : "exact";
  const imageNote =
    imageUrls.length > 0 ? normalizeImageNote(input.imageNote) : null;
  const imageSourceUrl =
    imageUrls.length > 0 ? normalizeImageSourceUrl(input.imageSourceUrl) : null;
  await ensureSchema();

  const pool = await getConnection();
  const request = pool.request();
  setInput(request, {
    productId,
    primaryImageUrl: imageUrls[0] || null,
    galleryJson: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
    imageMode,
    imageNote,
    imageSourceUrl,
    updatedBy: input.updatedBy?.trim() || null,
  });

  if (imageUrls.length === 0) {
    await request.query(`
      DELETE FROM ${PRODUCT_IMAGES_TABLE}
      WHERE IDARTICULO = @productId;
    `);

    return null;
  }

  await request.query(`
    IF EXISTS (
      SELECT 1
      FROM ${PRODUCT_IMAGES_TABLE}
      WHERE IDARTICULO = @productId
    )
    BEGIN
      UPDATE ${PRODUCT_IMAGES_TABLE}
      SET
        IMAGEN_PRINCIPAL_URL = @primaryImageUrl,
        GALERIA_JSON = @galleryJson,
        IMAGEN_TIPO = @imageMode,
        IMAGEN_NOTA = @imageNote,
        IMAGEN_SOURCE_URL = @imageSourceUrl,
        ACTUALIZADO_POR = @updatedBy,
        FECHA_ACTUALIZACION = SYSDATETIME()
      WHERE IDARTICULO = @productId;
    END
    ELSE
    BEGIN
      INSERT INTO ${PRODUCT_IMAGES_TABLE} (
        IDARTICULO,
        IMAGEN_PRINCIPAL_URL,
        GALERIA_JSON,
        IMAGEN_TIPO,
        IMAGEN_NOTA,
        IMAGEN_SOURCE_URL,
        ACTUALIZADO_POR
      )
      VALUES (
        @productId,
        @primaryImageUrl,
        @galleryJson,
        @imageMode,
        @imageNote,
        @imageSourceUrl,
        @updatedBy
      );
    END
  `);

  const overrides = await getProductImageOverridesByProductIds([productId]);
  return overrides.get(productId) || null;
}

export async function deleteProductImageOverride(productId: string) {
  const normalizedProductId = normalizeProductId(productId);
  if (!normalizedProductId) {
    return;
  }

  await ensureSchema();
  const pool = await getConnection();
  const request = pool.request();
  setInput(request, { productId: normalizedProductId });

  await request.query(`
    DELETE FROM ${PRODUCT_IMAGES_TABLE}
    WHERE IDARTICULO = @productId;
  `);
}
