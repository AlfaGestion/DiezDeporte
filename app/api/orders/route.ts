import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import {
  formatOrderAsLegacySummary,
  normalizeOrderFilters,
  OrderValidationError,
} from "@/lib/models/order";
import {
  createOrder,
  createOrderFromCheckoutPayload,
  getOrders,
  seedSampleOrders,
} from "@/lib/services/orderService";
import { getServerSettings } from "@/lib/store-config";
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
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("seed") === "true") {
      const orders = await seedSampleOrders();
      return NextResponse.json({ orders });
    }

    const filters = normalizeOrderFilters({
      estado: searchParams.get("estado"),
      estado_pago: searchParams.get("estado_pago"),
      tipo_pedido: searchParams.get("tipo_pedido"),
      vista: searchParams.get("vista"),
      q: searchParams.get("q"),
      fecha_desde: searchParams.get("fecha_desde"),
      fecha_hasta: searchParams.get("fecha_hasta"),
      limit: searchParams.get("limit"),
    });
    const orders = await getOrders(filters);
    return NextResponse.json({ orders, filters });
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
      { error: "El cuerpo del pedido no es un JSON valido." },
      { status: 400 },
    );
  }

  try {
    if (isLegacyCheckoutPayload(payload)) {
      const settings = await getServerSettings();
      const order = await createOrderFromCheckoutPayload(payload);
      const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
      return NextResponse.json(
        {
          order: formatOrderAsLegacySummary(order, itemCount, {
            tc: order.metadata.documentTc || settings.mercadoPagoOrderTc || settings.orderTc || "WEB",
            branch: settings.orderBranch,
            documentNumber: order.metadata.documentNumber || null,
          }),
          data: order,
        },
        { status: 201 },
      );
    }

    const order = await createOrder(payload, { origin: "sistema" });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Order API error", error);

    const message = error instanceof Error ? error.message : "No se pudo grabar el pedido.";
    const status = error instanceof OrderValidationError ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
