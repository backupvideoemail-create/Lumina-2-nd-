/**
 * AI Prime Studio — Read-Only Public URL & Cloud Run Recovery Verifier
 *
 * Strictly non-destructive diagnostic utility.
 * Verifies:
 *  1. DNS A-record parity between the existing .ai.studio URL and the Cloud Run .run.app URL
 *  2. TLS certificate validity for ai-prime-studio-photo-video.ai.studio
 *  3. Live Homepage HTML & primary JS asset availability (HTTP 200)
 *  4. /api/version parity between .ai.studio and .run.app (revision, region, Firestore authoritative mode)
 *  5. Live /api/banners and /api/templates responses
 *
 * Usage:
 *   npx tsx scripts/verify_public_url_recovery.ts
 *   TARGET_URL=https://... npx tsx scripts/verify_public_url_recovery.ts
 */

import dns from 'dns/promises';
import tls from 'tls';

const PUBLIC_URL = (process.env.TARGET_URL || 'https://ai-prime-studio-photo-video.ai.studio').replace(/\/$/, '');
const CLOUD_RUN_URL = (
  process.env.CLOUD_RUN_URL || 'https://ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app'
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

async function fetchWithTimeout(url: string, timeoutMs = 25000): Promise<{ res: Response; elapsedMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
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
  console.log('AI PRIME STUDIO — READ-ONLY PUBLIC URL RECOVERY VERIFICATION');
  console.log(`Public URL   : ${PUBLIC_URL}`);
  console.log(`Cloud Run URL: ${CLOUD_RUN_URL}`);
  console.log(`Timestamp    : ${new Date().toISOString()}`);
  console.log('================================================================\n');

  const publicHost = new URL(PUBLIC_URL).hostname;
  const runHost = new URL(CLOUD_RUN_URL).hostname;

  // 1. DNS A-Record Parity
  try {
    const [pubIps, runIps] = await Promise.all([dns.resolve4(publicHost), dns.resolve4(runHost)]);
    const pubSorted = [...pubIps].sort();
    const runSorted = [...runIps].sort();
    const identical =
      pubSorted.length > 0 &&
      pubSorted.length === runSorted.length &&
      pubSorted.every((ip, idx) => ip === runSorted[idx]);
    record(
      'CHECK-1',
      'DNS Routing Parity (.ai.studio vs .run.app)',
      identical ? 'PASS' : 'WARN',
      identical
        ? `Identical ${pubSorted.length} Cloud Run frontend IPs (${pubSorted[0]}..${pubSorted[pubSorted.length - 1]})`
        : `Public IPs=[${pubSorted.join(', ')}] vs Run IPs=[${runSorted.join(', ')}]`
    );
  } catch (err: any) {
    record('CHECK-1', 'DNS Routing Parity', 'FAIL', err?.message || String(err));
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

  // 3. Homepage HTML + JS Bundle
  try {
    const { res: homeRes, elapsedMs } = await fetchWithTimeout(`${PUBLIC_URL}/`, 30000);
    const html = await homeRes.text();
    const hasTitle = html.includes('AI Prime Studio');
    const assetMatch = html.match(/\/assets\/[^"'\s]+\.js/);
    const assetPath = assetMatch ? assetMatch[0] : '';
    let assetOk = false;
    let assetStatus = 0;
    if (assetPath) {
      const { res: assetRes } = await fetchWithTimeout(`${PUBLIC_URL}${assetPath}`, 20000);
      assetStatus = assetRes.status;
      assetOk = assetRes.ok;
    }
    record(
      'CHECK-3',
      'Homepage HTML & JS Bundle',
      homeRes.ok && hasTitle && assetOk ? 'PASS' : 'FAIL',
      `GET / -> HTTP ${homeRes.status} (${elapsedMs}ms, ${html.length} bytes, title=${hasTitle}); JS ${assetPath || 'missing'} -> HTTP ${assetStatus}`
    );
  } catch (err: any) {
    record('CHECK-3', 'Homepage HTML & JS Bundle', 'FAIL', err?.message || String(err));
  }

  // 4. /api/version Parity (.ai.studio vs .run.app)
  try {
    const [pubVer, runVer] = await Promise.all([
      fetchWithTimeout(`${PUBLIC_URL}/api/version`, 25000),
      fetchWithTimeout(`${CLOUD_RUN_URL}/api/version`, 25000)
    ]);
    const pubJson: any = await pubVer.res.json();
    const runJson: any = await runVer.res.json();

    const sameRevision =
      Boolean(pubJson?.cloudRunRevision) &&
      pubJson.cloudRunRevision === runJson?.cloudRunRevision &&
      pubJson.cloudRunRegion === runJson?.cloudRunRegion;
    const dbAuthoritative =
      pubJson?.databaseMode === 'firestore_authoritative' && pubJson?.databaseGuardBlocked === false;
    const hasModernGuardFields = Boolean(pubJson?.sanitizedGuard && pubJson?.verifiedGithubBaselineSha);

    record(
      'CHECK-4a',
      '/api/version Revision & Hosting Parity',
      pubVer.res.ok && runVer.res.ok && sameRevision && dbAuthoritative ? 'PASS' : 'FAIL',
      `revision=${pubJson?.cloudRunRevision} (matches .run.app=${sameRevision}), region=${pubJson?.cloudRunRegion}, db=${pubJson?.databaseMode}, guardBlocked=${pubJson?.databaseGuardBlocked}, templates=${pubJson?.templateCount}, scenes=${pubJson?.faceswapSceneCount}`
    );

    record(
      'CHECK-4b',
      'Deployed Code Freshness Check',
      hasModernGuardFields ? 'PASS' : 'WARN',
      hasModernGuardFields
        ? `Running updated build with sanitizedGuard & baseline ${pubJson?.verifiedGithubBaselineSha}`
        : `Live revision (${pubJson?.cloudRunRevision}) is running an older pre-hardening build (missing sanitizedGuard / verifiedGithubBaselineSha); pending safe recovery deploy once approved`
    );
  } catch (err: any) {
    record('CHECK-4', '/api/version Parity', 'FAIL', err?.message || String(err));
  }

  // 5. Live Customer Catalogue APIs (/api/banners & /api/templates)
  try {
    const [banResp, tplResp] = await Promise.all([
      fetchWithTimeout(`${PUBLIC_URL}/api/banners`, 20000),
      fetchWithTimeout(`${PUBLIC_URL}/api/templates`, 20000)
    ]);
    const banJson: any = await banResp.res.json();
    const tplJson: any = await tplResp.res.json();
    const bannerCount = Array.isArray(banJson?.banners) ? banJson.banners.length : 0;
    const tplCount = Array.isArray(tplJson?.templates) ? tplJson.templates.length : 0;

    record(
      'CHECK-5',
      'Live Customer Catalogue Endpoints',
      banResp.res.ok && tplResp.res.ok && bannerCount > 0 && tplCount > 0 ? 'PASS' : 'FAIL',
      `/api/banners -> HTTP ${banResp.res.status} (${bannerCount} banners); /api/templates -> HTTP ${tplResp.res.status} (${tplCount} templates)`
    );
  } catch (err: any) {
    record('CHECK-5', 'Live Customer Catalogue Endpoints', 'FAIL', err?.message || String(err));
  }

  const fails = results.filter((r) => r.status === 'FAIL').length;
  const warns = results.filter((r) => r.status === 'WARN').length;
  const passes = results.filter((r) => r.status === 'PASS').length;

  console.log('\n================================================================');
  console.log(`URL RECOVERY CHECK SUMMARY: ${passes} PASS, ${warns} WARN, ${fails} FAIL`);
  console.log('================================================================');
  if (fails > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
