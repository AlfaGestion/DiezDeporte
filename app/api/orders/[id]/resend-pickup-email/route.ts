import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { OrderNotFoundError, OrderValidationError } from "@/lib/models/order";
import { resendPickupReadyEmail } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
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
    const order = await resendPickupReadyEmail(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Order resend pickup email API error", error);
    return NextResponse.json(
      { error: "No se pudo reenviar el email de retiro." },
      { status: 500 },
    );
  }
}
