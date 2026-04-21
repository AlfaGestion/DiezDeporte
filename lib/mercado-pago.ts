import "server-only";
import { randomUUID } from "node:crypto";
import { truncate } from "@/lib/commerce";
import { getServerSettings } from "@/lib/store-config";

const MERCADO_PAGO_API_BASE = "https://api.mercadopago.com";

type MercadoPagoPreferenceItemInput = {
  title: string;
  quantity: number;
  unitPrice: number;
  currency: string;
};

type MercadoPagoPreferenceRequest = {
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }>;
  external_reference: string;
  notification_url: string;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return: "approved";
  binary_mode: boolean;
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
  };
  statement_descriptor?: string;
  metadata: {
    pendingOrderId: number;
    externalReference: string;
  };
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
};

export type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  preference_id?: string;
  merchant_order_id?: string | number;
  payment_type_id?: string;
  payment_method_id?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  payer?: {
    email?: string;
  };
};

async function getAccessToken() {
  const token = (await getServerSettings()).mercadoPagoAccessToken;

  if (!token) {
    throw new Error(
      "Falta APP_MP_ACCESS_TOKEN en el entorno para operar con Mercado Pago.",
    );
  }

  return token;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeMercadoPagoCurrencyId(value: string | null | undefined) {
  const currency = (value || "").trim().toUpperCase();

  if (!currency) {
    return "ARS";
  }

  if (
    currency === "1" ||
    currency === "$" ||
    currency === "ARS" ||
    currency === "AR$" ||
    currency === "PESO" ||
    currency === "PESOS"
  ) {
    return "ARS";
  }

  if (
    currency === "2" ||
    currency === "U$D" ||
    currency === "USD" ||
    currency === "US$" ||
    currency === "DOLAR" ||
    currency === "DOLARES"
  ) {
    return "USD";
  }

  if (
    currency === "3" ||
    currency === "EUR" ||
    currency === "EURO" ||
    currency === "EUROS"
  ) {
    return "EUR";
  }

  if (/^[A-Z]{3}$/.test(currency)) {
    return currency;
  }

  return "ARS";
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeAbsoluteHttpUrl(value: string | null | undefined) {
  const rawValue = (value || "").trim();

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return trimTrailingSlash(parsed.origin + parsed.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function readMercadoPagoJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMercadoPagoErrorMessage(payload: Record<string, unknown> | null) {
  if (!payload) return null;

  const message = payload.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  const cause = Array.isArray(payload.cause) ? payload.cause : [];
  const firstCause = cause[0];
  if (
    firstCause &&
    typeof firstCause === "object" &&
    "description" in firstCause &&
    typeof firstCause.description === "string"
  ) {
    return firstCause.description.trim();
  }

  return null;
}

async function mercadoPagoFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
  } = {},
) {
  const response = await fetch(`${MERCADO_PAGO_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.idempotencyKey
        ? { "X-Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const payload = await readMercadoPagoJson(response);

  if (!response.ok) {
    throw new Error(
      extractMercadoPagoErrorMessage(payload) ||
        `Mercado Pago devolvio ${response.status}.`,
    );
  }

  return payload as T;
}

export async function resolveMercadoPagoBaseUrl(requestUrl?: string) {
  const configuredBaseUrl = (await getServerSettings()).mercadoPagoPublicBaseUrl;
  const normalizedConfiguredBaseUrl = normalizeAbsoluteHttpUrl(configuredBaseUrl);

  if (normalizedConfiguredBaseUrl) {
    return normalizedConfiguredBaseUrl;
  }

  if (requestUrl) {
    try {
      return trimTrailingSlash(new URL(requestUrl).origin);
    } catch {
      // Fall through to the explicit error below.
    }
  }

  throw new Error(
    "Configura una URL publica valida para Mercado Pago en el admin. Ejemplo: https://tu-dominio.com",
  );
}

export async function buildMercadoPagoUrls(input: {
  requestUrl?: string;
  pendingOrderId: number;
  externalReference: string;
}) {
  const baseUrl = await resolveMercadoPagoBaseUrl(input.requestUrl);
  const callbackQuery = new URLSearchParams({
    orderId: String(input.pendingOrderId),
    externalReference: input.externalReference,
  });

  return {
    backUrls: {
      success: `${baseUrl}/pago/retorno?${callbackQuery.toString()}`,
      failure: `${baseUrl}/pago/retorno?${callbackQuery.toString()}`,
      pending: `${baseUrl}/pago/retorno?${callbackQuery.toString()}`,
    },
    notificationUrl: `${baseUrl}/api/payments/webhook?${callbackQuery.toString()}`,
  };
}

function splitFullName(fullName: string) {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length <= 1) {
    return {
      name: tokens[0] || undefined,
      surname: undefined,
    };
  }

  return {
    name: tokens.slice(0, -1).join(" "),
    surname: tokens.at(-1),
  };
}

export async function createMercadoPagoPreference(input: {
  requestUrl?: string;
  pendingOrderId: number;
  externalReference: string;
  customer: {
    fullName: string;
    email: string;
  };
  items: MercadoPagoPreferenceItemInput[];
}) {
  const settings = await getServerSettings();
  const { backUrls, notificationUrl } = await buildMercadoPagoUrls(input);
  const payerName = splitFullName(input.customer.fullName);

  const requestBody: MercadoPagoPreferenceRequest = {
    items: input.items.map((item) => ({
      title: truncate(item.title.trim() || "Pedido web", 120),
      quantity: item.quantity,
      unit_price: roundMoney(item.unitPrice),
      currency_id: normalizeMercadoPagoCurrencyId(item.currency),
    })),
    external_reference: input.externalReference,
    notification_url: notificationUrl,
    back_urls: backUrls,
    auto_return: "approved",
    binary_mode: settings.mercadoPagoBinaryMode,
    metadata: {
      pendingOrderId: input.pendingOrderId,
      externalReference: input.externalReference,
    },
    ...(input.customer.email.trim() || payerName.name || payerName.surname
      ? {
          payer: {
            ...(payerName.name ? { name: payerName.name } : {}),
            ...(payerName.surname ? { surname: payerName.surname } : {}),
            ...(input.customer.email.trim()
              ? { email: input.customer.email.trim() }
              : {}),
          },
        }
      : {}),
    ...(settings.mercadoPagoStatementDescriptor
      ? {
          statement_descriptor: truncate(
            settings.mercadoPagoStatementDescriptor,
            22,
          ),
        }
      : {}),
  };

  const response = await mercadoPagoFetch<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    {
      method: "POST",
      body: requestBody,
      idempotencyKey: randomUUID(),
    },
  );

  const preferenceId = response.id?.trim();
  const checkoutUrl =
    response.init_point?.trim() || response.sandbox_init_point?.trim() || "";

  if (!preferenceId || !checkoutUrl) {
    throw new Error(
      "Mercado Pago no devolvio la preferencia o la URL de checkout.",
    );
  }

  return {
    preferenceId,
    checkoutUrl,
    requestBody,
    responseBody: response,
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoFetch<MercadoPagoPayment>(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
}

export function extractPaymentIdFromWebhookPayload(
  payload: unknown,
  requestUrl: string,
) {
  const url = new URL(requestUrl);
  const searchParams = url.searchParams;
  const queryCandidates = [
    searchParams.get("data.id"),
    searchParams.get("id"),
    searchParams.get("payment_id"),
    searchParams.get("collection_id"),
  ];

  for (const candidate of queryCandidates) {
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directId = record.id;
  if (
    (record.type === "payment" || record.action === "payment.updated") &&
    (typeof directId === "string" || typeof directId === "number")
  ) {
    return String(directId).trim();
  }

  const nestedData = record.data;
  if (
    nestedData &&
    typeof nestedData === "object" &&
    "id" in nestedData &&
    (typeof nestedData.id === "string" || typeof nestedData.id === "number")
  ) {
    return String(nestedData.id).trim();
  }

  const collectionId = record.collection_id;
  if (typeof collectionId === "string" || typeof collectionId === "number") {
    return String(collectionId).trim();
  }

  const paymentId = record.payment_id;
  if (typeof paymentId === "string" || typeof paymentId === "number") {
    return String(paymentId).trim();
  }

  return null;
}
