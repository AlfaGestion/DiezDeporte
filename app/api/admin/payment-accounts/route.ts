import { NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { getPaymentCollectionAccounts } from "@/lib/services/paymentAccountService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const accounts = await getPaymentCollectionAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Payment accounts API error", error);
    return NextResponse.json(
      { error: "No se pudieron cargar las cuentas de cobro." },
      { status: 500 },
    );
  }
}
