import { getOrderStateLabel } from "@/lib/order-admin";
import type { OrderState } from "@/lib/types";
import { cn } from "@/components/admin/admin-ui";

const toneMap: Record<OrderState, string> = {
  PENDIENTE: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
  APROBADO: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-300/20",
  FACTURADO: "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-200 dark:ring-indigo-300/20",
  PREPARANDO: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-300/20",
  LISTO_PARA_RETIRO: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20",
  ENVIADO: "bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-cyan-300/20",
  ENTREGADO: "bg-green-50 text-green-800 ring-green-200 dark:bg-green-400/10 dark:text-green-200 dark:ring-green-300/20",
  CANCELADO: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-400/10 dark:text-slate-200 dark:ring-slate-300/20",
  ERROR: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-300/20",
};

export function OrderStatusBadge({
  state,
  className,
}: {
  state: OrderState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        toneMap[state],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current/80" />
      {getOrderStateLabel(state)}
    </span>
  );
}
