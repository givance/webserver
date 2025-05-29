import { randomBytes } from "crypto";

/**
 * Generates a unique tracking ID for email and link tracking
 */
export function generateTrackingId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Extracts client IP address from request headers
 */
export function getClientIpAddress(request: Request): string | undefined {
  // Check various headers for IP address
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return undefined;
}

/**
 * Extracts tracking metadata from request
 */
export function extractTrackingMetadata(request: Request) {
  return {
    ipAddress: getClientIpAddress(request),
    userAgent: request.headers.get("user-agent") || undefined,
    referer: request.headers.get("referer") || undefined,
  };
}

/**
 * Creates a 1x1 transparent PNG pixel for email tracking
 */
export function createTrackingPixel(): Buffer {
  // 1x1 transparent PNG in base64
  const transparentPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  return Buffer.from(transparentPng, "base64");
}
