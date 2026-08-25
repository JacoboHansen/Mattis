import {
  createCipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export class PushDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PushDeliveryError';
  }
}

function decodeBase64Url(value: string, field: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`${field} is not valid base64url`);
  }
  return Buffer.from(normalized, 'base64');
}

function encodeBase64Url(value: Buffer) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function requireConfig(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function publicKeyParts(publicKey: Buffer) {
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('VAPID public key must be an uncompressed P-256 key');
  }
  return {
    x: encodeBase64Url(publicKey.subarray(1, 33)),
    y: encodeBase64Url(publicKey.subarray(33, 65)),
  };
}

function createVapidPrivateKey(privateKeyValue: string, publicKeyValue: string) {
  const privateBytes = decodeBase64Url(privateKeyValue, 'VAPID private key');
  const publicBytes = decodeBase64Url(publicKeyValue, 'VAPID public key');
  if (privateBytes.length !== 32) throw new Error('VAPID private key must be 32 bytes');
  const { x, y } = publicKeyParts(publicBytes);
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: encodeBase64Url(privateBytes), x, y },
    format: 'jwk',
  });
}

function createVapidJwt(endpoint: URL) {
  const publicKeyValue =
    process.env.VAPID_PUBLIC_KEY?.trim() ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKeyValue) throw new Error('Missing VAPID_PUBLIC_KEY');
  const privateKey = createVapidPrivateKey(requireConfig('VAPID_PRIVATE_KEY'), publicKeyValue);
  const header = encodeBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = encodeBase64Url(
    Buffer.from(
      JSON.stringify({
        aud: endpoint.origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: requireConfig('VAPID_SUBJECT'),
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return {
    authorization: `vapid t=${unsigned}.${encodeBase64Url(signature)}, k=${publicKeyValue}`,
  };
}

function hkdfExtract(salt: Buffer, input: Buffer) {
  return createHmac('sha256', salt).update(input).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const output: Buffer[] = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(output).length < length; counter += 1) {
    previous = createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    output.push(previous);
  }
  return Buffer.concat(output).subarray(0, length);
}

function uncompressedPublicKey(key: KeyObject) {
  const jwk = key.export({ format: 'jwk' });
  if (!('x' in jwk) || !('y' in jwk) || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('Unable to export a P-256 public key');
  }
  return Buffer.concat([
    Buffer.from([4]),
    decodeBase64Url(jwk.x, 'public x'),
    decodeBase64Url(jwk.y, 'public y'),
  ]);
}

function publicKeyFromSubscription(value: Buffer) {
  if (value.length !== 65 || value[0] !== 4) {
    throw new Error('Push subscription key must be an uncompressed P-256 key');
  }
  return createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(value.subarray(1, 33)),
      y: encodeBase64Url(value.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

function encryptPayload(subscription: StoredPushSubscription, payload: Uint8Array) {
  const userAgentPublicKey = decodeBase64Url(subscription.p256dh, 'p256dh');
  const authSecret = decodeBase64Url(subscription.auth, 'auth');
  if (authSecret.length !== 16) throw new Error('Push auth secret must be 16 bytes');

  const { privateKey: ephemeralPrivateKey, publicKey: ephemeralPublicKey } = generateKeyPairSync(
    'ec',
    { namedCurve: 'prime256v1' },
  );
  const serverPublicKey = uncompressedPublicKey(ephemeralPublicKey);
  const ecdhSecret = diffieHellman({
    privateKey: ephemeralPrivateKey,
    publicKey: publicKeyFromSubscription(userAgentPublicKey),
  });

  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    userAgentPublicKey,
    serverPublicKey,
  ]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const paddedPayload = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const ciphertext = Buffer.concat([
    cipher.update(paddedPayload),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey,
    ciphertext,
  ]);
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: Record<string, unknown>,
) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:')
    throw new PushDeliveryError('Push endpoint is not HTTPS', 400);
  const encrypted = encryptPayload(subscription, Buffer.from(JSON.stringify(payload), 'utf8'));
  const { authorization } = createVapidJwt(endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: encrypted,
  });
  if (!response.ok) {
    throw new PushDeliveryError(`Push service returned ${response.status}`, response.status);
  }
}
