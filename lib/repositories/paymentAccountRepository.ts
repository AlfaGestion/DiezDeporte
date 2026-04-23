import "server-only";
import { getConnection } from "@/lib/db";
import type { PaymentCollectionAccount } from "@/lib/types";

type PaymentAccountRow = {
  CODIGO: string;
  DESCRIPCION: string | null;
  CODIGO_OPCIONAL: string | null;
  MEDIO_DE_PAGO: string | null;
};

function trimOrNull(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return normalized || null;
}

function mapPaymentAccountRow(row: PaymentAccountRow): PaymentCollectionAccount {
  const code = row.CODIGO.trim();
  const description = trimOrNull(row.DESCRIPCION) || code;
  const optionalCode = trimOrNull(row.CODIGO_OPCIONAL);
  const mediumCode = trimOrNull(row.MEDIO_DE_PAGO);

  return {
    code,
    label: optionalCode ? `${description} (${optionalCode})` : description,
    optionalCode,
    mediumCode,
  };
}

export async function getPaymentCollectionAccounts() {
  const pool = await getConnection();
  const result = await pool.request().query<PaymentAccountRow>(`
    SELECT
      LTRIM(RTRIM(CODIGO)) AS CODIGO,
      LTRIM(RTRIM(ISNULL(DESCRIPCION, ''))) AS DESCRIPCION,
      LTRIM(RTRIM(ISNULL(CodigoOpcional, ''))) AS CODIGO_OPCIONAL,
      LTRIM(RTRIM(ISNULL(MedioDePago, ''))) AS MEDIO_DE_PAGO
    FROM dbo.MA_CUENTAS WITH (NOLOCK)
    WHERE TipoVista = ''
      AND TITULO = 0
      AND Libro_Iva_Compras = 0
      AND Libro_Iva_Ventas = 0
      AND CajaYBanco = 1
      AND LTRIM(RTRIM(ISNULL(CodigoOpcional, ''))) <> ''
    ORDER BY DESCRIPCION, CODIGO;
  `);

  return result.recordset.map(mapPaymentAccountRow);
}

export async function getPaymentCollectionAccountByCode(code: string) {
  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  const pool = await getConnection();
  const request = pool.request();
  request.input("code", normalizedCode);
  const result = await request.query<PaymentAccountRow>(`
    SELECT TOP (1)
      LTRIM(RTRIM(CODIGO)) AS CODIGO,
      LTRIM(RTRIM(ISNULL(DESCRIPCION, ''))) AS DESCRIPCION,
      LTRIM(RTRIM(ISNULL(CodigoOpcional, ''))) AS CODIGO_OPCIONAL,
      LTRIM(RTRIM(ISNULL(MedioDePago, ''))) AS MEDIO_DE_PAGO
    FROM dbo.MA_CUENTAS WITH (NOLOCK)
    WHERE LTRIM(RTRIM(CODIGO)) = @code
      AND TipoVista = ''
      AND TITULO = 0
      AND Libro_Iva_Compras = 0
      AND Libro_Iva_Ventas = 0
      AND CajaYBanco = 1
      AND LTRIM(RTRIM(ISNULL(CodigoOpcional, ''))) <> '';
  `);

  return result.recordset[0] ? mapPaymentAccountRow(result.recordset[0]) : null;
}
