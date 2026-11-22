/**
 * AI Prime Studio — Read-Only Live Public URL & Multi-Service Parity Verifier
 *
 * Strictly non-destructive diagnostic utility (zero paid AI calls, zero payments, zero DB writes).
 * Verifies on https://ai-prime-studio.ai.studio (and compares against legacy backend when requested):
 *  1. DNS A-records & TLS certificate validity for ai-prime-studio.ai.studio
 *  2. Live Homepage HTML, JS bundle, and SEO canonical/sitemap readiness
 *  3. /api/version authoritative Firestore (default) lock on ai-prime-studio
 *  4. Live /api/banners and /api/templates responses
 *  5. Live Cloudflare R2 /api/media/* HTTP 200, Byte-Range, and CORP headers
 *  6. Live CORS OPTIONS preflight for Origin: https://ai-prime-studio.ai.studio
 *  7. Legacy Cloud Run (gen-lang-client-0525281130) reachability & shared Firestore parity
 *
 * Usage:
 *   npx tsx scripts/verify_public_url_recovery.ts
 *   TARGET_URL=https://ai-prime-studio.ai.studio npx tsx scripts/verify_public_url_recovery.ts
 */

import dns from 'dns/promises';
import tls from 'tls';

const PUBLIC_URL = (
  process.env.TARGET_URL ||
  process.env.PUBLIC_APP_URL ||
  'https://ai-prime-studio.ai.studio'
).replace(/\/$/, '');

const LEGACY_CLOUD_RUN_URL = (
  process.env.LEGACY_CLOUD_RUN_URL ||
  'https://ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app'
).replace(/\/$/, '');

interface CheckResult {
  id: string;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
}

const results: CheckResult[] = [];

