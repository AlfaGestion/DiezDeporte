import { NextResponse } from "next/server";
import { listProducts, searchStoreProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const category = searchParams.get("category") || "";
    const brand = searchParams.get("brand") || "";
    const hasServerFilters = Boolean(query.trim() || category.trim() || brand.trim());
    const products = hasServerFilters
      ? await searchStoreProducts({
          query,
          category,
          brand,
        })
      : await listProducts();

    return NextResponse.json({ products });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron obtener los artículos.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
