import dotenv from 'dotenv';
dotenv.config();

import { prodDb, adminFirestoreDb } from '../src/services/db/database.ts';
import { mediaStorage } from '../src/services/storage/mediaStorage.ts';

async function auditAllMedia() {
  console.log('=== AUDITING ALL TEMPLATES & SCENES MEDIA URLS ===\n');

  // 1. Get templates
  const templates = prodDb.getTemplates();
  console.log(`Total templates in database: ${templates.length}`);

  let totalChecked = 0;
  let okCount = 0;
  let missingCount = 0;
  const missingAssets: Array<{ id: string; title: string; field: string; url: string; error?: string }> = [];

  const BATCH_SIZE = 6;
  for (let i = 0; i < templates.length; i += BATCH_SIZE) {
    const batch = templates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (t) => {
        const rawUrls: Array<{ field: string; url?: string | null }> = [
          { field: 'cover', url: t.cover },
          { field: 'preview', url: t.preview },
          { field: 'sampleResult', url: t.sampleResult },
          { field: 'sampleBefore', url: t.sampleBefore },
          { field: 'sampleAfter', url: t.sampleAfter },
          { field: 'referenceImageUrl', url: t.referenceImageUrl }
        ];

        for (const item of rawUrls) {
          if (!item.url || typeof item.url !== 'string') {
            continue;
          }
          const trimmedUrl = item.url.trim();
          if (!trimmedUrl) {
            continue;
          }

          totalChecked++;
          if (trimmedUrl.startsWith('data:')) {
            okCount++;
            continue;
          }

          if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
            try {
              if (item.url) {
                const resp = await fetch(item.url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
                if (resp.ok) {
                  okCount++;
                } else {
                  missingCount++;
                  const failedUrl: string = item.url ?? '';
                  missingAssets.push({ id: t.id, title: t.title, field: item.field, url: failedUrl, error: `HTTP ${resp.status}` });
                }
              }
            } catch (err: any) {
              missingCount++;
              const failedUrl: string = item.url ?? '';
              missingAssets.push({ id: t.id, title: t.title, field: item.field, url: failedUrl, error: err.message });
            }
            continue;
          }

          if (trimmedUrl.startsWith('/api/media/')) {
            const fileId = trimmedUrl.replace('/api/media/', '').split('?')[0];
            try {
              const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId);
              if (streamRes.error || !streamRes.body) {
                missingCount++;
                const failedUrl: string = item.url ?? '';
                missingAssets.push({ id: t.id, title: t.title, field: item.field, url: failedUrl, error: streamRes.error || 'NotFound' });
              } else {
                okCount++;
              }
            } catch (err: any) {
              missingCount++;
              const failedUrl: string = item.url ?? '';
              missingAssets.push({ id: t.id, title: t.title, field: item.field, url: failedUrl, error: err.message });
            }
            continue;
          }

          // Other relative URL like /sample-cover.jpg
          const relUrl: string = item.url ?? '';
          missingAssets.push({ id: t.id, title: t.title, field: item.field, url: relUrl, error: 'Relative path without host' });
        }
      })
    );
  }

  console.log(`\nTemplates media check: ${okCount} OK, ${missingCount} FAILED out of ${totalChecked} checked.`);
  if (missingAssets.length > 0) {
    console.log(`\nSample of failed template media (first 15):`);
    missingAssets.slice(0, 15).forEach(m => {
      console.log(`  - [${m.id}] "${m.title}" -> ${m.field}: ${m.url} (Reason: ${m.error})`);
    });
  }

  // 2. Check Face Swap scenes
  console.log('\n=== AUDITING FACE SWAP SCENES ===');
  const scenes = prodDb.getFaceSwapScenes(true);
  console.log(`Total Face Swap scenes: ${scenes.length}`);
  for (const s of scenes) {
    console.log(`\nScene [${s.id}] "${s.title}":`);
    const rawSceneFields: Array<{ name: string; url?: string | null }> = [
      { name: 'sampleFace', url: s.sampleFace },
      { name: 'sourceVideoPreview', url: s.sourceVideoPreview },
      { name: 'resultVideoPreview', url: s.resultVideoPreview },
      { name: 'demoVideoUrl', url: s.demoVideoUrl }
    ];
    for (const f of rawSceneFields) {
      if (!f.url || typeof f.url !== 'string' || f.url.trim().length === 0) {
        console.log(`  ${f.name}: (empty)`);
        continue;
      }
      const mediaUrl: string = f.url;
      if (mediaUrl.startsWith('/api/media/')) {
        const fileId = mediaUrl.replace('/api/media/', '').split('?')[0];
        const stream = await mediaStorage.getAuthorizedObjectStream(fileId);
        if (stream.body) {
          console.log(`  ${f.name}: OK -> ${mediaUrl} (mime: ${stream.mimeType})`);
        } else {
          console.log(`  ${f.name}: FAILED -> ${mediaUrl} (error: ${stream.error})`);
        }
      } else {
        console.log(`  ${f.name}: EXTERNAL/OTHER -> ${mediaUrl}`);
      }
    }
  }

  process.exit(0);
}

auditAllMedia().catch(e => {
  console.error(e);
  process.exit(1);
});
