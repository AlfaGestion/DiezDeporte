export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatAdminDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sin dato";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin dato";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export const adminPanelClass = cn(
  "rounded-[22px] border border-[color:var(--admin-pane-line)]",
  "bg-[color:var(--admin-pane-bg)] shadow-[0_18px_42px_rgba(15,23,42,0.06)]",
  "dark:shadow-[0_18px_42px_rgba(0,0,0,0.24)]",
);

export const adminCardClass = cn(
  "rounded-[18px] border border-[color:var(--admin-card-line)]",
  "bg-[color:var(--admin-card-bg)]",
);

export const adminInputClass = cn(
  "h-11 w-full rounded-[14px] border border-[color:var(--admin-input-line)]",
  "bg-[color:var(--admin-input-bg)] px-3 text-[14px] text-[color:var(--admin-title)]",
  "outline-none transition placeholder:text-[color:var(--admin-text)]",
  "focus:border-[color:var(--admin-accent)] focus:ring-4 focus:ring-[color:var(--admin-accent-soft)]",
);

export const adminPrimaryButtonClass = cn(
  "inline-flex h-10 items-center justify-center rounded-[14px] px-4",
  "bg-[color:var(--admin-accent)] text-sm font-semibold text-white",
  "shadow-[0_10px_22px_rgba(13,109,216,0.18)] transition hover:-translate-y-px",
  "hover:bg-[color:var(--admin-accent-strong)]",
  "focus:outline-none focus:ring-4 focus:ring-[color:var(--admin-accent-soft)]",
);

export const adminSecondaryButtonClass = cn(
  "inline-flex h-10 items-center justify-center rounded-[14px] px-4 text-sm font-medium",
  "border border-[color:var(--admin-pane-line)] bg-white/70 text-[color:var(--admin-title)] transition",
  "hover:-translate-y-px hover:bg-white dark:bg-white/5 dark:hover:bg-white/10",
);

export const adminDangerButtonClass = cn(
  "inline-flex h-10 items-center justify-center rounded-[14px] px-4 text-sm font-medium",
  "border border-rose-200 bg-rose-50 text-rose-700 transition hover:-translate-y-px hover:bg-rose-100",
  "dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/15",
);
