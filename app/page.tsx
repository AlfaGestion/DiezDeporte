import { Storefront } from "@/components/storefront";
import { listProducts } from "@/lib/catalog";
import { getPublicStoreSettings } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const settings = getPublicStoreSettings();

  try {
    const products = await listProducts();

    return <Storefront initialProducts={products} settings={settings} />;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo conectar con la base de datos.";

    return (
      <Storefront
        initialProducts={[]}
        settings={settings}
        loadError={message}
      />
    );
  }
}
