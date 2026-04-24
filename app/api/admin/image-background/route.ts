import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSessionUser } from "@/lib/admin-auth";
import { removeNearWhiteBackground } from "@/lib/image-background";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentAdminSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const sourceUrl =
      typeof formData.get("sourceUrl") === "string"
        ? String(formData.get("sourceUrl")).trim()
        : "";
    const sourceFile = formData.get("sourceFile");

    let sourceBuffer: Buffer | null = null;

    if (sourceFile instanceof File && sourceFile.size > 0) {
      sourceBuffer = Buffer.from(await sourceFile.arrayBuffer());
    } else if (sourceUrl) {
      sourceBuffer = await fetchImageBufferFromUrl(request, sourceUrl);
    }

    if (!sourceBuffer) {
      return NextResponse.json({ error: "No se encontro una imagen para procesar." }, { status: 400 });
    }

    const processed = await removeNearWhiteBackground(sourceBuffer);

    if (!processed) {
      return NextResponse.json(
        { error: "No se detecto un fondo uniforme para remover en esta imagen." },
        { status: 422 },
      );
    }

    return new NextResponse(new Uint8Array(processed), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin-image-background] No se pudo quitar el fondo.", error);
    return NextResponse.json(
      { error: "No se pudo procesar la imagen." },
      { status: 500 },
    );
  }
}

async function fetchImageBufferFromUrl(request: NextRequest, rawUrl: string) {
  const targetUrl = rawUrl.startsWith("/")
    ? new URL(rawUrl, request.nextUrl.origin)
    : new URL(rawUrl);

  if (!/^https?:$/i.test(targetUrl.protocol)) {
    throw new Error("Protocolo no permitido.");
  }

  if (targetUrl.origin !== request.nextUrl.origin && isBlockedHost(targetUrl.hostname)) {
    throw new Error("Host no permitido.");
  }

  const response = await fetch(targetUrl.toString(), {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener la imagen (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    throw new Error("La fuente no devolvio una imagen.");
  }

  return Buffer.from(await response.arrayBuffer());
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
