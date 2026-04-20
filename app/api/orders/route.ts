import { NextResponse } from "next/server";
import {
  createOrder,
  createOrderFromCheckoutPayload,
  getOrders,
  seedSampleOrders,
} from "@/lib/services/orderService";
import { formatOrderAsLegacySummary, OrderValidationError } from "@/lib/models/order";
import type { CreateOrderInput, CreateOrderPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLegacyCheckoutPayload(payload: unknown): payload is CreateOrderPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "customer" in payload &&
      "items" in payload,
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("seed") === "true") {
      const orders = await seedSampleOrders();
      return NextResponse.json({ orders });
    }

    const orders = await getOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Orders GET API error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los pedidos.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: CreateOrderPayload | CreateOrderInput;

  try {
    payload = (await request.json()) as CreateOrderPayload | CreateOrderInput;
  } catch {
    return NextResponse.json(
      { error: "El cuerpo del pedido no es un JSON válido." },
      { status: 400 },
    );
  }

  try {
    if (isLegacyCheckoutPayload(payload)) {
      const order = await createOrderFromCheckoutPayload(payload);
      const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
      return NextResponse.json(
        {
          order: formatOrderAsLegacySummary(order, itemCount),
          data: order,
        },
        { status: 201 },
      );
    }

    const order = await createOrder(payload);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Order API error", error);

    const message = error instanceof Error ? error.message : "No se pudo grabar el pedido.";
    const status = error instanceof OrderValidationError ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
