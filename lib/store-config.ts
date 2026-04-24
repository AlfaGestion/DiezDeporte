import "server-only";
import { parseBoolean } from "@/lib/commerce";
import { LOCAL_HERO_IMAGE_URL, LOCAL_STORE_LOGO_URL } from "@/lib/site-assets";
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
  pendingOrderTtlMinutes: number;
  mercadoPagoAccessToken: string;
  mercadoPagoPublicBaseUrl: string;
  mercadoPagoOrderTc: string;
  mercadoPagoStatementDescriptor: string;
  mercadoPagoBinaryMode: boolean;
  imageBaseUrl: string;
  productImageDirectory: string;
  productImageSuffixes: string[];
  productImageExtensions: string[];
  showOutOfStock: boolean;
  validarStockAlConfirmarPedido: boolean;
  validarClasePrecioAlConfirmarPedido: boolean;
  enviarEmailPedidoRecibido: boolean;
  permitirCheckoutSinDireccionEnRetiro: boolean;
  pickupAvailabilityText: string;
  requerirNombreApellidoAlRetirar: boolean;
  requerirDniAlRetirar: boolean;
  permitirFinalizacionManualSinDatosRetiro: boolean;
  generarQrRetiro: boolean;
  stockReservationHours: number;
  aprobacionManualPedidos: boolean;
  facturacionManualPedidos: boolean;
  descripcionFlujoPedidos: string;
  maxReintentosInicioPago: number;
  enviarEmailSiFallaInicioPago: boolean;
  permitirRetiroYPagoLocalSiFallaMP: boolean;
  horasReservaStockPagoPendiente: number;
  orderReceivedEmailSubject: string;
  orderReceivedEmailBody: string;
  paymentInitFailureEmailSubject: string;
  paymentInitFailureEmailBody: string;
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  enviarEmailFacturadoRetiro: boolean;
  enviarEmailFacturadoEnvio: boolean;
};

function readSetting(
  storedValues: Map<string, string>,
  key: string,
  fallback = "",
) {
  return (storedValues.get(key) ?? process.env[key] ?? fallback).trim();
}

function readListSetting(
  storedValues: Map<string, string>,
  key: string,
  fallback = "",
) {
  return readSetting(storedValues, key, fallback)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
  const productImageDirectory =
    readSetting(storedValues, "APP_PRODUCT_IMAGE_DIRECTORY")
    || readSetting(storedValues, "APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY");

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
    pendingOrderTtlMinutes: Math.max(
      1,
      Number(readSetting(storedValues, "APP_PENDING_ORDER_TTL_MINUTES", "120") || "120"),
    ),
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
    productImageDirectory,
    productImageSuffixes: readListSetting(
      storedValues,
      "APP_PRODUCT_IMAGE_SUFFIXES",
      "a,b,c,d,e",
    ),
    productImageExtensions: readListSetting(
      storedValues,
      "APP_PRODUCT_IMAGE_EXTENSIONS",
      "jpg,jpeg,png,webp",
    ),
    showOutOfStock: parseBoolean(
      readSetting(storedValues, "NEXT_PUBLIC_SHOW_OUT_OF_STOCK", "true"),
      true,
    ),
    validarStockAlConfirmarPedido: parseBoolean(
      readSetting(storedValues, "APP_VALIDATE_STOCK_ON_CHECKOUT", "true"),
      true,
    ),
    validarClasePrecioAlConfirmarPedido: parseBoolean(
      readSetting(storedValues, "APP_VALIDATE_PRICE_CLASS_ON_CHECKOUT", "false"),
      false,
    ),
    enviarEmailPedidoRecibido: parseBoolean(
      readSetting(storedValues, "APP_SEND_ORDER_RECEIVED_EMAIL", "true"),
      true,
    ),
    permitirCheckoutSinDireccionEnRetiro: parseBoolean(
      readSetting(
        storedValues,
        "APP_ALLOW_PICKUP_CHECKOUT_WITHOUT_ADDRESS",
        "true",
      ),
      true,
    ),
    pickupAvailabilityText:
      readSetting(storedValues, "APP_PICKUP_SCHEDULE") ||
      readSetting(
        storedValues,
        "NEXT_PUBLIC_STORE_HOURS",
        "Lunes a sabados de 9 a 13 hs y de 16 a 20 hs.",
      ),
    requerirNombreApellidoAlRetirar: parseBoolean(
      readSetting(storedValues, "APP_REQUIRE_PICKUP_FULL_NAME", "true"),
      true,
    ),
    requerirDniAlRetirar: parseBoolean(
      readSetting(storedValues, "APP_REQUIRE_PICKUP_DNI", "false"),
      false,
    ),
    permitirFinalizacionManualSinDatosRetiro: parseBoolean(
      readSetting(storedValues, "APP_ALLOW_MANUAL_PICKUP_FINALIZATION", "false"),
      false,
    ),
    generarQrRetiro: parseBoolean(
      readSetting(storedValues, "APP_GENERATE_PICKUP_QR", "true"),
      true,
    ),
    stockReservationHours: Math.max(
      1,
      Number(readSetting(storedValues, "APP_STOCK_RESERVATION_HOURS", "24") || "24"),
    ),
    aprobacionManualPedidos: parseBoolean(
      readSetting(storedValues, "APP_ORDER_MANUAL_APPROVAL", "true"),
      true,
    ),
    facturacionManualPedidos: parseBoolean(
      readSetting(storedValues, "APP_ORDER_MANUAL_INVOICING", "true"),
      true,
    ),
    descripcionFlujoPedidos: readSetting(
      storedValues,
      "APP_ORDER_FLOW_DESCRIPTION",
      "Revisamos el pedido, confirmamos pago o stock si hace falta y luego avanzamos a facturacion y preparacion.",
    ),
    maxReintentosInicioPago: Math.max(
      1,
      Number(readSetting(storedValues, "APP_MAX_PAYMENT_INIT_RETRIES", "3") || "3"),
    ),
    enviarEmailSiFallaInicioPago: parseBoolean(
      readSetting(storedValues, "APP_SEND_PAYMENT_INIT_FAILURE_EMAIL", "true"),
      true,
    ),
    permitirRetiroYPagoLocalSiFallaMP: parseBoolean(
      readSetting(
        storedValues,
        "APP_ALLOW_PICKUP_LOCAL_PAYMENT_ON_MP_FAILURE",
        "true",
      ),
      true,
    ),
    horasReservaStockPagoPendiente: Math.max(
      1,
      Number(readSetting(storedValues, "APP_PENDING_STOCK_RESERVE_HOURS", "24") || "24"),
    ),
    orderReceivedEmailSubject: readSetting(
      storedValues,
      "APP_ORDER_RECEIVED_EMAIL_SUBJECT",
    ),
    orderReceivedEmailBody: readSetting(
      storedValues,
      "APP_ORDER_RECEIVED_EMAIL_BODY",
    ),
    paymentInitFailureEmailSubject: readSetting(
      storedValues,
      "APP_PAYMENT_INIT_FAILURE_EMAIL_SUBJECT",
    ),
    paymentInitFailureEmailBody: readSetting(
      storedValues,
      "APP_PAYMENT_INIT_FAILURE_EMAIL_BODY",
    ),
    invoiceEmailSubject: readSetting(storedValues, "APP_INVOICE_EMAIL_SUBJECT"),
    invoiceEmailBody: readSetting(storedValues, "APP_INVOICE_EMAIL_BODY"),
    enviarEmailFacturadoRetiro: parseBoolean(
      readSetting(storedValues, "APP_SEND_FACTURADO_EMAIL_PICKUP", "false"),
      false,
    ),
    enviarEmailFacturadoEnvio: parseBoolean(
      readSetting(storedValues, "APP_SEND_FACTURADO_EMAIL_SHIPMENT", "true"),
      true,
    ),
  };
}

