import { NextResponse } from "next/server";
import { isLikelyValidPostalCode, normalizePostalCodeInput } from "@/lib/shipping";
import { estimateShippingWithCorreoArgentino } from "@/lib/services/shippingEstimateService";
import { getServerSettings } from "@/lib/store-config";
import type { ShippingEstimateRequestItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstimateRequestBody = {
  postalCode?: string;
  items?: ShippingEstimateRequestItem[];
};

function normalizeItems(items: EstimateRequestBody["items"]) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const quantity = Math.trunc(Number(item?.quantity) || 0);

      return {
        productId: String(item?.productId || ""),
        description: String(item?.description || "").trim(),
        category: String(item?.category || "").trim(),
        quantity,
      };
    })
    .filter((item) => item.productId && item.quantity > 0);
}

export async function POST(request: Request) {
  let payload: EstimateRequestBody;

  try {
    payload = (await request.json()) as EstimateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "La solicitud de envio no es un JSON valido." },
      { status: 400 },
    );
  }

  const settings = await getServerSettings();

  if (!settings.shippingEstimationEnabled) {
    return NextResponse.json(
      { error: "La cotizacion con Correo Argentino no esta configurada." },
      { status: 503 },
    );
  }

  const postalCode = normalizePostalCodeInput(payload.postalCode || "");

  if (!isLikelyValidPostalCode(postalCode)) {
    return NextResponse.json(
      { error: "Ingresa un codigo postal valido para cotizar el envio." },
      { status: 400 },
    );
  }

  const items = normalizeItems(payload.items);

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Agrega al menos un articulo para estimar el envio." },
      { status: 400 },
    );
  }

  try {
    const estimate = await estimateShippingWithCorreoArgentino({
      postalCode,
      items,
      deliveredType: "D",
    });

    return NextResponse.json({ estimate }, { status: 200 });
  } catch (error) {
    console.error("Shipping estimate API error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cotizar el envio con Correo Argentino.",
      },
      { status: 502 },
    );
  }
}
