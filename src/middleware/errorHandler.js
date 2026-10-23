import { UpstreamError } from "../lib/errors.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: "Route not found"
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof URIError) {
    res.status(400).json({
      success: false,
      error: "Malformed request"
    });
    return;
  }

  if (error instanceof UpstreamError) {
    if (error.reason === "rate_limited") {
      const retryAfter = error.retryAfter ?? 30;
      res.setHeader("Retry-After", String(retryAfter));
      res.status(503).json({
        success: false,
        error: "Minecraft profile service rate limit reached"
      });
      return;
    }

    if (error.reason === "invalid_response") {
      res.status(502).json({
        success: false,
        error: "Minecraft profile service returned an invalid response"
      });
      return;
    }

    res.status(503).json({
      success: false,
      error: "Minecraft profile service temporarily unavailable"
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
}
