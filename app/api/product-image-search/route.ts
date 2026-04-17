import { NextRequest, NextResponse } from "next/server";
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

    const result = await searchProductImageOnWeb(
      code,
      description,
      currentImageUrl || null,
    );
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo buscar la imagen del producto.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
