import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError, OrderValidationError } from "@/lib/models/order";
import { registrarRetiroPedidoPorCodigo } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { codigo?: string; nombreApellido?: string };

  try {
    body = (await request.json()) as { codigo?: string; nombreApellido?: string };
  } catch {
    return NextResponse.json({ error: "El cuerpo no es un JSON valido." }, { status: 400 });
  }

  try {
    const order = await registrarRetiroPedidoPorCodigo(
      body.codigo || "",
      body.nombreApellido || "",
      { origin: "admin" },
    );

    return NextResponse.json({
      order: {
        id: order.id,
        numero_pedido: order.numero_pedido,
        nombre_cliente: order.nombre_cliente,
        estado: order.estado,
        retirado: order.retirado,
        fecha_hora_retiro: order.fecha_hora_retiro,
        nombre_apellido_retiro: order.nombre_apellido_retiro,
      },
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: "No se encontro un pedido para ese codigo." }, { status: 404 });
    }

    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Pickup redeem API error", error);
    return NextResponse.json({ error: "No se pudo registrar el retiro." }, { status: 500 });
  }
}
