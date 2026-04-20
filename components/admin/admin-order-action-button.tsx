"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/components/admin/admin-ui";
import type { OrderState } from "@/lib/types/order";

type ActionResult = {
  ok: boolean;
  saved?: string;
  error?: string;
};

type AdminOrderActionButtonProps = {
  action: "advance" | "refresh" | "update-state" | "approve-payment" | "resend-pickup-email";
  orderId: number;
  nextState?: OrderState | null;
  returnTo: string;
  className?: string;
  label: string;
  pendingLabel?: string;
};

function buildReturnUrl(
  returnTo: string,
  params: { saved?: string | null; error?: string | null },
) {
  const url = new URL(returnTo, window.location.origin);

  if (params.saved) {
    url.searchParams.set("saved", params.saved);
  } else {
    url.searchParams.delete("saved");
  }

  if (params.error) {
    url.searchParams.set("error", params.error);
  } else {
    url.searchParams.delete("error");
  }

  return `${url.pathname}${url.search}`;
}

async function runOrderAction(input: {
  action: AdminOrderActionButtonProps["action"];
  orderId: number;
  nextState?: OrderState | null;
}) {
  if (input.action === "refresh") {
    const response = await fetch(`/api/payments/status?orderId=${input.orderId}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: "order-refresh" };
    }

    return { ok: true, saved: "refresh" };
  }

  if (input.action === "update-state") {
    const response = await fetch(`/api/orders/${input.orderId}/estado`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        estado: input.nextState || null,
      }),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        error:
          response.status === 404
            ? "order-not-found"
            : result?.error
              ? "order-update"
              : "order-update",
      };
    }

    return { ok: true, saved: "state-updated" };
  }

  if (input.action === "approve-payment") {
    const response = await fetch(`/api/orders/${input.orderId}/payment-status`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        estado_pago: "aprobado",
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 404 ? "order-not-found" : "order-payment-update",
      };
    }

    return { ok: true, saved: "payment-updated" };
  }

  if (input.action === "resend-pickup-email") {
    const response = await fetch(`/api/orders/${input.orderId}/resend-pickup-email`, {
      method: "POST",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 404 ? "order-not-found" : "pickup-email-resend",
      };
    }

    return { ok: true, saved: "pickup-email-resent" };
  }

  const response = await fetch(`/api/orders/${input.orderId}/advance`, {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      error:
        response.status === 404
          ? "order-not-found"
          : result?.error
            ? "order-advance"
            : "order-advance",
    };
  }

  return { ok: true, saved: "advance" };
}

export function AdminOrderActionButton({
  action,
  orderId,
  nextState,
  returnTo,
  className,
  label,
  pendingLabel,
}: AdminOrderActionButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleClick = () => {
    setLocalError(null);

    startTransition(async () => {
      try {
        const result = await runOrderAction({
          action,
          orderId,
          nextState,
        });

        const nextUrl = buildReturnUrl(returnTo, {
          saved: result.ok ? result.saved || null : null,
          error: result.ok ? null : result.error || null,
        });

        router.replace(nextUrl, { scroll: false });
        router.refresh();

        if (!result.ok && !result.error) {
          setLocalError("No se pudo completar la accion.");
        }
      } catch (error) {
        const nextUrl = buildReturnUrl(returnTo, {
          saved: null,
          error:
            action === "refresh"
              ? "order-refresh"
              : action === "approve-payment"
                ? "order-payment-update"
              : action === "resend-pickup-email"
                ? "pickup-email-resend"
              : action === "advance"
                ? "order-advance"
                : "order-update",
        });

        router.replace(nextUrl, { scroll: false });
        router.refresh();
        setLocalError(error instanceof Error ? error.message : "No se pudo completar la accion.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className={cn(className, isPending && "cursor-wait opacity-70")}
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? pendingLabel || "Procesando..." : label}
      </button>
      {localError ? <div className="text-xs text-rose-600">{localError}</div> : null}
    </>
  );
}
