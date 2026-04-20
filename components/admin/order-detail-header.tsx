import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { PaymentStatusBadge } from "@/components/admin/payment-status-badge";
import {
  adminPanelClass,
  adminSecondaryButtonClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import { formatCurrency } from "@/lib/commerce";
import { getOrderTypeLabel } from "@/lib/order-admin";
import type { StoredOrder } from "@/lib/types";

export function OrderDetailHeader({
  order,
  documentNumber,
  documentTc,
  safeReturnTo,
  isEmbedded,
}: {
  order: StoredOrder;
  documentNumber: string;
  documentTc: string | null;
  safeReturnTo: string;
  isEmbedded: boolean;
}) {
  return (
    <section className={cn(adminPanelClass, "overflow-hidden px-5 py-5 sm:px-6")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          {!isEmbedded ? (
            <Link href={safeReturnTo} className={cn(adminSecondaryButtonClass, "w-fit")}>
              Volver al listado
            </Link>
          ) : null}

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
              Pedido
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[color:var(--admin-title)]">
                {order.numero_pedido}
              </h1>
              <OrderStatusBadge state={order.estado} />
              <PaymentStatusBadge status={order.estado_pago} />
            </div>
            <p className="text-sm text-[color:var(--admin-text)]">
              {documentTc || "NP"} {documentNumber} · {getOrderTypeLabel(order.tipo_pedido)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Fecha
            </div>
            <div className="mt-1 text-sm font-medium text-[color:var(--admin-title)]">
              {formatAdminDateTime(order.fecha_creacion)}
            </div>
          </div>
          <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Total
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--admin-title)]">
              {formatCurrency(order.monto_total)}
            </div>
          </div>
          <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Pago
            </div>
            <div className="mt-1 text-sm font-medium text-[color:var(--admin-title)]">
              {order.id_pago || "Sin pago"}
            </div>
          </div>
          <div className="rounded-[16px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Actualizado
            </div>
            <div className="mt-1 text-sm font-medium text-[color:var(--admin-title)]">
              {formatAdminDateTime(order.fecha_actualizacion)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
