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

export type AdminProductImageEntry = {
  product: Product;
  baseProduct: Product;
  imageOverride: ProductImageOverride | null;
  contentOverride: ProductAdminOverride | null;
};

declare global {
  var __diezDeportesProductImageGalleryCache:
    | Map<string, string[]>
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
    record.URL1?.trim() || null,
    settings.imageBaseUrl,
  );
  const imageGalleryUrls = resolvedImageUrl
    ? [resolvedImageUrl]
    : await buildProductImageGallery(articleId, settings);
  const primaryImageUrl = imageGalleryUrls[0] || resolvedImageUrl || null;

  return {
    id: articleId,
    code: articleId,
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
  const baseProducts = await Promise.all(
    records.map((record) => mapBaseProduct(record, settings)),
  );
  const [imageOverrides, contentOverrides] = await Promise.all([
    getProductImageOverridesByProductIds(baseProducts.map((product) => product.id)),
    getProductAdminOverridesByProductIds(baseProducts.map((product) => product.id)),
  ]);

  return baseProducts.map((baseProduct) => {
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
      product: applyProductImageOverride(contentAppliedProduct, imageOverride),
    } satisfies AdminProductImageEntry;
  });
}

export async function listProducts() {
  const settings = await getServerSettings();
  const pool = await getConnection();
  const request = pool.request();
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(settings.productLimit)));

  setInput(request, "depositId", settings.stockDepositId || null);

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
    SELECT TOP (${safeLimit})
      a.IDARTICULO,
      a.DESCRIPCION,
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
    ORDER BY a.DESCRIPCION ASC;
  `);

  const entries = await buildAdminProductImageEntries(result.recordset, settings);
  return entries.map((entry) => entry.product);
}

export async function getProductsByIds(
  productIds: string[],
  executor?: Executor,
) {
  const requestedIds = collectDistinctLegacyArticleIds(productIds);
  if (requestedIds.length === 0) return [];

  const settings = await getServerSettings();
  const connection = executor || (await getConnection());
  const request = createRequest(connection);
  setInput(request, "depositId", settings.stockDepositId || null);

  const placeholders = requestedIds.map((_, index) => `@productId${index}`);
  requestedIds.forEach((productId, index) => {
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
      CAST(ISNULL(a.${settings.priceColumn}, 0) AS float) AS RawPrice,
      CAST(ISNULL(a.COSTO, 0) AS float) AS COSTO,
      CAST(ISNULL(s.StockActual, 0) AS float) AS StockActual,
      CAST(ISNULL(a.TasaIVA, ${settings.defaultTaxRate}) AS float) AS TasaIVA,
      a.Moneda,
      a.IDUNIDAD,
      a.IdFamilia,
      a.IDTIPO,
      a.TalleDefault,
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = ISNULL(a.IDARTICULO, '')
    WHERE a.IDARTICULO IN (${placeholders.join(", ")})
      AND ISNULL(a.SUSPENDIDO, 0) = 0
      AND ISNULL(a.SuspendidoV, 0) = 0;
  `);

  const entries = await buildAdminProductImageEntries(result.recordset, settings);
  return entries.map((entry) => entry.product);
}

export async function getAdminProductsByIds(productIds: string[]) {
  const requestedIds = collectDistinctLegacyArticleIds(productIds);
  if (requestedIds.length === 0) {
    return [];
  }

  const settings = await getServerSettings();
  const pool = await getConnection();
  const request = createRequest(pool);

  requestedIds.forEach((productId, index) => {
    setInput(request, `productId${index}`, productId);
  });

  setInput(request, "depositId", settings.stockDepositId || null);

  const placeholders = requestedIds.map((_, index) => `@productId${index}`);
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

  return buildAdminProductImageEntries(result.recordset, settings);
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
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(input.limit ?? 60)));
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
    SELECT TOP (${safeLimit})
      a.IDARTICULO,
      a.DESCRIPCION,
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

function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}
