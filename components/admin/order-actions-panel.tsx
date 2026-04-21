"use client";

import { AdminOrderActionButton } from "@/components/admin/admin-order-action-button";
import { InvoiceEmailDialog } from "@/components/admin/invoice-email-dialog";
import { OrderPaymentRecoveryActions } from "@/components/admin/order-payment-recovery-actions";
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
  allowPickupLocalFallback,
  pickupSchedule,
}: {
  order: StoredOrder;
  returnTo: string;
  nextActionLabel: string | null;
  canMarkCancelled: boolean;
  canMarkError: boolean;
  allowPickupLocalFallback: boolean;
  pickupSchedule?: string | null;
}) {
  const isLocalPickupPayment =
    order.tipo_pedido === "retiro" &&
    (order.metadata.paymentMethod || "").trim().toLowerCase() === "pago en local";
  const needsApprovedPayment =
    nextActionLabel === "Facturar" &&
    order.estado_pago !== "aprobado" &&
    !isLocalPickupPayment;
  const opensInvoiceDialog =
    nextActionLabel === "Facturar" && order.estado_pago === "aprobado";
  const needsPickupRegistration = nextActionLabel === "Registrar retiro";
  const canResendPickupEmail =
    order.tipo_pedido === "retiro" &&
    order.estado === "LISTO_PARA_RETIRO" &&
    order.retirado !== "SI";
  const pickupEmailOnlyMode = canResendPickupEmail;
  const canRecoverPayment =
    order.metadata.paymentInitStatus === "failed" &&
    order.estado === "PENDIENTE" &&
    order.estado_pago === "pendiente";

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
        <PickupEmailComposer order={order} pickupSchedule={pickupSchedule} />
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
          ) : opensInvoiceDialog ? (
            <InvoiceEmailDialog
              orderId={order.id}
              customerName={order.nombre_cliente}
              customerEmail={order.email_cliente}
              orderNumber={order.numero_pedido}
              triggerClassName={cn(adminPrimaryButtonClass, "w-full")}
            />
          ) : needsPickupRegistration ? (
            <a href="#pickup-panel" className={cn(adminPrimaryButtonClass, "w-full")}>
              Registrar retiro
            </a>
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

          {canRecoverPayment ? (
            <div className="space-y-2 rounded-[16px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="font-semibold">Hubo un fallo tecnico al iniciar Mercado Pago.</div>
              <div>
                {order.metadata.paymentInitErrorMessage || "El pedido sigue vigente y puedes reintentar el pago o pasar a retiro y pago local."}
              </div>
              <OrderPaymentRecoveryActions
                orderId={order.id}
                allowPickupLocalFallback={allowPickupLocalFallback}
              />
            </div>
          ) : null}

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
