const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const COMPACT_UUID_PATTERN = /^[0-9a-f]{32}$/i;
const HYPHENATED_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUsername(value) {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}

export function normalizeUuid(value) {
  if (typeof value !== "string") {
    return null;
  }

  if (!COMPACT_UUID_PATTERN.test(value) && !HYPHENATED_UUID_PATTERN.test(value)) {
    return null;
  }

  return value.replaceAll("-", "").toLowerCase();
}
