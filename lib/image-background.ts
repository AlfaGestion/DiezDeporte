import sharp from "sharp";

type PixelStats = ReturnType<typeof readPixelStatsAtOffset>;

type BackgroundColor = {
  red: number;
  green: number;
  blue: number;
  average: number;
};

export async function removeNearWhiteBackground(buffer: Buffer) {
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

    if (hasTransparentExterior(data, width, height, channels)) {
      return sharp(data, {
        raw: {
          width,
          height,
          channels,
        },
      })
        .png()
        .toBuffer();
    }

    const backgroundColor = estimateBorderBackgroundColor(
      data,
      width,
      height,
      channels,
    );

    if (backgroundColor === null) {
      return null;
    }

    const backgroundMask = floodFillBackground(
      data,
      width,
      height,
      channels,
      backgroundColor,
    );

    if (backgroundMask.removedPixels === 0) {
      return null;
    }

    applyBackgroundTransparency(
      data,
      width,
      height,
      channels,
      backgroundColor,
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

function estimateBorderBackgroundColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) {
  const samples: PixelStats[] = [];
  const borderThickness = getBorderThickness(width, height);

  forEachBorderBandPixel(width, height, borderThickness, (x, y) => {
    const stats = readPixelStats(data, width, channels, x, y);
    if (stats.alpha < 8) return;
    if (stats.average < 208) return;
    if (stats.spread > 54) return;

    samples.push(stats);
  });

  if (samples.length === 0) {
    return null;
  }

  const totals = samples.reduce(
    (accumulator, sample) => ({
      red: accumulator.red + sample.red,
      green: accumulator.green + sample.green,
      blue: accumulator.blue + sample.blue,
    }),
    { red: 0, green: 0, blue: 0 },
  );

  const red = totals.red / samples.length;
  const green = totals.green / samples.length;
  const blue = totals.blue / samples.length;

  return {
    red,
    green,
    blue,
    average: (red + green + blue) / 3,
  } satisfies BackgroundColor;
}

function hasTransparentExterior(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) {
  const borderThickness = getBorderThickness(width, height);
  let sampledPixels = 0;
  let transparentPixels = 0;

  forEachBorderBandPixel(width, height, borderThickness, (x, y) => {
    sampledPixels += 1;

    const stats = readPixelStats(data, width, channels, x, y);
    if (stats.alpha <= 244) {
      transparentPixels += 1;
    }
  });

  return sampledPixels > 0 && transparentPixels / sampledPixels >= 0.08;
}

function floodFillBackground(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  backgroundColor: BackgroundColor,
) {
  const mask = new Uint8Array(width * height);
  const queue: number[] = [];
  let removedPixels = 0;

  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (mask[index] === 1) return;

    const stats = readPixelStats(data, width, channels, x, y);
    if (!isSeedBackgroundPixel(stats, backgroundColor)) {
      return;
    }

    mask[index] = 1;
    queue.push(index);
    removedPixels += 1;
  };

  forEachBorderBandPixel(width, height, getBorderThickness(width, height), enqueue);

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
      if (!isConnectedBackgroundPixel(stats, backgroundColor)) {
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
  backgroundColor: BackgroundColor,
  mask: Uint8Array,
) {
  const minAverage = Math.max(168, backgroundColor.average - 84);

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue;

    const offset = index * channels;
    const stats = readPixelStatsAtOffset(data, offset);
    const alphaIndex = offset + 3;
    const similarity = clamp(
      1 - getBackgroundColorDistance(stats, backgroundColor) / 72,
      0,
      1,
    );
    const brightness = clamp(
      (stats.average - minAverage) / Math.max(18, backgroundColor.average - minAverage),
      0,
      1,
    );
    const neutrality = clamp(1 - stats.spread / 84, 0, 1);

    let strength = (similarity * 0.72) + (brightness * 0.18) + (neutrality * 0.1);
    strength = Math.pow(clamp(strength, 0, 1), 1.75);

    let remainingAlpha = Math.round(255 * Math.pow(1 - strength, 2.4));

    if (
      similarity >= 0.94 &&
      stats.spread <= 24 &&
      stats.average >= backgroundColor.average - 6
    ) {
      remainingAlpha = 0;
    }

    const nextAlpha = Math.min(data[alphaIndex], remainingAlpha);
    data[alphaIndex] = nextAlpha;

    if (nextAlpha <= 0) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      continue;
    }

    if (nextAlpha < 255) {
      const normalizedAlpha = nextAlpha / 255;
      data[offset] = removeBackgroundSpill(data[offset], backgroundColor.red, normalizedAlpha);
      data[offset + 1] = removeBackgroundSpill(
        data[offset + 1],
        backgroundColor.green,
        normalizedAlpha,
      );
      data[offset + 2] = removeBackgroundSpill(
        data[offset + 2],
        backgroundColor.blue,
        normalizedAlpha,
      );
    }
  }
}

function getBorderThickness(width: number, height: number) {
  return Math.max(1, Math.min(12, Math.round(Math.min(width, height) * 0.035)));
}

function forEachBorderBandPixel(
  width: number,
  height: number,
  thickness: number,
  callback: (x: number, y: number) => void,
) {
  const safeThickness = Math.max(1, Math.min(thickness, width, height));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x < safeThickness ||
        y < safeThickness ||
        x >= width - safeThickness ||
        y >= height - safeThickness
      ) {
        callback(x, y);
      }
    }
  }
}

function isSeedBackgroundPixel(stats: PixelStats, backgroundColor: BackgroundColor) {
  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(208, backgroundColor.average - 18) &&
    stats.spread <= 58 &&
    getBackgroundColorDistance(stats, backgroundColor) <= 42
  );
}

function isConnectedBackgroundPixel(stats: PixelStats, backgroundColor: BackgroundColor) {
  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(188, backgroundColor.average - 42) &&
    stats.spread <= 76 &&
    getBackgroundColorDistance(stats, backgroundColor) <= 64
  );
}

function getBackgroundColorDistance(stats: PixelStats, backgroundColor: BackgroundColor) {
  const redDelta = stats.red - backgroundColor.red;
  const greenDelta = stats.green - backgroundColor.green;
  const blueDelta = stats.blue - backgroundColor.blue;

  return Math.sqrt(
    (redDelta * redDelta) +
    (greenDelta * greenDelta) +
    (blueDelta * blueDelta),
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
    red,
    green,
    blue,
    alpha,
    average: (red + green + blue) / 3,
    spread: max - min,
  };
}

function removeBackgroundSpill(channel: number, backgroundChannel: number, alpha: number) {
  return clamp(
    Math.round((channel - backgroundChannel * (1 - alpha)) / alpha),
    0,
    255,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
