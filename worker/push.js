/**
 * Minimal Web Push sender for Cloudflare Workers (no dependencies).
 * Implements RFC 8291 (aes128gcm message encryption) + RFC 8292 (VAPID).
 * Apple's push service (web.push.apple.com) accepts standard Web Push for
 * home-screen PWAs, so this works for iOS without FCM.
 */

const te = new TextEncoder();

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, length);
}

/** Import the app's VAPID private key (raw base64url scalar) as an ECDSA P-256 signing key. */
async function importVapidPrivateKey(publicB64url, privateB64url) {
  const pub = b64urlToBytes(publicB64url); // 65 bytes, uncompressed point 0x04 || x || y
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateB64url,
    ext: true
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidHeaders(endpoint, publicKey, privateKey, subject) {
  const { origin } = new URL(endpoint);
  const header = bytesToB64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(te.encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  })));
  const signingInput = te.encode(`${header}.${payload}`);
  const key = await importVapidPrivateKey(publicKey, privateKey);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput));
  const jwt = `${header}.${payload}.${bytesToB64url(sig)}`;
  return { Authorization: `vapid t=${jwt}, k=${publicKey}` };
}

/** Encrypt a payload per RFC 8291 aes128gcm for one subscription. */
async function encryptPayload(payloadText, p256dhB64url, authB64url) {
  const clientPub = b64urlToBytes(p256dhB64url); // 65 bytes
  const authSecret = b64urlToBytes(authB64url);  // 16 bytes

  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey));

  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, localKeys.privateKey, 256));

  // PRK = HKDF(auth, ecdh, "WebPush: info" || 0x00 || clientPub || serverPub, 32)
  const prkInfo = concat(te.encode('WebPush: info\0'), clientPub, localPubRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, prkInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  // Body header: salt(16) | rs(4) | idlen(1) | keyid(=server public key, 65)
  const rs = 4096;
  const headerBlock = concat(
    salt,
    new Uint8Array([(rs >> 24) & 0xff, (rs >> 16) & 0xff, (rs >> 8) & 0xff, rs & 0xff]),
    new Uint8Array([localPubRaw.length]),
    localPubRaw
  );

  const plaintext = concat(te.encode(payloadText), new Uint8Array([2])); // 0x02 = last record padding delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  return concat(headerBlock, ciphertext);
}

/**
 * Send one push. Returns the HTTP status from the push service.
 * 404/410 mean the subscription is dead and should be deleted.
 */
export async function sendWebPush(subscription, payloadText, env) {
  const { endpoint, keys } = subscription;
  const body = await encryptPayload(payloadText, keys.p256dh, keys.auth);
  const vapid = await vapidHeaders(endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, 'mailto:andrew.marnoch@gmail.com');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapid,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body
  });
  return res.status;
}
