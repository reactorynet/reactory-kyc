import crypto from 'crypto';
import logger from '@reactory/server-core/logging';

/**
 * Webhook Signature Verification Utilities
 */

export interface WebhookVerificationOptions {
  algorithm?: 'sha256' | 'sha1' | 'sha512';
  encoding?: 'hex' | 'base64';
  prefix?: string; // Some providers prefix signatures (e.g., "sha256=")
}

/**
 * Verify webhook signature using HMAC
 */
export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  options: WebhookVerificationOptions = {}
): boolean {
  try {
    const {
      algorithm = 'sha256',
      encoding = 'hex',
      prefix = ''
    } = options;

    // Remove prefix if present
    const cleanSignature = prefix ? signature.replace(prefix, '') : signature;

    // Compute expected signature
    const computedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest(encoding as any);

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Verify Trulio webhook signature
 * Trulio uses SHA-256 HMAC with hex encoding
 */
export function verifyTrulioSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyHmacSignature(payload, signature, secret, {
    algorithm: 'sha256',
    encoding: 'hex'
  });
}

/**
 * Verify Onfido webhook signature
 * Onfido uses SHA-256 HMAC with hex encoding and 'sha256=' prefix
 */
export function verifyOnfidoSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyHmacSignature(payload, signature, secret, {
    algorithm: 'sha256',
    encoding: 'hex',
    prefix: 'sha256='
  });
}

/**
 * Generate webhook signature for testing
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  secret: string,
  options: WebhookVerificationOptions = {}
): string {
  const {
    algorithm = 'sha256',
    encoding = 'hex',
    prefix = ''
  } = options;

  const signature = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest(encoding as any);

  return prefix ? `${prefix}${signature}` : signature;
}

/**
 * Validate webhook timestamp to prevent replay attacks
 */
export function validateWebhookTimestamp(
  timestamp: number,
  maxAgeSeconds: number = 300 // 5 minutes default
): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  const age = currentTime - timestamp;

  if (age < 0) {
    logger.warn('Webhook timestamp is in the future');
    return false;
  }

  if (age > maxAgeSeconds) {
    logger.warn(`Webhook timestamp too old: ${age}s (max: ${maxAgeSeconds}s)`);
    return false;
  }

  return true;
}

/**
 * Parse webhook signature header
 * Handles various formats like "sha256=abc123" or "v1=abc123,t=123456"
 */
export function parseSignatureHeader(
  header: string
): Record<string, string> {
  const result: Record<string, string> = {};

  // Split by comma for formats like Stripe's "v1=abc,t=123"
  const parts = header.split(',');

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }

  // If no key-value pairs found, treat whole string as signature
  if (Object.keys(result).length === 0) {
    result.signature = header;
  }

  return result;
}

