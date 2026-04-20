import { NextResponse } from "next/server";
import { resolvePendingPaymentStatus } from "@/lib/web-payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawOrderId = searchParams.get("orderId");
  const pendingOrderId = rawOrderId ? Number(rawOrderId) : Number.NaN;
  const paymentId = searchParams.get("paymentId");
  const preferenceId = searchParams.get("preferenceId");
  const externalReference = searchParams.get("externalReference");

  if (
    !Number.isFinite(pendingOrderId) &&
    !paymentId &&
    !preferenceId &&
    !externalReference
  ) {
    return NextResponse.json(
      { error: "Falta orderId, paymentId, preferenceId o externalReference." },
      { status: 400 },
    );
  }

  try {
    const status = await resolvePendingPaymentStatus({
      pendingOrderId: Number.isFinite(pendingOrderId) ? pendingOrderId : null,
      paymentId,
      preferenceId,
      externalReference,
    });

    if (!status) {
      return NextResponse.json(
        { error: "No se encontro el pago solicitado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ status });
  } catch (error) {
    console.error("Mercado Pago status API error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el estado del pago.",
      },
      { status: 400 },
    );
  }
}
