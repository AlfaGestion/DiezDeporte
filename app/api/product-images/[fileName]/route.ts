import { NextResponse } from "next/server";
import {
  getManagedProductImageContentType,
  isMissingManagedProductImageError,
  readManagedProductImage,
} from "@/lib/product-image-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await context.params;

  try {
    const fileBuffer = await readManagedProductImage(fileName);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": getManagedProductImageContentType(fileName),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (isMissingManagedProductImageError(error)) {
      return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
    }

    return NextResponse.json(
      { error: "No se pudo abrir la imagen solicitada." },
      { status: 500 },
    );
  }
}
