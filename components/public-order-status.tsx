"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/commerce";
import type { PaymentStatusResult } from "@/lib/types";

type PublicOrderStatusProps = {
  storeName: string;
  supportWhatsapp: string;
};

function resolveTitle(status: PaymentStatusResult | null) {
  if (!status) {
    return {
      title: "Estamos buscando tu pedido",
      description: "Ingresa desde el link del email para ver el estado actualizado.",
    };
  }

  if (status.orderType === "retiro" && status.orderState === "LISTO_PARA_RETIRO") {
    return {
      title: "Tu pedido esta listo para retirar",
      description: "Aqui tienes el codigo de retiro y el QR para mostrar en el local.",
    };
  }

  return {
    title: "Estado de tu pedido",
    description: "Consulta el estado mas reciente de tu compra.",
  };
}

export function PublicOrderStatus({
  storeName,
  supportWhatsapp,
}: PublicOrderStatusProps) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PaymentStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const externalReference =
    searchParams.get("externalReference") || searchParams.get("external_reference");

  useEffect(() => {
    if (!externalReference) {
      setLoading(false);
      setError("Falta el identificador del pedido.");
      return;
    }

    let active = true;

    async function loadOrder() {
      try {
        const response = await fetch(
          `/api/payments/status?externalReference=${encodeURIComponent(externalReference)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as {
          error?: string;
          status?: PaymentStatusResult;
        };

        if (!response.ok || !result.status) {
          throw new Error(result.error || "No se pudo consultar el pedido.");
        }

        if (!active) {
          return;
        }

        setStatus(result.status);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo consultar el pedido.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => {
      active = false;
    };
  }, [externalReference]);

  const heading = resolveTitle(status);

  return (
    <main className="payment-return-page">
      <section className="payment-return-card">
        <span className="payment-return-eyebrow">{storeName}</span>
        <h1>{heading.title}</h1>
        <p>{heading.description}</p>

        {loading ? <div className="message">Consultando el pedido...</div> : null}
        {error ? <div className="message error">{error}</div> : null}

        {status ? (
          <>
            <div className="payment-return-summary">
              <div className="payment-return-row">
                <span>Pedido</span>
                <strong>{status.externalReference}</strong>
              </div>
              <div className="payment-return-row">
                <span>Estado</span>
                <strong>{status.orderState || "Pendiente"}</strong>
              </div>
              <div className="payment-return-row">
                <span>Total</span>
                <strong>{formatCurrency(status.total)}</strong>
              </div>
              {status.pickupCode ? (
                <div className="payment-return-row">
                  <span>Codigo de retiro</span>
                  <strong>{status.pickupCode}</strong>
                </div>
              ) : null}
            </div>

            {status.qrCode ? (
              <div className="mt-5 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface)] p-5">
                <div className="text-center">
                  <h2 className="m-0 text-lg">QR de retiro</h2>
                  <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                    Muestralo en el local junto con tu codigo.
                  </p>
                </div>
                <div className="mt-4 flex justify-center">
                  <img
                    src={status.qrCode}
                    alt={`QR del pedido ${status.externalReference}`}
                    className="max-w-[240px] rounded-[18px] bg-white p-3"
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="payment-return-actions">
          <Link href="/" className="submit-order-button">
            Volver a la tienda
          </Link>
          <a href={supportWhatsapp} className="hero-secondary">
            Necesito ayuda
          </a>
        </div>
      </section>
    </main>
  );
}
