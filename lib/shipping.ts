import type {
  ShippingEstimateRequestItem,
  ShippingEstimateResult,
} from "@/lib/types";
import type { OrderMetadata, OrderType } from "@/lib/types/order";

export const SHIPPING_STATUSES = [
  "not_applicable",
  "free",
  "estimated",
  "pending_quote",
] as const;

export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

export type ShippingSnapshot = {
  itemsSubtotal: number;
  freeShippingThreshold: number;
  shippingStatus: ShippingStatus;
  shippingCost: number | null;
  qualifiesForFreeShipping: boolean;
};

export type ShippingPackageEstimate = {
  itemCount: number;
  weightGrams: number;
  height: number;
  width: number;
  length: number;
};

function normalizeMoney(value: number | null | undefined) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(2));
}

function normalizeThreshold(value: number | null | undefined) {
  return Math.max(0, normalizeMoney(value));
}

function clampDimension(value: number, fallback: number, max = 150) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.ceil(value)));
}

function normalizeSearchableText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeShippingStatus(value: unknown): ShippingStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  return SHIPPING_STATUSES.includes(value as ShippingStatus)
    ? (value as ShippingStatus)
    : null;
}

export function buildShippingSnapshot(input: {
  orderType: OrderType;
  itemsSubtotal: number;
  freeShippingThreshold?: number | null;
}): ShippingSnapshot {
  const itemsSubtotal = normalizeMoney(input.itemsSubtotal);
  const freeShippingThreshold = normalizeThreshold(input.freeShippingThreshold);

  if (input.orderType !== "envio") {
    return {
      itemsSubtotal,
      freeShippingThreshold,
      shippingStatus: "not_applicable",
      shippingCost: null,
      qualifiesForFreeShipping: false,
    };
  }

  const qualifiesForFreeShipping =
    freeShippingThreshold > 0 && itemsSubtotal >= freeShippingThreshold;

  return {
    itemsSubtotal,
    freeShippingThreshold,
    shippingStatus: qualifiesForFreeShipping ? "free" : "pending_quote",
    shippingCost: qualifiesForFreeShipping ? 0 : null,
    qualifiesForFreeShipping,
  };
}

export function applyShippingEstimate(
  snapshot: ShippingSnapshot,
  estimate: Pick<ShippingEstimateResult, "shippingCost"> | null | undefined,
) {
  if (
    snapshot.shippingStatus !== "pending_quote" ||
    !estimate ||
    !Number.isFinite(estimate.shippingCost) ||
    estimate.shippingCost <= 0
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    shippingStatus: "estimated" as const,
    shippingCost: normalizeMoney(estimate.shippingCost),
  } satisfies ShippingSnapshot;
}

export function normalizePostalCodeInput(value: string | null | undefined) {
  return (value || "").replace(/[\s-]+/g, "").toUpperCase();
}

export function normalizePostalCodeForShippingQuote(
  value: string | null | undefined,
) {
  const normalized = normalizePostalCodeInput(value);
  const shortCpaMatch = normalized.match(/^[A-Z](\d{4})$/);

  if (shortCpaMatch) {
    return shortCpaMatch[1];
  }

  const fullCpaMatch = normalized.match(/^[A-Z](\d{4})[A-Z]{3}$/);

  if (fullCpaMatch) {
    return fullCpaMatch[1];
  }

  return normalized;
}

export function isLikelyValidPostalCode(value: string | null | undefined) {
  const normalized = normalizePostalCodeInput(value);

  if (/^\d{4}$/.test(normalized)) {
    return true;
  }

  if (/^[A-Z]\d{4}$/.test(normalized)) {
    return true;
  }

  return /^[A-Z]\d{4}[A-Z]{3}$/.test(normalized);
}

