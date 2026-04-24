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
    const refinedBackgroundMask = refineBackgroundMask(
      data,
      width,
      height,
      channels,
      backgroundColor,
      backgroundMask.mask,
    );

    if (refinedBackgroundMask.removedPixels === 0) {
      return null;
    }

    applyBackgroundTransparency(
      data,
      width,
      height,
      channels,
      backgroundColor,
      refinedBackgroundMask.mask,
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
  const scores = new Float32Array(width * height);
  const queue: number[] = [];
  let removedPixels = 0;

  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (mask[index] === 1) return;

    const stats = readPixelStats(data, width, channels, x, y);
    const backgroundScore = getBackgroundScore(stats, backgroundColor);

    if (!isSeedBackgroundPixel(stats, backgroundColor, backgroundScore)) {
      return;
    }

    mask[index] = 1;
    scores[index] = backgroundScore;
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
      const backgroundScore = getBackgroundScore(stats, backgroundColor);
      const currentStats = readPixelStatsAtOffset(data, index * channels);

      if (
        !isConnectedBackgroundPixel(
          stats,
          backgroundColor,
          backgroundScore,
          scores[index],
          currentStats,
        )
      ) {
        continue;
      }

      mask[nextIndex] = 1;
      scores[nextIndex] = backgroundScore;
      queue.push(nextIndex);
      removedPixels += 1;
    }
  }

  return { mask, removedPixels };
}

function refineBackgroundMask(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  backgroundColor: BackgroundColor,
  initialMask: Uint8Array,
) {
  let mask = initialMask.slice();

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const nextMask = mask.slice();
    let changed = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (mask[index] !== 1) {
          continue;
        }

        if (!shouldProtectMaskedPixel(data, width, height, channels, x, y, backgroundColor, mask)) {
          continue;
        }

        nextMask[index] = 0;
        changed += 1;
      }
    }

    if (changed === 0) {
      break;
    }

    mask = nextMask;
  }

  return retainBorderConnectedMask(mask, width, height);
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
      if (!shouldPreserveBrightNeutralPixel(stats, backgroundColor)) {
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

function isSeedBackgroundPixel(
  stats: PixelStats,
  backgroundColor: BackgroundColor,
  backgroundScore: number,
) {
  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(208, backgroundColor.average - 18) &&
    stats.spread <= 58 &&
    getBackgroundColorDistance(stats, backgroundColor) <= 42 &&
    backgroundScore >= 0.78
  );
}

function isConnectedBackgroundPixel(
  stats: PixelStats,
  backgroundColor: BackgroundColor,
  backgroundScore: number,
  currentBackgroundScore: number,
  currentStats: PixelStats,
) {
  if (
    !(
      stats.alpha >= 8 &&
      stats.average >= Math.max(188, backgroundColor.average - 42) &&
      stats.spread <= 76 &&
      getBackgroundColorDistance(stats, backgroundColor) <= 64 &&
      backgroundScore >= 0.54
    )
  ) {
    return false;
  }

  const scoreDrop = currentBackgroundScore - backgroundScore;
  if (scoreDrop > 0.18 && stats.average < currentStats.average - 6) {
    return false;
  }

  const stepDistance = getPixelColorDistance(stats, currentStats);
  if (
    stepDistance > 24 &&
    (
      stats.average < backgroundColor.average - 14 ||
      stats.spread > 18 ||
      backgroundScore < currentBackgroundScore - 0.08
    )
  ) {
    return false;
  }

  return (
    stats.alpha >= 8 &&
    stats.average >= Math.max(188, backgroundColor.average - 42) &&
    stats.spread <= 76 &&
    getBackgroundColorDistance(stats, backgroundColor) <= 64
  );
}

function shouldProtectMaskedPixel(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
  backgroundColor: BackgroundColor,
  mask: Uint8Array,
) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }

      const nextIndex = nextY * width + nextX;
      if (mask[nextIndex] === 1) {
        continue;
      }

      const neighborStats = readPixelStats(data, width, channels, nextX, nextY);
      if (isStrongForegroundPixel(neighborStats, backgroundColor)) {
        return true;
      }
    }
  }

  return false;
}

function retainBorderConnectedMask(mask: Uint8Array, width: number, height: number) {
  const connectedMask = new Uint8Array(mask.length);
  const queue: number[] = [];
  let removedPixels = 0;
  const borderThickness = getBorderThickness(width, height);

  forEachBorderBandPixel(width, height, borderThickness, (x, y) => {
    const index = y * width + x;
    if (mask[index] !== 1 || connectedMask[index] === 1) {
      return;
    }

    connectedMask[index] = 1;
    queue.push(index);
    removedPixels += 1;
  });

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
      if (mask[nextIndex] !== 1 || connectedMask[nextIndex] === 1) {
        continue;
      }

      connectedMask[nextIndex] = 1;
      queue.push(nextIndex);
      removedPixels += 1;
    }
  }

  return { mask: connectedMask, removedPixels };
}

function isStrongForegroundPixel(stats: PixelStats, backgroundColor: BackgroundColor) {
  const backgroundScore = getBackgroundScore(stats, backgroundColor);

  return (
    stats.alpha >= 8 &&
    (
      backgroundScore <= 0.42 ||
      stats.average <= backgroundColor.average - 18 ||
      stats.spread >= 20 ||
      getBackgroundColorDistance(stats, backgroundColor) >= 26
    )
  );
}

function shouldPreserveBrightNeutralPixel(
  stats: PixelStats,
  backgroundColor: BackgroundColor,
) {
  return (
    stats.average >= Math.max(224, backgroundColor.average - 10) &&
    stats.spread <= 18
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

function getPixelColorDistance(left: PixelStats, right: PixelStats) {
  const redDelta = left.red - right.red;
  const greenDelta = left.green - right.green;
  const blueDelta = left.blue - right.blue;

  return Math.sqrt(
    (redDelta * redDelta) +
    (greenDelta * greenDelta) +
    (blueDelta * blueDelta),
  );
}

function getBackgroundScore(stats: PixelStats, backgroundColor: BackgroundColor) {
  const minAverage = Math.max(168, backgroundColor.average - 84);
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

  return (similarity * 0.62) + (brightness * 0.24) + (neutrality * 0.14);
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
