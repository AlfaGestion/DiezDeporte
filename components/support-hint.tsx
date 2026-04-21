export function SupportHint({
  text,
  href,
  actionLabel,
}: {
  text?: string;
  href?: string | null;
  actionLabel?: string;
}) {
  if (!text && !href) {
    return null;
  }

  return (
    <div className="mt-4 text-sm leading-6 text-[color:var(--text-soft)]">
      {text ? <p>{text}</p> : null}
      {href ? (
        <a href={href} className="site-email">
          {actionLabel || "Necesito ayuda"}
        </a>
      ) : null}
    </div>
  );
}
