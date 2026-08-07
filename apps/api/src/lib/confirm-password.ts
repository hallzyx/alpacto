import { timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";

/** Compare user-provided password to env secret (constant-time when lengths match). */
export function assertConfirmPassword(
  expected: string,
  provided: string | undefined,
  opts?: { missingMessage?: string; invalidMessage?: string },
): void {
  const secret = expected.trim();
  if (!secret) return;

  const given = (provided ?? "").trim();
  if (!given) {
    throw new ApiError(403, opts?.missingMessage ?? "Confirmation password required");
  }

  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiError(403, opts?.invalidMessage ?? "Invalid confirmation password");
  }
}
