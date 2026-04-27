export function getLegacyArticleId(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

export function getLegacyArticleDisplayId(value: string | null | undefined) {
  return getLegacyArticleId(value).trim();
}

export function getLegacyArticleParentId(value: string | null | undefined) {
  const articleId = getLegacyArticleId(value);
  const separatorIndex = articleId.indexOf("|");

  return separatorIndex === -1 ? articleId : articleId.slice(0, separatorIndex);
}

export function getLegacyArticleRelationKey(value: string | null | undefined) {
  const parentId = getLegacyArticleParentId(value);

  // Solo para vincular registros en pantalla cuando la base heredada mezcla
  // formato fijo con variantes sin padding. No usar este valor para guardar.
  return parentId.replace(/^\s+|\s+$/g, "");
}

export function collectDistinctLegacyArticleIds(
  values: Iterable<string | null | undefined>,
) {
  const uniqueIds: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const articleId = getLegacyArticleId(value);

    if (articleId === "" || seen.has(articleId)) {
      continue;
    }

    seen.add(articleId);
    uniqueIds.push(articleId);
  }

  return uniqueIds;
}
