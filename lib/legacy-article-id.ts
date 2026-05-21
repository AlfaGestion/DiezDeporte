export function getLegacyArticleId(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

type LegacyArticleGroupingInput =
  | string
  | {
      articleId: string | null | undefined;
      procedencia?: string | null | undefined;
    };

function resolveLegacyArticleGroupingInput(input: LegacyArticleGroupingInput) {
  if (typeof input === "string") {
    return {
      articleId: input,
      procedencia: "",
    };
  }

  return {
    articleId: input.articleId,
    procedencia: input.procedencia || "",
  };
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

export function getLegacyArticleProcedenciaParentId(
  value: string | null | undefined,
) {
  const procedencia = getLegacyArticleId(value);
  const separatorIndex = procedencia.indexOf("|");

  return separatorIndex === -1
    ? procedencia
    : procedencia.slice(0, separatorIndex);
}

export function getLegacyArticleVariantSegments(
  input: LegacyArticleGroupingInput,
) {
  const { articleId, procedencia } = resolveLegacyArticleGroupingInput(input);
  const procedenciaSegments = getLegacyArticleId(procedencia)
    .split("|")
    .slice(1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "-");

  if (procedenciaSegments.length > 0) {
    return procedenciaSegments;
  }

  return getLegacyArticleId(articleId)
    .split("|")
    .slice(1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "-");
}

export function getLegacyArticleGroupingParentId(
  input: LegacyArticleGroupingInput,
) {
  const { articleId, procedencia } = resolveLegacyArticleGroupingInput(input);
  return (
    getLegacyArticleProcedenciaParentId(procedencia) ||
    getLegacyArticleParentId(articleId)
  );
}

export function getLegacyArticleGroupingRelationKey(
  input: LegacyArticleGroupingInput,
) {
  const parentId = getLegacyArticleGroupingParentId(input);

  // Solo para vincular registros en pantalla cuando la base heredada mezcla
  // formato fijo con variantes sin padding. No usar este valor para guardar.
  return parentId.replace(/^\s+|\s+$/g, "");
}

export function isLegacyArticleGroupedChild(input: LegacyArticleGroupingInput) {
  const { articleId, procedencia } = resolveLegacyArticleGroupingInput(input);
  const ownRelationKey = getLegacyArticleRelationKey(articleId);
  const groupRelationKey = getLegacyArticleGroupingRelationKey({
    articleId,
    procedencia,
  });

  return (
    getLegacyArticleId(articleId).includes("|") ||
    (Boolean(groupRelationKey) && groupRelationKey !== ownRelationKey)
  );
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
