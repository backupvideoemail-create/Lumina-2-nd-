import dotenv from 'dotenv';
dotenv.config();

import { mediaStorage } from '../src/services/storage/mediaStorage.ts';
import { adminFirestoreDb, prodDb } from '../src/services/db/database.ts';

async function runDiagnosis() {
  console.log('=== R2 ENV VAR AUDIT (EXACT NAMES) ===');
  const varsToCheck = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
    'ACCESS_KEY_ID',
    'SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_ACCESS_KEY_ID',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_ACCOUNT_ID'
  ];

  for (const v of varsToCheck) {
    const val = process.env[v];
    const status = val ? (val.trim().length > 0 ? 'PRESENT' : 'EMPTY') : 'MISSING';
    const length = val ? val.trim().length : 0;
    console.log(`${v}: ${status} (length: ${length})`);
  }

  console.log('\n=== FIRESTORE ADMIN SDK CONNECTION ===');
  console.log('adminFirestoreDb initialized:', Boolean(adminFirestoreDb));
  console.log('process.env.FIREBASE_SERVICE_ACCOUNT_KEY:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'PRESENT' : 'MISSING');
  console.log('process.env.FIRESTORE_DATABASE_ID:', process.env.FIRESTORE_DATABASE_ID || '(not set)');

  if (adminFirestoreDb) {
    try {
      const colls = await adminFirestoreDb.listCollections();
      console.log('Firestore collections reachable:', colls.map((c: any) => c.id).join(', '));
      
      const configDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
      console.log('config/faceswap_scenes exists:', configDoc.exists);
      if (configDoc.exists) {
        const data = configDoc.data();
        const scenes = data?.scenes || [];
        console.log(`Found ${scenes.length} Face Swap scenes in config/faceswap_scenes`);
        if (scenes.length > 0) {
          console.log('Sample scene 0 ID:', scenes[0].id, 'Title:', scenes[0].title);
          console.log('Sample scene 0 sampleFace:', scenes[0].sampleFace);
          console.log('Sample scene 0 sourceVideoPreview:', scenes[0].sourceVideoPreview);
          console.log('Sample scene 0 resultVideoPreview:', scenes[0].resultVideoPreview);
        }
      }

      const templatesSnap = await adminFirestoreDb.collection('templates').limit(5).get();
      console.log(`Templates collection count (sample limit 5): ${templatesSnap.size}`);
      templatesSnap.forEach((doc: any) => {
        const t = doc.data();
        console.log(`Template: id=${t.id}, title="${t.title}", cover="${t.cover}", preview="${t.preview}"`);
      });

      const mediaMetaSnap = await adminFirestoreDb.collection('media_metadata').limit(5).get();
      console.log(`media_metadata collection count (sample limit 5): ${mediaMetaSnap.size}`);
      mediaMetaSnap.forEach((doc: any) => {
        const m = doc.data();
        console.log(`MediaMeta: fileId=${m.fileId}, provider=${m.provider}, r2Key=${m.r2Key}, publicUrl=${m.publicUrl}`);
      });
    } catch (err: any) {
      console.error('Firestore check error:', err.message);
    }
  }

  console.log('\n=== R2 LIVE AUTHENTICATION TEST ===');
  const status = await mediaStorage.testR2Connection();
  console.log('Storage Status:');
  console.log('  activeDriver:', status.activeDriver);
  console.log('  r2Configured:', status.r2Configured);
  console.log('  r2LiveAuthenticated:', status.r2LiveAuthenticated);
  console.log('  missingEnvVars:', status.missingEnvVars.join(', ') || 'None');
  console.log('  bucket:', status.bucket);
  console.log('  publicBaseUrl:', status.publicBaseUrl);
  console.log('  r2Error:', status.r2Error || 'None');
  console.log('  localFilesCount:', status.localStats.fileCount);

  process.exit(0);
}

runDiagnosis().catch(err => {
  console.error('Diagnostic run failed:', err);
  process.exit(1);
});
