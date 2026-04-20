import "server-only";
import { createOrderFromCheckoutPayload } from "@/lib/services/orderService";
import type { CreateOrderPayload, OrderSummary } from "@/lib/types";
import { formatOrderAsLegacySummary } from "@/lib/models/order";

export async function createOrder(payload: CreateOrderPayload): Promise<OrderSummary> {
  const order = await createOrderFromCheckoutPayload(payload);
  const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  return formatOrderAsLegacySummary(order, itemCount);
}

