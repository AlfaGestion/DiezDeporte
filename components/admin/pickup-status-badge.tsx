import { cn } from "@/components/admin/admin-ui";
import { getPickupStatusLabel } from "@/lib/order-admin";

export function PickupStatusBadge({
  redeemed,
  className,
}: {
  redeemed: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        redeemed
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20"
          : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current/80" />
      {getPickupStatusLabel(redeemed)}
    </span>
  );
}
