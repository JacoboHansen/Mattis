import { createHash } from 'node:crypto';

import { isUuid } from '../uuid';

// A stable Mattis namespace keeps tutor reply IDs deterministic without changing
// the UUID database contract used by messages.client_message_id.
const TUTOR_MESSAGE_NAMESPACE = 'f87a35eb-73aa-5a5d-b5e4-73ea1e4bd3f2';
const SESSION_OPENING_NAMESPACE = '99c40fcb-a5c5-5d2e-bd4e-7ed7cbfd2d4a';

function uuidBytes(value: string) {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

function formatUuid(value: Uint8Array) {
  const hex = Buffer.from(value).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function deriveNamespacedUuid(namespace: string, value: string) {
  const digest = createHash('sha1')
    .update(uuidBytes(namespace))
    .update(value, 'utf8')
    .digest()
    .subarray(0, 16);

  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  return formatUuid(digest);
}

/** Derives a stable RFC 4122 UUIDv5 for the tutor reply to a student message. */
export function deriveTutorMessageId(studentMessageId: string) {
  if (!isUuid(studentMessageId)) {
    throw new TypeError('studentMessageId must be a valid UUID.');
  }

  return deriveNamespacedUuid(
    TUTOR_MESSAGE_NAMESPACE,
    studentMessageId.toLowerCase(),
  );
}

/** Derives a stable ID for an opening message in an idempotent session create. */
export function deriveSessionOpeningMessageId(
  sessionCreationKey: string,
  sequence: number,
) {
  if (!isUuid(sessionCreationKey)) {
    throw new TypeError('sessionCreationKey must be a valid UUID.');
  }
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 1) {
    throw new TypeError('sequence must be 0 or 1.');
  }

  return deriveNamespacedUuid(
    SESSION_OPENING_NAMESPACE,
    `${sessionCreationKey.toLowerCase()}:${sequence}`,
  );
}
