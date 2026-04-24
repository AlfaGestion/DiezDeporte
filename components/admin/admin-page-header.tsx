import { adminInputClass, adminPanelClass, adminPrimaryButtonClass, cn } from "@/components/admin/admin-ui";

export function AdminPageHeader({
  title,
  subtitle,
  searchDefaultValue,
  resultCount,
  searchName,
  searchPlaceholder,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  searchDefaultValue?: string | null;
  resultCount?: number;
  searchName?: string;
  searchPlaceholder?: string;
  eyebrow?: string;
}) {
  return (
    <div className={cn(adminPanelClass, "flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between")}>
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
          {eyebrow || "Operacion"}
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[color:var(--admin-title)]">
            {title}
          </h1>
          {typeof resultCount === "number" ? (
            <span className="inline-flex h-7 items-center rounded-full bg-[color:var(--admin-accent-soft)] px-3 text-xs font-semibold text-[color:var(--admin-accent-strong)]">
              {resultCount} visibles
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="max-w-2xl text-sm text-[color:var(--admin-text)]">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-[560px]">
        <div className="relative flex-1">
          <input
            type="search"
            name={searchName || "q"}
            defaultValue={searchDefaultValue || ""}
            placeholder={searchPlaceholder || "Buscar por numero, cliente o email"}
            className={cn(adminInputClass, "pr-4")}
          />
        </div>
        <button type="submit" className={cn(adminPrimaryButtonClass, "min-w-[108px]")}>
          Buscar
        </button>
      </div>
    </div>
  );
}
