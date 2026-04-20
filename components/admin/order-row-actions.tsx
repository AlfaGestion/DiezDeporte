import {
  advanceAdminOrderAction,
  refreshAdminOrderAction,
} from "@/app/admin/actions";
import { AdminOrderDetailFrameTrigger } from "@/components/admin-order-detail-frame-trigger";
import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";
import type { AdminOrderRecord } from "@/lib/types";

export function OrderRowActions({
  order,
  returnTo,
}: {
  order: AdminOrderRecord;
  returnTo: string;
}) {
  return (
    <div className="flex min-w-[250px] flex-col gap-2">
      {order.nextActionLabel ? (
        <form action={advanceAdminOrderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={cn(adminPrimaryButtonClass, "w-full")}>
            {order.nextActionLabel}
          </button>
        </form>
      ) : (
        <div className="inline-flex h-10 items-center text-sm text-[color:var(--admin-text)]">
          Sin accion pendiente
        </div>
      )}

      <div className="flex items-center gap-2">
        <form action={refreshAdminOrderAction} className="flex-1">
          <input type="hidden" name="pendingOrderId" value={order.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={cn(adminSecondaryButtonClass, "w-full")}>
            Actualizar pago
          </button>
        </form>

        <AdminOrderDetailFrameTrigger
          orderId={order.id}
          returnTo={returnTo}
          className={cn(adminSecondaryButtonClass, "flex-1")}
        />
      </div>
    </div>
  );
}
