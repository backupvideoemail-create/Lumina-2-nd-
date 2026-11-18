/**
 * Central Authentication Policy Flag Configuration.
 *
 * Google Sign-In is the sole enabled customer authentication method.
 * Phone OTP / SMS verification is disabled (PHONE_AUTH_ENABLED=false)
 * so zero SMS billing or reCAPTCHA phone flow is triggered.
 */
export const PHONE_AUTH_ENABLED: boolean =
  typeof process !== 'undefined' && process.env?.PHONE_AUTH_ENABLED === 'true';

export const AUTH_POLICY = {
  googleOnly: !PHONE_AUTH_ENABLED,
  phoneAuthEnabled: PHONE_AUTH_ENABLED
} as const;
