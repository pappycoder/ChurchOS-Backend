/**
 * @file two-factor.util.ts
 * @description Pure helpers for email-OTP two-factor authentication.
 *
 * Generates a random 6-digit code, hashes it (SHA-256) so only the digest is
 * ever persisted in Redis, and verifies a submitted code against that digest
 * using a constant-time comparison.
 *
 * @module profile/two-factor.util
 * @since 1.0.0
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const CODE_LENGTH = 6;

/**
 * Generates a random 6-digit numeric code (left-padded with zeros).
 *
 * @returns A numeric string of length CODE_LENGTH
 */
export function generateTwoFactorCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * Hashes a plaintext code with SHA-256 and returns the hex digest.
 * Only this digest should ever be stored.
 *
 * @param code - The plaintext 6-digit code
 * @returns SHA-256 hex digest
 */
export function hashTwoFactorCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Compares a submitted code against a stored digest in constant time.
 *
 * @param code - The plaintext code supplied by the user
 * @param digest - The stored SHA-256 hex digest
 * @returns True when the code matches the digest
 */
export function verifyTwoFactorCode(code: string, digest: string): boolean {
  const candidate = Buffer.from(hashTwoFactorCode(code), 'hex');
  const expected = Buffer.from(digest, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}

/**
 * Masks an email address for safe display (e.g. j***@example.com).
 *
 * @param email - The address to mask
 * @returns A masked rendering of the address
 */
export function maskTwoFactorEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return email;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}${domain}`;
}
