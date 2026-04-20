import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get("url")?.trim() || "";
    const transparent = request.nextUrl.searchParams.get("transparent") === "1";
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
    const buffer = Buffer.from(bytes);

    if (!transparent || !contentType.startsWith("image/")) {
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    const processed = await removeNearWhiteBackground(buffer);
    if (!processed) {
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    return new NextResponse(new Uint8Array(processed), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
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

async function removeNearWhiteBackground(buffer: Buffer) {
  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const backgroundAverage = estimateBorderBackgroundAverage(
      data,
      width,
      height,
      channels,
    );

    if (backgroundAverage === null) {
      return null;
    }

    const backgroundMask = floodFillBackground(
      data,
      width,
      height,
      channels,
      backgroundAverage,
    );

    if (backgroundMask.removedPixels === 0) {
      return null;
    }

    applyBackgroundTransparency(
      data,
      width,
      height,
      channels,
      backgroundAverage,
      backgroundMask.mask,
    );

    return sharp(data, {
      raw: {
        width,
        height,
        channels,
      },
    })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

function estimateBorderBackgroundAverage(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) {
  const samples: number[] = [];

  forEachBorderPixel(width, height, (x, y) => {
    const stats = readPixelStats(data, width, channels, x, y);
    if (stats.alpha < 8) return;
    if (stats.average < 232) return;
    if (stats.spread > 38) return;

    samples.push(stats.average);
  });

  if (samples.length === 0) {
    return null;
  }

  const total = samples.reduce((sum, value) => sum + value, 0);
  return total / samples.length;
}

function floodFillBackground(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  backgroundAverage: number,
) {
  const mask = new Uint8Array(width * height);
  const queue: number[] = [];
  let removedPixels = 0;

  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (mask[index] === 1) return;

    const stats = readPixelStats(data, width, channels, x, y);
    if (!isSeedBackgroundPixel(stats, backgroundAverage)) {
      return;
    }

    mask[index] = 1;
    queue.push(index);
    removedPixels += 1;
  };

  forEachBorderPixel(width, height, enqueue);

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);

    for (const [nextX, nextY] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }

      const nextIndex = nextY * width + nextX;
      if (mask[nextIndex] === 1) {
        continue;
      }

      const stats = readPixelStats(data, width, channels, nextX, nextY);
      if (!isConnectedBackgroundPixel(stats, backgroundAverage)) {
        continue;
      }

      mask[nextIndex] = 1;
      queue.push(nextIndex);
      removedPixels += 1;
    }
  }

  return { mask, removedPixels };
}

function applyBackgroundTransparency(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  backgroundAverage: number,
  mask: Uint8Array,
) {
  const safeBackgroundAverage = Math.max(236, backgroundAverage);

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue;

    const offset = index * channels;
    const stats = readPixelStatsAtOffset(data, offset);
    const alphaIndex = offset + 3;

    if (stats.average >= safeBackgroundAverage - 2 && stats.spread <= 18) {
      data[alphaIndex] = 0;
      continue;
    }

    const whiteness = clamp(
      (stats.average - 220) / Math.max(18, safeBackgroundAverage - 220),
      0,
      1,
    );
    const neutrality = clamp(1 - stats.spread / 46, 0, 1);
    const strength = whiteness * neutrality;
    const remainingAlpha = Math.round(
      255 * Math.pow(1 - strength, 2.2),
    );

    data[alphaIndex] = Math.min(data[alphaIndex], remainingAlpha);
  }
}

function forEachBorderPixel(
  width: number,
  height: number,
  callback: (x: number, y: number) => void,
) {
  for (let x = 0; x < width; x += 1) {
    callback(x, 0);
    if (height > 1) {
      callback(x, height - 1);
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    callback(0, y);
    if (width > 1) {
      callback(width - 1, y);
    }
  }
}

function isSeedBackgroundPixel(
  stats: ReturnType<typeof readPixelStatsAtOffset>,
  backgroundAverage: number,
) {
  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(236, backgroundAverage - 8) &&
    stats.spread <= 34
  );
}

function isConnectedBackgroundPixel(
  stats: ReturnType<typeof readPixelStatsAtOffset>,
  backgroundAverage: number,
) {
  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(224, backgroundAverage - 22) &&
    stats.spread <= 42
  );
}

function readPixelStats(
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
) {
  return readPixelStatsAtOffset(data, (y * width + x) * channels);
}

function readPixelStatsAtOffset(data: Buffer, offset: number) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  return {
    alpha,
    average: (red + green + blue) / 3,
    spread: max - min,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
