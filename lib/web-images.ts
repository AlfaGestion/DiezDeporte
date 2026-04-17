import "server-only";

type BingImageResult = {
  imageUrl: string;
  imageSourceUrl: string | null;
  imageMode: "illustrative";
  imageNote: string;
};

type CachedSearch = {
  result: BingImageResult | null;
  fetchedAt: number;
};

type CachedPlaceholderCheck = {
  isPlaceholder: boolean;
  fetchedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __diezDeportesWebImageCache: Map<string, CachedSearch> | undefined;
  // eslint-disable-next-line no-var
  var __diezDeportesPlaceholderCache: Map<string, CachedPlaceholderCheck> | undefined;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BING_IMAGE_SEARCH_URL = "https://www.bing.com/images/search";

export async function searchProductImageOnWeb(
  code: string,
  description: string,
  currentImageUrl?: string | null,
) {
  const cacheKey = [
    code.trim().toUpperCase(),
    description.trim().toUpperCase(),
    currentImageUrl?.trim() || "",
  ].join("::");
  const cache = getWebImageCache();
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  if (currentImageUrl && !(await shouldReplaceCurrentImage(currentImageUrl))) {
    cache.set(cacheKey, { result: null, fetchedAt: Date.now() });
    return null;
  }

  const query = buildSearchQuery(description, code);
  if (!query) {
    cache.set(cacheKey, { result: null, fetchedAt: Date.now() });
    return null;
  }

  const html = await fetchSearchHtml(query);
  const result = pickBestImageResult(html, query);
  cache.set(cacheKey, { result, fetchedAt: Date.now() });
  return result;
}

function getWebImageCache() {
  if (!global.__diezDeportesWebImageCache) {
    global.__diezDeportesWebImageCache = new Map<string, CachedSearch>();
  }

  return global.__diezDeportesWebImageCache;
}

function getPlaceholderCache() {
  if (!global.__diezDeportesPlaceholderCache) {
    global.__diezDeportesPlaceholderCache = new Map<string, CachedPlaceholderCheck>();
  }

  return global.__diezDeportesPlaceholderCache;
}

function buildSearchQuery(description: string, code: string) {
  const cleaned = tokenize(description).join(" ");
  if (cleaned) return cleaned;

  return getBaseCode(code).toLowerCase();
}

async function fetchSearchHtml(query: string) {
  const searchUrl = `${BING_IMAGE_SEARCH_URL}?q=${encodeURIComponent(query)}&form=HDRSC3`;
  const response = await fetch(searchUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo buscar imagenes web (${response.status})`);
  }

  return response.text();
}

async function shouldReplaceCurrentImage(currentImageUrl: string) {
  if (!isOdooProductImage(currentImageUrl)) {
    return false;
  }

  const cache = getPlaceholderCache();
  const cached = cache.get(currentImageUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.isPlaceholder;
  }

  const response = await fetch(currentImageUrl, {
    method: "HEAD",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const disposition = response.headers.get("content-disposition") || "";
  const isPlaceholder = /placeholder_thumbnail/i.test(disposition);
  cache.set(currentImageUrl, { isPlaceholder, fetchedAt: Date.now() });
  return isPlaceholder;
}

function pickBestImageResult(html: string, query: string) {
  const queryTokens = tokenize(query);
  const matches = [...html.matchAll(/<a[^>]+class="iusc"[^>]+m="([^"]+)"/gi)].slice(0, 12);

  let bestScore = 0;
  let bestResult: BingImageResult | null = null;

  for (const match of matches) {
    const data = parseBingMetadata(match[1]);
    if (!data) continue;

    const imageUrl = normalizeRemoteUrl(data.murl) || normalizeRemoteUrl(data.turl);
    if (!imageUrl) continue;

    const score = scoreBingCandidate(queryTokens, `${data.t || ""} ${data.desc || ""} ${data.purl || ""}`);
    if (score < 2 || score <= bestScore) continue;

    bestScore = score;
    bestResult = {
      imageUrl,
      imageSourceUrl: normalizeRemoteUrl(data.purl),
      imageMode: "illustrative",
      imageNote:
        "Imagen ilustrativa encontrada en internet. Es solo de referencia y puede no coincidir exactamente con el producto.",
    };
  }

  return bestResult;
}

function parseBingMetadata(encodedJson: string) {
  try {
    const decoded = decodeHtml(encodedJson);
    return JSON.parse(decoded) as {
      murl?: string;
      turl?: string;
      purl?: string;
      t?: string;
      desc?: string;
    };
  } catch {
    return null;
  }
}

function normalizeRemoteUrl(value?: string | null) {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  return value.trim();
}

function isOdooProductImage(value: string) {
  return /https?:\/\/diezdeportes\.odoo\.com\/web\/image\/product\.template\//i.test(value);
}

function scoreBingCandidate(queryTokens: string[], text: string) {
  const haystack = new Set(tokenize(text));
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.has(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }

  return score;
}

function getBaseCode(value: string) {
  return value.split("|")[0]?.trim() || value.trim();
}

function tokenize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => {
      return (
        token.length >= 3 &&
        !STOP_WORDS.has(token) &&
        !COLOR_WORDS.has(token) &&
        !SIZE_WORDS.has(token)
      );
    });
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

const STOP_WORDS = new Set([
  "para",
  "con",
  "sin",
  "the",
  "and",
  "men",
  "man",
  "mujer",
  "hombre",
  "kids",
  "adulto",
  "adulta",
  "junior",
  "nino",
  "nina",
  "niño",
  "niña",
  "blist",
]);

const COLOR_WORDS = new Set([
  "negro",
  "negra",
  "blanco",
  "blanca",
  "gris",
  "rojo",
  "roja",
  "azul",
  "verde",
  "rosa",
  "fucsia",
  "violeta",
  "amarillo",
  "amarilla",
  "naranja",
  "marron",
  "bordo",
  "celeste",
  "colores",
  "multicolor",
]);

const SIZE_WORDS = new Set([
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "xxxl",
  "uni",
  "unico",
  "talle",
]);
