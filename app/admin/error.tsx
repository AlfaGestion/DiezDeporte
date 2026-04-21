"use client";

import { useEffect } from "react";
import { RetryAction } from "@/components/retry-action";
import { logClientError } from "@/lib/error-monitor-client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError({
      code: "ADMIN_PAGE_ERROR",
      scope: "admin",
      route: window.location.pathname,
      error,
    });
  }, [error]);

  return (
    <main className="admin-shell">
      <section className="admin-pane">
        <div className="admin-pane-header">
          <div>
            <span className="admin-pane-kicker">Admin</span>
            <h2>Tuvimos un inconveniente</h2>
            <p>No pudimos mostrar esta seccion del panel en este momento.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/admin" className="submit-order-button">
            Volver al panel
          </a>
          <RetryAction onRetry={reset} />
        </div>
      </section>
    </main>
  );
}
