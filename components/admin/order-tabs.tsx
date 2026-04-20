import Link from "next/link";
import type { AdminOrderBucket } from "@/lib/types";
import { adminPanelClass, cn } from "@/components/admin/admin-ui";

type OrderTab = {
  value: AdminOrderBucket;
  label: string;
  count: number;
  href: string;
};

export function OrderTabs({
  tabs,
  activeValue,
}: {
  tabs: OrderTab[];
  activeValue: AdminOrderBucket;
}) {
  return (
    <div className={cn(adminPanelClass, "overflow-x-auto px-2 py-2")}>
      <nav className="flex min-w-max gap-2" aria-label="Vistas de pedidos">
        {tabs.map((tab) => {
          const active = tab.value === activeValue;

          return (
            <Link
              key={tab.value}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-3 rounded-[14px] px-4 py-2.5 text-sm transition",
                active
                  ? "bg-[color:var(--admin-accent)] text-white shadow-[0_10px_24px_rgba(13,109,216,0.18)]"
                  : "text-[color:var(--admin-title)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              )}
            >
              <span className="font-medium">{tab.label}</span>
              <span
                className={cn(
                  "inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                  active
                    ? "bg-white/16 text-white"
                    : "bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent-strong)]",
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
