"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminQrCameraScanner } from "@/components/admin/admin-qr-camera-scanner";
import {
  adminCardClass,
  adminInputClass,
  adminPrimaryButtonClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import { PickupStatusBadge } from "@/components/admin/pickup-status-badge";
import type { StoredOrder } from "@/lib/types";

export function PickupRedeemPanel({
  order,
}: {
  order: StoredOrder;
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();
  const isLocked = order.retirado === "SI";
  const canSubmit =
    !isLocked && !isPending && codigo.trim().length > 0 && nombreApellido.trim().length > 0;

  const handleSubmit = () => {
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/registrar-retiro`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            codigo,
            nombreApellido,
          }),
        });

        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          setFeedbackTone("error");
          setFeedback(result?.error || "No se pudo registrar el retiro.");
          return;
        }

        setFeedbackTone("success");
        setFeedback("Retiro registrado correctamente. Este codigo ya no puede volver a usarse.");
        setCodigo("");
        setNombreApellido("");
        router.refresh();
      } catch (error) {
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo registrar el retiro.");
      }
    });
  };

  return (
    <section className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Retiro en local</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          {isLocked
            ? "El retiro ya fue registrado. Solo se muestra la informacion final."
            : "Escanea el QR o pega el codigo de retiro para validarlo una sola vez."}
        </p>
      </div>

      {!isLocked ? (
        <div className="space-y-3">
          <input
            value={nombreApellido}
            onChange={(event) => setNombreApellido(event.target.value)}
            placeholder="NombreApellido de quien retira"
            className={adminInputClass}
            disabled={isPending}
          />

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <input
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
              placeholder="Escanea el QR o ingresa el codigo"
              className={adminInputClass}
              disabled={isPending}
            />
            <AdminQrCameraScanner
              onDetected={(value) => {
                setCodigo(value);
                setFeedback(null);
              }}
              disabled={isPending}
              buttonLabel="Leer QR con camara"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            className={cn(adminPrimaryButtonClass, "w-full", isPending && "cursor-wait opacity-70")}
            disabled={!canSubmit}
          >
            {isPending ? "Registrando..." : "Registrar retiro"}
          </button>
        </div>
      ) : (
        <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Retirado por
          </div>
          <div className="mt-2 text-base font-semibold text-[color:var(--admin-title)]">
            {order.nombre_apellido_retiro || "Sin registrar"}
          </div>
          <div className="mt-2 text-sm text-[color:var(--admin-text)]">
            {order.fecha_hora_retiro
              ? `Retiro registrado el ${formatAdminDateTime(order.fecha_hora_retiro)}.`
              : "Retiro registrado."}
          </div>
        </div>
      )}

      <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[color:var(--admin-text)]">Estado de retiro</span>
          <PickupStatusBadge redeemed={order.retirado === "SI"} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[color:var(--admin-text)]">Fecha de retiro</span>
          <strong className="text-[color:var(--admin-title)]">
            {order.retirado === "SI"
              ? formatAdminDateTime(order.fecha_hora_retiro)
              : "Todavia no retirado"}
          </strong>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[color:var(--admin-text)]">Retirado por</span>
          <strong className="text-right text-[color:var(--admin-title)]">
            {order.nombre_apellido_retiro || "Sin registrar"}
          </strong>
        </div>
      </div>

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
    </section>
  );
}
