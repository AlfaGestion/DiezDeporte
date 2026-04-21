"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AdminQrCameraScanner } from "@/components/admin/admin-qr-camera-scanner";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import {
  adminCardClass,
  adminInputClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  cn,
  formatAdminDateTime,
} from "@/components/admin/admin-ui";
import type { OrderState } from "@/lib/types";

type PickupLookupOrder = {
  id: number;
  numero_pedido: string;
  nombre_cliente: string;
  email_cliente?: string | null;
  dni_cliente?: string | null;
  estado: OrderState;
  fecha_entrada_estado?: string | null;
  retirado: "SI" | "NO";
  fecha_creacion: string | null;
  fecha_hora_retiro: string | null;
  nombre_apellido_retiro: string | null;
  nombre_retiro?: string | null;
  apellido_retiro?: string | null;
  dni_retiro?: string | null;
  observacion_retiro?: string | null;
};

type PickupLookupItem = {
  articleId: string;
  description: string;
  quantity: number;
  total: number;
};

type PickupLookupResult = {
  pickupCode: string;
  disponible: boolean;
  order: PickupLookupOrder;
  items: PickupLookupItem[];
};

function buildLookupMessage(result: PickupLookupResult) {
  if (result.order.retirado === "SI") {
    return "Este codigo ya fue usado. El pedido ya figura como retirado.";
  }

  if (!result.disponible) {
    return "El pedido existe, pero todavia no esta disponible para retirar.";
  }

  return "Codigo valido. Completa los datos de quien retira para confirmar la entrega.";
}

