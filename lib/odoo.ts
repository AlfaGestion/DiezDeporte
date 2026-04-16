import "server-only";
import type { BrandImage } from "@/lib/types";
import { parseBoolean } from "@/lib/commerce";

type OdooProductImage = {
  code: string;
  imageUrl: string;
  title: string;
  href: string;
};

type OdooAssets = {
  brandImages: BrandImage[];
  productImages: Map<string, OdooProductImage>;
  fetchedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __diezDeportesOdooAssets: OdooAssets | undefined;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_SAFE_PAGES = 30;

function getOdooShopUrl() {
  return process.env.ODOO_SHOP_URL?.trim() || "";
}

function shouldSyncImages() {
  return parseBoolean(process.env.ODOO_SYNC_IMAGES, false);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function absoluteUrl(baseUrl: string, maybeRelativeUrl: string) {
  return new URL(decodeHtml(maybeRelativeUrl), baseUrl).toString();
}

function parseMaxPages(html: string) {
  const matches = [...html.matchAll(/\/shop\/page\/(\d+)/g)];
  const maxPage = matches.reduce((max, current) => {
    const page = Number(current[1]);
    return Number.isFinite(page) ? Math.max(max, page) : max;
  }, 1);

  const configuredMax = Number(process.env.ODOO_MAX_PAGES || String(maxPage));
  const safeMax = Number.isFinite(configuredMax)
    ? Math.max(1, configuredMax)
    : maxPage;

  return Math.min(Math.max(maxPage, 1), Math.min(safeMax, MAX_SAFE_PAGES));
}

function parseProductImages(html: string, baseUrl: string) {
  const productImages = new Map<string, OdooProductImage>();
  const productRegex =
    /<a[^>]+href="([^"]*\/shop\/[^"]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+src="([^"]*\/web\/image\/product\.template\/[^"]+)"[^>]+alt="([^"]+)"/gi;

  for (const match of html.matchAll(productRegex)) {
    const [, href, title, src, alt] = match;
    const decodedAlt = decodeHtml(alt);
    const codeMatch = decodedAlt.match(/^\[([^\]]+)\]/);
    if (!codeMatch) continue;

    const code = normalizeCode(codeMatch[1]);
    if (!code) continue;

    productImages.set(code, {
      code,
      href: absoluteUrl(baseUrl, href),
      imageUrl: absoluteUrl(baseUrl, src),
      title: decodeHtml(title),
    });
  }

  return productImages;
}

function parseBrandImages(html: string, baseUrl: string) {
  const images: BrandImage[] = [];
  const seen = new Set<string>();
  const imageRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;

  for (const match of html.matchAll(imageRegex)) {
    const rawSrc = match[1];
    if (
      !/\/web\/image\//i.test(rawSrc) ||
      /product\.template/i.test(rawSrc) ||
      /website\/\d+\/logo/i.test(rawSrc)
    ) {
      continue;
    }

    const decodedSrc = decodeHtml(rawSrc);
    if (
      !/MARCAS|SALOMON|Mesa%20de%20trabajo|Mesa de trabajo|logo%20diez%20deportes/i.test(
        decodedSrc,
      )
    ) {
      continue;
    }

    const src = absoluteUrl(baseUrl, decodedSrc);
    if (seen.has(src)) continue;
    seen.add(src);

    const fileName = decodeURIComponent(decodedSrc.split("/").pop() || "Marca");
    images.push({
      src,
      alt: fileName.replace(/\?.*$/, ""),
    });
  }

  return images.slice(0, 12);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo leer Odoo (${response.status})`);
  }

  return response.text();
}

export async function getOdooAssets(): Promise<OdooAssets> {
  const shopUrl = getOdooShopUrl();
  if (!shopUrl || !shouldSyncImages()) {
    return {
      brandImages: [],
      productImages: new Map(),
      fetchedAt: Date.now(),
    };
  }

  const cached = global.__diezDeportesOdooAssets;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const firstPageHtml = await fetchHtml(shopUrl);
  const maxPages = parseMaxPages(firstPageHtml);
  const pageUrls = Array.from({ length: maxPages - 1 }, (_, index) => {
    return `${shopUrl.replace(/\/$/, "")}/page/${index + 2}`;
  });

  const remainingPages = await Promise.all(
    pageUrls.map(async (pageUrl) => {
      try {
        return await fetchHtml(pageUrl);
      } catch {
        return "";
      }
    }),
  );

  const allHtml = [firstPageHtml, ...remainingPages].filter(Boolean);
  const productImages = new Map<string, OdooProductImage>();

  for (const html of allHtml) {
    const parsedImages = parseProductImages(html, shopUrl);
    for (const [code, productImage] of parsedImages) {
      productImages.set(code, productImage);
    }
  }

  const assets: OdooAssets = {
    brandImages: parseBrandImages(firstPageHtml, shopUrl),
    productImages,
    fetchedAt: Date.now(),
  };

  global.__diezDeportesOdooAssets = assets;
  return assets;
}