export async function getPublicStoreSettings(): Promise<PublicStoreSettings> {
  const [settings, storedValues] = await Promise.all([
    getServerSettings(),
    loadStoredSettingValues(),
  ]);
  const mercadoPagoEnabled = Boolean(
    settings.mercadoPagoAccessToken && settings.mercadoPagoPublicBaseUrl,
  );

  return {
    storeName: readSetting(storedValues, "NEXT_PUBLIC_STORE_NAME", "Diez Deportes"),
    logoUrl: readSetting(
      storedValues,
      "NEXT_PUBLIC_STORE_LOGO_URL",
      LOCAL_STORE_LOGO_URL,
    ),
    storeTagline: readSetting(
      storedValues,
      "NEXT_PUBLIC_STORE_TAGLINE",
      "Equipamiento deportivo con stock real y pedido directo",
    ),
    welcomeMessage: readSetting(
      storedValues,
      "NEXT_PUBLIC_STORE_WELCOME_MESSAGE",
      "Bienvenido a nuestra tienda online. Compra facil, segura y con atencion personalizada.",
    ),
    storeHours: readSetting(
      storedValues,
      "NEXT_PUBLIC_STORE_HOURS",
      "Lunes a sabados de 9 a 13 hs y de 16 a 20 hs.",
    ),
    pickupSchedule:
      readSetting(storedValues, "APP_PICKUP_SCHEDULE") ||
      readSetting(
        storedValues,
        "NEXT_PUBLIC_STORE_HOURS",
        "Lunes a sabados de 9 a 13 hs y de 16 a 20 hs.",
      ),
    allowBackorders: settings.allowBackorders,
    allowPickupCheckoutWithoutAddress:
      settings.permitirCheckoutSinDireccionEnRetiro,
    mercadoPagoEnabled,
    showOutOfStock: settings.showOutOfStock,
    heroImageUrl: readSetting(
      storedValues,
      "NEXT_PUBLIC_HERO_IMAGE_URL",
      LOCAL_HERO_IMAGE_URL,
    ),
    facebookUrl: readSetting(storedValues, "NEXT_PUBLIC_FACEBOOK_URL", ""),
    instagramUrl: readSetting(storedValues, "NEXT_PUBLIC_INSTAGRAM_URL", ""),
    supportWhatsapp: readSetting(
      storedValues,
      "NEXT_PUBLIC_SUPPORT_WHATSAPP",
      "https://wa.me/message/DMXTLZXT6GVRG1",
    ),
    supportEmail: readSetting(
      storedValues,
      "NEXT_PUBLIC_SUPPORT_EMAIL",
      "deportes10elbolson@yahoo.com.ar",
    ),
    supportPhone: readSetting(
      storedValues,
      "NEXT_PUBLIC_SUPPORT_PHONE",
      "+54 9 294 467-4525",
    ),
    storeAddress: readSetting(
      storedValues,
      "NEXT_PUBLIC_STORE_ADDRESS",
      "Castelli, Av. Sarmiento esq, R8430 El Bolson, Rio Negro.",
    ),
    supportBlurb: readSetting(
      storedValues,
      "NEXT_PUBLIC_SUPPORT_BLURB",
      "En Diez Deportes trabajamos para ofrecerte atencion personalizada, envios seguros a todo el pais y una experiencia de compra simple.",
    ),
  };
}
