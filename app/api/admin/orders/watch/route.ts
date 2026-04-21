import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { getWatchSnapshot } from "@/lib/repositories/orderRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const snapshot = await getWatchSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Admin order watch API error", error);
    return NextResponse.json(
      { error: "No se pudo consultar el monitor de pedidos." },
      { status: 500 },
    );
  }
}
