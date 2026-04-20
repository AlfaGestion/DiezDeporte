import type { ReactNode } from "react";
import { adminPanelClass, cn } from "@/components/admin/admin-ui";

export function EmptyState({
  title,
  message,
  action,
  compact = false,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        adminPanelClass,
        "flex flex-col items-start gap-3 text-left",
        compact ? "px-5 py-6" : "px-6 py-8",
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent-strong)]">
        ·
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[color:var(--admin-title)]">{title}</h3>
        <p className="max-w-xl text-sm text-[color:var(--admin-text)]">{message}</p>
      </div>
      {action}
    </div>
  );
}
