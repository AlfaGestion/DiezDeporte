import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError } from "@/lib/models/order";
import { getOrderDetailById } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  try {
    const detail = await getOrderDetailById(orderId);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Order GET by id API error", error);
    return NextResponse.json({ error: "No se pudo obtener el pedido." }, { status: 500 });
  }
}
