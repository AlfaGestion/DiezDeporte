import { getPublicStoreSettings } from "@/lib/store-config";
import { NotFoundState } from "@/components/not-found-state";

export default async function RootNotFound() {
  const settings = await getPublicStoreSettings().catch(() => null);

  return (
    <NotFoundState
      title="No encontramos esta pagina"
      message="Puede que el enlace no sea valido o que la pagina ya no este disponible."
      supportHref={settings?.supportWhatsapp || null}
    />
  );
}
