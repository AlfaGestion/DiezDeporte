import { adminCardClass, cn } from "@/components/admin/admin-ui";
import { getOrderTypeLabel } from "@/lib/order-admin";
import type { StoredOrder } from "@/lib/types";

export function OrderDeliveryCard({
  order,
  documentNumber,
  documentTc,
}: {
  order: StoredOrder;
  documentNumber: string;
  documentTc: string | null;
}) {
  const isPickup = order.tipo_pedido === "retiro";

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Entrega</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          Modalidad, referencia operativa y seguimiento.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Tipo
          </dt>
          <dd className="mt-1 font-medium text-[color:var(--admin-title)]">
            {getOrderTypeLabel(order.tipo_pedido)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Direccion
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">
            {order.metadata.customerAddress || order.direccion || "Sin direccion"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Referencia
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">
            {isPickup ? order.metadata.pickupCode || "Sin codigo" : `${documentTc || "NP"} ${documentNumber}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Seguimiento
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">
            {order.numero_seguimiento || "Sin seguimiento"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            QR de retiro
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">
            {order.codigo_qr ? "Disponible" : "No generado"}
          </dd>
        </div>
      </dl>

      {isPickup && order.codigo_qr ? (
        <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={order.codigo_qr} alt={`QR del pedido ${order.numero_pedido}`} className="mx-auto max-w-[220px]" />
        </div>
      ) : null}
    </section>
  );
}
