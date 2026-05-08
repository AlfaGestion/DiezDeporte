import "server-only";
import { getCorreoArgentinoRates } from "@/lib/correo-argentino";
import {
  buildPackageEstimateFromItems,
  normalizePostalCodeForShippingQuote,
} from "@/lib/shipping";
import type { ShippingEstimateRequestItem, ShippingEstimateResult } from "@/lib/types";

function toMoney(value: unknown) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

function pickBestRate(
  rates: Array<{
    deliveredType?: "D" | "S";
    productName?: string;
    productType?: string;
    price?: number;
    deliveryTimeMin?: string;
    deliveryTimeMax?: string;
  }>,
  deliveredType: "D" | "S",
) {
  const matchingRates = rates.filter((rate) => rate.deliveredType === deliveredType);
  const candidates = matchingRates.length > 0 ? matchingRates : rates;

  return candidates.reduce<typeof candidates[number] | null>((best, rate) => {
    const currentPrice = toMoney(rate.price);
    const bestPrice = best ? toMoney(best.price) : null;

    if (currentPrice === null) {
      return best;
    }

    if (bestPrice === null || currentPrice < bestPrice) {
      return rate;
    }

    return best;
  }, null);
}

export async function estimateShippingWithCorreoArgentino(input: {
  postalCode: string;
  items: ShippingEstimateRequestItem[];
  deliveredType?: "D" | "S";
}): Promise<ShippingEstimateResult> {
  const deliveredType = input.deliveredType || "D";
  const estimatedPackage = buildPackageEstimateFromItems(input.items);
  const postalCode = normalizePostalCodeForShippingQuote(input.postalCode);
  const payload = await getCorreoArgentinoRates({
    postalCodeDestination: postalCode,
    packageEstimate: estimatedPackage,
    deliveredType,
  });
  const rates = Array.isArray(payload.rates) ? payload.rates : [];
  const selectedRate = pickBestRate(rates, deliveredType);
  const shippingCost = toMoney(selectedRate?.price);

  if (!selectedRate || shippingCost === null) {
    throw new Error("Correo Argentino no devolvio una tarifa valida para ese destino.");
  }

  return {
    postalCode,
    source: "correo-argentino",
    serviceName: selectedRate.productName?.trim() || selectedRate.productType?.trim() || null,
    deliveredType,
    shippingCost,
    deliveryTimeMin: selectedRate.deliveryTimeMin?.trim() || null,
    deliveryTimeMax: selectedRate.deliveryTimeMax?.trim() || null,
    validTo: payload.validTo?.trim() || null,
    estimatedPackage,
  };
}
