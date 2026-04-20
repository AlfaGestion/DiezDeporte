import { NextResponse } from "next/server";
import { createPendingMercadoPagoOrder } from "@/lib/web-payments";
import type { CreateOrderPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: CreateOrderPayload;

  try {
    payload = (await request.json()) as CreateOrderPayload;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la compra no es un JSON valido." },
      { status: 400 },
    );
  }

  try {
    const preference = await createPendingMercadoPagoOrder({
      payload,
      requestUrl: request.url,
    });

    return NextResponse.json({ preference }, { status: 201 });
  } catch (error) {
    console.error("Mercado Pago preference API error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar el pago con Mercado Pago.",
      },
      { status: 400 },
    );
  }
}
