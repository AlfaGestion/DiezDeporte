import { NextResponse } from "next/server";
import { listProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const products = await listProducts();
    return NextResponse.json({ products });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron obtener los artículos.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
