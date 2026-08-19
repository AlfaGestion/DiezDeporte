import "server-only";
import type { ConnectionPool, IResult, Transaction } from "mssql";
import {
  formatSizeLabel,
  getPriceBreakdown,
  resolveImageUrl,
  toNumber,
} from "@/lib/commerce";
import { getConnection, sql } from "@/lib/db";
import {
  collectDistinctLegacyArticleIds,
  getLegacyArticleId,
} from "@/lib/legacy-article-id";
import { resolveManagedProductImageUrls } from "@/lib/product-image-storage";
import {
  getProductImageOverridesByProductIds,
  type ProductImageOverride,
} from "@/lib/repositories/productImageRepository";
import {
  getProductAdminOverridesByProductIds,
  type ProductAdminOverride,
} from "@/lib/repositories/productOverrideRepository";
import { getServerSettings } from "@/lib/store-config";
import type { ServerSettings } from "@/lib/store-config";
import type { Product } from "@/lib/types";

type Executor = ConnectionPool | Transaction;

type ProductRecord = {
  IDARTICULO: string;
  DESCRIPCION: string;
  Procedencia: string | null;
  RawPrice: number;
  COSTO: number | null;
  StockActual: number | null;
  TasaIVA: number | null;
  Moneda: string | null;
  IDUNIDAD: string | null;
  IdFamilia: string | null;
  IDTIPO: string | null;
  IDRUBRO: string | null;
  TalleDefault: string | null;
  ColorDefault: string | null;
  Presentacion: string | null;
  CUENTAPROVEEDOR: string | null;
  CODIGOBARRA: string | null;
  RutaImagen: string | null;
  URL1: string | null;
  BrandDescription: string | null;
  CategoryDescription: string | null;
};

const SQL_IN_PARAMETER_CHUNK_SIZE = 1800;
const DESCENDANT_CHUNK_SIZE = 400;

export type AdminProductImageEntry = {
  product: Product;
  baseProduct: Product;
  imageOverride: ProductImageOverride | null;
  contentOverride: ProductAdminOverride | null;
  isPublishedInCatalog: boolean;
};

export type AdminProductSearchPage = {
  entries: AdminProductImageEntry[];
  totalCount: number;
  publishedCount: number;
  allCount: number;
  page: number;
  pageSize: number;
};

declare global {
  var __diezDeportesProductImageGalleryCache:
    | Map<string, string[]>
    | undefined;
  var __diezDeportesListProductsCache:
    | { at: number; promise: Promise<Product[]> }
    | undefined;
}

function getProductImageGalleryCache() {
  if (!global.__diezDeportesProductImageGalleryCache) {
    global.__diezDeportesProductImageGalleryCache = new Map<string, string[]>();
  }

  return global.__diezDeportesProductImageGalleryCache;
}

function setInput(
  request: ReturnType<typeof createRequest> | ReturnType<ConnectionPool["request"]>,
  name: string,
  value: unknown,
) {
  request.input(name, value);
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function buildProductImageGallery(productCode: string, settings: ServerSettings) {
  const baseCode = productCode.split("||")[0] || productCode;

  if (!baseCode) {
    return [];
  }

  const cacheKey = [
    settings.productImageSuffixes.join(","),
    settings.productImageExtensions.join(","),
    baseCode,
  ].join("::");
  const cache = getProductImageGalleryCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const urls = await resolveManagedProductImageUrls({
      productId: baseCode,
      suffixes: settings.productImageSuffixes,
      extensions: settings.productImageExtensions,
    });

    cache.set(cacheKey, urls);
    return urls;
  } catch (error) {
    console.error("[catalog] No se pudo resolver la galeria de imagenes.", error);
    cache.set(cacheKey, []);
    return [];
  }
}

function isCatalogPublishedValue(value: string | null | undefined) {
  return (value || "").trim().toLowerCase() === "1";
}

