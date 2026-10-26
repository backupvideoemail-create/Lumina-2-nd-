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

  for (const t of templates) {
    const urlsToCheck = [
      { field: 'cover', url: t.cover },
      { field: 'preview', url: t.preview },
      { field: 'sampleResult', url: t.sampleResult }
    ].filter(x => Boolean(x.url));

    for (const item of urlsToCheck) {
      totalChecked++;
      const url = item.url;
      if (url.startsWith('data:')) {
        okCount++;
        continue;
      }
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // External URL
        try {
          const resp = await fetch(url, { method: 'HEAD' });
          if (resp.ok) {
            okCount++;
          } else {
            missingCount++;
            missingAssets.push({ id: t.id, title: t.title, field: item.field, url, error: `HTTP ${resp.status}` });
          }
        } catch (err: any) {
          missingCount++;
          missingAssets.push({ id: t.id, title: t.title, field: item.field, url, error: err.message });
        }
        continue;
      }

      if (url.startsWith('/api/media/')) {
        const fileId = url.replace('/api/media/', '').split('?')[0];
        try {
          const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId);
          if (streamRes.error || !streamRes.body) {
            missingCount++;
            missingAssets.push({ id: t.id, title: t.title, field: item.field, url, error: streamRes.error || 'NotFound' });
          } else {
            okCount++;
          }
        } catch (err: any) {
          missingCount++;
          missingAssets.push({ id: t.id, title: t.title, field: item.field, url, error: err.message });
        }
        continue;
      }

      // Other relative URL like /sample-cover.jpg
      missingAssets.push({ id: t.id, title: t.title, field: item.field, url, error: 'Relative path without host' });
    }
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
    const fields = [
      { name: 'sampleFace', url: s.sampleFace },
      { name: 'sourceVideoPreview', url: s.sourceVideoPreview },
      { name: 'resultVideoPreview', url: s.resultVideoPreview }
    ];
    for (const f of fields) {
      if (!f.url) {
        console.log(`  ${f.name}: (empty)`);
        continue;
      }
      if (f.url.startsWith('/api/media/')) {
        const fileId = f.url.replace('/api/media/', '');
        const stream = await mediaStorage.getAuthorizedObjectStream(fileId);
        if (stream.body) {
          console.log(`  ${f.name}: OK -> ${f.url} (mime: ${stream.mimeType})`);
        } else {
          console.log(`  ${f.name}: FAILED -> ${f.url} (error: ${stream.error})`);
        }
      } else {
        console.log(`  ${f.name}: EXTERNAL/OTHER -> ${f.url}`);
      }
    }
  }

  process.exit(0);
}

auditAllMedia().catch(e => {
  console.error(e);
  process.exit(1);
});
