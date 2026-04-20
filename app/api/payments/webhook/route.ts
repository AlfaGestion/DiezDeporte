import { NextResponse } from "next/server";
import { extractPaymentIdFromWebhookPayload } from "@/lib/mercado-pago";
import { handleMercadoPagoWebhook } from "@/lib/web-payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseWebhookPayload(rawBody: string) {
  if (!rawBody.trim()) return null;

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

async function processWebhook(request: Request) {
  const url = new URL(request.url);
  const rawBody =
    request.method === "POST" ? await request.text() : "";
  const payload = parseWebhookPayload(rawBody);
  const paymentId = extractPaymentIdFromWebhookPayload(payload, request.url);
  const rawOrderId = url.searchParams.get("orderId");
  const pendingOrderId = rawOrderId ? Number(rawOrderId) : Number.NaN;
  const preferenceId = url.searchParams.get("preferenceId");
  const externalReference = url.searchParams.get("externalReference");

  if (
    !paymentId &&
    !Number.isFinite(pendingOrderId) &&
    !preferenceId &&
    !externalReference
  ) {
    return NextResponse.json(
      { received: true, ignored: true },
      { status: 202 },
    );
  }

  try {
    const status = await handleMercadoPagoWebhook({
      pendingOrderId: Number.isFinite(pendingOrderId) ? pendingOrderId : null,
      paymentId,
      preferenceId,
      externalReference,
    });

    return NextResponse.json(
      {
        received: true,
        status: status?.status || "pending",
        orderId: status?.pendingOrderId || null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Mercado Pago webhook error", error);

    return NextResponse.json(
      {
        received: true,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el webhook.",
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  return processWebhook(request);
}

export async function GET(request: Request) {
  return processWebhook(request);
}