async function mapBaseProduct(record: ProductRecord, settings: ServerSettings) {
  const articleId = getLegacyArticleId(record.IDARTICULO);
  const taxRate = toNumber(record.TasaIVA, settings.defaultTaxRate);
  const pricing = getPriceBreakdown(
    toNumber(record.RawPrice),
    taxRate,
    settings.pricesIncludeTax,
  );
  const resolvedImageUrl = resolveImageUrl(
    record.RutaImagen?.trim() || null,
    null,
    settings.imageBaseUrl,
  );
  const imageGalleryUrls = resolvedImageUrl
    ? [resolvedImageUrl]
    : await buildProductImageGallery(articleId, settings);
  const primaryImageUrl = imageGalleryUrls[0] || resolvedImageUrl || null;

  return {
    id: articleId,
    code: articleId,
    procedencia: getLegacyArticleId(record.Procedencia),
    description: record.DESCRIPCION.trim(),
    brand: record.BrandDescription?.trim() || "",
    category: record.CategoryDescription?.trim() || "",
    categoryId: record.IDRUBRO?.trim() || "",
    price: pricing.grossPrice,
    netPrice: pricing.netPrice,
    taxAmount: pricing.taxAmount,
    rawPrice: toNumber(record.RawPrice),
    stock: Math.max(0, toNumber(record.StockActual)),
    taxRate,
    currency: record.Moneda?.trim() || "ARS",
    unitId: record.IDUNIDAD?.trim() || "",
    familyId: record.IdFamilia?.trim() || "",
    typeId: record.IDTIPO?.trim() || "",
    defaultSize: formatSizeLabel(record.TalleDefault),
    defaultColor: record.ColorDefault?.trim() || "",
    presentation: record.Presentacion?.trim() || "",
    supplierAccount: record.CUENTAPROVEEDOR?.trim() || "",
    barcode: record.CODIGOBARRA?.trim() || null,
    imageUrl: primaryImageUrl,
    imageGalleryUrls,
    imageMode: primaryImageUrl ? "exact" : "none",
    imageNote: null,
    imageSourceUrl: null,
    cost: toNumber(record.COSTO),
  } satisfies Product;
}

function applyProductContentOverride(
  product: Product,
  override: ProductAdminOverride | null | undefined,
  settings: ServerSettings,
) {
  if (!override) {
    return product;
  }

  const nextProduct: Product = {
    ...product,
    description: override.description || product.description,
    brand: override.brand || product.brand,
    category: override.category || product.category,
  };

  if (override.price !== null) {
    const pricing = getPriceBreakdown(
      override.price,
      product.taxRate,
      settings.pricesIncludeTax,
    );

    nextProduct.price = pricing.grossPrice;
    nextProduct.netPrice = pricing.netPrice;
    nextProduct.taxAmount = pricing.taxAmount;
    nextProduct.rawPrice = override.price;
  }

  return nextProduct;
}

function applyProductImageOverride(
  product: Product,
  override: ProductImageOverride | null | undefined,
) {
  if (!override || override.imageGalleryUrls.length === 0) {
    return product;
  }

  return {
    ...product,
    imageUrl: override.imageGalleryUrls[0] || null,
    imageGalleryUrls: override.imageGalleryUrls,
    imageMode: override.imageMode,
    imageNote: override.imageNote,
    imageSourceUrl: override.imageSourceUrl,
  } satisfies Product;
}

async function buildAdminProductImageEntries(
  records: ProductRecord[],
  settings: ServerSettings,
) {
  const recordById = new Map(
    records.map((record) => [getLegacyArticleId(record.IDARTICULO), record] as const),
  );
  const baseProducts = await Promise.all(
    records.map((record) => mapBaseProduct(record, settings)),
  );
  const [imageOverrides, contentOverrides] = await Promise.all([
    getProductImageOverridesByProductIds(baseProducts.map((product) => product.id)),
    getProductAdminOverridesByProductIds(baseProducts.map((product) => product.id)),
  ]);

  return baseProducts.map((baseProduct) => {
    const matchingRecord = recordById.get(baseProduct.id);
    const imageOverride = imageOverrides.get(baseProduct.id) || null;
    const contentOverride = contentOverrides.get(baseProduct.id) || null;
    const contentAppliedProduct = applyProductContentOverride(
      baseProduct,
      contentOverride,
      settings,
    );

    return {
      baseProduct,
      contentOverride,
      imageOverride,
      isPublishedInCatalog: isCatalogPublishedValue(matchingRecord?.URL1),
      product: applyProductImageOverride(contentAppliedProduct, imageOverride),
    } satisfies AdminProductImageEntry;
  });
}

