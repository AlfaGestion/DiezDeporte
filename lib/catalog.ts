import "server-only";
import type { ConnectionPool, IResult, Transaction } from "mssql";
import { getPriceBreakdown, resolveImageUrl, toNumber } from "@/lib/commerce";
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
    imageUrl: resolveImageUrl(
      record.RutaImagen?.trim() || null,
      record.URL1?.trim() || null,
      settings.imageBaseUrl,
    ),
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

  return products.map((product) => {
    const odooImage = odooAssets.productImages.get(product.id.trim().toUpperCase());

    if (!odooImage) {
      return product;
    }

    return {
      ...product,
      imageUrl: odooImage.imageUrl,
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
