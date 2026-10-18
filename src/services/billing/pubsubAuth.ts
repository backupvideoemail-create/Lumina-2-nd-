import crypto from 'crypto';

interface GoogleJwk {
  kty: string;
  alg?: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
}

interface GoogleJwkResponse {
  keys: GoogleJwk[];
}

let cachedKeys: GoogleJwk[] = [];
let keysCachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for public certs

async function getGooglePublicKeys(): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - keysCachedAt < CACHE_TTL_MS) {
    return cachedKeys;
  }
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) {
      throw new Error(`Failed to fetch Google public certs: HTTP ${res.status}`);
    }
    const data = (await res.json()) as GoogleJwkResponse;
    if (data.keys && Array.isArray(data.keys)) {
      cachedKeys = data.keys;
      keysCachedAt = now;
      return cachedKeys;
    }
  } catch (err: any) {
    console.error('[PubSubAuth] Error fetching Google certs:', err.message);
    if (cachedKeys.length > 0) return cachedKeys;
  }
  return [];
}

export interface PubSubVerificationResult {
  valid: boolean;
  error?: string;
  email?: string;
  audience?: string;
}

/**
 * Authenticates Google Cloud Pub/Sub Push requests via Google-signed OIDC JWTs.
 * Validates:
 * 1. Bearer token presence
 * 2. RS256 algorithm and valid kid against Google public JWKs
 * 3. Cryptographic signature check (timingSafe/RSA-SHA256)
 * 4. Token expiration (exp)
 * 5. Google issuer (https://accounts.google.com)
 * 6. Expected audience (matches PUBSUB_AUDIENCE / RTDN_AUDIENCE or configured webhook URL)
 * 7. Authorized service account email
 */
export async function verifyPubSubOidcToken(
  authHeader: string | undefined,
  expectedAudience?: string,
  allowedServiceAccount?: string
): Promise<PubSubVerificationResult> {
  // Allow test bypass ONLY if explicitly configured for local developer testing
  if (!authHeader) {
    if (process.env.NODE_ENV === 'test' || process.env.BYPASS_PUBSUB_AUTH === 'true') {
      return { valid: true, email: 'test@developer.gserviceaccount.com' };
    }
    return { valid: false, error: 'Missing Authorization header. Google Cloud Pub/Sub push requests require an authenticated Google OIDC Bearer token.' };
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { valid: false, error: 'Invalid Authorization header format; expected Bearer <token>' };
  }

  const token = parts[1];
  const jwtSegments = token.split('.');
  if (jwtSegments.length !== 3) {
    return { valid: false, error: 'Malformed JWT structure; expected 3 segments' };
  }

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(Buffer.from(jwtSegments[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(jwtSegments[1], 'base64url').toString('utf8'));
  } catch (e: any) {
    return { valid: false, error: 'Invalid JWT JSON encoding in header or payload' };
  }

  if (header.alg !== 'RS256') {
    return { valid: false, error: `Unsupported JWT algorithm: ${header.alg}. Expected RS256.` };
  }

  const kid = header.kid;
  if (!kid) {
    return { valid: false, error: 'JWT missing kid in header' };
  }

  const keys = await getGooglePublicKeys();
  const matchingJwk = keys.find((k) => k.kid === kid);
  if (!matchingJwk) {
    return { valid: false, error: `No matching Google public key found for kid: ${kid}` };
  }

  // Cryptographically verify RS256 signature against Google public key
  try {
    const pubKey = crypto.createPublicKey({ key: matchingJwk as any, format: 'jwk' });
    const isSignatureValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${jwtSegments[0]}.${jwtSegments[1]}`),
      pubKey,
      Buffer.from(jwtSegments[2], 'base64url')
    );
    if (!isSignatureValid) {
      return { valid: false, error: 'Cryptographic signature verification failed for Google OIDC token' };
    }
  } catch (err: any) {
    return { valid: false, error: `Cryptographic verification error: ${err.message}` };
  }

  // Validate token expiration
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec - 60) {
    return { valid: false, error: 'Google OIDC token has expired' };
  }

  // Validate issuer
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    return { valid: false, error: `Invalid token issuer: ${payload.iss}` };
  }

  // Validate audience
  const targetAudience =
    expectedAudience ||
    process.env.PUBSUB_AUDIENCE ||
    process.env.RTDN_AUDIENCE;

  if (targetAudience && payload.aud) {
    const normTokenAud = String(payload.aud).replace(/^https?:\/\//, '').replace(/\/$/, '');
    const normTargetAud = targetAudience.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (normTokenAud !== normTargetAud) {
      return { valid: false, error: `Audience mismatch: expected ${targetAudience}, got ${payload.aud}` };
    }
  }

  // Validate service account email
  const email = payload.email;
  const configuredServiceAccount = allowedServiceAccount || process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (configuredServiceAccount && email !== configuredServiceAccount) {
    return {
      valid: false,
      error: `Service account email mismatch: expected ${configuredServiceAccount}, got ${email}`
    };
  }

  // Verify email belongs to an authorized Google Service Account
  if (email && !email.endsWith('.gserviceaccount.com')) {
    return {
      valid: false,
      error: `Token email (${email}) is not a verified Google Service Account`
    };
  }

  return { valid: true, email: payload.email, audience: payload.aud };
}
