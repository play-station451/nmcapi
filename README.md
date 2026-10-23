# Minecraft Profile API

A small Express API for looking up Minecraft Java Edition profiles through the official Mojang services only. It is organized so more API namespaces can be mounted next to the existing `/api/minecraft` routes.

## Requirements

- Node.js 20 or newer
- npm

## Install and run

```bash
npm install
npm start
```

The server listens on port `3000` by default. To use another port:

```bash
PORT=3001 npm start
```

For development with automatic restart:

```bash
npm run dev
```

## Endpoints

### Username lookup

```bash
curl http://localhost:3000/api/minecraft/profile/username/Notch
```

Existing profile:

```json
{
  "success": true,
  "available": false,
  "username": "Notch",
  "uuid": "069a79f444e94726a5befca90e38aaf5",
  "usernameSince": null
}
```

Unresolved username:

```json
{
  "success": false,
  "available": null,
  "error": "No Minecraft profile found",
  "message": "The official Mojang API did not return a profile for this username. It cannot confirm whether the username is available for registration."
}
```

Invalid username:

```json
{
  "success": false,
  "error": "Invalid Minecraft username"
}
```

### UUID lookup

Both compact and hyphenated UUIDs are accepted.

```bash
curl http://localhost:3000/api/minecraft/profile/uuid/069a79f444e94726a5befca90e38aaf5
curl http://localhost:3000/api/minecraft/profile/uuid/069a79f4-44e9-4726-a5be-fca90e38aaf5
```

Existing profile:

```json
{
  "success": true,
  "available": false,
  "username": "Notch",
  "uuid": "069a79f444e94726a5befca90e38aaf5",
  "usernameSince": null
}
```

Unknown UUID:

```json
{
  "success": false,
  "error": "No Minecraft profile found"
}
```

Invalid UUID:

```json
{
  "success": false,
  "error": "Invalid Minecraft UUID"
}
```

### Skin and cape lookup

Fetch the current skin or cape texture for a profile by username or UUID. Texture URLs point to Mojang's official texture host and are always returned over HTTPS.

```bash
curl http://localhost:3000/api/minecraft/profile/username/jeb_/skin
curl http://localhost:3000/api/minecraft/profile/username/jeb_/cape
curl http://localhost:3000/api/minecraft/profile/uuid/853c80ef3c3749fdaa49938b674adae6/skin
curl http://localhost:3000/api/minecraft/profile/uuid/853c80ef3c3749fdaa49938b674adae6/cape
```

Existing profile with a skin:

```json
{
  "success": true,
  "available": false,
  "username": "Notch",
  "uuid": "069a79f444e94726a5befca90e38aaf5",
  "usernameSince": null,
  "skin": {
    "url": "https://textures.minecraft.net/texture/292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680",
    "variant": "CLASSIC"
  }
}
```

`variant` is `CLASSIC` or `SLIM`. An unrecognized upstream model value is returned as `null`.

Existing profile with a cape:

```json
{
  "success": true,
  "available": false,
  "username": "jeb_",
  "uuid": "853c80ef3c3749fdaa49938b674adae6",
  "usernameSince": null,
  "cape": {
    "url": "https://textures.minecraft.net/texture/9e507afc56359978a3eb3e32367042b853cddd0995d17d0da995662913fb00f7"
  }
}
```

Existing profile without the requested texture:

```json
{
  "success": true,
  "available": false,
  "username": "Notch",
  "uuid": "069a79f444e94726a5befca90e38aaf5",
  "usernameSince": null,
  "cape": null,
  "message": "No cape texture is available for this profile"
}
```

## Status codes

| Status | Meaning |
| --- | --- |
| 200 | Profile, skin, or cape found |
| 400 | Invalid username, invalid UUID, missing route parameter, or malformed request |
| 404 | No profile found, or unknown route |
| 429 | This API's per-client rate limit was exceeded |
| 502 | Mojang returned an unexpected or invalid response |
| 503 | Mojang is unavailable, timed out, or rate limited the request |

Upstream failures:

```json
{
  "success": false,
  "error": "Minecraft profile service temporarily unavailable"
}
```

```json
{
  "success": false,
  "error": "Minecraft profile service returned an invalid response"
}
```

```json
{
  "success": false,
  "error": "Minecraft profile service rate limit reached"
}
```

## Data availability

- Username lookup uses `https://api.mojang.com/users/profiles/minecraft/{username}`.
- UUID lookup, skin lookup, and cape lookup use `https://sessionserver.mojang.com/session/minecraft/profile/{uuid}`.
- Skin and cape data are read from the profile's `textures` property. The API verifies the texture's `profileId`, restricts texture URLs to `textures.minecraft.net`, and returns them over HTTPS.
- Skin `variant` is `CLASSIC` or `SLIM`, or `null` if the upstream model value is unrecognized. Cape entries contain only a `url`.
- If a profile has no skin or cape texture property, the corresponding field is `null` and the response includes an explanatory message.
- Skin and cape lookups share the same cached texture response, so requesting both for the same profile uses one official Mojang request per cache window.
- Username texture lookup resolves the username first, so an uncached lookup can require one extra official Mojang request.
- `usernameSince` is always `null`. Mojang does not currently provide a supported public endpoint for Java Edition username history. The legacy name-history endpoint returns 404 and is not used.
- A missing profile does not prove that a username can be registered. Mojang's name-availability endpoint requires authentication, which this API does not implement. When Mojang cannot resolve a username, `available` is `null` and the response explains the limitation.
- A found profile always has `available: false` because its current username is in use.

## Rate limiting

The API allows 60 requests per minute per client IP. Exceeding it returns status `429` with a `Retry-After` header.

## Project structure

```text
package.json
src/
  app.js
  server.js
  lib/
    errors.js
    validation.js
  middleware/
    errorHandler.js
    rateLimit.js
  routes/
    minecraft.js
  services/
    minecraft.js
```
