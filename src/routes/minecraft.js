import { Router } from "express";
import { ProfileNotFoundError } from "../lib/errors.js";
import { isValidUsername, normalizeUuid } from "../lib/validation.js";
import {
  lookupByUsername,
  lookupByUuid,
  lookupTexturesByUsername,
  lookupTexturesByUuid
} from "../services/minecraft.js";

const router = Router();

function sendUsernameNotFound(res) {
  res.status(404).json({
    success: false,
    available: null,
    error: "No Minecraft profile found",
    message: "The official Mojang API did not return a profile for this username. It cannot confirm whether the username is available for registration."
  });
}

function sendProfileWithTexture(res, profile, field) {
  const payload = {
    success: true,
    available: false,
    username: profile.username,
    uuid: profile.uuid,
    usernameSince: null,
    [field]: profile[field]
  };

  if (!profile[field]) {
    payload.message = `No ${field} texture is available for this profile`;
  }

  res.status(200).json(payload);
}

async function handleUsernameTexture(req, res, next, field) {
  const { username } = req.params;

  if (!isValidUsername(username)) {
    res.status(400).json({
      success: false,
      error: "Invalid Minecraft username"
    });
    return;
  }

  try {
    const profile = await lookupTexturesByUsername(username);
    sendProfileWithTexture(res, profile, field);
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      sendUsernameNotFound(res);
      return;
    }

    next(error);
  }
}

async function handleUuidTexture(req, res, next, field) {
  const uuid = normalizeUuid(req.params.uuid);

  if (!uuid) {
    res.status(400).json({
      success: false,
      error: "Invalid Minecraft UUID"
    });
    return;
  }

  try {
    const profile = await lookupTexturesByUuid(uuid);
    sendProfileWithTexture(res, profile, field);
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      res.status(404).json({
        success: false,
        error: "No Minecraft profile found"
      });
      return;
    }

    next(error);
  }
}

router.get("/profile/username", (req, res) => {
  res.status(400).json({
    success: false,
    error: "Minecraft username is required"
  });
});

router.get("/profile/username/:username", async (req, res, next) => {
  const { username } = req.params;

  if (!isValidUsername(username)) {
    res.status(400).json({
      success: false,
      error: "Invalid Minecraft username"
    });
    return;
  }

  try {
    const profile = await lookupByUsername(username);
    res.status(200).json({
      success: true,
      available: false,
      username: profile.username,
      uuid: profile.uuid,
      usernameSince: profile.usernameSince
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      sendUsernameNotFound(res);
      return;
    }

    next(error);
  }
});

router.get("/profile/uuid", (req, res) => {
  res.status(400).json({
    success: false,
    error: "Minecraft UUID is required"
  });
});

router.get("/profile/uuid/:uuid", async (req, res, next) => {
  const uuid = normalizeUuid(req.params.uuid);

  if (!uuid) {
    res.status(400).json({
      success: false,
      error: "Invalid Minecraft UUID"
    });
    return;
  }

  try {
    const profile = await lookupByUuid(uuid);
    res.status(200).json({
      success: true,
      available: false,
      username: profile.username,
      uuid: profile.uuid,
      usernameSince: profile.usernameSince
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      res.status(404).json({
        success: false,
        error: "No Minecraft profile found"
      });
      return;
    }

    next(error);
  }
});

router.get("/profile/username/:username/skin", (req, res, next) => {
  handleUsernameTexture(req, res, next, "skin").catch(next);
});

router.get("/profile/uuid/:uuid/skin", (req, res, next) => {
  handleUuidTexture(req, res, next, "skin").catch(next);
});

router.get("/profile/username/:username/cape", (req, res, next) => {
  handleUsernameTexture(req, res, next, "cape").catch(next);
});

router.get("/profile/uuid/:uuid/cape", (req, res, next) => {
  handleUuidTexture(req, res, next, "cape").catch(next);
});

export default router;
