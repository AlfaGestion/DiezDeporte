"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  adminCardClass,
  adminInputClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import { getOrderStateLabel } from "@/lib/order-admin";
import type { OrderState } from "@/lib/types";

type PickupLookupOrder = {
  id: number;
  numero_pedido: string;
  nombre_cliente: string;
  estado: OrderState;
  retirado: "SI" | "NO";
  fecha_hora_retiro: string | null;
  nombre_apellido_retiro: string | null;
};

type PickupLookupResult = {
  pickupCode: string;
  disponible: boolean;
  order: PickupLookupOrder;
};

function buildLookupMessage(result: PickupLookupResult) {
  if (result.order.retirado === "SI") {
    return "Este codigo ya fue usado. El pedido ya figura como retirado.";
  }

  if (!result.disponible) {
    return "El pedido existe, pero todavia no esta disponible para retirar.";
  }

  return "Codigo valido. Ahora ingresa NombreApellido para registrar el retiro.";
}

export function PickupDeskPane() {
  const [codigo, setCodigo] = useState("");
  const [nombreApellido, setNombreApellido] = useState("");
  const [lookup, setLookup] = useState<PickupLookupResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | "warning">("warning");
  const [isLookingUp, startLookupTransition] = useTransition();
  const [isRedeeming, startRedeemTransition] = useTransition();

  const resetResolvedState = () => {
    setLookup(null);
    setNombreApellido("");
  };

  const handleLookup = () => {
    setFeedback(null);

    startLookupTransition(async () => {
      try {
        const response = await fetch("/api/orders/pickup/lookup", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ codigo }),
        });

        const result = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<PickupLookupResult>)
          | null;

        if (!response.ok || !result?.order || !result.pickupCode) {
          setLookup(null);
          setFeedbackTone("error");
          setFeedback(result?.error || "No se pudo validar el codigo de retiro.");
          return;
        }

        const nextLookup = {
          pickupCode: result.pickupCode,
          disponible: Boolean(result.disponible),
          order: result.order as PickupLookupOrder,
        } satisfies PickupLookupResult;

        setLookup(nextLookup);
        setCodigo(result.pickupCode);
        setFeedbackTone(nextLookup.disponible ? "success" : "warning");
        setFeedback(buildLookupMessage(nextLookup));
      } catch (error) {
        setLookup(null);
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo validar el codigo de retiro.");
      }
    });
  };

  const handleRedeem = () => {
    setFeedback(null);

    startRedeemTransition(async () => {
      try {
        const response = await fetch("/api/orders/pickup/redeem", {
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

        const result = (await response.json().catch(() => null)) as
          | {
              error?: string;
              order?: PickupLookupOrder;
            }
          | null;

        if (!response.ok || !result?.order) {
          setFeedbackTone("error");
          setFeedback(result?.error || "No se pudo registrar el retiro.");
          return;
        }

        const nextLookup = {
          pickupCode: codigo.trim(),
          disponible: false,
          order: result.order,
        } satisfies PickupLookupResult;

        setLookup(nextLookup);
        setFeedbackTone("success");
        setFeedback("Retiro registrado correctamente. Este codigo ya no puede volver a usarse.");
        setNombreApellido("");
      } catch (error) {
        setFeedbackTone("error");
        setFeedback(error instanceof Error ? error.message : "No se pudo registrar el retiro.");
      }
    });
  };

  const canLookup = !isLookingUp && !isRedeeming && codigo.trim().length > 0;
  const canRedeem =
    Boolean(lookup?.disponible) &&
    !isLookingUp &&
    !isRedeeming &&
    nombreApellido.trim().length > 0;

  return (
    <section className="space-y-4">
      <section className={cn(adminPanelClass, "space-y-5 p-5")}>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-text)]">
            Mostrador
          </div>
          <h1 className="text-lg font-semibold text-[color:var(--admin-title)]">Retiros</h1>
          <p className="text-sm text-[color:var(--admin-text)]">
            Escanea el QR o pega el codigo. Si el pedido esta disponible, podras registrar
            el retiro con NombreApellido.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={codigo}
            onChange={(event) => {
              setCodigo(event.target.value);
              resetResolvedState();
            }}
            placeholder="Escanea el QR o ingresa el codigo de retiro"
            className={adminInputClass}
            disabled={isLookingUp || isRedeeming}
          />

          <button
            type="button"
            onClick={handleLookup}
            className={cn(adminPrimaryButtonClass, "w-full md:w-auto", !canLookup && "opacity-70")}
            disabled={!canLookup}
          >
            {isLookingUp ? "Validando..." : "Validar codigo"}
          </button>
        </div>

        {lookup?.disponible ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={nombreApellido}
              onChange={(event) => setNombreApellido(event.target.value)}
              placeholder="NombreApellido de quien retira"
              className={adminInputClass}
              disabled={isLookingUp || isRedeeming}
            />

            <button
              type="button"
              onClick={handleRedeem}
              className={cn(adminPrimaryButtonClass, "w-full md:w-auto", !canRedeem && "opacity-70")}
              disabled={!canRedeem}
            >
              {isRedeeming ? "Registrando..." : "Confirmar retiro"}
            </button>
          </div>
        ) : null}

        {feedback ? (
          <div
            className={cn(
              "rounded-[14px] border px-4 py-3 text-sm",
              feedbackTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : feedbackTone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            {feedback}
          </div>
        ) : null}
      </section>

      {lookup ? (
        <section className={cn(adminCardClass, "space-y-4 p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--admin-title)]">
                Pedido {lookup.order.numero_pedido}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--admin-text)]">
                Cliente: {lookup.order.nombre_cliente}
              </p>
            </div>

            <Link
              href={`/admin/orders/${lookup.order.id}`}
              className={adminSecondaryButtonClass}
            >
              Ver detalle
            </Link>
          </div>

          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 py-3">
              <dt className="text-[color:var(--admin-text)]">Estado</dt>
              <dd className="mt-1 font-semibold text-[color:var(--admin-title)]">
                {getOrderStateLabel(lookup.order.estado)}
              </dd>
            </div>
            <div className="rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 py-3">
              <dt className="text-[color:var(--admin-text)]">Retirado</dt>
              <dd className="mt-1 font-semibold text-[color:var(--admin-title)]">
                {lookup.order.retirado}
              </dd>
            </div>
            <div className="rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 py-3">
              <dt className="text-[color:var(--admin-text)]">FechaHoraRetiro</dt>
              <dd className="mt-1 font-semibold text-[color:var(--admin-title)]">
                {formatAdminDateTime(lookup.order.fecha_hora_retiro)}
              </dd>
            </div>
            <div className="rounded-[14px] border border-[color:var(--admin-pane-line)] px-4 py-3">
              <dt className="text-[color:var(--admin-text)]">NombreApellido</dt>
              <dd className="mt-1 font-semibold text-[color:var(--admin-title)]">
                {lookup.order.nombre_apellido_retiro || "-"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
