"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminPrimaryButtonClass,
  adminTextAreaClass,
  cn,
} from "@/components/admin/admin-ui";
import type { StoredOrder } from "@/lib/types";

function buildDefaultPickupEmailText(order: StoredOrder) {
  return [
    `Hola ${order.nombre_cliente},`,
    "",
    `Tu pedido ${order.numero_pedido} ya esta listo para retirar.`,
    "Pasa por el local con tu codigo de retiro o abre el enlace del pedido para mostrar el QR.",
  ].join("\n");
}

export function PickupEmailComposer({
  order,
}: {
  order: StoredOrder;
}) {
  const router = useRouter();
  const defaultMessage = useMemo(() => buildDefaultPickupEmailText(order), [order]);
  const [message, setMessage] = useState(defaultMessage);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/resend-pickup-email`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
          }),
        });

        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          setFeedbackTone("error");
          setFeedback(result?.error || "No se pudo enviar el email de retiro.");
          return;
        }

        setFeedbackTone("success");
        setFeedback("Email de retiro enviado.");
        router.refresh();
      } catch (error) {
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo enviar el email de retiro.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
          Texto del email
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={cn(adminTextAreaClass, "min-h-[148px] resize-y")}
          placeholder="Escribe el texto del email de retiro"
          disabled={isPending}
        />
      </label>

      <button
        type="button"
        onClick={handleSubmit}
        className={cn(adminPrimaryButtonClass, "w-full", isPending && "cursor-wait opacity-70")}
        disabled={isPending}
      >
        {isPending ? "Enviando..." : "Enviar email de retiro"}
      </button>

      {feedback ? (
        <div
          className={cn(
            "rounded-[14px] px-4 py-3 text-sm",
            feedbackTone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
