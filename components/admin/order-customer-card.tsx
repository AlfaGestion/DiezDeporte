import { adminCardClass, cn } from "@/components/admin/admin-ui";
import type { StoredOrder } from "@/lib/types";

export function OrderCustomerCard({ order }: { order: StoredOrder }) {
  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Cliente</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          Datos de contacto para seguimiento del pedido.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Nombre
          </dt>
          <dd className="mt-1 font-medium text-[color:var(--admin-title)]">{order.nombre_cliente}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Email
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">{order.email_cliente}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Telefono
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">{order.telefono_cliente}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Observaciones
          </dt>
          <dd className="mt-1 text-[color:var(--admin-title)]">
            {order.metadata.customerNotes || "Sin observaciones"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
