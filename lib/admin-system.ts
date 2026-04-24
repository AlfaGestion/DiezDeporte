export const ADMIN_SYSTEM_SECTIONS = ["articulos"] as const;

export type AdminSystemSection = (typeof ADMIN_SYSTEM_SECTIONS)[number];

export function normalizeAdminSystemSection(
  value: string | null | undefined,
): AdminSystemSection {
  if (value === "products" || value === "articulos") {
    return "articulos";
  }

  return "articulos";
}

export function getAdminSystemSectionLabel(section: AdminSystemSection) {
  switch (section) {
    case "articulos":
      return "Articulos";
    default:
      return section;
  }
}
