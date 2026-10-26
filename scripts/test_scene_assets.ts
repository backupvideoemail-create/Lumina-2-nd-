import dotenv from 'dotenv';
dotenv.config();

import { mediaStorage } from '../src/services/storage/mediaStorage.ts';
import { adminFirestoreDb } from '../src/services/db/database.ts';
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function testSceneMedia() {
  const filesToTest = [
    'admin_upload_1792932259216_081f56e3.jpg',
    'admin_upload_1792932276580_a33bc2bb.mp4',
    'admin_upload_1792932285452_3a6a549a.mp4',
    'admin_upload_1791462885787_3e643158.jpg', // One known from media_metadata
  ];

  console.log('=== CHECKING SPECIFIC SCENE ASSETS IN FIRESTORE & R2 ===\n');

  for (const fileId of filesToTest) {
    console.log(`Checking file: ${fileId}`);
    // 1. Check in media_metadata collection
    const doc = await adminFirestoreDb?.collection('media_metadata').doc(fileId).get();
    if (doc?.exists) {
      const data = doc.data();
      console.log(`  Firestore media_metadata: FOUND -> provider=${data?.provider}, r2Key=${data?.r2Key}, isPublic=${data?.isPublic}`);
    } else {
      console.log(`  Firestore media_metadata: NOT FOUND`);
    }

    // 2. Check via mediaStorage.getAuthorizedObjectStream
    try {
      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId);
      if (streamRes.error) {
        console.log(`  getAuthorizedObjectStream: ERROR (${streamRes.error})`);
      } else if (streamRes.body) {
        console.log(`  getAuthorizedObjectStream: SUCCESS (mime: ${streamRes.mimeType})`);
      }
    } catch (e: any) {
      console.log(`  getAuthorizedObjectStream: EXCEPTION (${e.message})`);
    }
  }

  // 3. Let's list some objects in R2 to see what is ACTUALLY in the bucket!
  console.log('\n=== LISTING OBJECTS IN CLOUDFLARE R2 BUCKET ===');
  const r2Items = await mediaStorage.listR2Objects();
  console.log(`Total objects found in R2 bucket 'lumina-prime-ai-media': ${r2Items.length}`);
  r2Items.slice(0, 20).forEach((item, idx) => {
    console.log(`  [${idx + 1}] key="${item.key}" size=${item.size} bytes`);
  });

  // Check if any admin_upload files are in R2
  const adminUploadsInR2 = r2Items.filter(i => i.key.includes('admin_upload_'));
  console.log(`\nAdmin upload files in R2: ${adminUploadsInR2.length}`);
  adminUploadsInR2.forEach(i => console.log(`  key="${i.key}"`));

  process.exit(0);
}

testSceneMedia().catch(e => {
  console.error(e);
  process.exit(1);
});
