import Link from "next/link";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { formatCurrency } from "@/lib/commerce";
import type { PaymentStatusResult } from "@/lib/types";

type PublicOrderStatusProps = {
  storeName: string;
  supportWhatsapp: string;
  status: PaymentStatusResult | null;
  error?: string | null;
};

function resolveTitle(status: PaymentStatusResult | null, error?: string | null) {
  if (error) {
    return {
      title: "No pudimos cargar tu pedido",
      description: error,
    };
  }

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
  status,
  error = null,
}: PublicOrderStatusProps) {
  const heading = resolveTitle(status, error);

  return (
    <main className="payment-return-page">
      <section className="payment-return-card">
        <div className="payment-return-topbar">
          <span className="payment-return-eyebrow">{storeName}</span>
          <PublicThemeToggle />
        </div>
        <h1>{heading.title}</h1>
        <p>{heading.description}</p>

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
                <div
                  className="mt-4 flex justify-center rounded-[18px] border border-[color:var(--line)] px-4 py-5"
                  style={{
                    background:
                      "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--surface) 92%), color-mix(in srgb, var(--surface-soft) 78%, var(--surface) 22%))",
                  }}
                >
                  <img
                    src={status.qrCode}
                    alt={`QR del pedido ${status.externalReference}`}
                    className="max-w-[240px] drop-shadow-[0_16px_26px_rgba(15,23,42,0.12)]"
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
