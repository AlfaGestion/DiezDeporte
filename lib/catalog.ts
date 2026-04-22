import "server-only";
import type { DbExecutor } from "@/lib/db";
import {
  formatSizeLabel,
  getPriceBreakdown,
  resolveImageUrl,
  toNumber,
} from "@/lib/commerce";
import { queryRows } from "@/lib/db";
import { ensureSchema as ensureAdminSystemSchema } from "@/lib/repositories/adminSystemRepository";
import { getServerSettings } from "@/lib/store-config";
import type { ServerSettings } from "@/lib/store-config";
import type { Product } from "@/lib/types";

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
  IDRUBRO: string | null;
  IDTIPO: string | null;
  TipoDescripcion: string | null;
  RubroDescripcion: string | null;
  TalleDefault: string | null;
  Presentacion: string | null;
  CUENTAPROVEEDOR: string | null;
  CODIGOBARRA: string | null;
  RutaImagen: string | null;
  URL1: string | null;
};

const GENERIC_BRAND_NAMES = new Set(["MARCA"]);
const BRAND_NAME_NORMALIZATIONS: Record<string, string> = {
  REEBOOK: "REEBOK",
  TREVO: "MONTAGNE",
};

function normalizeCatalogText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function normalizeBrandName(value: string | null | undefined) {
  const normalizedValue = normalizeCatalogText(value);
  if (!normalizedValue) {
    return "";
  }

  const canonicalValue =
    BRAND_NAME_NORMALIZATIONS[normalizedValue.toUpperCase()] ||
    normalizedValue.toUpperCase();

  if (GENERIC_BRAND_NAMES.has(canonicalValue)) {
    return "";
  }

  return canonicalValue;
}

function normalizeCategoryName(value: string | null | undefined) {
  return normalizeCatalogText(value).toUpperCase();
}

function mapProduct(record: ProductRecord, settings: ServerSettings) {
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

  return {
    id: record.IDARTICULO.trim(),
    code: record.IDARTICULO.trim(),
    description: record.DESCRIPCION.trim(),
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
    categoryId: record.IDRUBRO?.trim() || record.IdFamilia?.trim() || "",
    categoryName:
      normalizeCategoryName(record.RubroDescripcion) ||
      normalizeCatalogText(record.IdFamilia) ||
      "",
    brandId: record.IDTIPO?.trim() || "",
    brandName: normalizeBrandName(record.TipoDescripcion),
    defaultSize: formatSizeLabel(record.TalleDefault),
    presentation: record.Presentacion?.trim() || "",
    supplierAccount: record.CUENTAPROVEEDOR?.trim() || "",
    barcode: record.CODIGOBARRA?.trim() || null,
    imageUrl: resolvedImageUrl,
    imageMode: resolvedImageUrl ? "exact" : "none",
    imageNote: null,
    imageSourceUrl: null,
    cost: toNumber(record.COSTO),
  } satisfies Product;
}

function buildProductsBaseQuery(settings: ServerSettings, includeWebBlocked: boolean) {
  return `
    SELECT
      a.IDARTICULO,
      a.DESCRIPCION,
      COALESCE(a.${settings.priceColumn}, 0) AS RawPrice,
      COALESCE(a.COSTO, 0) AS COSTO,
      COALESCE(s.StockActual, 0) AS StockActual,
      COALESCE(a.TasaIVA, ${settings.defaultTaxRate}) AS TasaIVA,
      a.Moneda,
      a.IDUNIDAD,
      a.IdFamilia,
      a.IDRUBRO,
      a.IDTIPO,
      t.Descripcion AS TipoDescripcion,
      r.Descripcion AS RubroDescripcion,
      a.TalleDefault,
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1
    FROM dbo_V_MA_ARTICULOS a
    LEFT JOIN (
      SELECT
        TRIM(IDArticulo) AS IDArticulo,
        SUM(COALESCE(CantidadUD, 0)) AS StockActual
      FROM dbo_V_MV_Stock
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (:depositId IS NULL OR TRIM(COALESCE(IdDeposito, '')) = :depositId)
      GROUP BY TRIM(IDArticulo)
    ) s
      ON s.IDArticulo = TRIM(a.IDARTICULO)
    LEFT JOIN dbo_WEB_V_MA_ARTICULOS_BLOQUEADOS wb
      ON TRIM(wb.IDARTICULO) = TRIM(a.IDARTICULO)
    LEFT JOIN dbo_V_TA_TipoArticulo t
      ON TRIM(t.IdTipo) = TRIM(a.IDTIPO)
    LEFT JOIN dbo_V_TA_Rubros r
      ON TRIM(r.IdRubro) = TRIM(a.IDRUBRO)
    WHERE COALESCE(a.SUSPENDIDO, 0) = 0
      AND COALESCE(a.SuspendidoV, 0) = 0
      ${includeWebBlocked ? "" : "AND wb.ID IS NULL"}
  `;
}

export async function listProducts() {
  await ensureAdminSystemSchema();
  const settings = await getServerSettings();
  const safeLimit =
    settings.productLimit > 0
      ? Math.max(1, Math.min(10000, Math.trunc(settings.productLimit)))
      : null;
  const limitClause = safeLimit ? ` LIMIT ${safeLimit}` : "";
  const rows = await queryRows<ProductRecord>(
    `
      ${buildProductsBaseQuery(settings, false)}
      ORDER BY a.DESCRIPCION ASC${limitClause};
    `,
    { depositId: settings.stockDepositId || null },
  );

  return rows.map((record) => mapProduct(record, settings));
}

export async function getProductsByIds(
  productIds: string[],
  executor?: DbExecutor,
  options?: {
    includeWebBlocked?: boolean;
  },
) {
  if (productIds.length === 0) {
    return [];
  }

  await ensureAdminSystemSchema();
  const settings = await getServerSettings();
  const normalizedIds = productIds.map((productId) => productId.trim()).filter(Boolean);

  if (normalizedIds.length === 0) {
    return [];
  }

  const idPlaceholders = normalizedIds
    .map((_, index) => `:productId${index}`)
    .join(", ");
  const params = Object.fromEntries([
    ["depositId", settings.stockDepositId || null],
    ...normalizedIds.map((value, index) => [`productId${index}`, value]),
  ]);
  const rows = await queryRows<ProductRecord>(
    `
      ${buildProductsBaseQuery(settings, Boolean(options?.includeWebBlocked))}
      AND TRIM(a.IDARTICULO) IN (${idPlaceholders});
    `,
    params,
    executor,
  );

  return rows.map((record) => mapProduct(record, settings));
}
