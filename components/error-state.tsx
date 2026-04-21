import Link from "next/link";
import type { ReactNode } from "react";

export function ErrorState({
  title,
  message,
  primaryAction,
  secondaryAction,
  hint,
}: {
  title: string;
  message: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <main className="payment-return-page">
      <section className="payment-return-card">
        <span className="payment-return-eyebrow">Atencion</span>
        <h1>{title}</h1>
        <p>{message}</p>

        <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface-soft)] text-2xl font-semibold text-[color:var(--text)]">
          !
        </div>

        <div className="payment-return-actions">
          {primaryAction || (
            <Link href="/" className="submit-order-button">
              Volver al inicio
            </Link>
          )}
          {secondaryAction}
        </div>

        {hint}
      </section>
    </main>
  );
}
