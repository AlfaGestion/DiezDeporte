import { Storefront } from "@/components/storefront";
import { listProducts } from "@/lib/catalog";
import { LOCAL_BRAND_IMAGES, LOCAL_PROMO_TILES } from "@/lib/site-assets";
import { getPublicStoreSettings } from "@/lib/store-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const settings = await getPublicStoreSettings();

  try {
    const products = await listProducts();

    return (
      <Storefront
        initialProducts={products}
        settings={settings}
        brandImages={LOCAL_BRAND_IMAGES}
        logoUrl={settings.logoUrl}
        heroImageUrl={settings.heroImageUrl}
        promoTiles={LOCAL_PROMO_TILES}
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
        brandImages={LOCAL_BRAND_IMAGES}
        logoUrl={settings.logoUrl}
        heroImageUrl={settings.heroImageUrl}
        promoTiles={LOCAL_PROMO_TILES}
        loadError={message}
      />
    );
  }
}