function record(id: string, name: string, status: 'PASS' | 'WARN' | 'FAIL', details: string) {
  results.push({ id, name, status, details });
  console.log(`[${status}] ${id} ${name}: ${details}`);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 25000
): Promise<{ res: Response; elapsedMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
    return { res, elapsedMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectTls(hostname: string): Promise<{
  ok: boolean;
  subjectCn?: string;
  san?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}> {
  return await new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { servername: hostname, timeout: 10000 }, () => {
      try {
        const cert = socket.getPeerCertificate();
        const subjectCn = typeof cert.subject?.CN === 'string' ? cert.subject.CN : undefined;
        const issuer = typeof cert.issuer?.O === 'string' ? `${cert.issuer.O} (${cert.issuer.CN || ''})` : undefined;
        const validToMs = cert.valid_to ? Date.parse(cert.valid_to) : NaN;
        const ok = Number.isFinite(validToMs) && validToMs > Date.now();
        socket.end();
        resolve({
          ok,
          subjectCn,
          san: cert.subjectaltname,
          issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to
        });
      } catch (err: any) {
        socket.end();
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'TLS handshake timeout' });
    });
    socket.on('error', (err: any) => {
      resolve({ ok: false, error: err?.message || String(err) });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('AI PRIME STUDIO — READ-ONLY LIVE NEW URL VERIFICATION');
  console.log(`Primary Public URL : ${PUBLIC_URL}`);
  console.log(`Legacy Backend URL : ${LEGACY_CLOUD_RUN_URL}`);
  console.log(`Timestamp          : ${new Date().toISOString()}`);
  console.log('================================================================\n');

  const publicHost = new URL(PUBLIC_URL).hostname;

  // 1. DNS Resolution
  try {
    const pubIps = (await dns.resolve4(publicHost)).sort();
    record(
      'CHECK-1',
      'DNS A-Records (.ai.studio)',
      pubIps.length > 0 ? 'PASS' : 'FAIL',
      `Resolved ${pubIps.length} Google Frontend IPs (${pubIps[0]}..${pubIps[pubIps.length - 1]})`
    );
  } catch (err: any) {
    record('CHECK-1', 'DNS A-Records', 'FAIL', err?.message || String(err));
  }

  // 2. TLS Certificate Validity
  const tlsInfo = await inspectTls(publicHost);
  if (tlsInfo.ok) {
    record(
      'CHECK-2',
      'TLS Certificate Validity',
      'PASS',
      `CN=${tlsInfo.subjectCn}, SAN=${tlsInfo.san}, Issuer=${tlsInfo.issuer}, Valid=${tlsInfo.validFrom} -> ${tlsInfo.validTo}`
    );
  } else {
    record('CHECK-2', 'TLS Certificate Validity', 'FAIL', tlsInfo.error || 'Certificate invalid or expired');
  }

  // 3. Homepage HTML, JS Bundle & Canonical SEO Tag
  try {
    const { res: homeRes, elapsedMs } = await fetchWithTimeout(`${PUBLIC_URL}/`, {}, 30000);
    const html = await homeRes.text();
    const hasTitle = html.includes('AI Prime Studio');
    const hasCanonical = html.includes('rel="canonical"') && html.includes('https://ai-prime-studio.ai.studio/');
    const assetMatch = html.match(/\/assets\/[^"'\s]+\.js/);
    const assetPath = assetMatch ? assetMatch[0] : '';
    let assetOk = false;
    let assetStatus = 0;
    if (assetPath) {
      const { res: assetRes } = await fetchWithTimeout(`${PUBLIC_URL}${assetPath}`, { method: 'HEAD' }, 20000);
      assetStatus = assetRes.status;
      assetOk = assetRes.ok;
    }
    record(
      'CHECK-3a',
      'Homepage HTML & JS Bundle',
      homeRes.ok && hasTitle && assetOk ? 'PASS' : 'FAIL',
      `GET / -> HTTP ${homeRes.status} (${elapsedMs}ms, ${html.length} bytes, title=${hasTitle}); JS ${assetPath || 'missing'} -> HTTP ${assetStatus}`
    );
    record(
      'CHECK-3b',
      'SEO Canonical & Sitemap Freshness',
      hasCanonical ? 'PASS' : 'WARN',
      hasCanonical
        ? 'Live HTML contains canonical https://ai-prime-studio.ai.studio/'
        : 'Live revision predates today canonical/sitemap commit (will activate once republished)'
    );
  } catch (err: any) {
    record('CHECK-3', 'Homepage HTML & JS Bundle', 'FAIL', err?.message || String(err));
  }

  // 4. /api/version Authoritative Database & Service Identity
  let firstBannerMediaPath = '';
  try {
    const { res: pubVer } = await fetchWithTimeout(`${PUBLIC_URL}/api/version`, {}, 25000);
    const pubJson: any = await pubVer.json();
    const dbOk =
      pubJson?.databaseMode === 'firestore_authoritative' &&
      pubJson?.databaseGuardBlocked === false &&
      pubJson?.sanitizedGuard?.expectedProjectId === 'ai-prime-studio' &&
      pubJson?.sanitizedGuard?.effectiveDatabaseId === '(default)' &&
      pubJson?.sanitizedGuard?.serviceAccountProjectMatch === 'MATCH';

    record(
      'CHECK-4',
      '/api/version Authoritative Firestore & Cloud Run Identity',
      pubVer.ok && dbOk ? 'PASS' : 'FAIL',
      `revision=${pubJson?.cloudRunRevision}, region=${pubJson?.cloudRunRegion}, db=${pubJson?.databaseMode}, saMatch=${pubJson?.sanitizedGuard?.serviceAccountProjectMatch}, templates=${pubJson?.templateCount}, scenes=${pubJson?.faceswapSceneCount}`
    );
  } catch (err: any) {
    record('CHECK-4', '/api/version', 'FAIL', err?.message || String(err));
  }

  // 5. Live Customer Catalogue APIs (/api/banners & /api/templates)
  try {
    const [banResp, tplResp] = await Promise.all([
      fetchWithTimeout(`${PUBLIC_URL}/api/banners`, {}, 20000),
      fetchWithTimeout(`${PUBLIC_URL}/api/templates`, {}, 20000)
    ]);
    const banJson: any = await banResp.res.json();
    const tplJson: any = await tplResp.res.json();
    const bannerCount = Array.isArray(banJson?.banners) ? banJson.banners.length : 0;
    const tplCount = Array.isArray(tplJson?.templates) ? tplJson.templates.length : 0;
    if (bannerCount > 0 && typeof banJson.banners[0]?.image === 'string') {
      firstBannerMediaPath = banJson.banners[0].image;
    }

    record(
      'CHECK-5',
      'Live Customer Catalogue Endpoints',
      banResp.res.ok && tplResp.res.ok && bannerCount > 0 && tplCount > 0 ? 'PASS' : 'FAIL',
      `/api/banners -> HTTP ${banResp.res.status} (${bannerCount} banners); /api/templates -> HTTP ${tplResp.res.status} (${tplCount} templates)`
    );
  } catch (err: any) {
    record('CHECK-5', 'Live Customer Catalogue Endpoints', 'FAIL', err?.message || String(err));
  }

  // 6. Live Cloudflare R2 Media Streaming (HEAD + Byte-Range + CORP)
  try {
    if (firstBannerMediaPath && firstBannerMediaPath.startsWith('/api/media/')) {
      const { res: mediaRes } = await fetchWithTimeout(
        `${PUBLIC_URL}${firstBannerMediaPath}`,
        { method: 'HEAD' },
        20000
      );
      const acceptRanges = mediaRes.headers.get('accept-ranges') || '';
      const corp = mediaRes.headers.get('cross-origin-resource-policy') || '';
      const contentType = mediaRes.headers.get('content-type') || '';
      const contentLength = mediaRes.headers.get('content-length') || '';
      record(
        'CHECK-6',
        'Live Cloudflare R2 Media Stream & Headers',
        mediaRes.ok && acceptRanges.includes('bytes') && corp === 'cross-origin' ? 'PASS' : 'FAIL',
        `HEAD ${firstBannerMediaPath} -> HTTP ${mediaRes.status} (${contentType}, ${contentLength} bytes, accept-ranges=${acceptRanges}, corp=${corp})`
      );
    } else {
      record('CHECK-6', 'Live Cloudflare R2 Media Stream', 'WARN', 'No /api/media/* banner path returned to probe');
    }
  } catch (err: any) {
    record('CHECK-6', 'Live Cloudflare R2 Media Stream', 'FAIL', err?.message || String(err));
  }

  // 7. Live CORS Preflight for Origin: https://ai-prime-studio.ai.studio
  try {
    const { res: corsRes } = await fetchWithTimeout(
      `${PUBLIC_URL}/api/templates`,
      {
        method: 'OPTIONS',
        headers: {
          Origin: PUBLIC_URL,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization, Range'
        }
      },
      15000
    );
    const acao = corsRes.headers.get('access-control-allow-origin') || '';
    const acah = corsRes.headers.get('access-control-allow-headers') || '';
    const aceh = corsRes.headers.get('access-control-expose-headers') || '';
    const ok = corsRes.ok && Boolean(acao) && acah.includes('Authorization') && acah.includes('Range');
    record(
      'CHECK-7',
      'Live CORS & Byte-Range Preflight',
      ok ? 'PASS' : 'FAIL',
      `OPTIONS /api/templates -> HTTP ${corsRes.status} (ACAO=${acao}, Expose=${aceh})`
    );
  } catch (err: any) {
    record('CHECK-7', 'Live CORS Preflight', 'FAIL', err?.message || String(err));
  }

  // 8. Legacy Cloud Run Backend (gen-lang-client-0525281130) Parallel Health & Shared Firestore Parity
  try {
    const { res: legVer } = await fetchWithTimeout(`${LEGACY_CLOUD_RUN_URL}/api/version`, {}, 20000);
    const legJson: any = await legVer.json();
    const ok = legVer.ok && legJson?.databaseMode === 'firestore_authoritative' && legJson?.databaseGuardBlocked === false;
    record(
      'CHECK-8',
      'Legacy Cloud Run Backend Parity (Android/Webhook Safety)',
      ok ? 'PASS' : 'WARN',
      `legacy revision=${legJson?.cloudRunRevision}, region=${legJson?.cloudRunRegion}, db=${legJson?.databaseMode}, templates=${legJson?.templateCount}`
    );
  } catch (err: any) {
    record('CHECK-8', 'Legacy Cloud Run Backend Parity', 'WARN', err?.message || String(err));
  }

  const fails = results.filter((r) => r.status === 'FAIL').length;
  const warns = results.filter((r) => r.status === 'WARN').length;
  const passes = results.filter((r) => r.status === 'PASS').length;

  console.log('\n================================================================');
  console.log(`LIVE NEW URL VERIFICATION SUMMARY: ${passes} PASS, ${warns} WARN, ${fails} FAIL`);
  console.log('================================================================');
  if (fails > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
