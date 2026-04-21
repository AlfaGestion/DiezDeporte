"use client";

import { AdminOrderActionButton } from "@/components/admin/admin-order-action-button";
import { PickupEmailComposer } from "@/components/admin/pickup-email-composer";
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
  const needsApprovedPayment =
    nextActionLabel === "Facturar" && order.estado_pago !== "aprobado";
  const canResendPickupEmail =
    order.tipo_pedido === "retiro" &&
    order.estado === "LISTO_PARA_RETIRO" &&
    order.retirado !== "SI";
  const pickupEmailOnlyMode = canResendPickupEmail;

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">
          {pickupEmailOnlyMode ? "Email de retiro" : "Acciones"}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          {pickupEmailOnlyMode
            ? "Edita el texto y envia el aviso de retiro al cliente."
            : "Operacion manual del pedido y refresco del pago."}
        </p>
      </div>

      {pickupEmailOnlyMode ? (
        <PickupEmailComposer order={order} />
      ) : (
        <div className="space-y-2">
          {needsApprovedPayment ? (
            <AdminOrderActionButton
              action="approve-payment"
              orderId={order.id}
              returnTo={returnTo}
              label="Aprobar pago"
              pendingLabel="Aprobando..."
              className={cn(adminPrimaryButtonClass, "w-full")}
            />
          ) : nextActionLabel ? (
            <AdminOrderActionButton
              action="advance"
              orderId={order.id}
              returnTo={returnTo}
              label={nextActionLabel}
              pendingLabel="Actualizando..."
              className={cn(adminPrimaryButtonClass, "w-full")}
            />
          ) : (
            <div className="rounded-[14px] border border-dashed border-[color:var(--admin-pane-line)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
              No hay un siguiente paso disponible para este pedido.
            </div>
          )}

          <AdminOrderActionButton
            action="refresh"
            orderId={order.id}
            returnTo={returnTo}
            label="Actualizar pago"
            pendingLabel="Actualizando..."
            className={cn(adminSecondaryButtonClass, "w-full")}
          />

          {canMarkCancelled ? (
            <AdminOrderActionButton
              action="update-state"
              orderId={order.id}
              nextState="CANCELADO"
              returnTo={returnTo}
              label="Cancelar pedido"
              pendingLabel="Cancelando..."
              className={cn(adminDangerButtonClass, "w-full")}
            />
          ) : null}

          {canMarkError ? (
            <AdminOrderActionButton
              action="update-state"
              orderId={order.id}
              nextState="ERROR"
              returnTo={returnTo}
              label="Marcar error"
              pendingLabel="Actualizando..."
              className={cn(adminSecondaryButtonClass, "w-full")}
            />
          ) : null}
        </div>
      )}

      {!pickupEmailOnlyMode ? (
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
      ) : null}
    </section>
  );
}
