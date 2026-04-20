import "server-only";
import {
  createMercadoPagoOrder,
  processMercadoPagoWebhook,
  resolveMercadoPagoPaymentStatus,
} from "@/lib/services/paymentService";
import type { CreateOrderPayload } from "@/lib/types";

export async function createPendingMercadoPagoOrder(input: {
  payload: CreateOrderPayload;
  requestUrl?: string;
}) {
  return createMercadoPagoOrder(input);
}

export async function resolvePendingPaymentStatus(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  return resolveMercadoPagoPaymentStatus(input);
}

export async function handleMercadoPagoWebhook(input: {
  pendingOrderId?: number | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  externalReference?: string | null;
}) {
  return processMercadoPagoWebhook(input);
}
