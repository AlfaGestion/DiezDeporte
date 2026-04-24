import { NextRequest, NextResponse } from "next/server";
import { getProductImageOverridesByProductIds, saveProductImageOverride } from "@/lib/repositories/productImageRepository";
import { searchProductImageOnWeb } from "@/lib/web-images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim() || "";
    const description = request.nextUrl.searchParams.get("description")?.trim() || "";
    const currentImageUrl = request.nextUrl.searchParams.get("currentImageUrl")?.trim() || "";

    if (!description) {
      return NextResponse.json({ result: null });
    }

    if (code) {
      const overrides = await getProductImageOverridesByProductIds([code]);
      const existingOverride = overrides.get(code) || null;

      if (existingOverride?.imageMode === "illustrative" && existingOverride.imageUrl) {
        return NextResponse.json({
          result: {
            imageUrl: existingOverride.imageUrl,
            imageGalleryUrls: existingOverride.imageGalleryUrls,
            imageMode: existingOverride.imageMode,
            imageNote: existingOverride.imageNote,
            imageSourceUrl: existingOverride.imageSourceUrl,
          },
        });
      }
    }

    const result = await searchProductImageOnWeb(
      code,
      description,
      currentImageUrl || null,
    );

    if (result && code) {
      try {
        await saveProductImageOverride({
          productId: code,
          imageUrls: [result.imageUrl],
          imageMode: "illustrative",
          imageNote: result.imageNote,
          imageSourceUrl: result.imageSourceUrl,
          updatedBy: "system-web-search",
        });
      } catch (error) {
        console.error("[product-image-search] No se pudo persistir la imagen ilustrativa.", error);
      }
    }

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo buscar la imagen del producto.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
