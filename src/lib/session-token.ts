export const SESSION_COOKIE_NAME = "cf_session";

export interface SessionPayload {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  exp: number;
}

const DEFAULT_DEV_SECRET = "corta-fecha-distrimarcas-session-secret-2026";

function getSecret(): string {
  return process.env.AUTH_SECRET || DEFAULT_DEV_SECRET;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

let cachedSecret: string | null = null;
let cachedKeyPromise: Promise<CryptoKey> | null = null;

async function importHmacKey() {
  const secret = getSecret();
  if (cachedKeyPromise && cachedSecret === secret) {
    return cachedKeyPromise;
  }
  const enc = new TextEncoder();
  cachedSecret = secret;
  cachedKeyPromise = crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKeyPromise;
}

export async function signSessionToken(
  payload: Omit<SessionPayload, "exp">,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(fullPayload))
  );
  const key = await importHmacKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const encodedSig = toBase64Url(new Uint8Array(signature));
  return `${encodedPayload}.${encodedSig}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const key = await importHmacKey();
    const sigBytes = fromBase64Url(encodedSig);
    const sigArrayBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigArrayBuffer,
      new TextEncoder().encode(encodedPayload)
    );
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const parsed = JSON.parse(payloadJson) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
