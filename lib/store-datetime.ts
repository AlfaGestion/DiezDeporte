const STORE_SQL_OFFSET_MINUTES = Number(
  process.env.APP_SQL_LOCAL_OFFSET_MINUTES || "-180",
);

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function parseSqlServerLocalDate(
  value: string | Date | null | undefined,
) {
  const date = normalizeDate(value);

  if (!date) {
    return null;
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes() - STORE_SQL_OFFSET_MINUTES,
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function formatSqlServerLocalDateTime(
  value: string | Date | null | undefined,
  locale = "es-AR",
) {
  const date = parseSqlServerLocalDate(value);

  if (!date) {
    return "Sin dato";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
