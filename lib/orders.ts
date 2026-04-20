import "server-only";
import { formatOrderAsLegacySummary } from "@/lib/models/order";
import { createOrderFromCheckoutPayload } from "@/lib/services/orderService";
import { getServerSettings } from "@/lib/store-config";
import type { CreateOrderPayload, OrderSummary } from "@/lib/types";

export async function createOrder(payload: CreateOrderPayload): Promise<OrderSummary> {
  const settings = await getServerSettings();
  const order = await createOrderFromCheckoutPayload(payload);
  const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  return formatOrderAsLegacySummary(order, itemCount, {
    tc: order.metadata.documentTc || settings.mercadoPagoOrderTc || settings.orderTc || "WEB",
    branch: settings.orderBranch,
    documentNumber: order.metadata.documentNumber || null,
  });
}
