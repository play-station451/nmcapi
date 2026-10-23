import { ProfileNotFoundError, UpstreamError } from "../lib/errors.js";
import { isValidUsername, normalizeUuid } from "../lib/validation.js";

const USERNAME_ENDPOINT = "https://api.mojang.com/users/profiles/minecraft/";
const SESSION_ENDPOINT = "https://sessionserver.mojang.com/session/minecraft/profile/";
const TEXTURE_HOST = "textures.minecraft.net";
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30000;
const CACHE_MAX_ENTRIES = 1000;

const profileCache = new Map();
const textureCache = new Map();

function isTimeout(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

function parseRetryAfter(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

async function requestJson(url) {
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch (error) {
    throw new UpstreamError(isTimeout(error) ? "timeout" : "network");
  }

  if (response.status === 204 || response.status === 404) {
    return { found: false, body: null };
  }

  if (response.status === 429) {
    throw new UpstreamError("rate_limited", {
      retryAfter: parseRetryAfter(response.headers.get("retry-after"))
    });
  }

  if (!response.ok) {
    throw new UpstreamError(response.status >= 500 ? "unavailable" : "invalid_response");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new UpstreamError("invalid_response");
  }

  try {
    return { found: true, body: await response.json() };
  } catch (error) {
    throw new UpstreamError(isTimeout(error) ? "timeout" : "invalid_response");
  }
}

function parseProfile(body, expected) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UpstreamError("invalid_response");
  }

  const uuid = normalizeUuid(body.id);
  const username = body.name;

  if (!uuid || !isValidUsername(username)) {
    throw new UpstreamError("invalid_response");
  }

  if (expected.uuid && uuid !== expected.uuid) {
    throw new UpstreamError("invalid_response");
  }

  if (expected.username && username.toLowerCase() !== expected.username.toLowerCase()) {
    throw new UpstreamError("invalid_response");
  }

  return {
    username,
    uuid,
    usernameSince: null
  };
}

function cloneProfile(profile) {
  return {
    username: profile.username,
    uuid: profile.uuid,
    usernameSince: profile.usernameSince
  };
}

function normalizeSkinVariant(metadata) {
  if (metadata === undefined) {
    return "CLASSIC";
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  if (metadata.model === undefined) {
    return "CLASSIC";
  }

  if (typeof metadata.model !== "string") {
    return null;
  }

  const model = metadata.model.toLowerCase();

  if (model === "slim") {
    return "SLIM";
  }

  if (model === "classic") {
    return "CLASSIC";
  }

  return null;
}

function normalizeTextureUrl(value) {
  if (typeof value !== "string") {
    throw new UpstreamError("invalid_response");
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new UpstreamError("invalid_response");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UpstreamError("invalid_response");
  }

  if (url.hostname.toLowerCase() !== TEXTURE_HOST) {
    throw new UpstreamError("invalid_response");
  }

  if (!url.pathname.startsWith("/texture/") || url.pathname.length <= "/texture/".length) {
    throw new UpstreamError("invalid_response");
  }

  return `https://${TEXTURE_HOST}${url.pathname}`;
}

function parseSkinTexture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UpstreamError("invalid_response");
  }

  return {
    url: normalizeTextureUrl(value.url),
    variant: normalizeSkinVariant(value.metadata)
  };
}

function parseCapeTexture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UpstreamError("invalid_response");
  }

  return {
    url: normalizeTextureUrl(value.url)
  };
}

