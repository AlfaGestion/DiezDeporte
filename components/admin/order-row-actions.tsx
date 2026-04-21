"use client";

import { AdminOrderActionButton } from "@/components/admin/admin-order-action-button";
import { AdminOrderDetailFrameTrigger } from "@/components/admin-order-detail-frame-trigger";
import { InvoiceEmailDialog } from "@/components/admin/invoice-email-dialog";
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
  const needsApprovedPayment =
    order.nextActionLabel === "Facturar" && order.paymentStatus !== "aprobado";
  const opensInvoiceDialog =
    order.nextActionLabel === "Facturar" && order.paymentStatus === "aprobado";
  const opensPickupRegistration = order.nextActionLabel === "Registrar retiro";

  return (
    <div className="flex min-w-[250px] flex-col gap-2">
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
          customerName={order.customerName}
          customerEmail={order.customerEmail}
          orderNumber={order.orderNumber}
          triggerLabel="Facturar"
          triggerClassName={cn(adminPrimaryButtonClass, "w-full")}
        />
      ) : opensPickupRegistration ? (
        <AdminOrderDetailFrameTrigger
          orderId={order.id}
          returnTo={returnTo}
          label="Registrar retiro"
          className={cn(adminPrimaryButtonClass, "w-full")}
        />
      ) : order.nextActionLabel ? (
        <AdminOrderActionButton
          action="advance"
          orderId={order.id}
          returnTo={returnTo}
          label={order.nextActionLabel}
          pendingLabel="Actualizando..."
          className={cn(adminPrimaryButtonClass, "w-full")}
        />
      ) : (
        <div className="inline-flex h-10 items-center text-sm text-[color:var(--admin-text)]">
          Sin accion pendiente
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AdminOrderActionButton
            action="refresh"
            orderId={order.id}
            returnTo={returnTo}
            label="Actualizar pago"
            pendingLabel="Actualizando..."
            className={cn(adminSecondaryButtonClass, "w-full")}
          />
        </div>

        <AdminOrderDetailFrameTrigger
          orderId={order.id}
          returnTo={returnTo}
          className={cn(adminSecondaryButtonClass, "flex-1")}
        />
      </div>
    </div>
  );
}
