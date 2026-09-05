import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

// Read from stdin so the password is never included in process arguments.
const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (!password || Buffer.byteLength(password, "utf8") > 128) {
  process.stderr.write("Podaj hasło przez standardowe wejście (1–128 bajtów UTF-8).\n");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
process.stdout.write(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}\n`);
