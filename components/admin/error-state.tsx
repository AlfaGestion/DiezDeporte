import type { ReactNode } from "react";
import { adminPanelClass, cn } from "@/components/admin/admin-ui";

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn(adminPanelClass, "border-rose-200/80 px-6 py-8 dark:border-rose-400/20")}>
      <div className="flex flex-col gap-3 text-left">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
          !
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[color:var(--admin-title)]">{title}</h3>
          <p className="max-w-xl text-sm text-[color:var(--admin-text)]">{message}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
