import { createHash } from "node:crypto";

/** SHA-256(ip + salt) — stored instead of raw IPs so tool_lookups holds no PII (§5). */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}
