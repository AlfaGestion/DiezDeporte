import "server-only";
import type { ConnectionPool, IResult, Transaction } from "mssql";
import {
  getPriceBreakdown,
  resolveImageUrl,
  toNumber,
} from "@/lib/commerce";
import { getConnection, sql } from "@/lib/db";
import { getOdooAssets } from "@/lib/odoo";
import { getServerSettings } from "@/lib/store-config";
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
  Presentacion: string | null;
  CUENTAPROVEEDOR: string | null;
  CODIGOBARRA: string | null;
  RutaImagen: string | null;
  URL1: string | null;
};

function setInput(
  request: ReturnType<typeof createRequest> | ReturnType<ConnectionPool["request"]>,
  name: string,
  value: unknown,
) {
  request.input(name, value);
}

function mapProduct(record: ProductRecord) {
  const settings = getServerSettings();
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

  const product: Product = {
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
    presentation: record.Presentacion?.trim() || "",
    supplierAccount: record.CUENTAPROVEEDOR?.trim() || "",
    barcode: record.CODIGOBARRA?.trim() || null,
    imageUrl: resolvedImageUrl,
    imageMode: resolvedImageUrl ? "exact" : "none",
    imageNote: null,
    imageSourceUrl: null,
    cost: toNumber(record.COSTO),
  };

  return product;
}

export async function listProducts() {
  const settings = getServerSettings();
  const pool = await getConnection();
  const request = pool.request();
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(settings.productLimit)));

  setInput(request, "depositId", settings.stockDepositId || null);

  const result = await request.query<ProductRecord>(`
    WITH StockActual AS (
      SELECT
        LTRIM(RTRIM(IDArticulo)) AS IDArticulo,
        SUM(ISNULL(CantidadUD, 0)) AS StockActual
      FROM dbo.V_MV_Stock WITH (NOLOCK)
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
      GROUP BY LTRIM(RTRIM(IDArticulo))
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
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = LTRIM(RTRIM(a.IDARTICULO))
    WHERE ISNULL(a.SUSPENDIDO, 0) = 0
      AND ISNULL(a.SuspendidoV, 0) = 0
    ORDER BY a.DESCRIPCION ASC;
  `);

  const products = result.recordset.map(mapProduct);
  const odooAssets = await getOdooAssets();
  const odooProductImages = Array.from(odooAssets.productImages.values());

  return products.map<Product>((product) => {
    const odooImage = odooAssets.productImages.get(product.id.trim().toUpperCase());

    if (!odooImage) {
      const illustrativeImage = findIllustrativeImage(product, odooProductImages);
      if (!illustrativeImage) {
        return product;
      }

      return {
        ...product,
        imageUrl: illustrativeImage.imageUrl,
        imageMode: "illustrative" as const,
        imageNote: "Imagen ilustrativa tomada de un articulo similar publicado online.",
        imageSourceUrl: illustrativeImage.href,
      };
    }

    return {
      ...product,
      imageUrl: odooImage.imageUrl,
      imageMode: "exact" as const,
      imageNote: null,
      imageSourceUrl: odooImage.href,
    };
  });
}

export async function getProductsByIds(
  productIds: string[],
  executor?: Executor,
) {
  if (productIds.length === 0) return [];

  const settings = getServerSettings();
  const connection = executor || (await getConnection());
  const request = createRequest(connection);
  setInput(request, "depositId", settings.stockDepositId || null);

  const placeholders = productIds.map((_, index) => `@productId${index}`);
  productIds.forEach((productId, index) => {
    setInput(request, `productId${index}`, productId.trim());
  });

  const result: IResult<ProductRecord> = await request.query(`
    WITH StockActual AS (
      SELECT
        LTRIM(RTRIM(IDArticulo)) AS IDArticulo,
        SUM(ISNULL(CantidadUD, 0)) AS StockActual
      FROM dbo.V_MV_Stock WITH (NOLOCK)
      WHERE (Anulado = 0 OR Anulado IS NULL)
        AND (@depositId IS NULL OR LTRIM(RTRIM(ISNULL(IdDeposito, ''))) = @depositId)
      GROUP BY LTRIM(RTRIM(IDArticulo))
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
      a.Presentacion,
      a.CUENTAPROVEEDOR,
      a.CODIGOBARRA,
      a.RutaImagen,
      a.URL1
    FROM dbo.V_MA_ARTICULOS a WITH (NOLOCK)
    LEFT JOIN StockActual s
      ON s.IDArticulo = LTRIM(RTRIM(a.IDARTICULO))
    WHERE LTRIM(RTRIM(a.IDARTICULO)) IN (${placeholders.join(", ")});
  `);

  return result.recordset.map(mapProduct);
}
function createRequest(executor: Executor) {
  if ("begin" in executor) {
    return new sql.Request(executor);
  }

  return executor.request();
}

function findIllustrativeImage(
  product: Product,
  candidates: Array<{
    code: string;
    imageUrl: string;
    title: string;
    href: string;
  }>,
) {
  const productCode = product.code.trim().toUpperCase();
  const baseCode = getBaseCode(productCode);

  const codeMatch = candidates.find((candidate) => {
    const candidateCode = candidate.code.trim().toUpperCase();
    const candidateBaseCode = getBaseCode(candidateCode);

    return (
      candidateCode !== productCode &&
      (candidateCode === baseCode ||
        candidateCode.startsWith(`${baseCode}|`) ||
        candidateBaseCode === baseCode)
    );
  });

  if (codeMatch) {
    return codeMatch;
  }

  const targetTokens = tokenizeDescription(product.description);
  if (targetTokens.length === 0) {
    return null;
  }

  let bestMatch: (typeof candidates)[number] | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateCode = candidate.code.trim().toUpperCase();
    if (candidateCode === productCode) continue;

    const score = scoreCandidate(targetTokens, candidate.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestScore >= 3 ? bestMatch : null;
}

function getBaseCode(value: string) {
  return value.split("|")[0]?.trim().toUpperCase() || value.trim().toUpperCase();
}

function tokenizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => {
      return (
        token.length >= 3 &&
        !STOP_WORDS.has(token) &&
        !COLOR_WORDS.has(token) &&
        !SIZE_WORDS.has(token)
      );
    });
}

function scoreCandidate(targetTokens: string[], candidateTitle: string) {
  const candidateTokens = new Set(tokenizeDescription(candidateTitle));
  let score = 0;

  for (const token of targetTokens) {
    if (candidateTokens.has(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }

  return score;
}

const STOP_WORDS = new Set([
  "para",
  "con",
  "sin",
  "the",
  "and",
  "men",
  "man",
  "mujer",
  "hombre",
  "kids",
  "adulto",
  "adulta",
  "junior",
  "nino",
  "nina",
  "niño",
  "niña",
  "blist",
]);

const COLOR_WORDS = new Set([
  "negro",
  "negra",
  "blanco",
  "blanca",
  "gris",
  "rojo",
  "roja",
  "azul",
  "verde",
  "rosa",
  "fucsia",
  "violeta",
  "amarillo",
  "amarilla",
  "naranja",
  "marron",
  "bordo",
  "celeste",
  "colores",
  "multicolor",
]);

const SIZE_WORDS = new Set([
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "xxxl",
  "uni",
  "unico",
  "talle",
]);
