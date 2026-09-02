import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/** AES-256-GCM Feldverschlüsselung (SVNR, TOTP-Secret). Format: base64(iv).base64(tag).base64(ct) */
function key(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("FIELD_ENCRYPTION_KEY (64 hex chars) fehlt");
  return Buffer.from(hex, "hex");
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptField(enc: string | null | undefined): string | null {
  if (!enc) return null;
  // Ein beschädigter oder mit einem anderen Schlüssel verschlüsselter Wert soll die Seite nicht mit
  // einem 500er abschießen – er ist schlicht nicht lesbar und wird als leer angezeigt.
  try {
    const [iv, tag, ct] = enc.split(".").map((s) => Buffer.from(s, "base64"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
