import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError, OrderValidationError } from "@/lib/models/order";
import { lookupPickupOrderByCode } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { codigo?: string };

  try {
    body = (await request.json()) as { codigo?: string };
  } catch {
    return NextResponse.json({ error: "El cuerpo no es un JSON valido." }, { status: 400 });
  }

  try {
    const { order, pickupCode, documentItems, currentStateEnteredAt } =
      await lookupPickupOrderByCode(body.codigo || "");
    const disponible = order.estado === "LISTO_PARA_RETIRO" && order.retirado !== "SI";

    return NextResponse.json({
      pickupCode,
      disponible,
      order: {
        id: order.id,
        numero_pedido: order.numero_pedido,
        nombre_cliente: order.nombre_cliente,
        email_cliente: order.email_cliente,
        dni_cliente: order.metadata.customerDocumentNumber || null,
        estado: order.estado,
        paymentMethod: order.metadata.paymentMethod || null,
        paymentStatus: order.estado_pago,
        fecha_entrada_estado: currentStateEnteredAt,
        retirado: order.retirado,
        fecha_creacion: order.fecha_creacion,
        fecha_hora_retiro: order.fecha_hora_retiro,
        nombre_apellido_retiro: order.nombre_apellido_retiro,
        nombre_retiro: order.nombre_retiro,
        apellido_retiro: order.apellido_retiro,
        dni_retiro: order.dni_retiro,
        observacion_retiro: order.observacion_retiro,
      },
      items: documentItems.map((item) => ({
        articleId: item.articleId,
        description: item.description,
        quantity: item.quantity,
        total: item.total,
      })),
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: "No se encontro un pedido para ese codigo." }, { status: 404 });
    }

    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Pickup lookup API error", error);
    return NextResponse.json({ error: "No se pudo validar el codigo de retiro." }, { status: 500 });
  }
}
