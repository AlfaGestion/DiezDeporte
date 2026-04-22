export const ADMIN_SYSTEM_SECTIONS = [
  "articulos",
  "stock",
  "marcas",
  "categorias",
] as const;

export type AdminSystemSection = (typeof ADMIN_SYSTEM_SECTIONS)[number];
export type AdminSystemEditorMode = "new" | "edit";

export type AdminSystemLookupOption = {
  value: string;
  code: string;
  label: string;
};

export type AdminSystemArticleRecord = {
  id: number;
  code: string;
  description: string;
  barcode: string | null;
  supplierProductCode: string | null;
  imagePath: string | null;
  unitId: string;
  unitLabel: string | null;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  price: number;
  cost: number;
  taxRate: number;
  supplierAccount: string;
  exempt: boolean;
  weighable: boolean;
  suspended: boolean;
  suspendedForSales: boolean;
  webBlocked: boolean;
  stock: number;
};

export type AdminSystemSummary = {
  articleCount: number;
  blockedArticleCount: number;
  brandCount: number;
  categoryCount: number;
  defaultDepositId: string;
  defaultDepositLabel: string | null;
};

export function normalizeAdminSystemSection(
  value: string | null | undefined,
): AdminSystemSection {
  if (value === "nuevo_articulo") {
    return "articulos";
  }

  return ADMIN_SYSTEM_SECTIONS.includes((value || "") as AdminSystemSection)
    ? ((value || "") as AdminSystemSection)
    : "articulos";
}

export function normalizeAdminSystemEditorMode(
  value: string | null | undefined,
): AdminSystemEditorMode | null {
  return value === "new" || value === "edit" ? value : null;
}

export function getAdminSystemSectionLabel(section: AdminSystemSection) {
  switch (section) {
    case "articulos":
      return "Articulos";
    case "stock":
      return "Stock";
    case "marcas":
      return "Marcas";
    case "categorias":
      return "Categorias";
    default:
      return section;
  }
}
