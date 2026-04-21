import { OrderRowActions } from "@/components/admin/order-row-actions";
import { PickupStatusBadge } from "@/components/admin/pickup-status-badge";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { PaymentStatusBadge } from "@/components/admin/payment-status-badge";
import {
  adminPanelClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import { formatCurrency } from "@/lib/commerce";
import { getOrderTypeLabel } from "@/lib/order-admin";
import type { AdminOrderRecord } from "@/lib/types";

function sortOrdersForDisplay(orders: AdminOrderRecord[]) {
  return [...orders].sort((left, right) => {
    const getPriority = (order: AdminOrderRecord) => {
      if (order.orderState === "CANCELADO") {
        return 2;
      }

      if (order.orderState === "ENTREGADO") {
        return 1;
      }

      return 0;
    };
    const leftPriority = getPriority(left);
    const rightPriority = getPriority(right);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return 0;
  });
}

export function OrdersTable({
  orders,
  returnTo,
}: {
  orders: AdminOrderRecord[];
  returnTo: string;
}) {
  const displayOrders = sortOrdersForDisplay(orders);

  return (
    <div className={cn(adminPanelClass, "overflow-hidden")}>
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[1] bg-[color:var(--admin-table-head-bg)]">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-table-head-text)]">
              <th className="px-5 py-4">Pedido</th>
              <th className="px-5 py-4">Fecha</th>
              <th className="px-5 py-4">Cliente</th>
              <th className="px-5 py-4 text-right">Total</th>
              <th className="px-5 py-4">Tipo</th>
              <th className="px-5 py-4">Estado</th>
              <th className="px-5 py-4">Pago</th>
              <th className="px-5 py-4">Accion</th>
            </tr>
          </thead>
          <tbody>
            {displayOrders.map((order) => {
              const isDelivered = order.orderState === "ENTREGADO";
              const isPendingPickup = order.orderState === "LISTO_PARA_RETIRO";
              const isCancelled = order.orderState === "CANCELADO";

              return (
                <tr
                  key={order.id}
                  className={cn(
                    "border-t border-[color:var(--admin-table-row-line)] align-top transition",
                    isCancelled
                      ? "bg-rose-50/80 hover:bg-rose-100/80 dark:bg-rose-500/10 dark:hover:bg-rose-500/15"
                      : isDelivered
                      ? "bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15"
                      : isPendingPickup
                        ? "bg-amber-50/80 hover:bg-amber-100/80 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
                      : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-[color:var(--admin-title)]">{order.orderNumber}</div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        Ref. {order.externalReference}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <div className="font-medium text-[color:var(--admin-title)]">
                        {formatAdminDateTime(order.createdAt)}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        Act. {formatAdminDateTime(order.updatedAt)}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <div className="font-medium text-[color:var(--admin-title)]">
                        {order.customerName || "Sin nombre"}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">{order.customerEmail || "Sin correo"}</div>
                      <div className="text-xs text-[color:var(--admin-text)]">{order.customerPhone || "Sin telefono"}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="space-y-1">
                      <div className="font-semibold tabular-nums text-[color:var(--admin-title)]">
                        {formatCurrency(order.total)}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {order.itemCount} {order.itemCount === 1 ? "unidad" : "unidades"}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <div className="font-medium text-[color:var(--admin-title)]">
                        {getOrderTypeLabel(order.orderType)}
                      </div>
                      {order.orderType === "retiro" ? (
                        <>
                          <PickupStatusBadge redeemed={order.pickupRedeemed} className="w-fit" />
                          <div className="text-xs text-[color:var(--admin-text)]">
                            {order.pickupRedeemed
                              ? `Retirado ${formatAdminDateTime(order.pickupRedeemedAt)}`
                              : "Todavia no retirado"}
                          </div>
                          <div className="text-xs text-[color:var(--admin-text)]">
                            {order.pickupRedeemedBy
                              ? `Retiro: ${order.pickupRedeemedBy}`
                              : order.pickupCode
                                ? `Codigo: ${order.pickupCode}`
                                : "Sin codigo de retiro"}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-[color:var(--admin-text)]">{order.customerCity || "Sin localidad"}</div>
                          <div className="text-xs text-[color:var(--admin-text)]">{order.customerAddress || "Sin direccion"}</div>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <OrderStatusBadge state={order.orderState} />
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {order.nextActionLabel ? `Siguiente: ${order.nextActionLabel}` : "Cerrado"}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {order.paymentMethod || order.paymentMethodId || "Metodo no informado"}
                        {order.paymentTypeId ? ` | ${order.paymentTypeId}` : ""}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {order.paymentId || "Sin pago registrado"}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <OrderRowActions order={order} returnTo={returnTo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