function parseTextures(body, uuid) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UpstreamError("invalid_response");
  }

  if (body.properties === undefined) {
    return { skin: null, cape: null };
  }

  if (!Array.isArray(body.properties)) {
    throw new UpstreamError("invalid_response");
  }

  const textureProperty = body.properties.find((property) => {
    return property && typeof property === "object" && property.name === "textures";
  });

  if (!textureProperty) {
    return { skin: null, cape: null };
  }

  if (typeof textureProperty.value !== "string") {
    throw new UpstreamError("invalid_response");
  }

  let textureData;

  try {
    textureData = JSON.parse(Buffer.from(textureProperty.value, "base64").toString("utf8"));
  } catch {
    throw new UpstreamError("invalid_response");
  }

  if (!textureData || typeof textureData !== "object" || Array.isArray(textureData)) {
    throw new UpstreamError("invalid_response");
  }

  if (textureData.profileId !== undefined) {
    const textureUuid = normalizeUuid(textureData.profileId);

    if (!textureUuid || textureUuid !== uuid) {
      throw new UpstreamError("invalid_response");
    }
  }

  const textures = textureData.textures;

  if (!textures || typeof textures !== "object" || Array.isArray(textures)) {
    return { skin: null, cape: null };
  }

  return {
    skin: textures.SKIN ? parseSkinTexture(textures.SKIN) : null,
    cape: textures.CAPE ? parseCapeTexture(textures.CAPE) : null
  };
}

function cloneTextureProfile(profile) {
  return {
    username: profile.username,
    uuid: profile.uuid,
    skin: profile.skin ? { ...profile.skin } : null,
    cape: profile.cape ? { ...profile.cape } : null
  };
}

function readCache(store, key) {
  const entry = store.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

function writeCache(store, key, value) {
  if (store.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();

    for (const [cachedKey, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(cachedKey);
      }
    }

    while (store.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      store.delete(oldestKey);
    }
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function cacheProfile(profile) {
  writeCache(profileCache, `uuid:${profile.uuid}`, profile);
  writeCache(profileCache, `username:${profile.username.toLowerCase()}`, profile);
}

function cacheTextureProfile(profile) {
  writeCache(textureCache, `uuid:${profile.uuid}`, profile);
  writeCache(textureCache, `username:${profile.username.toLowerCase()}`, profile);
}

export async function lookupByUsername(username) {
  const cacheKey = `username:${username.toLowerCase()}`;
  const cached = readCache(profileCache, cacheKey);

  if (cached) {
    return cloneProfile(cached);
  }

  const { found, body } = await requestJson(`${USERNAME_ENDPOINT}${encodeURIComponent(username)}`);

  if (!found) {
    throw new ProfileNotFoundError();
  }

  const profile = parseProfile(body, { username });
  cacheProfile(profile);

  return cloneProfile(profile);
}

export async function lookupByUuid(uuid) {
  const cacheKey = `uuid:${uuid}`;
  const cached = readCache(profileCache, cacheKey);

  if (cached) {
    return cloneProfile(cached);
  }

  const { found, body } = await requestJson(`${SESSION_ENDPOINT}${uuid}`);

  if (!found) {
    throw new ProfileNotFoundError();
  }

  const profile = parseProfile(body, { uuid });
  cacheProfile(profile);

  return cloneProfile(profile);
}

export async function lookupTexturesByUuid(uuid) {
  const cacheKey = `uuid:${uuid}`;
  const cached = readCache(textureCache, cacheKey);

  if (cached) {
    return cloneTextureProfile(cached);
  }

  const { found, body } = await requestJson(`${SESSION_ENDPOINT}${uuid}`);

  if (!found) {
    throw new ProfileNotFoundError();
  }

  const profile = parseProfile(body, { uuid });
  const textures = parseTextures(body, profile.uuid);
  const textureProfile = {
    username: profile.username,
    uuid: profile.uuid,
    skin: textures.skin,
    cape: textures.cape
  };

  cacheTextureProfile(textureProfile);

  return cloneTextureProfile(textureProfile);
}

export async function lookupTexturesByUsername(username) {
  const cacheKey = `username:${username.toLowerCase()}`;
  const cached = readCache(textureCache, cacheKey);

  if (cached) {
    return cloneTextureProfile(cached);
  }

  const profile = await lookupByUsername(username);

  return lookupTexturesByUuid(profile.uuid);
}
