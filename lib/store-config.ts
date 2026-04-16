import "server-only";
import { parseBoolean } from "@/lib/commerce";
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

export function getServerSettings() {
  const priceColumn = (process.env.APP_PRICE_COLUMN || "PRECIO1").toUpperCase();

  return {
    priceColumn: priceColumns.has(priceColumn) ? priceColumn : "PRECIO1",
    productLimit: Math.max(1, Number(process.env.APP_PRODUCT_LIMIT || "200")),
    stockDepositId: (process.env.APP_STOCK_DEPOSIT_ID || "").trim(),
    defaultTaxRate: Number(process.env.APP_DEFAULT_TAX_RATE || "21"),
    pricesIncludeTax: parseBoolean(process.env.APP_PRICES_INCLUDE_TAX, true),
    allowBackorders: parseBoolean(process.env.APP_ALLOW_BACKORDERS, false),
    writeStockMovements: parseBoolean(process.env.APP_WRITE_STOCK_MOVEMENTS, true),
    orderTc: (process.env.APP_ORDER_TC || "").trim(),
    orderBranch: (process.env.APP_ORDER_BRANCH || "").trim(),
    orderLetter: (process.env.APP_ORDER_LETTER || "X").trim(),
    customerAccount: (process.env.APP_CUSTOMER_ACCOUNT || "").trim(),
    vendorId: (process.env.APP_VENDOR_ID || "9999").trim(),
    unitBusiness: (process.env.APP_UNEGOCIO || "").trim(),
    priceListId: (process.env.APP_PRICE_LIST_ID || "1").trim(),
    classPrice: Number(process.env.APP_CLASS_PRICE || "1"),
    saleReasonId: (process.env.APP_SALE_REASON_ID || "1").trim(),
    stockReasonId: (process.env.APP_STOCK_REASON_ID || "1").trim(),
    documentType: (process.env.APP_DOCUMENT_TYPE || "1").trim(),
    ivaCondition: (process.env.APP_IVA_CONDITION || "1").trim(),
    paymentCondition: (process.env.APP_PAYMENT_CONDITION || "1").trim(),
    orderUser: (process.env.APP_ORDER_USER || "web-shop").trim(),
    imageBaseUrl: (process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL || "").trim(),
    showOutOfStock: parseBoolean(process.env.NEXT_PUBLIC_SHOW_OUT_OF_STOCK, true),
  };
}

export function getPublicStoreSettings(): PublicStoreSettings {
  const settings = getServerSettings();

  return {
    storeName: process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Diez Deportes",
    storeTagline:
      process.env.NEXT_PUBLIC_STORE_TAGLINE?.trim() ||
      "Equipamiento deportivo con stock real y pedido directo",
    allowBackorders: settings.allowBackorders,
    showOutOfStock: settings.showOutOfStock,
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
