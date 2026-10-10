import crypto from 'crypto';

interface ServiceAccountConfig {
  client_email: string;
  private_key: string;
}

export interface GooglePlayVerificationResult {
  verified: boolean;
  orderId?: string;
  purchaseState?: number;
  acknowledgementState?: number;
  rawDetails?: any;
  error?: string;
}

class GooglePlayService {
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private getCredentials(): ServiceAccountConfig | null {
    const jsonStr = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!jsonStr) return null;
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key
        };
      }
    } catch {
      // JSON parse error
    }
    return null;
  }

  private async getAccessToken(creds: ServiceAccountConfig): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60) {
      return this.cachedToken.token;
    }

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const signature = crypto.createSign('RSA-SHA256')
      .update(`${header}.${claim}`)
      .sign(creds.private_key, 'base64url');

    const assertion = `${header}.${claim}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Failed to obtain Google Play OAuth token: ${tokenRes.status} ${errText}`);
    }

    const data = await tokenRes.json();
    this.cachedToken = {
      token: data.access_token,
      expiresAt: now + (data.expires_in || 3600)
    };
    return data.access_token;
  }

  /**
   * Authoritatively verifies an in-app product or subscription purchase token
   * directly against the official Google Play Developer API (androidpublisher.googleapis.com).
   */
  async verifyPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
    isSubscription: boolean
  ): Promise<GooglePlayVerificationResult> {
    const creds = this.getCredentials();
    if (!creds) {
      // In development mode, check if explicitly bypassed with mock or require strict config
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_PLAY_VERIFY === 'true') {
        return {
          verified: true,
          orderId: `dev_${Date.now()}`,
          purchaseState: 0,
          error: 'DEVELOPMENT_MODE_BYPASS'
        };
      }
      return {
        verified: false,
        error: 'Backend missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON. Official Google Play API verification requires service account credentials with androidpublisher permission.'
      };
    }

    try {
      const accessToken = await this.getAccessToken(creds);

      if (isSubscription) {
        // First try Subscriptions v2 API
        const urlV2 = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
        const resV2 = await fetch(urlV2, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (resV2.ok) {
          const subData = await resV2.json();
          // subscriptionState: SUBSCRIPTION_STATE_ACTIVE (1) or SUBSCRIPTION_STATE_IN_GRACE_PERIOD (2)
          const state = subData.subscriptionState;
          const isActive = state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 1;
          if (!isActive) {
            return {
              verified: false,
              rawDetails: subData,
              error: `Subscription is not active. State: ${state}`
            };
          }
          return {
            verified: true,
            orderId: subData.latestOrderId,
            rawDetails: subData
          };
        }

        // Fallback to Subscriptions v1 API
        const urlV1 = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;
        const resV1 = await fetch(urlV1, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!resV1.ok) {
          const errText = await resV1.text();
          return {
            verified: false,
            error: `Google Play API subscription verification failed: HTTP ${resV1.status} - ${errText}`
          };
        }

        const dataV1 = await resV1.json();
        // paymentState: 0 = Payment pending, 1 = Payment received, 2 = Free trial
        const isValid = dataV1.paymentState === 1 || dataV1.paymentState === 2;
        if (!isValid) {
          return {
            verified: false,
            rawDetails: dataV1,
            error: `Subscription paymentState is invalid: ${dataV1.paymentState}`
          };
        }

        return {
          verified: true,
          orderId: dataV1.orderId,
          rawDetails: dataV1
        };
      } else {
        // Standard In-App One-Time Product
        const urlProduct = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;
        const resProd = await fetch(urlProduct, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!resProd.ok) {
          const errText = await resProd.text();
          return {
            verified: false,
            error: `Google Play API product verification failed: HTTP ${resProd.status} - ${errText}`
          };
        }

        const prodData = await resProd.json();
        // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
        if (prodData.purchaseState !== 0) {
          return {
            verified: false,
            rawDetails: prodData,
            error: `Purchase state is not Purchased (state: ${prodData.purchaseState})`
          };
        }

        return {
          verified: true,
          orderId: prodData.orderId,
          purchaseState: prodData.purchaseState,
          acknowledgementState: prodData.acknowledgementState,
          rawDetails: prodData
        };
      }
    } catch (err: any) {
      return {
        verified: false,
        error: `Network or crypto error verifying Google Play purchase: ${err.message}`
      };
    }
  }
}

export const googlePlayService = new GooglePlayService();
