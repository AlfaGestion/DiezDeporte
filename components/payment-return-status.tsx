"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/commerce";
import type { PaymentStatusResult } from "@/lib/types";

const LOCAL_STORAGE_CART_KEY = "diezdeportes-cart";

type PaymentReturnStatusProps = {
  storeName: string;
};

function shouldPoll(status: PaymentStatusResult | null) {
  if (!status) return false;

  return (
    status.status === "pending" ||
    status.status === "processing" ||
    (status.status === "approved" && !status.order)
  );
}

function resolveHeadline(status: PaymentStatusResult | null) {
  if (!status) {
    return {
      title: "Estamos verificando tu pago",
      description: "Consultando el estado mas reciente de Mercado Pago.",
    };
  }

  if (status.status === "finalized" && status.order) {
    return {
      title: "Pago aprobado",
      description: "El pedido ya quedo registrado en el sistema.",
    };
  }

  if (status.status === "approved") {
    return {
      title: "Pago aprobado",
      description: "Estamos terminando de cargar el pedido en el backend.",
    };
  }

  if (status.status === "rejected") {
    return {
      title: "Pago rechazado",
      description: "Mercado Pago informo que la operacion no fue aprobada.",
    };
  }

  if (status.status === "cancelled") {
    return {
      title: "Pago cancelado",
      description: "La compra no se completo y el pedido sigue sin confirmar.",
    };
  }

  if (status.status === "error") {
    return {
      title: "Pago recibido con revision pendiente",
      description:
        "La pasarela respondio, pero la carga final del pedido requiere revision manual.",
    };
  }

  if (status.status === "processing") {
    return {
      title: "Procesando pedido",
      description: "El pago ya ingreso y estamos terminando la registracion.",
    };
  }

  return {
    title: "Pago pendiente",
    description: "Mercado Pago todavia no confirmo la operacion.",
  };
}

export function PaymentReturnStatus({
  storeName,
}: PaymentReturnStatusProps) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PaymentStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orderId = searchParams.get("orderId");
  const paymentId =
    searchParams.get("payment_id") || searchParams.get("collection_id");
  const preferenceId = searchParams.get("preference_id");
  const externalReference =
    searchParams.get("external_reference") || searchParams.get("externalReference");

  useEffect(() => {
    if (!orderId && !paymentId && !preferenceId && !externalReference) {
      setStatus(null);
      setLoading(false);
      setError("No llegaron identificadores de pago en el retorno.");
      return;
    }

    let active = true;
    let firstLoad = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchStatus() {
      if (!active) return;

      if (firstLoad) {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (orderId) params.set("orderId", orderId);
      if (paymentId) params.set("paymentId", paymentId);
      if (preferenceId) params.set("preferenceId", preferenceId);
      if (externalReference) {
        params.set("externalReference", externalReference);
      }

      try {
        const response = await fetch(`/api/payments/status?${params.toString()}`, {
          cache: "no-store",
        });

        const result = (await response.json()) as {
          error?: string;
          status?: PaymentStatusResult;
        };

        if (!response.ok || !result.status) {
          throw new Error(result.error || "No se pudo consultar el estado.");
        }

        if (!active) return;

        setStatus(result.status);
        setError(null);

        if (shouldPoll(result.status)) {
          timeoutId = setTimeout(fetchStatus, 2500);
        }
      } catch (fetchError) {
        if (!active) return;

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo consultar el estado del pago.",
        );
      } finally {
        firstLoad = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    fetchStatus();

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [orderId, paymentId, preferenceId, externalReference]);

  useEffect(() => {
    if (status?.status !== "finalized" || !status.order) {
      return;
    }

    window.localStorage.removeItem(LOCAL_STORAGE_CART_KEY);
  }, [status]);

  const headline = resolveHeadline(status);

  return (
    <main className="payment-return-page">
      <section className="payment-return-card">
        <span className="payment-return-eyebrow">{storeName}</span>
        <h1>{headline.title}</h1>
        <p>{headline.description}</p>

        {loading && !status ? (
          <div className="message">Consultando informacion del pago...</div>
        ) : null}

        {error ? <div className="message error">{error}</div> : null}

        {status ? (
          <div className="payment-return-summary">
            <div className="payment-return-row">
              <span>Estado Mercado Pago</span>
              <strong>{status.paymentStatus || "pending"}</strong>
            </div>
            <div className="payment-return-row">
              <span>Total</span>
              <strong>{formatCurrency(status.total)}</strong>
            </div>
            <div className="payment-return-row">
              <span>Unidades</span>
              <strong>{status.itemCount}</strong>
            </div>
            {status.paymentId ? (
              <div className="payment-return-row">
                <span>Pago MP</span>
                <strong>{status.paymentId}</strong>
              </div>
            ) : null}
            {status.preferenceId ? (
              <div className="payment-return-row">
                <span>Preferencia</span>
                <strong>{status.preferenceId}</strong>
              </div>
            ) : null}
            {status.order ? (
              <div className="payment-return-row">
                <span>Comprobante</span>
                <strong>
                  {status.order.tc} {status.order.idComprobante}
                </strong>
              </div>
            ) : null}
          </div>
        ) : null}

        {status?.finalizationError ? (
          <div className="payment-return-note">
            {status.finalizationError}
          </div>
        ) : null}

        <div className="payment-return-actions">
          <Link href="/" className="submit-order-button">
            Volver a la tienda
          </Link>
        </div>
      </section>
    </main>
  );
}