async function fetchPublishedStoreProductRecords(input?: {
  query?: string;
}) {
  const settings = await getServerSettings();
  const pool = await getConnection();
  const request = createRequest(pool);
  const normalizedQuery = (input?.query || "").trim();
  const searchLike = normalizedQuery ? `%${normalizedQuery}%` : "";
  const searchPrefix = normalizedQuery ? `${normalizedQuery}%` : "";

  setInput(request, "depositId", settings.stockDepositId || null);
  setInput(request, "search", normalizedQuery);
  setInput(request, "searchLike", searchLike);
  setInput(request, "searchPrefix", searchPrefix);

  const result = await request.query<ProductRecord>(`
    WITH StockActual AS (
      SELECT
        ISNULL(IDArticulo, '') AS IDArticulo,
        SUM(ISNULL(CantidadUD, 0)) AS StockActual
      FROM dbo.V_MV_Stock WITH (NOLOCK)
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
      GROUP BY ISNULL(IDArticulo, '')
    )
    SELECT
      a.IDARTICULO,
      a.DESCRIPCION,
      a.Procedencia,
      CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
      CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
      CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
      CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
      a.Moneda,
      a.IDUNIDAD,
      a.IdFamilia,
      a.IDTIPO,
      a.IDRUBRO,
      a.TalleDefault,
      a.ColorDefault,
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1,
      tipo.Descripcion AS BrandDescription,
      rubro.Descripcion AS CategoryDescription
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
    LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
      ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
    LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
      ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
    WHERE ISNULL(a.SUSPENDIDO, 0) = 0
      AND ISNULL(a.SuspendidoV, 0) = 0
      AND LOWER(LTRIM(RTRIM(ISNULL(a.URL1, '')))) = '1'
      AND (
        @search = ''
        OR a.IDARTICULO LIKE @searchLike
        OR a.DESCRIPCION LIKE @searchLike
        OR ISNULL(a.CODIGOBARRA, '') LIKE @searchLike
      )
    ORDER BY
      CASE
        WHEN @search <> '' AND a.IDARTICULO = @search THEN 0
        WHEN @search <> '' AND a.IDARTICULO LIKE @searchLike THEN 1
        WHEN @search <> '' AND a.DESCRIPCION LIKE @searchPrefix THEN 2
        ELSE 3
      END,
      a.DESCRIPCION ASC;
  `);

  return {
    settings,
    records: result.recordset,
  };
}

async function fetchStoreDescendantProductRecords(
  seedIds: string[],
  settings: ServerSettings,
) {
  const requestedIds = collectDistinctLegacyArticleIds(seedIds);
  if (requestedIds.length === 0) {
    return [] as ProductRecord[];
  }

  const pool = await getConnection();

  const chunkResults = await Promise.all(
    chunkValues(requestedIds, DESCENDANT_CHUNK_SIZE).map(async (chunk) => {
      const request = createRequest(pool);
      setInput(request, "depositId", settings.stockDepositId || null);

      const procedenciaPlaceholders = chunk.map((_, index) => `@seedId${index}`);
      const prefixConditions = chunk.map((_, index) => `a.IDARTICULO LIKE @seedPrefix${index}`);

      chunk.forEach((seedId, index) => {
        setInput(request, `seedId${index}`, seedId);
        setInput(request, `seedPrefix${index}`, `${seedId}|%`);
      });

      const result = await request.query<ProductRecord>(`
        WITH StockActual AS (
          SELECT
            ISNULL(IDArticulo, '') AS IDArticulo,
            SUM(ISNULL(CantidadUD, 0)) AS StockActual
          FROM dbo.V_MV_Stock WITH (NOLOCK)
          WHERE (Anulado = 0 OR Anulado IS NULL)
            AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
          GROUP BY ISNULL(IDArticulo, '')
        )
        SELECT
          a.IDARTICULO,
          a.DESCRIPCION,
          a.Procedencia,
          CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
          CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
          CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
          CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
          a.Moneda,
          a.IDUNIDAD,
          a.IdFamilia,
          a.IDTIPO,
          a.IDRUBRO,
          a.TalleDefault,
          a.ColorDefault,
          a.Presentacion,
          a.CUENTAPROVEEDOR,
          a.CODIGOBARRA,
          a.RutaImagen,
          a.URL1,
          tipo.Descripcion AS BrandDescription,
          rubro.Descripcion AS CategoryDescription
        FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
        LEFT JOIN StockActual s
          ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
        LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
          ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
        LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
          ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
        WHERE ISNULL(a.SUSPENDIDO, 0) = 0
          AND ISNULL(a.SuspendidoV, 0) = 0
          AND (
            ISNULL(a.Procedencia, '') IN (${procedenciaPlaceholders.join(", ")})
            OR ${prefixConditions.join("\n          OR ")}
          );
      `);

      return result.recordset;
    }),
  );

  return chunkResults.flat();
}

