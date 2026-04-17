import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get("url")?.trim() || "";
    if (!rawUrl) {
      return NextResponse.json({ error: "Falta la URL de la imagen." }, { status: 400 });
    }

    const targetUrl = new URL(rawUrl);
    if (!/^https?:$/i.test(targetUrl.protocol)) {
      return NextResponse.json({ error: "Protocolo no permitido." }, { status: 400 });
    }

    if (isBlockedHost(targetUrl.hostname)) {
      return NextResponse.json({ error: "Host no permitido." }, { status: 400 });
    }

    const upstream = await fetch(targetUrl.toString(), {
      cache: "force-cache",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `No se pudo obtener la imagen (${upstream.status}).` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "La URL no devolvio una imagen." }, { status: 415 });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo proxyar la imagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isBlockedHost(hostname: string) {
  const host = hostname.trim().toLowerCase();

  if (!host) return true;
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) {
    return true;
  }

  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;

  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }

  return false;
}
