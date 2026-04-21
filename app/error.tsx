"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/error-state";
import { RetryAction } from "@/components/retry-action";
import { SupportHint } from "@/components/support-hint";
import { logClientError } from "@/lib/error-monitor-client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError({
      code: "PUBLIC_PAGE_ERROR",
      scope: "public",
      route: window.location.pathname,
      error,
    });
  }, [error]);

  return (
    <ErrorState
      title="Tuvimos un inconveniente"
      message="No pudimos mostrar esta pagina en este momento. Proba de nuevo en unos minutos."
      primaryAction={
        <Link href="/" className="submit-order-button">
          Volver al inicio
        </Link>
      }
      secondaryAction={<RetryAction onRetry={reset} />}
      hint={
        <SupportHint text={error.digest ? `Referencia interna: ${error.digest}` : undefined} />
      }
    />
  );
}
