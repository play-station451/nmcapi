export class ProfileNotFoundError extends Error {
  constructor() {
    super("No Minecraft profile found");
    this.name = "ProfileNotFoundError";
  }
}

export class UpstreamError extends Error {
  constructor(reason, options = {}) {
    super("Minecraft profile service request failed");
    this.name = "UpstreamError";
    this.reason = reason;
    this.retryAfter = options.retryAfter ?? null;
  }
}
