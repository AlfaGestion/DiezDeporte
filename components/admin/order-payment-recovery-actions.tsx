"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";

export function OrderPaymentRecoveryActions({
  orderId,
  allowPickupLocalFallback,
}: {
  orderId: number;
  allowPickupLocalFallback: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (action: "retry" | "pickup-local") => {
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          action === "retry"
            ? `/api/orders/${orderId}/retry-payment`
            : `/api/orders/${orderId}/pickup-local-payment`,
          {
            method: "POST",
            credentials: "same-origin",
          },
        );
        const result = (await response.json().catch(() => null)) as
          | {
              error?: string;
              preference?: { checkoutUrl?: string | null };
            }
          | null;

        if (!response.ok) {
          setFeedback(
            result?.error ||
              (action === "retry"
                ? "No se pudo reintentar el pago."
                : "No se pudo activar retiro y pago local."),
          );
          return;
        }

        if (action === "retry" && result?.preference?.checkoutUrl) {
          const openedWindow = window.open(
            result.preference.checkoutUrl,
            "_blank",
            "noopener,noreferrer",
          );

          if (!openedWindow) {
            window.location.assign(result.preference.checkoutUrl);
          }
        }

        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : action === "retry"
              ? "No se pudo reintentar el pago."
              : "No se pudo activar retiro y pago local.",
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={cn(adminSecondaryButtonClass, "w-full", isPending && "cursor-wait opacity-70")}
        onClick={() => runAction("retry")}
        disabled={isPending}
      >
        {isPending ? "Procesando..." : "Reintentar pago"}
      </button>

      {allowPickupLocalFallback ? (
        <button
          type="button"
          className={cn(adminPrimaryButtonClass, "w-full", isPending && "cursor-wait opacity-70")}
          onClick={() => runAction("pickup-local")}
          disabled={isPending}
        >
          {isPending ? "Procesando..." : "Pasar a retiro y pago local"}
        </button>
      ) : null}

      {feedback ? (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
