import { getPublicStoreSettings } from "@/lib/store-config";
import { NotFoundState } from "@/components/not-found-state";

export default async function RootNotFound() {
  const settings = await getPublicStoreSettings().catch(() => null);

  return (
    <NotFoundState
      title="No encontramos esta página"
      message="Puede que el enlace no sea válido o que la página ya no esté disponible."
      supportHref={settings?.supportWhatsapp || null}
    />
  );
}