async function expandStoreProductRecords(
  baseRecords: ProductRecord[],
  settings: ServerSettings,
) {
  const recordById = new Map(
    baseRecords.map((record) => [getLegacyArticleId(record.IDARTICULO), record] as const),
  );
  const processedSeedIds = new Set<string>();
  let frontierSeedIds = baseRecords.map((record) => getLegacyArticleId(record.IDARTICULO));

  while (frontierSeedIds.length > 0) {
    const nextSeedIds = collectDistinctLegacyArticleIds(frontierSeedIds).filter(
      (seedId) => !processedSeedIds.has(seedId),
    );

    frontierSeedIds = [];

    if (nextSeedIds.length === 0) {
      break;
    }

    nextSeedIds.forEach((seedId) => processedSeedIds.add(seedId));

    const descendantRecords = await fetchStoreDescendantProductRecords(nextSeedIds, settings);

    for (const record of descendantRecords) {
      const productId = getLegacyArticleId(record.IDARTICULO);

      if (!productId || recordById.has(productId)) {
        continue;
      }

      recordById.set(productId, record);
      frontierSeedIds.push(productId);
    }
  }

  return Array.from(recordById.values());
}

const LIST_PRODUCTS_CACHE_TTL_MS = 45_000;

async function computeListProducts() {
  const { settings, records } = await fetchPublishedStoreProductRecords();
  const expandedRecords = await expandStoreProductRecords(records, settings);
  const entries = await buildAdminProductImageEntries(expandedRecords, settings);
  return entries.map((entry) => entry.product);
}

export function invalidateListProductsCache() {
  global.__diezDeportesListProductsCache = undefined;
}

