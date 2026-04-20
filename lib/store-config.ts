import "server-only";
import { parseBoolean } from "@/lib/commerce";
import { getStoredSettingValuesByEnvKey } from "@/lib/store-settings";
import type { PublicStoreSettings } from "@/lib/types";

const priceColumns = new Set([
  "PRECIO1",
  "PRECIO2",
  "PRECIO3",
  "PRECIO4",
  "PRECIO5",
  "PRECIO6",
  "PRECIO7",
  "PRECIO8",
]);

export type ServerSettings = {
  priceColumn: string;
  productLimit: number;
  stockDepositId: string;
  defaultTaxRate: number;
  pricesIncludeTax: boolean;
  allowBackorders: boolean;
  writeStockMovements: boolean;
  orderTc: string;
  orderBranch: string;
  orderLetter: string;
  customerAccount: string;
  vendorId: string;
  unitBusiness: string;
  priceListId: string;
  classPrice: number;
  saleReasonId: string;
  stockReasonId: string;
  documentType: string;
  ivaCondition: string;
  paymentCondition: string;
  orderUser: string;
  mercadoPagoAccessToken: string;
  mercadoPagoPublicBaseUrl: string;
  mercadoPagoOrderTc: string;
  mercadoPagoStatementDescriptor: string;
  mercadoPagoBinaryMode: boolean;
  imageBaseUrl: string;
  showOutOfStock: boolean;
};

function readSetting(
  storedValues: Map<string, string>,
  key: string,
  fallback = "",
) {
  return (storedValues.get(key) ?? process.env[key] ?? fallback).trim();
}

async function loadStoredSettingValues() {
  try {
    return await getStoredSettingValuesByEnvKey();
  } catch (error) {
    console.error(
      "[store-config] No se pudo leer TA_CONFIGURACION. Se usan valores de .env.",
      error,
    );
    return new Map<string, string>();
  }
}

export async function getServerSettings(): Promise<ServerSettings> {
  const storedValues = await loadStoredSettingValues();
  const priceColumn = readSetting(storedValues, "APP_PRICE_COLUMN", "PRECIO1").toUpperCase();

  return {
    priceColumn: priceColumns.has(priceColumn) ? priceColumn : "PRECIO1",
    productLimit: Math.max(
      1,
      Number(readSetting(storedValues, "APP_PRODUCT_LIMIT", "200") || "200"),
    ),
    stockDepositId: readSetting(storedValues, "APP_STOCK_DEPOSIT_ID"),
    defaultTaxRate: Number(
      readSetting(storedValues, "APP_DEFAULT_TAX_RATE", "21") || "21",
    ),
    pricesIncludeTax: parseBoolean(
      readSetting(storedValues, "APP_PRICES_INCLUDE_TAX", "true"),
      true,
    ),
    allowBackorders: parseBoolean(
      readSetting(storedValues, "APP_ALLOW_BACKORDERS", "false"),
      false,
    ),
    writeStockMovements: parseBoolean(
      readSetting(storedValues, "APP_WRITE_STOCK_MOVEMENTS", "true"),
      true,
    ),
    orderTc: readSetting(storedValues, "APP_ORDER_TC"),
    orderBranch: readSetting(storedValues, "APP_ORDER_BRANCH"),
    orderLetter: readSetting(storedValues, "APP_ORDER_LETTER", "X"),
    customerAccount: readSetting(storedValues, "APP_CUSTOMER_ACCOUNT"),
    vendorId: readSetting(storedValues, "APP_VENDOR_ID", "9999"),
    unitBusiness: readSetting(storedValues, "APP_UNEGOCIO"),
    priceListId: readSetting(storedValues, "APP_PRICE_LIST_ID", "1"),
    classPrice: Number(readSetting(storedValues, "APP_CLASS_PRICE", "1") || "1"),
    saleReasonId: readSetting(storedValues, "APP_SALE_REASON_ID", "1"),
    stockReasonId: readSetting(storedValues, "APP_STOCK_REASON_ID", "1"),
    documentType: readSetting(storedValues, "APP_DOCUMENT_TYPE", "1"),
    ivaCondition: readSetting(storedValues, "APP_IVA_CONDITION", "1"),
    paymentCondition: readSetting(storedValues, "APP_PAYMENT_CONDITION", "1"),
    orderUser: readSetting(storedValues, "APP_ORDER_USER", "web-shop"),
    mercadoPagoAccessToken: readSetting(storedValues, "APP_MP_ACCESS_TOKEN"),
    mercadoPagoPublicBaseUrl: readSetting(storedValues, "APP_PUBLIC_BASE_URL"),
    mercadoPagoOrderTc: readSetting(storedValues, "APP_MP_ORDER_TC"),
    mercadoPagoStatementDescriptor: readSetting(
      storedValues,
      "APP_MP_STATEMENT_DESCRIPTOR",
    ),
    mercadoPagoBinaryMode: parseBoolean(
      readSetting(storedValues, "APP_MP_BINARY_MODE", "false"),
      false,
    ),
    imageBaseUrl: readSetting(storedValues, "NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL"),
    showOutOfStock: parseBoolean(
      readSetting(storedValues, "NEXT_PUBLIC_SHOW_OUT_OF_STOCK", "true"),
      true,
    ),
  };
}

export async function getPublicStoreSettings(): Promise<PublicStoreSettings> {
  const settings = await getServerSettings();
  const mercadoPagoEnabled = Boolean(
    settings.mercadoPagoAccessToken && settings.mercadoPagoPublicBaseUrl,
  );

  return {
    storeName: process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Diez Deportes",
    logoUrl:
      process.env.NEXT_PUBLIC_STORE_LOGO_URL?.trim() ||
      "https://diezdeportes.odoo.com/web/image/website/2/logo/Diez%20Deportes?unique=cdf28c5",
    storeTagline:
      process.env.NEXT_PUBLIC_STORE_TAGLINE?.trim() ||
      "Equipamiento deportivo con stock real y pedido directo",
    allowBackorders: settings.allowBackorders,
    mercadoPagoEnabled,
    showOutOfStock: settings.showOutOfStock,
    heroImageUrl:
      process.env.NEXT_PUBLIC_HERO_IMAGE_URL?.trim() ||
      "https://diezdeportes.odoo.com/web/image/1120-f02b7f1a/image%20%286%29.webp",
    supportWhatsapp:
      process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ||
      "https://wa.me/message/DMXTLZXT6GVRG1",
    supportEmail:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
      "deportes10elbolson@yahoo.com.ar",
    supportPhone:
      process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || "+54 9 294 467-4525",
    storeAddress:
      process.env.NEXT_PUBLIC_STORE_ADDRESS?.trim() ||
      "Castelli, Av. Sarmiento esq, R8430 El Bolson, Rio Negro.",
    supportBlurb:
      process.env.NEXT_PUBLIC_SUPPORT_BLURB?.trim() ||
      "En Diez Deportes trabajamos para ofrecerte atencion personalizada, envios seguros a todo el pais y una experiencia de compra simple.",
  };
}
