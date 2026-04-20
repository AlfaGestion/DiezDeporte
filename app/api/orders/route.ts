import { NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import type { CreateOrderPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: CreateOrderPayload;

  try {
    payload = (await request.json()) as CreateOrderPayload;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo del pedido no es un JSON válido." },
      { status: 400 },
    );
  }

  try {
    const order = await createOrder(payload);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Order API error", error);

    const message =
      error instanceof Error ? error.message : "No se pudo grabar el pedido.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
