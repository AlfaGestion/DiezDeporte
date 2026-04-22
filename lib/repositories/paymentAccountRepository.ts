import "server-only";
import { queryOne, queryRows } from "@/lib/db";
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
  const rows = await queryRows<PaymentAccountRow>(`
    SELECT
      TRIM(CODIGO) AS CODIGO,
      TRIM(COALESCE(DESCRIPCION, '')) AS DESCRIPCION,
      TRIM(COALESCE(CodigoOpcional, '')) AS CODIGO_OPCIONAL,
      TRIM(COALESCE(MedioDePago, '')) AS MEDIO_DE_PAGO
    FROM dbo_MA_CUENTAS
    WHERE TipoVista = ''
      AND TITULO = 0
      AND Libro_Iva_Compras = 0
      AND Libro_Iva_Ventas = 0
      AND CajaYBanco = 1
      AND TRIM(COALESCE(CodigoOpcional, '')) <> ''
    ORDER BY DESCRIPCION, CODIGO;
  `);

  return rows.map(mapPaymentAccountRow);
}

export async function getPaymentCollectionAccountByCode(code: string) {
  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  const row = await queryOne<PaymentAccountRow>(
    `
      SELECT
        TRIM(CODIGO) AS CODIGO,
        TRIM(COALESCE(DESCRIPCION, '')) AS DESCRIPCION,
        TRIM(COALESCE(CodigoOpcional, '')) AS CODIGO_OPCIONAL,
        TRIM(COALESCE(MedioDePago, '')) AS MEDIO_DE_PAGO
      FROM dbo_MA_CUENTAS
      WHERE TRIM(CODIGO) = :code
        AND TipoVista = ''
        AND TITULO = 0
        AND Libro_Iva_Compras = 0
        AND Libro_Iva_Ventas = 0
        AND CajaYBanco = 1
        AND TRIM(COALESCE(CodigoOpcional, '')) <> ''
      LIMIT 1;
    `,
    { code: normalizedCode },
  );

  return row ? mapPaymentAccountRow(row) : null;
}
