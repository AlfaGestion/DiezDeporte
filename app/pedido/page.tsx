import { Suspense } from "react";
import { PublicOrderStatus } from "@/components/public-order-status";
import { getPublicStoreSettings } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicOrderPage() {
  const settings = await getPublicStoreSettings();

  return (
    <Suspense
      fallback={
        <main className="payment-return-page">
          <section className="payment-return-card">
            <span className="payment-return-eyebrow">{settings.storeName}</span>
            <h1>Estamos buscando tu pedido</h1>
            <p>Consultando la informacion mas reciente.</p>
          </section>
        </main>
      }
    >
      <PublicOrderStatus
        storeName={settings.storeName}
        supportWhatsapp={settings.supportWhatsapp}
      />
    </Suspense>
  );
}
