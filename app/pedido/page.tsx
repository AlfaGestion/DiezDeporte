import { OrderNotFoundState } from "@/components/order-not-found-state";
import { PublicOrderStatus } from "@/components/public-order-status";
import { logServerError } from "@/lib/error-monitor";
import { getPublicStoreSettings } from "@/lib/store-config";
import { resolvePendingPaymentStatus } from "@/lib/web-payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicOrderPageProps = {
  searchParams: Promise<{
    externalReference?: string;
    external_reference?: string;
  }>;
};

export default async function PublicOrderPage({
  searchParams,
}: PublicOrderPageProps) {
  const [settings, params] = await Promise.all([
    getPublicStoreSettings(),
    searchParams,
  ]);
  const externalReference =
    params.externalReference?.trim() || params.external_reference?.trim() || "";
  let status = null;
  let mode: "missing" | "not-found" | "error" | null = null;

  if (!externalReference) {
    mode = "not-found";
  } else {
    try {
      status = await resolvePendingPaymentStatus({
        externalReference,
      });

      if (!status) {
        mode = "not-found";
      }
    } catch (pageError) {
      logServerError({
        code: "PUBLIC_ORDER_LOOKUP_ERROR",
        scope: "order",
        route: "/pedido",
        error: pageError,
        externalReference,
      });
      mode = "error";
    }
  }

  if (mode === "not-found") {
    return <OrderNotFoundState supportHref={settings.supportWhatsapp} />;
  }

  return (
    <PublicOrderStatus
      storeName={settings.storeName}
      pickupSchedule={settings.pickupSchedule}
      supportWhatsapp={settings.supportWhatsapp}
      status={status}
      error={mode === "error" ? "No pudimos consultar el estado del pedido en este momento." : null}
    />
  );
}
