import { getPaymentStatusLabel } from "@/lib/order-admin";
import type { OrderPaymentStatus } from "@/lib/types";
import { cn } from "@/components/admin/admin-ui";

const toneMap: Record<OrderPaymentStatus, string> = {
  pendiente: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-400/10 dark:text-slate-200 dark:ring-slate-300/20",
  aprobado: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20",
  rechazado: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-300/20",
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: OrderPaymentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        toneMap[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current/80" />
      {getPaymentStatusLabel(status)}
    </span>
  );
}
