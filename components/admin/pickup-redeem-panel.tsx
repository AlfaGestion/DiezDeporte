"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AdminQrCameraScanner } from "@/components/admin/admin-qr-camera-scanner";
import {
  adminCardClass,
  adminInputClass,
  adminPrimaryButtonClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import { PickupStatusBadge } from "@/components/admin/pickup-status-badge";
import { isPickupLocalPaymentOrder } from "@/lib/models/order";
import type { PaymentCollectionAccount, StoredOrder } from "@/lib/types";

export function PickupRedeemPanel({
  order,
  requirePickupFullName,
  requirePickupDni,
  allowManualFinalize,
}: {
  order: StoredOrder;
  requirePickupFullName: boolean;
  requirePickupDni: boolean;
  allowManualFinalize: boolean;
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [observacion, setObservacion] = useState("");
  const [paymentAccountCode, setPaymentAccountCode] = useState("");
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentCollectionAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [isPending, startTransition] = useTransition();
  const isLocked = order.retirado === "SI";
  const isLocalPickupPayment = isPickupLocalPaymentOrder(order);
  const requiresLocalPaymentAccount =
    isLocalPickupPayment && order.estado_pago !== "aprobado";
  const canSubmit =
    !isLocked &&
    !isPending &&
    codigo.trim().length > 0 &&
    (!requirePickupFullName || (nombre.trim().length > 0 && apellido.trim().length > 0)) &&
    (requirePickupFullName || nombre.trim().length > 0 || apellido.trim().length > 0) &&
    (!requirePickupDni || dni.trim().length > 0) &&
    (!requiresLocalPaymentAccount || paymentAccountCode.trim().length > 0);

  useEffect(() => {
    if (!requiresLocalPaymentAccount || isLocked) {
      return;
    }

    let cancelled = false;
    setAccountsLoading(true);
    setAccountsError(null);

    fetch("/api/admin/payment-accounts", {
      credentials: "same-origin",
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | { accounts?: PaymentCollectionAccount[]; error?: string }
          | null;

        if (!response.ok || !result?.accounts) {
          throw new Error(result?.error || "No se pudieron cargar los metodos de pago.");
        }

        if (cancelled) {
          return;
        }

        const accounts = result.accounts;
        setPaymentAccounts(accounts);
        setPaymentAccountCode((current) => current || accounts[0]?.code || "");
      })
      .catch((error) => {
        if (!cancelled) {
          setAccountsError(
            error instanceof Error ? error.message : "No se pudieron cargar los metodos de pago.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLocked, requiresLocalPaymentAccount]);

  const handleManualFinalize = () => {
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/estado`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            estado: "ENTREGADO",
          }),
        });

        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          setFeedbackTone("error");
          setFeedback(result?.error || "No se pudo finalizar el retiro.");
          return;
        }

        setFeedbackTone("success");
        setFeedback("Pedido marcado como entregado.");
        router.refresh();
      } catch (error) {
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo finalizar el retiro.");
      }
    });
  };

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
            nombre,
            apellido,
            dni,
            observacion,
            paymentAccountCode: paymentAccountCode || null,
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
        setNombre("");
        setApellido("");
        setDni("");
        setObservacion("");
        setPaymentAccountCode("");
        router.refresh();
      } catch (error) {
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo registrar el retiro.");
      }
    });
  };

  return (
    <section id="pickup-panel" className={cn(adminCardClass, "space-y-4 p-5")}>
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">Retiro en local</h2>
        <p className="mt-1 text-sm text-[color:var(--admin-text)]">
          {isLocked
            ? "El retiro ya fue registrado. Solo se muestra la informacion final."
            : "Escanea el QR o pega el codigo de retiro para validarlo una sola vez."}
        </p>
        {!isLocked && isLocalPickupPayment ? (
          <p className="mt-2 text-sm text-[color:var(--admin-text)]">
            Al registrar el retiro tambien dejamos informado el pago realizado en el local.
          </p>
        ) : null}
        {!isLocked && requiresLocalPaymentAccount ? (
          <p className="mt-2 text-xs text-[color:var(--admin-text)]">
            Para cerrar este retiro hace falta elegir el metodo de pago.
          </p>
        ) : null}
      </div>

      {!isLocked ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder={requirePickupFullName ? "Nombre de quien retira" : "Nombre"}
              className={adminInputClass}
              disabled={isPending}
            />
            <input
              value={apellido}
              onChange={(event) => setApellido(event.target.value)}
              placeholder={requirePickupFullName ? "Apellido de quien retira" : "Apellido"}
              className={adminInputClass}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={dni}
              onChange={(event) => setDni(event.target.value)}
              placeholder={requirePickupDni ? "DNI obligatorio" : "DNI"}
              className={adminInputClass}
              disabled={isPending}
            />
            <input
              value={observacion}
              onChange={(event) => setObservacion(event.target.value)}
              placeholder="Observacion opcional"
              className={adminInputClass}
              disabled={isPending}
            />
          </div>

          {requiresLocalPaymentAccount ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[color:var(--admin-title)]">
                Metodo de pago
              </label>
              <select
                value={paymentAccountCode}
                onChange={(event) => setPaymentAccountCode(event.target.value)}
                className={adminInputClass}
                disabled={isPending || accountsLoading}
              >
                <option value="">
                  {accountsLoading ? "Cargando metodos..." : "Selecciona un metodo de pago"}
                </option>
                {paymentAccounts.map((account) => (
                  <option key={account.code} value={account.code}>
                    {account.label}
                  </option>
                ))}
              </select>
              {accountsError ? (
                <p className="text-sm text-rose-700 dark:text-rose-300">{accountsError}</p>
              ) : (
                <p className="text-xs text-[color:var(--admin-text)]">
                  Este dato se guarda junto con el pago informado al momento del retiro.
                </p>
              )}
            </div>
          ) : null}

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

          {allowManualFinalize && !requiresLocalPaymentAccount ? (
            <button
              type="button"
              onClick={handleManualFinalize}
              className={cn("w-full", adminPrimaryButtonClass)}
              disabled={isPending}
            >
              {isPending ? "Actualizando..." : "Finalizar sin datos de retiro"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--admin-text)]">
            Retirado por
          </div>
          <div className="mt-2 text-base font-semibold text-[color:var(--admin-title)]">
            {order.nombre_apellido_retiro || "Sin registrar"}
          </div>
          {order.dni_retiro ? (
            <div className="mt-2 text-sm text-[color:var(--admin-text)]">
              DNI: {order.dni_retiro}
            </div>
          ) : null}
          {order.observacion_retiro ? (
            <div className="mt-2 text-sm text-[color:var(--admin-text)]">
              Obs.: {order.observacion_retiro}
            </div>
          ) : null}
          {order.metadata.pickupPaymentAccountLabel ? (
            <div className="mt-2 text-sm text-[color:var(--admin-text)]">
              Cobrado en: {order.metadata.pickupPaymentAccountLabel}
            </div>
          ) : null}
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
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[color:var(--admin-text)]">DNI</span>
          <strong className="text-right text-[color:var(--admin-title)]">
            {order.dni_retiro || "Sin registrar"}
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
