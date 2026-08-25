import { generateKeyPairSync } from 'node:crypto';

const base64Url = (value) =>
  value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateJwk = privateKey.export({ format: 'jwk' });
const publicJwk = publicKey.export({ format: 'jwk' });

if (
  typeof privateJwk.d !== 'string' ||
  typeof publicJwk.x !== 'string' ||
  typeof publicJwk.y !== 'string'
) {
  throw new Error('Could not export VAPID key material.');
}

const publicBytes = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicJwk.x, 'base64url'),
  Buffer.from(publicJwk.y, 'base64url'),
]);

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${base64Url(publicBytes)}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);
console.log('VAPID_SUBJECT=mailto:replace-with-maintainer@example.com');
