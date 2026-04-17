import { Storefront } from "@/components/storefront";
import { listProducts } from "@/lib/catalog";
import { getOdooAssets } from "@/lib/odoo";
import { getPublicStoreSettings } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const settings = getPublicStoreSettings();

  try {
    const [products, odooAssets] = await Promise.all([
      listProducts(),
      getOdooAssets(),
    ]);

    return (
      <Storefront
        initialProducts={products}
        settings={settings}
        brandImages={odooAssets.brandImages}
        logoUrl={odooAssets.logoUrl ?? settings.logoUrl}
        heroImageUrl={odooAssets.heroImageUrl ?? null}
        promoTiles={odooAssets.promoTiles ?? []}
      />
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo conectar con la base de datos.";

    return (
      <Storefront
        initialProducts={[]}
        settings={settings}
        brandImages={[]}
        logoUrl={settings.logoUrl}
        heroImageUrl={null}
        promoTiles={[]}
        loadError={message}
      />
    );
  }
}
