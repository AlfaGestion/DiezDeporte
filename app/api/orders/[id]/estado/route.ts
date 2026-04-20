import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderValidationError,
} from "@/lib/models/order";
import { updateOrderStatus } from "@/lib/services/orderService";
import type { OrderState } from "@/lib/types/order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  const orderId = Number(id);

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "El id del pedido es invalido." }, { status: 400 });
  }

  let body: { estado?: OrderState };

  try {
    body = (await request.json()) as { estado?: OrderState };
  } catch {
    return NextResponse.json({ error: "El cuerpo no es un JSON valido." }, { status: 400 });
  }

  if (!body.estado) {
    return NextResponse.json({ error: "Falta el nuevo estado." }, { status: 400 });
  }

  try {
    const order = await updateOrderStatus(orderId, body.estado, { origin: "admin" });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof InvalidOrderTransitionError ||
      error instanceof OrderValidationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Order PATCH estado API error", error);
    return NextResponse.json({ error: "No se pudo actualizar el estado." }, { status: 500 });
  }
}
