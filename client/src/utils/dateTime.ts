const POS_TIME_ZONE = "Africa/Nairobi";
const POS_LOCALE = "en-KE";

/**
 * Converts SQLite-style timestamps such as:
 * 2026-09-18 06:50:00
 *
 * into an ISO-compatible UTC timestamp:
 * 2026-09-18T06:50:00Z
 *
 * Invent POS currently stores these timestamps in UTC.
 */
const normalizeUtcDate = (value: string | Date): Date => {
  if (value instanceof Date) {
    return value;
  }

  const trimmed = value.trim();

  // If the API already supplied an explicit timezone,
  // let JavaScript parse it normally.
  if (
    trimmed.endsWith("Z") ||
    /[+-]\d{2}:\d{2}$/.test(trimmed)
  ) {
    return new Date(trimmed);
  }

  // SQLite CURRENT_TIMESTAMP values are UTC but normally arrive
  // as "YYYY-MM-DD HH:mm:ss" without a timezone marker.
  const normalized = trimmed.replace(" ", "T");

  return new Date(`${normalized}Z`);
};

export const formatDateTime = (
  value?: string | Date | null
): string => {
  if (!value) return "—";

  const date = normalizeUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(POS_LOCALE, {
    timeZone: POS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatDate = (
  value?: string | Date | null
): string => {
  if (!value) return "—";

  const date = normalizeUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(POS_LOCALE, {
    timeZone: POS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const formatTime = (
  value?: string | Date | null
): string => {
  if (!value) return "—";

  const date = normalizeUtcDate(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(POS_LOCALE, {
    timeZone: POS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const POS_TIMEZONE = POS_TIME_ZONE;

/**
 * Returns a YYYY-MM-DD value using the Invent POS business timezone.
 *
 * Use this for HTML date inputs, "today" comparisons, and other
 * business-calendar logic. Unlike formatDate/formatDateTime, the return
 * value is intentionally machine-friendly rather than display-formatted.
 */
export const getKenyaDateInputValue = (
  value?: string | Date | null
): string => {
  const date = normalizeUtcDate(value ?? new Date());

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: POS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;
  const month = parts.find(
    (part) => part.type === "month"
  )?.value;
  const day = parts.find(
    (part) => part.type === "day"
  )?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
};