export function PickupDeskPane({
  requirePickupFullName,
  requirePickupDni,
}: {
  requirePickupFullName: boolean;
  requirePickupDni: boolean;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [observacion, setObservacion] = useState("");
  const [lookup, setLookup] = useState<PickupLookupResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | "warning">("warning");
  const [isLookingUp, startLookupTransition] = useTransition();
  const [isRedeeming, startRedeemTransition] = useTransition();

  const resetResolvedState = () => {
    setLookup(null);
    setNombre("");
    setApellido("");
    setDni("");
    setObservacion("");
  };

  const runLookup = (pickupCode: string) => {
    setFeedback(null);

    startLookupTransition(async () => {
      try {
        const response = await fetch("/api/orders/pickup/lookup", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ codigo: pickupCode }),
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
          items: Array.isArray(result.items) ? (result.items as PickupLookupItem[]) : [],
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

  const handleLookup = () => {
    runLookup(codigo);
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
            nombre,
            apellido,
            dni,
            observacion,
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

        setLookup((currentLookup) =>
          currentLookup
            ? {
                ...currentLookup,
                disponible: false,
                order: {
                  ...currentLookup.order,
                  ...result.order,
                },
              }
            : {
                pickupCode: codigo.trim(),
                disponible: false,
                order: {
                  ...(result.order as PickupLookupOrder),
                  fecha_creacion: null,
                },
                items: [],
              },
        );
        setFeedbackTone("success");
        setFeedback("Retiro registrado correctamente. Este codigo ya no puede volver a usarse.");
        setNombre("");
        setApellido("");
        setDni("");
        setObservacion("");
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
    (!requirePickupFullName ||
      (nombre.trim().length > 0 && apellido.trim().length > 0)) &&
    (requirePickupFullName || nombre.trim().length > 0 || apellido.trim().length > 0) &&
    (!requirePickupDni || dni.trim().length > 0);

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
            el retiro con datos del retirante.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
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

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleLookup}
              className={cn(adminPrimaryButtonClass, "w-full", !canLookup && "opacity-70")}
              disabled={!canLookup}
            >
              {isLookingUp ? "Validando..." : "Validar codigo"}
            </button>
            <AdminQrCameraScanner
              onDetected={(value) => {
                setCodigo(value);
                resetResolvedState();
                runLookup(value);
              }}
              disabled={isLookingUp || isRedeeming}
              buttonLabel="Leer QR con camara"
            />
          </div>
        </div>

        {lookup?.disponible ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder={requirePickupFullName ? "Nombre de quien retira" : "Nombre"}
                className={adminInputClass}
                disabled={isLookingUp || isRedeeming}
              />
              <input
                value={apellido}
                onChange={(event) => setApellido(event.target.value)}
                placeholder={requirePickupFullName ? "Apellido de quien retira" : "Apellido"}
                className={adminInputClass}
                disabled={isLookingUp || isRedeeming}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={dni}
                onChange={(event) => setDni(event.target.value)}
                placeholder={requirePickupDni ? "DNI obligatorio" : "DNI"}
                className={adminInputClass}
                disabled={isLookingUp || isRedeeming}
              />
              <input
                value={observacion}
                onChange={(event) => setObservacion(event.target.value)}
                placeholder="Observacion opcional"
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
            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                  Pedido
                </div>
                <div className="mt-2 text-lg font-semibold text-[color:var(--admin-title)]">
                  {lookup.order.numero_pedido}
                </div>
              </div>

              <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                  Fecha de creacion
                </div>
                <div className="mt-2 text-base font-semibold text-[color:var(--admin-title)]">
                  {formatAdminDateTime(lookup.order.fecha_creacion)}
                </div>
              </div>

              <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                  Cliente
                </div>
                <div className="mt-2 text-base font-semibold text-[color:var(--admin-title)]">
                  {lookup.order.nombre_cliente}
                </div>
              </div>

              <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                  Datos del cliente
                </div>
                <div className="mt-2 space-y-1 text-sm text-[color:var(--admin-title)]">
                  <div>{lookup.order.email_cliente || "Sin email"}</div>
                  <div>DNI: {lookup.order.dni_cliente || "Sin registrar"}</div>
                </div>
              </div>
            </div>

            <Link
              href={`/admin/orders/${lookup.order.id}`}
              className={adminSecondaryButtonClass}
            >
              Ver detalle
            </Link>
          </div>

          <div className="flex flex-col gap-3 rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Estado actual
              </div>
              <div className="mt-2">
                <OrderStatusBadge state={lookup.order.estado} />
              </div>
            </div>

            <div className="md:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Entro a este estado
              </div>
              <div className="mt-2 text-sm font-semibold text-[color:var(--admin-title)]">
                {formatAdminDateTime(lookup.order.fecha_entrada_estado)}
              </div>
            </div>
          </div>

          {lookup.order.retirado === "SI" ? (
            <section className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
                Informe de retiro
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-[color:var(--admin-text)]">Nombre</div>
                  <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                    {lookup.order.nombre_apellido_retiro || "Sin registrar"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[color:var(--admin-text)]">DNI</div>
                  <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                    {lookup.order.dni_retiro || "Sin registrar"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[color:var(--admin-text)]">Fecha</div>
                  <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                    {formatAdminDateTime(lookup.order.fecha_hora_retiro)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[color:var(--admin-text)]">Observacion</div>
                  <div className="mt-1 font-semibold text-[color:var(--admin-title)]">
                    {lookup.order.observacion_retiro || "Sin observaciones"}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="rounded-[16px] border border-[color:var(--admin-pane-line)] bg-[color:var(--admin-pane-bg)] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--admin-text)]">
              Detalle del pedido
            </div>
            {lookup.items.length > 0 ? (
              <div className="mt-4 space-y-3">
                {lookup.items.map((item, index) => (
                  <div
                    key={`${item.articleId}-${index}`}
                    className="flex items-start justify-between gap-3 border-t border-[color:var(--admin-pane-line)] pt-3 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <div className="font-semibold text-[color:var(--admin-title)]">
                        {item.description || item.articleId}
                      </div>
                      <div className="text-xs text-[color:var(--admin-text)]">
                        {item.articleId}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-[color:var(--admin-title)]">
                      x{item.quantity}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-[color:var(--admin-text)]">
                No se encontraron articulos para este retiro.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
