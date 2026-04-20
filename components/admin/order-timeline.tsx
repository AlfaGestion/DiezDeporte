import { EmptyState } from "@/components/admin/empty-state";
import { adminPanelClass, cn, formatAdminDateTime } from "@/components/admin/admin-ui";
import { getLogOriginLabel, getOrderStateLabel } from "@/lib/order-admin";
import type { OrderStatusLog } from "@/lib/types";

export function OrderTimeline({ logs }: { logs: OrderStatusLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        title="Sin eventos registrados"
        message="Todavia no hay cambios de estado ni eventos operativos para este pedido."
      />
    );
  }

  return (
    <section className={cn(adminPanelClass, "space-y-5 px-5 py-5 sm:px-6")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Timeline</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">Historial de estados y origen de cada cambio.</p>
      </div>

      <div className="space-y-4">
        {logs.map((log) => (
          <article key={log.id} className="relative pl-6">
            <span className="absolute left-0 top-1 h-3 w-3 rounded-full bg-[color:var(--admin-accent)]" />
            <span className="absolute left-[5px] top-4 h-[calc(100%-0.25rem)] w-px bg-[color:var(--admin-pane-line)]" />
            <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                    {getOrderStateLabel(log.estadoNuevo)}
                  </div>
                  <div className="text-xs text-[color:var(--admin-text)]">
                    {log.estadoAnterior ? `Desde ${getOrderStateLabel(log.estadoAnterior)}` : "Alta inicial"}
                  </div>
                </div>
                <div className="space-y-1 text-left text-xs text-[color:var(--admin-text)] sm:text-right">
                  <div>{getLogOriginLabel(log.origen)}</div>
                  <div>{formatAdminDateTime(log.fecha)}</div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
