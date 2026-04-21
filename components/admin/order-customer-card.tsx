import { adminCardClass, cn } from "@/components/admin/admin-ui";
import type { StoredOrder } from "@/lib/types";

export function OrderCustomerCard({ order }: { order: StoredOrder }) {
  const customerName = order.nombre_cliente.trim() || "Cliente";
  const initials = customerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  const notes = order.metadata.customerNotes?.trim() || null;

  return (
    <section className={cn(adminCardClass, "overflow-hidden")}>
      <div className="border-b border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
              Cliente
            </div>
            <div className="space-y-1">
              <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-[color:var(--admin-title)]">
                {customerName}
              </h2>
              <p className="text-sm text-[color:var(--admin-text)]">
                Datos de contacto para seguimiento y coordinacion del pedido.
              </p>
            </div>
          </div>

          <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] text-base font-semibold tracking-[0.08em] text-[color:var(--admin-accent-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {initials || "CL"}
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Email
          </div>
          <div className="mt-2 text-sm font-medium text-[color:var(--admin-title)]">
            <a href={`mailto:${order.email_cliente}`} className="break-all hover:text-[color:var(--admin-accent)]">
              {order.email_cliente}
            </a>
          </div>
        </div>

        <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Telefono
          </div>
          <div className="mt-2 text-sm font-medium text-[color:var(--admin-title)]">
            <a href={`tel:${order.telefono_cliente}`} className="hover:text-[color:var(--admin-accent)]">
              {order.telefono_cliente}
            </a>
          </div>
        </div>

        <div className="sm:col-span-2 rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
            Observaciones
          </div>
          <div className="mt-2 text-sm leading-6 text-[color:var(--admin-title)]">
            {notes || "Sin observaciones del cliente."}
          </div>
        </div>
      </div>
    </section>
  );
}
