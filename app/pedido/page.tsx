import { PublicOrderStatus } from "@/components/public-order-status";
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
  let error: string | null = null;

  if (!externalReference) {
    error = "Falta el identificador del pedido.";
  } else {
    try {
      status = await resolvePendingPaymentStatus({
        externalReference,
      });

      if (!status) {
        error = "No se encontro un pedido para ese enlace.";
      }
    } catch (pageError) {
      error =
        pageError instanceof Error
          ? pageError.message
          : "No se pudo consultar el estado del pedido.";
    }
  }

  return (
    <PublicOrderStatus
      storeName={settings.storeName}
      supportWhatsapp={settings.supportWhatsapp}
      status={status}
      error={error}
    />
  );
}
