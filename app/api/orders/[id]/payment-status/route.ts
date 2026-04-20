import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError } from "@/lib/models/order";
import { markOrderPaymentStatus } from "@/lib/services/orderService";
import type { OrderPaymentStatus } from "@/lib/types/order";

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

  let body: { estado_pago?: OrderPaymentStatus };

  try {
    body = (await request.json()) as { estado_pago?: OrderPaymentStatus };
  } catch {
    return NextResponse.json({ error: "El cuerpo no es un JSON valido." }, { status: 400 });
  }

  if (!body.estado_pago) {
    return NextResponse.json({ error: "Falta el nuevo estado de pago." }, { status: 400 });
  }

  try {
    const order = await markOrderPaymentStatus(orderId, body.estado_pago, null);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Order PATCH payment status API error", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el estado del pago." },
      { status: 500 },
    );
  }
}
