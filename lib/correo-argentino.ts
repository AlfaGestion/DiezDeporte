import "server-only";
import { getServerSettings } from "@/lib/store-config";
import {
  normalizePostalCodeForShippingQuote,
  type ShippingPackageEstimate,
} from "@/lib/shipping";

type CorreoArgentinoTokenResponse = {
  token?: string;
  expires?: string;
  code?: string;
  message?: string;
};

type CorreoArgentinoRate = {
  deliveredType?: "D" | "S";
  productType?: string;
  productName?: string;
  price?: number;
  deliveryTimeMin?: string;
  deliveryTimeMax?: string;
};

type CorreoArgentinoRatesResponse = {
  customerId?: string;
  validTo?: string;
  rates?: CorreoArgentinoRate[];
  code?: string;
  message?: string;
};

type CorreoArgentinoTokenCache = {
  cacheKey: string;
  token: string;
  expiresAt: number;
};

declare global {
  var __diezDeportesCorreoArgentinoTokenCache:
    | CorreoArgentinoTokenCache
    | undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseExpiresAt(value: string | undefined) {
  if (!value) {
    return Date.now() + 10 * 60 * 1000;
  }

  const normalized = value.replace(" ", "T");
  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    return Date.now() + 10 * 60 * 1000;
  }

  return timestamp;
}

async function readCorreoJson<T>(response: Response) {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractCorreoError(payload: { message?: string; code?: string } | null) {
  if (!payload?.message) {
    return null;
  }

  const message = payload.message.trim();
  return payload.code ? `${payload.code}: ${message}` : message;
}

export async function isCorreoArgentinoConfigured() {
  const settings = await getServerSettings();

  return Boolean(
    settings.correoArgentinoApiBaseUrl &&
      settings.correoArgentinoApiUser &&
      settings.correoArgentinoApiPassword &&
      settings.correoArgentinoCustomerId &&
      settings.correoArgentinoOriginPostalCode,
  );
}

async function getCorreoArgentinoToken() {
  const settings = await getServerSettings();
  const baseUrl = trimTrailingSlash(settings.correoArgentinoApiBaseUrl);
  const user = settings.correoArgentinoApiUser.trim();
  const password = settings.correoArgentinoApiPassword.trim();

  if (!baseUrl || !user || !password) {
    throw new Error("Falta configurar la autenticacion de Correo Argentino.");
  }

  const cacheKey = `${baseUrl}::${user}`;
  const cached = global.__diezDeportesCorreoArgentinoTokenCache;

  if (cached && cached.cacheKey === cacheKey && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const basicAuth = Buffer.from(`${user}:${password}`).toString("base64");
  const response = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
    },
    cache: "no-store",
  });
  const payload = await readCorreoJson<CorreoArgentinoTokenResponse>(response);

  if (!response.ok || !payload?.token?.trim()) {
    throw new Error(
      extractCorreoError(payload) ||
        `Correo Argentino devolvio ${response.status} al pedir el token.`,
    );
  }

  const token = payload.token.trim();
  global.__diezDeportesCorreoArgentinoTokenCache = {
    cacheKey,
    token,
    expiresAt: parseExpiresAt(payload.expires),
  };

  return token;
}

export async function getCorreoArgentinoRates(input: {
  postalCodeDestination: string;
  packageEstimate: ShippingPackageEstimate;
  deliveredType?: "D" | "S";
}) {
  const settings = await getServerSettings();
  const token = await getCorreoArgentinoToken();
  const baseUrl = trimTrailingSlash(settings.correoArgentinoApiBaseUrl);
  const customerId = settings.correoArgentinoCustomerId.trim();
  const postalCodeOrigin = normalizePostalCodeForShippingQuote(
    settings.correoArgentinoOriginPostalCode,
  );
  const postalCodeDestination = normalizePostalCodeForShippingQuote(
    input.postalCodeDestination,
  );

  if (!customerId || !postalCodeOrigin || !postalCodeDestination) {
    throw new Error("Falta configurar los datos base para cotizar en Correo Argentino.");
  }

  const response = await fetch(`${baseUrl}/rates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerId,
      postalCodeOrigin,
      postalCodeDestination,
      deliveredType: input.deliveredType || "D",
      dimensions: {
        weight: input.packageEstimate.weightGrams,
        height: input.packageEstimate.height,
        width: input.packageEstimate.width,
        length: input.packageEstimate.length,
      },
    }),
    cache: "no-store",
  });
  const payload = await readCorreoJson<CorreoArgentinoRatesResponse>(response);

  if (!response.ok || !payload) {
    throw new Error(
      extractCorreoError(payload) ||
        `Correo Argentino devolvio ${response.status} al cotizar el envio.`,
    );
  }

  return payload;
}