export async function listProducts() {
  const cached = global.__diezDeportesListProductsCache;

  if (cached && Date.now() - cached.at < LIST_PRODUCTS_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = computeListProducts();
  global.__diezDeportesListProductsCache = { at: Date.now(), promise };

  try {
    return await promise;
  } catch (error) {
    if (global.__diezDeportesListProductsCache?.promise === promise) {
      global.__diezDeportesListProductsCache = undefined;
    }

    throw error;
  }
}

export async function getProductsByIds(
  productIds: string[],
  executor?: Executor,
): Promise<Product[]> {
  const requestedIds = collectDistinctLegacyArticleIds(productIds);
  if (requestedIds.length === 0) return [];

  const settings = await getServerSettings();
  const connection = executor || (await getConnection());
  const records: ProductRecord[] = [];

  for (const chunk of chunkValues(requestedIds, SQL_IN_PARAMETER_CHUNK_SIZE)) {
    const request = createRequest(connection);
    setInput(request, "depositId", settings.stockDepositId || null);

    const placeholders = chunk.map((_, index) => `@productId${index}`);
    chunk.forEach((productId, index) => {
      setInput(request, `productId${index}`, productId);
    });

    const result: IResult<ProductRecord> = await request.query(`
      WITH StockActual AS (
        SELECT
          ISNULL(IDArticulo, '') AS IDArticulo,
          SUM(ISNULL(CantidadUD, 0)) AS StockActual
        FROM dbo.V_MV_Stock WITH (NOLOCK)
        WHERE (Anulado = 0 OR Anulado IS NULL)
          AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
        GROUP BY ISNULL(IDArticulo, '')
      )
      SELECT
        a.IDARTICULO,
        a.DESCRIPCION,
        a.Procedencia,
        CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
        CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
        CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
        CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
        a.Moneda,
        a.IDUNIDAD,
        a.IdFamilia,
        a.IDTIPO,
        a.IDRUBRO,
        a.TalleDefault,
        a.ColorDefault,
        a.Presentacion,
        a.CUENTAPROVEEDOR,
        a.CODIGOBARRA,
        a.RutaImagen,
        a.URL1,
        tipo.Descripcion AS BrandDescription,
        rubro.Descripcion AS CategoryDescription
      FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
      LEFT JOIN StockActual s
        ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
      LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
        ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
      LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
        ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
      WHERE a.IDARTICULO IN (${placeholders.join(", ")})
        AND ISNULL(a.SUSPENDIDO, 0) = 0
        AND ISNULL(a.SuspendidoV, 0) = 0;
    `);

    records.push(...result.recordset);
  }

  const entries = await buildAdminProductImageEntries(records, settings);
  const productById = new Map(entries.map((entry) => [entry.product.id, entry.product]));

  return requestedIds
    .map((productId) => productById.get(productId))
    .filter((product): product is Product => Boolean(product));
}

export async function getAdminProductsByIds(
  productIds: string[],
): Promise<AdminProductImageEntry[]> {
  const requestedIds = collectDistinctLegacyArticleIds(productIds);
  if (requestedIds.length === 0) {
    return [];
  }

  const settings = await getServerSettings();
  const pool = await getConnection();
  const records: ProductRecord[] = [];

  for (const chunk of chunkValues(requestedIds, SQL_IN_PARAMETER_CHUNK_SIZE)) {
    const request = createRequest(pool);

    chunk.forEach((productId, index) => {
      setInput(request, `productId${index}`, productId);
    });

    setInput(request, "depositId", settings.stockDepositId || null);

    const placeholders = chunk.map((_, index) => `@productId${index}`);
    const result: IResult<ProductRecord> = await request.query(`
      WITH StockActual AS (
        SELECT
          ISNULL(IDArticulo, '') AS IDArticulo,
          SUM(ISNULL(CantidadUD, 0)) AS StockActual
        FROM dbo.V_MV_Stock WITH (NOLOCK)
        WHERE (Anulado = 0 OR Anulado IS NULL)
          AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
        GROUP BY ISNULL(IDArticulo, '')
      )
      SELECT
        a.IDARTICULO,
        a.DESCRIPCION,
        a.Procedencia,
        CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
        CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
        CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
        CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
        a.Moneda,
        a.IDUNIDAD,
        a.IdFamilia,
        a.IDTIPO,
        a.IDRUBRO,
        a.TalleDefault,
        a.ColorDefault,
        a.Presentacion,
        a.CUENTAPROVEEDOR,
        a.CODIGOBARRA,
        a.RutaImagen,
        a.URL1,
        tipo.Descripcion AS BrandDescription,
        rubro.Descripcion AS CategoryDescription
      FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
      LEFT JOIN StockActual s
        ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
      LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
        ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
      LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
        ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
      WHERE a.IDARTICULO IN (${placeholders.join(", ")})
        AND ISNULL(a.SUSPENDIDO, 0) = 0
        AND ISNULL(a.SuspendidoV, 0) = 0;
    `);

    records.push(...result.recordset);
  }

  const entries = await buildAdminProductImageEntries(records, settings);
  const entryById = new Map(entries.map((entry) => [entry.product.id, entry]));
  const orderedEntries: AdminProductImageEntry[] = [];

  for (const productId of requestedIds) {
    const entry = entryById.get(productId);
    if (entry) {
      orderedEntries.push(entry);
    }
  }

  return orderedEntries;
}

export async function getAdminProductsByGroupRelationKey(input: {
  groupRelationKey: string;
  publishedOnly?: boolean;
}) {
  const groupRelationKey = input.groupRelationKey.trim();
  if (!groupRelationKey) {
    return [] as AdminProductImageEntry[];
  }

  const settings = await getServerSettings();
  const pool = await getConnection();
  const request = createRequest(pool);

  setInput(request, "depositId", settings.stockDepositId || null);
  setInput(request, "groupRelationKey", groupRelationKey);
  setInput(request, "publishedOnly", input.publishedOnly ? 1 : 0);

  const result: IResult<ProductRecord> = await request.query(`
    WITH StockActual AS (
      SELECT
        ISNULL(IDArticulo, '') AS IDArticulo,
        SUM(ISNULL(CantidadUD, 0)) AS StockActual
      FROM dbo.V_MV_Stock WITH (NOLOCK)
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
      GROUP BY ISNULL(IDArticulo, '')
    )
    SELECT
      a.IDARTICULO,
      a.DESCRIPCION,
      a.Procedencia,
      CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
      CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
      CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
      CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
      a.Moneda,
      a.IDUNIDAD,
      a.IdFamilia,
      a.IDTIPO,
      a.IDRUBRO,
      a.TalleDefault,
      a.ColorDefault,
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1,
      tipo.Descripcion AS BrandDescription,
      rubro.Descripcion AS CategoryDescription
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
    LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
      ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
    LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
      ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
    WHERE ISNULL(a.SUSPENDIDO, 0) = 0
      AND ISNULL(a.SuspendidoV, 0) = 0
      AND (
        LTRIM(RTRIM(
          CASE
            WHEN LTRIM(RTRIM(ISNULL(a.Procedencia, ''))) <> ''
              AND CHARINDEX('|', ISNULL(a.Procedencia, '')) > 0
              THEN LEFT(a.Procedencia, CHARINDEX('|', a.Procedencia) - 1)
            WHEN LTRIM(RTRIM(ISNULL(a.Procedencia, ''))) <> ''
              THEN ISNULL(a.Procedencia, '')
            WHEN CHARINDEX('|', ISNULL(a.IDARTICULO, '')) > 0
              THEN LEFT(a.IDARTICULO, CHARINDEX('|', a.IDARTICULO) - 1)
            ELSE ISNULL(a.IDARTICULO, '')
          END
        )) = @groupRelationKey
      )
      AND (
        @publishedOnly = 0
        OR LOWER(LTRIM(RTRIM(ISNULL(a.URL1, '')))) = '1'
      )
    ORDER BY a.DESCRIPCION ASC, a.IDARTICULO ASC;
  `);

  return buildAdminProductImageEntries(result.recordset, settings);
}

export async function searchProductsForAdminPage(input: {
  query: string;
  brandId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  publishedOnly?: boolean;
}): Promise<AdminProductSearchPage> {
  const settings = await getServerSettings();
  const pool = await getConnection();
  const safeLimit = Math.max(
    1,
    Math.min(120, Math.trunc(input.limit ?? settings.productLimit)),
  );
  const safePage = Math.max(1, Math.trunc(input.page ?? 1));
  const offset = (safePage - 1) * safeLimit;
  const normalizedQuery = input.query.trim();
  const brandId = input.brandId || "";
  const categoryId = input.categoryId || "";
  const searchLike = normalizedQuery ? `%${normalizedQuery}%` : "";
  const searchPrefix = normalizedQuery ? `${normalizedQuery}%` : "";
  const publishedOnly = input.publishedOnly ? 1 : 0;

  const countRequest = createRequest(pool);
  setInput(countRequest, "search", normalizedQuery);
  setInput(countRequest, "searchLike", searchLike);
  setInput(countRequest, "brandId", brandId);
  setInput(countRequest, "categoryId", categoryId);

  const pageRequest = createRequest(pool);
  setInput(pageRequest, "depositId", settings.stockDepositId || null);
  setInput(pageRequest, "search", normalizedQuery);
  setInput(pageRequest, "searchLike", searchLike);
  setInput(pageRequest, "searchPrefix", searchPrefix);
  setInput(pageRequest, "brandId", brandId);
  setInput(pageRequest, "categoryId", categoryId);
  setInput(pageRequest, "publishedOnly", publishedOnly);
  setInput(pageRequest, "offsetRows", offset);
  setInput(pageRequest, "fetchRows", safeLimit);

  const [countResult, pageResult] = await Promise.all([
    countRequest.query<{
      AllCount: number | null;
      PublishedCount: number | null;
    }>(`
      WITH FilteredBase AS (
        SELECT
          CASE
            WHEN LOWER(LTRIM(RTRIM(ISNULL(a.URL1, '')))) = '1' THEN 1
            ELSE 0
          END AS IsPublishedInCatalog
        FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
        WHERE ISNULL(a.SUSPENDIDO, 0) = 0
          AND ISNULL(a.SuspendidoV, 0) = 0
          AND (@brandId = '' OR ISNULL(a.IDTIPO, '') = @brandId)
          AND (@categoryId = '' OR ISNULL(a.IDRUBRO, '') = @categoryId)
          AND (
            @search = ''
            OR a.IDARTICULO LIKE @searchLike
            OR a.DESCRIPCION LIKE @searchLike
            OR ISNULL(a.CODIGOBARRA, '') LIKE @searchLike
          )
      )
      SELECT
        COUNT(*) AS AllCount,
        SUM(IsPublishedInCatalog) AS PublishedCount
      FROM FilteredBase;
    `),
    pageRequest.query<ProductRecord>(`
      WITH StockActual AS (
        SELECT
          ISNULL(IDArticulo, '') AS IDArticulo,
          SUM(ISNULL(CantidadUD, 0)) AS StockActual
        FROM dbo.V_MV_Stock WITH (NOLOCK)
        WHERE (Anulado = 0 OR Anulado IS NULL)
          AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
        GROUP BY ISNULL(IDArticulo, '')
      ),
      FilteredBase AS (
        SELECT
          a.IDARTICULO,
          a.DESCRIPCION,
          a.Procedencia,
          CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
          CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
          CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
          CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
          a.Moneda,
          a.IDUNIDAD,
          a.IdFamilia,
          a.IDTIPO,
          a.IDRUBRO,
          a.TalleDefault,
          a.ColorDefault,
          a.Presentacion,
          a.CUENTAPROVEEDOR,
          a.CODIGOBARRA,
          a.RutaImagen,
          a.URL1,
          tipo.Descripcion AS BrandDescription,
          rubro.Descripcion AS CategoryDescription,
          CASE
            WHEN LOWER(LTRIM(RTRIM(ISNULL(a.URL1, '')))) = '1' THEN 1
            ELSE 0
          END AS IsPublishedInCatalog
        FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
        LEFT JOIN StockActual s
          ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
        LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
          ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
        LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
          ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
        WHERE ISNULL(a.SUSPENDIDO, 0) = 0
          AND ISNULL(a.SuspendidoV, 0) = 0
          AND (@brandId = '' OR ISNULL(a.IDTIPO, '') = @brandId)
          AND (@categoryId = '' OR ISNULL(a.IDRUBRO, '') = @categoryId)
          AND (
            @search = ''
            OR a.IDARTICULO LIKE @searchLike
            OR a.DESCRIPCION LIKE @searchLike
            OR ISNULL(a.CODIGOBARRA, '') LIKE @searchLike
          )
      )
      SELECT
        IDARTICULO,
        DESCRIPCION,
        Procedencia,
        RawPrice,
        COSTO,
        StockActual,
        TasaIVA,
        Moneda,
        IDUNIDAD,
        IdFamilia,
        IDTIPO,
        IDRUBRO,
        TalleDefault,
        ColorDefault,
        Presentacion,
        CUENTAPROVEEDOR,
        CODIGOBARRA,
        RutaImagen,
        URL1,
        BrandDescription,
        CategoryDescription
      FROM FilteredBase
      WHERE (@publishedOnly = 0 OR IsPublishedInCatalog = 1)
      ORDER BY
        CASE
          WHEN @search <> '' AND IDARTICULO = @search THEN 0
          WHEN @search <> '' AND IDARTICULO LIKE @searchLike THEN 1
          WHEN @search <> '' AND DESCRIPCION LIKE @searchPrefix THEN 2
          ELSE 3
        END,
        DESCRIPCION ASC,
        IDARTICULO ASC
      OFFSET @offsetRows ROWS
      FETCH NEXT @fetchRows ROWS ONLY;
    `),
  ]);

  const counts = countResult.recordset[0] || {
    AllCount: 0,
    PublishedCount: 0,
  };
  const allCount = Number(counts.AllCount || 0);
  const publishedCount = Number(counts.PublishedCount || 0);

  return {
    entries: await buildAdminProductImageEntries(pageResult.recordset, settings),
    totalCount: publishedOnly ? publishedCount : allCount,
    publishedCount,
    allCount,
    page: safePage,
    pageSize: safeLimit,
  } satisfies AdminProductSearchPage;
}

export async function searchProductsForAdmin(input: {
  query: string;
  brandId?: string;
  categoryId?: string;
  limit?: number;
}) {
  const settings = await getServerSettings();
  const pool = await getConnection();
  const request = createRequest(pool);
  const safeLimit = Math.max(
    1,
    Math.min(1000, Math.trunc(input.limit ?? settings.productLimit)),
  );
  const normalizedQuery = input.query.trim();
  const brandId = input.brandId || "";
  const categoryId = input.categoryId || "";
  const searchLike = normalizedQuery ? `%${normalizedQuery}%` : "";
  const searchPrefix = normalizedQuery ? `${normalizedQuery}%` : "";

  setInput(request, "depositId", settings.stockDepositId || null);
  setInput(request, "search", normalizedQuery);
  setInput(request, "searchLike", searchLike);
  setInput(request, "searchPrefix", searchPrefix);
  setInput(request, "brandId", brandId);
  setInput(request, "categoryId", categoryId);

  const result: IResult<ProductRecord> = await request.query(`
    WITH StockActual AS (
      SELECT
        ISNULL(IDArticulo, '') AS IDArticulo,
        SUM(ISNULL(CantidadUD, 0)) AS StockActual
      FROM dbo.V_MV_Stock WITH (NOLOCK)
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
      GROUP BY ISNULL(IDArticulo, '')
    )
    SELECT
      a.IDARTICULO,
      a.DESCRIPCION,
      a.Procedencia,
      CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
      CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
      CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
      CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
      a.Moneda,
      a.IDUNIDAD,
      a.IdFamilia,
      a.IDTIPO,
      a.IDRUBRO,
      a.TalleDefault,
      a.ColorDefault,
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1,
      tipo.Descripcion AS BrandDescription,
      rubro.Descripcion AS CategoryDescription
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
    LEFT JOIN dbo.V_TA_TipoArticulo tipo WITH (NOLOCK)
      ON LTRIM(RTRIM(tipo.IdTipo)) = LTRIM(RTRIM(a.IDTIPO))
    LEFT JOIN dbo.V_TA_Rubros rubro WITH (NOLOCK)
      ON LTRIM(RTRIM(rubro.IdRubro)) = LTRIM(RTRIM(a.IDRUBRO))
    WHERE ISNULL(a.SUSPENDIDO, 0) = 0
      AND ISNULL(a.SuspendidoV, 0) = 0
      AND (@brandId = '' OR ISNULL(a.IDTIPO, '') = @brandId)
      AND (@categoryId = '' OR ISNULL(a.IDRUBRO, '') = @categoryId)
      AND (
        @search = ''
        OR a.IDARTICULO LIKE @searchLike
        OR a.DESCRIPCION LIKE @searchLike
        OR ISNULL(a.CODIGOBARRA, '') LIKE @searchLike
      )
    ORDER BY
      CASE
        WHEN @search <> '' AND a.IDARTICULO = @search THEN 0
        WHEN @search <> '' AND a.IDARTICULO LIKE @searchLike THEN 1
        WHEN @search <> '' AND a.DESCRIPCION LIKE @searchPrefix THEN 2
        ELSE 3
      END,
      a.DESCRIPCION ASC;
  `);

  return buildAdminProductImageEntries(result.recordset, settings);
}

function normalizeStoreFilterText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchStoreProducts(input: {
  query?: string;
  brand?: string;
  category?: string;
}) {
  const normalizedQuery = (input.query || "").trim();
  const normalizedBrand = normalizeStoreFilterText(input.brand);
  const normalizedCategory = normalizeStoreFilterText(input.category);
  const { settings, records } = await fetchPublishedStoreProductRecords({
    query: normalizedQuery,
  });
  const expandedRecords = await expandStoreProductRecords(records, settings);
  const entries = await buildAdminProductImageEntries(expandedRecords, settings);

  return entries
    .map((entry) => entry.product)
    .filter((product) => {
      if (
        normalizedBrand
        && normalizeStoreFilterText(product.brand) !== normalizedBrand
      ) {
        return false;
      }

      if (
        normalizedCategory
        && normalizeStoreFilterText(product.category) !== normalizedCategory
      ) {
        return false;
      }

      return true;
    });
}

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}
