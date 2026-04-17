import "server-only";
import type { BrandImage, PromoTile } from "@/lib/types";
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
  logoUrl: string | null;
  heroImageUrl: string | null;
  promoTiles: PromoTile[];
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
    const metadata = getBrandMetadata(decodedSrc);
    if (!metadata) {
      continue;
    }

    const src = absoluteUrl(baseUrl, decodedSrc);
    if (seen.has(src)) continue;
    seen.add(src);

    images.push({
      src,
      alt: metadata.label,
      label: metadata.label,
      aliases: metadata.aliases,
    });
  }

  return images.slice(0, 6);
}

function parseHeroImage(html: string, baseUrl: string) {
  const match = html.match(/background-image:\s*url\((?:&#34;|")([^"')]+)(?:&#34;|")\)/i);
  if (!match) {
    return null;
  }

  return absoluteUrl(baseUrl, match[1]);
}

function parseLogoImage(html: string, baseUrl: string) {
  const match = html.match(/<img[^>]+src="([^"]*\/web\/image\/website\/\d+\/logo\/[^"]+)"/i);
  if (!match) {
    return null;
  }

  return absoluteUrl(baseUrl, match[1]);
}

function parsePromoTiles(html: string, baseUrl: string) {
  const tiles: PromoTile[] = [];
  const regex =
    /<a href="([^"]+)"[^>]*><img src="([^"]+Mesa%20de%20trabajo[^"]+)" alt="([^"]*)"/gi;

  for (const [index, match] of [...html.matchAll(regex)].entries()) {
    if (index > 5) break;

    const [, href, src, alt] = match;
    const absoluteHref = absoluteUrl(baseUrl, href);
    const definition = getPromoMetadata(absoluteHref, index);
    tiles.push({
      href: absoluteHref,
      src: getPromoImageSource(absoluteHref) || absoluteUrl(baseUrl, src),
      alt: decodeHtml(alt) || definition.label,
      label: definition.label,
      filterValue: definition.filterValue,
    });
  }

  return tiles;
}

function getBrandMetadata(decodedSrc: string) {
  if (/MARCAS%20DIEZ%20DEPORTES-06/i.test(decodedSrc)) {
    return { label: "Puma", aliases: ["PUMA"] };
  }

  if (/MARCAS%20DIEZ%20DEPORTES-05/i.test(decodedSrc)) {
    return { label: "Reebok", aliases: ["REEBOK", "RBK"] };
  }

  if (/MARCAS%20DIEZ%20DEPORTES-04/i.test(decodedSrc)) {
    return { label: "Topper", aliases: ["TOPPER"] };
  }

  if (/SALOMON/i.test(decodedSrc)) {
    return { label: "Salomon", aliases: ["SALOMON"] };
  }

  if (/MARCAS%20DIEZ%20DEPORTES-02/i.test(decodedSrc)) {
    return { label: "Montagne", aliases: ["MONTAGNE", "TREVO"] };
  }

  if (/MARCAS%20DIEZ%20DEPORTES-01/i.test(decodedSrc)) {
    return { label: "Merrell", aliases: ["MERRELL"] };
  }

  return null;
}

function getPromoMetadata(href: string, index: number) {
  if (/attribute_values=13-102/i.test(href)) {
    return { label: "Kids", filterValue: "ninez" };
  }

  if (/attribute_values=13-99/i.test(href)) {
    return { label: "Mujeres", filterValue: "mujeres" };
  }

  if (/attribute_values=13-98/i.test(href)) {
    return { label: "Hombres", filterValue: "hombres" };
  }

  const fallbacks = [
    { label: "Kids", filterValue: "ninez" },
    { label: "Mujeres", filterValue: "mujeres" },
    { label: "Hombres", filterValue: "hombres" },
  ];

  return (
    fallbacks[index] || {
      label: `Destacado ${index + 1}`,
      filterValue: "all",
    }
  );
}

function getPromoImageSource(href: string) {
  if (/attribute_values=13-102/i.test(href)) {
    return "/promos/promo-kids.png";
  }

  if (/attribute_values=13-99/i.test(href)) {
    return "/promos/promo-mujeres.png";
  }

  if (/attribute_values=13-98/i.test(href)) {
    return "/promos/promo-hombres.png";
  }

  return null;
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
      logoUrl: null,
      heroImageUrl: null,
      promoTiles: [],
      fetchedAt: Date.now(),
    };
  }

  const cached = global.__diezDeportesOdooAssets;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      brandImages: cached.brandImages ?? [],
      productImages: cached.productImages ?? new Map(),
      logoUrl: cached.logoUrl ?? null,
      heroImageUrl: cached.heroImageUrl ?? null,
      promoTiles: cached.promoTiles ?? [],
      fetchedAt: cached.fetchedAt,
    };
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
    logoUrl: parseLogoImage(firstPageHtml, shopUrl),
    heroImageUrl: parseHeroImage(firstPageHtml, shopUrl),
    promoTiles: parsePromoTiles(firstPageHtml, shopUrl),
    productImages,
    fetchedAt: Date.now(),
  };

  global.__diezDeportesOdooAssets = assets;
  return assets;
}
