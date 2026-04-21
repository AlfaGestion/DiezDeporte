"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logClientError } from "@/lib/error-monitor-client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError({
      code: "GLOBAL_APP_ERROR",
      scope: "global",
      route: typeof window !== "undefined" ? window.location.pathname : "/",
      error,
    });
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="payment-return-page">
          <section className="payment-return-card">
            <span className="payment-return-eyebrow">Sistema</span>
            <h1>Tuvimos un inconveniente</h1>
            <p>No pudimos completar esta accion en este momento. Proba de nuevo en unos minutos.</p>
            <div className="payment-return-actions">
              <Link href="/" className="submit-order-button">
                Volver al inicio
              </Link>
              <button type="button" className="hero-secondary" onClick={() => reset()}>
                Reintentar
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
