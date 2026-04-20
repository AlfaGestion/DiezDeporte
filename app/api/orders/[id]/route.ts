import { NextResponse } from "next/server";
import { OrderNotFoundError } from "@/lib/models/order";
import { getOrderById } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const orderId = Number(id);

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "El id del pedido es inválido." }, { status: 400 });
  }

  try {
    const order = await getOrderById(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Order GET by id API error", error);
    return NextResponse.json({ error: "No se pudo obtener el pedido." }, { status: 500 });
  }
}

