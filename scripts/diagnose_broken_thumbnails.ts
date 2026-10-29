import dotenv from 'dotenv';
dotenv.config();

import { prodDb } from '../src/services/db/database.ts';
import { mediaStorage } from '../src/services/storage/mediaStorage.ts';

async function diagnoseThumbnails() {
  console.log('=== FAST DIAGNOSIS OF CATALOG TEMPLATE THUMBNAILS ===\n');
  const templates = prodDb.getTemplates();
  console.log(`Total templates: ${templates.length}`);

  const brokenList: Array<{
    id: string;
    title: string;
    category: string;
    cover: string;
    preview: string;
    sampleResult?: string;
    issue: string;
  }> = [];

  for (const t of templates) {
    if (!t.cover || !t.cover.trim()) {
      brokenList.push({
        id: t.id,
        title: t.title,
        category: t.category,
        cover: t.cover || '(empty)',
        preview: t.preview || '(empty)',
        sampleResult: t.sampleResult,
        issue: 'Cover property is empty or missing'
      });
      continue;
    }

    if (t.cover.startsWith('/api/media/')) {
      const fileId = t.cover.replace('/api/media/', '').split('?')[0];
      const meta = await mediaStorage.getMetadata(fileId);
      if (!meta) {
        brokenList.push({
          id: t.id,
          title: t.title,
          category: t.category,
          cover: t.cover,
          preview: t.preview || '(empty)',
          sampleResult: t.sampleResult,
          issue: `R2 / media_metadata not found for fileId: ${fileId}`
        });
      }
    }
  }

  console.log(`\nFound ${brokenList.length} templates with broken/empty covers out of ${templates.length}:`);
  brokenList.forEach((b, i) => {
    console.log(`\n[${i + 1}] ID: ${b.id}`);
    console.log(`    Title: "${b.title}"`);
    console.log(`    Category: ${b.category}`);
    console.log(`    Cover URL: ${b.cover}`);
    console.log(`    Issue: ${b.issue}`);
  });

  process.exit(0);
}

diagnoseThumbnails().catch(e => {
  console.error(e);
  process.exit(1);
});
