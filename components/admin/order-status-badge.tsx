import type { CSSProperties } from "react";
import { getOrderStateLabel, getOrderStateThemeKey } from "@/lib/order-admin";
import type { OrderState } from "@/lib/types";
import { cn } from "@/components/admin/admin-ui";

export function OrderStatusBadge({
  state,
  className,
}: {
  state: OrderState;
  className?: string;
}) {
  const themeKey = getOrderStateThemeKey(state);
  const badgeStyle = {
    backgroundColor: `var(--order-state-${themeKey}-bg)`,
    color: `var(--order-state-${themeKey}-text)`,
    borderColor: `var(--order-state-${themeKey}-border)`,
  } as CSSProperties;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
        className,
      )}
      style={badgeStyle}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(--order-state-${themeKey}-dot)` }}
      />
      {getOrderStateLabel(state)}
    </span>
  );
}