function resolvePackageProfile(item: ShippingEstimateRequestItem) {
  const haystack = normalizeSearchableText(
    `${item.category} ${item.description}`,
  );

  if (
    /(zapat|calzado|botin|bota|sandalia|ojota|tenis|slipper|crocs)/.test(
      haystack,
    )
  ) {
    return { weightGrams: 1200, height: 16, width: 26, length: 36 };
  }

  if (
    /(buzo|campera|hoodie|canguro|rompeviento|parka|chaleco|anorak)/.test(
      haystack,
    )
  ) {
    return { weightGrams: 900, height: 12, width: 28, length: 36 };
  }

  if (
    /(pantalon|jogging|calza|legging|short|bermuda|pollera)/.test(haystack)
  ) {
    return { weightGrams: 650, height: 8, width: 25, length: 32 };
  }

  if (/(remera|musculosa|camiseta|top|chomba|jersey)/.test(haystack)) {
    return { weightGrams: 300, height: 5, width: 20, length: 25 };
  }

  if (/(mochila|bolso|morral|rinonera|cartera|bandolera)/.test(haystack)) {
    return { weightGrams: 800, height: 12, width: 30, length: 40 };
  }

  if (/(pelota|ball)/.test(haystack)) {
    return { weightGrams: 700, height: 25, width: 25, length: 25 };
  }

  if (/(gorra|gorro|guante|media|medias|vincha|munequera)/.test(haystack)) {
    return { weightGrams: 150, height: 4, width: 15, length: 20 };
  }

  return { weightGrams: 700, height: 10, width: 25, length: 30 };
}

export function buildPackageEstimateFromItems(
  items: ShippingEstimateRequestItem[],
): ShippingPackageEstimate {
  const safeItems =
    items.length > 0
      ? items
      : [
          {
            productId: "GENERIC",
            description: "Paquete generico",
            category: "",
            quantity: 1,
          },
        ];
  let itemCount = 0;
  let totalWeightGrams = 0;
  let totalVolume = 0;
  let maxLength = 30;
  let maxWidth = 25;

  for (const item of safeItems) {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 0));
    const profile = resolvePackageProfile(item);

    itemCount += quantity;
    totalWeightGrams += profile.weightGrams * quantity;
    totalVolume +=
      profile.length * profile.width * profile.height * quantity * 0.72;
    maxLength = Math.max(maxLength, profile.length);
    maxWidth = Math.max(maxWidth, profile.width);
  }

  const footprint = Math.max(1, maxLength * maxWidth);
  const estimatedHeight = totalVolume / footprint;

  return {
    itemCount,
    weightGrams: Math.max(1, Math.min(25000, Math.ceil(totalWeightGrams))),
    height: clampDimension(estimatedHeight, 10),
    width: clampDimension(maxWidth, 25),
    length: clampDimension(maxLength, 30),
  };
}

export function resolveShippingSnapshotFromMetadata(input: {
  orderType: OrderType;
  orderTotal: number;
  metadata?: OrderMetadata | null;
  fallbackFreeShippingThreshold?: number | null;
}): ShippingSnapshot {
  const metadata = input.metadata || {};
  const storedStatus = normalizeShippingStatus(metadata.shippingStatus);
  const itemsSubtotal = normalizeMoney(metadata.itemsSubtotal ?? input.orderTotal);
  const freeShippingThreshold = normalizeThreshold(
    metadata.freeShippingThreshold ?? input.fallbackFreeShippingThreshold,
  );

  if (input.orderType !== "envio") {
    return buildShippingSnapshot({
      orderType: input.orderType,
      itemsSubtotal,
      freeShippingThreshold,
    });
  }

  if (storedStatus) {
    const qualifiesForFreeShipping =
      storedStatus === "free" || Boolean(metadata.freeShippingQualified);

    return {
      itemsSubtotal,
      freeShippingThreshold,
      shippingStatus: storedStatus,
      shippingCost:
        storedStatus === "free"
          ? 0
          : storedStatus === "estimated"
            ? normalizeMoney(metadata.shippingCost)
            : null,
      qualifiesForFreeShipping,
    };
  }

  if (typeof metadata.freeShippingQualified === "boolean") {
    return {
      itemsSubtotal,
      freeShippingThreshold,
      shippingStatus: metadata.freeShippingQualified ? "free" : "pending_quote",
      shippingCost: metadata.freeShippingQualified ? 0 : null,
      qualifiesForFreeShipping: metadata.freeShippingQualified,
    };
  }

  return buildShippingSnapshot({
    orderType: input.orderType,
    itemsSubtotal,
    freeShippingThreshold,
  });
}
