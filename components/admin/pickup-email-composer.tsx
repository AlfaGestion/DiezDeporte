"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminPrimaryButtonClass,
  adminTextAreaClass,
  cn,
} from "@/components/admin/admin-ui";
import type { StoredOrder } from "@/lib/types";

function buildDefaultPickupEmailText(order: StoredOrder, pickupSchedule?: string | null) {
  return [
    `Hola ${order.nombre_cliente},`,
    "",
    `Tu pedido ${order.numero_pedido} ya esta listo para retirar.`,
    pickupSchedule
      ? `Puedes pasar en estos dias y horarios:\n${pickupSchedule}`
      : "Pasa por el local con tu codigo de retiro.",
    "",
    "Debajo agregamos automaticamente el codigo de retiro, el link al pedido y el QR.",
  ].join("\n");
}

export function PickupEmailComposer({
  order,
  pickupSchedule,
}: {
  order: StoredOrder;
  pickupSchedule?: string | null;
}) {
  const router = useRouter();
  const defaultMessage = useMemo(
    () => buildDefaultPickupEmailText(order, pickupSchedule),
    [order, pickupSchedule],
  );
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

      <div className="rounded-[14px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-card-bg)] px-4 py-3 text-sm text-[color:var(--admin-text)]">
        El sistema agrega automaticamente abajo el horario de retiro configurado, el codigo y el link al pedido con QR.
      </div>

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
