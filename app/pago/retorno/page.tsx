import { Suspense } from "react";
import { PaymentReturnStatus } from "@/components/payment-return-status";
import { getPublicStoreSettings } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PaymentReturnPage() {
  const settings = await getPublicStoreSettings();

  return (
    <Suspense
      fallback={
        <main className="payment-return-page">
          <section className="payment-return-card">
            <span className="payment-return-eyebrow">{settings.storeName}</span>
            <h1>Estamos verificando tu pago</h1>
            <p>Consultando el estado mas reciente de Mercado Pago.</p>
          </section>
        </main>
      }
    >
      <PaymentReturnStatus
        storeName={settings.storeName}
        supportWhatsapp={settings.supportWhatsapp}
      />
    </Suspense>
  );
}
