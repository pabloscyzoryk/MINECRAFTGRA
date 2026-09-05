import { randomInt, scrypt, timingSafeEqual } from "node:crypto";

export const WORLD_ADMIN_TTL = 90_000;
const HASH_FORMAT = /^scrypt\$([a-f\d]{32})\$([a-f\d]{64})$/i;
export function configuredWorldPassword(hash: unknown): hash is string {
  return typeof hash === "string" && HASH_FORMAT.test(hash);
}
/** The salt is 16 decoded bytes, matching the administrator's offline generator. */
export async function verifyWorldPassword(password: unknown, hash: unknown): Promise<boolean> {
  if (
    !configuredWorldPassword(hash) ||
    typeof password !== "string" ||
    !password.length ||
    Buffer.byteLength(password, "utf8") > 128
  )
    return false;
  const match = HASH_FORMAT.exec(hash)!;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(match[1], "hex"), 32, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
  return timingSafeEqual(derived, Buffer.from(match[2], "hex"));
}
export function validWorldSeed(seed: unknown): seed is number | null {
  return (
    seed === null ||
    (typeof seed === "number" &&
      Number.isInteger(seed) &&
      seed >= -2147483648 &&
      seed <= 2147483647)
  );
}
export function chooseWorldSeed(seed: number | null): number {
  return seed === null ? randomInt(-2147483648, 2147483648) : seed;
}
