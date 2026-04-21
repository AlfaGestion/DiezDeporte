import type { CSSProperties } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { adminPanelClass, cn, formatAdminDateTime } from "@/components/admin/admin-ui";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import {
  getLogOriginLabel,
  getOrderStateLabel,
  getOrderStateShortCode,
  getOrderStateThemeKey,
} from "@/lib/order-admin";
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
        {logs.map((log, index) => {
          const themeKey = getOrderStateThemeKey(log.estadoNuevo);
          const codeStyle = {
            backgroundColor: `var(--order-state-${themeKey}-bg)`,
            color: `var(--order-state-${themeKey}-text)`,
            borderColor: `var(--order-state-${themeKey}-border)`,
          } as CSSProperties;

          return (
            <article key={log.id} className="relative pl-7">
              <span
                className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-[color:var(--admin-pane-bg)]"
                style={{ backgroundColor: `var(--order-state-${themeKey}-dot)` }}
              />
              {index < logs.length - 1 ? (
                <span className="absolute left-[6px] top-5 h-[calc(100%-0.5rem)] w-px bg-[color:var(--admin-pane-line)]" />
              ) : null}

              <div className="rounded-[18px] border border-[color:var(--admin-card-line)] bg-[color:var(--admin-card-bg)] px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.22em]"
                        style={codeStyle}
                      >
                        {getOrderStateShortCode(log.estadoNuevo)}
                      </span>
                      <OrderStatusBadge state={log.estadoNuevo} />
                    </div>
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
          );
        })}
      </div>
    </section>
  );
}
