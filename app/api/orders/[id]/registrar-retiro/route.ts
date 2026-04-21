import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError, OrderValidationError } from "@/lib/models/order";
import { registrarRetiroPedido } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
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

  let body: {
    codigo?: string;
    nombre?: string;
    apellido?: string;
    dni?: string;
    observacion?: string;
    paymentAccountCode?: string;
  };

  try {
    body = (await request.json()) as {
      codigo?: string;
      nombre?: string;
      apellido?: string;
      dni?: string;
      observacion?: string;
      paymentAccountCode?: string;
    };
  } catch {
    return NextResponse.json({ error: "El cuerpo no es un JSON valido." }, { status: 400 });
  }

  try {
    const order = await registrarRetiroPedido(
      orderId,
      {
        codigo: body.codigo || "",
        nombre: body.nombre || "",
        apellido: body.apellido || "",
        dni: body.dni || null,
        observacion: body.observacion || null,
        paymentAccountCode: body.paymentAccountCode || null,
      },
      {
        origin: "admin",
      },
    );
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Order registrar retiro API error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo registrar el retiro.",
      },
      { status: 500 },
    );
  }
}
