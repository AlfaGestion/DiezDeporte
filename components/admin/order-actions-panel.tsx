import {
  advanceAdminOrderAction,
  refreshAdminOrderAction,
  updateAdminOrderStateAction,
} from "@/app/admin/actions";
import {
  adminCardClass,
  adminDangerButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";
import type { StoredOrder } from "@/lib/types";

export function OrderActionsPanel({
  order,
  returnTo,
  nextActionLabel,
  canMarkCancelled,
  canMarkError,
}: {
  order: StoredOrder;
  returnTo: string;
  nextActionLabel: string | null;
  canMarkCancelled: boolean;
  canMarkError: boolean;
}) {
  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Acciones</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          Operacion manual del pedido y refresco del pago.
        </p>
      </div>

      <div className="space-y-2">
        {nextActionLabel ? (
          <form action={advanceAdminOrderAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className={cn(adminPrimaryButtonClass, "w-full")}>
              {nextActionLabel}
            </button>
          </form>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[color:var(--admin-pane-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
            No hay un siguiente paso disponible para este pedido.
          </div>
        )}

        <form action={refreshAdminOrderAction}>
          <input type="hidden" name="pendingOrderId" value={order.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={cn(adminSecondaryButtonClass, "w-full")}>
            Actualizar pago
          </button>
        </form>

        {canMarkCancelled ? (
          <form action={updateAdminOrderStateAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="nextState" value="CANCELADO" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className={cn(adminDangerButtonClass, "w-full")}>
              Cancelar pedido
            </button>
          </form>
        ) : null}

        {canMarkError ? (
          <form action={updateAdminOrderStateAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="nextState" value="ERROR" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className={cn(adminSecondaryButtonClass, "w-full")}>
              Marcar error
            </button>
          </form>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-[color:var(--admin-pane-line)] pt-4 text-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Preference ID
          </div>
          <div className="mt-1 break-all text-[color:var(--admin-title)]">
            {order.metadata.preferenceId || "Sin preferencia"}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Metodo de pago
          </div>
          <div className="mt-1 text-[color:var(--admin-title)]">
            {order.metadata.paymentMethodId || order.metadata.paymentMethod || "No informado"}
          </div>
        </div>
      </div>
    </section>
  );
}
