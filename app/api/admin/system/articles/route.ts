import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { listAdminSystemArticles } from "@/lib/repositories/adminSystemRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const depositId = request.nextUrl.searchParams.get("depositId")?.trim() || "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || "12");
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(20, Math.trunc(requestedLimit)))
    : 12;

  if (!query) {
    return NextResponse.json({ articles: [] });
  }

  try {
    const articles = await listAdminSystemArticles({
      query,
      depositId: depositId || null,
      limit,
    });

    return NextResponse.json({
      articles: articles.map((article) => ({
        code: article.code,
        description: article.description,
        brandName: article.brandName,
        categoryName: article.categoryName,
        unitLabel: article.unitLabel,
        stock: article.stock,
      })),
    });
  } catch (error) {
    console.error("Admin system articles API error", error);
    return NextResponse.json(
      { error: "No se pudieron consultar los articulos." },
      { status: 500 },
    );
  }
}
