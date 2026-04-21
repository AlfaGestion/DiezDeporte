import type { BrandImage, PromoTile } from "@/lib/types";

export const LOCAL_STORE_LOGO_URL = "/branding/logo-diez-deportes.png";
export const LOCAL_STORE_LOGO_DARK_URL = "/branding/logo-diez-deportes-dark.png";
export const LOCAL_HERO_IMAGE_URL = "/branding/hero-home.webp";

export const LOCAL_BRAND_IMAGES: BrandImage[] = [
  {
    src: "/brands/puma.png",
    alt: "Puma",
    label: "Puma",
    aliases: ["PUMA"],
  },
  {
    src: "/brands/reebok.png",
    alt: "Reebok",
    label: "Reebok",
    aliases: ["REEBOK", "RBK"],
  },
  {
    src: "/brands/topper.png",
    alt: "Topper",
    label: "Topper",
    aliases: ["TOPPER"],
  },
  {
    src: "/brands/salomon.png",
    alt: "Salomon",
    label: "Salomon",
    aliases: ["SALOMON"],
  },
  {
    src: "/brands/montagne.png",
    alt: "Montagne",
    label: "Montagne",
    aliases: ["MONTAGNE", "TREVO"],
  },
  {
    src: "/brands/merrell.png",
    alt: "Merrell",
    label: "Merrell",
    aliases: ["MERRELL"],
  },
];

export const LOCAL_PROMO_TILES: PromoTile[] = [
  {
    src: "/promos/promo-mujeres.png",
    href: "/catalogo?attribute_values=13-99",
    alt: "Coleccion mujeres",
    label: "Mujeres",
    filterValue: "mujeres",
  },
  {
    src: "/promos/promo-hombres.png",
    href: "/catalogo?attribute_values=13-98",
    alt: "Coleccion hombres",
    label: "Hombres",
    filterValue: "hombres",
  },
  {
    src: "/promos/promo-kids.png",
    href: "/catalogo?attribute_values=13-102",
    alt: "Coleccion kids",
    label: "Kids",
    filterValue: "ninez",
  },
];
