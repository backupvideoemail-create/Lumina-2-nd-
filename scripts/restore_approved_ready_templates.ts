import fs from 'fs';
import path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SEED_TEMPLATES } from '../src/data/templatesData.ts';
import { validateTemplateReadiness } from '../src/services/validation/templateReadiness.ts';
import {
  adminFirestoreDb,
  getDatabaseGuardState,
  evaluateDatabaseLock,
  CANONICAL_PROJECT_ID,
  CANONICAL_DATABASE_ID
} from '../src/services/db/database.ts';

const APPROVED_RESTORE_IDS = [
  'tpl_retro_35mm_kodak',
  'tpl_instagram_story_quote',
  'tpl_dark_academia_library',
  'tpl_bali_resort_morning',
  'tpl_instagram_aesthetic_polaroid_carousel',
  'tpl_daily_status_morning',
  'tpl_cyber_synthwave_horizon'
] as const;

async function main() {
  const lockCheck = evaluateDatabaseLock({
    configuredProjectId: (firebaseConfig as any).projectId,
    configuredDatabaseId: (firebaseConfig as any).firestoreDatabaseId,
    envDatabaseOverride: process.env.FIRESTORE_DATABASE_ID
  });

  if (lockCheck.blocked) {
    throw new Error(`ABORTED BY DATABASE LOCK: ${lockCheck.reason}`);
  }

  const guard = getDatabaseGuardState();
  if (guard.blocked || !adminFirestoreDb) {
    throw new Error(`ABORTED: adminFirestoreDb unavailable or blocked (${guard.blockedReason || guard.connectionSource})`);
  }

  const db = adminFirestoreDb;
  const effectiveDbId = (db as any)?._databaseId?.database || CANONICAL_DATABASE_ID;
  if (effectiveDbId !== CANONICAL_DATABASE_ID) {
    throw new Error(`CRITICAL_FIRESTORE_LOCK: Expected '${CANONICAL_DATABASE_ID}', got '${effectiveDbId}'`);
  }

  console.log(`[Restore] Connected cleanly to ${CANONICAL_PROJECT_ID} / ${effectiveDbId} via ${guard.connectionSource}`);

  // 1. Pre-mutation complete backup of templates + config collections
  const templatesSnap = await db.collection('templates').get();
  const configSnap = await db.collection('config').get();

  const backupTemplates: Record<string, any> = {};
  templatesSnap.forEach((doc: any) => {
    backupTemplates[doc.id] = doc.data();
  });

  const backupConfig: Record<string, any> = {};
  configSnap.forEach((doc: any) => {
    backupConfig[doc.id] = doc.data();
  });

  const deletedIds: string[] = Array.isArray(backupConfig?.deleted_template_ids?.ids)
    ? backupConfig.deleted_template_ids.ids
    : [];

  const backupDir = path.resolve(process.cwd(), '.data/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const safeTs = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `canonical_default_backup_${safeTs}.json`);

  const backupPayload = {
    projectId: CANONICAL_PROJECT_ID,
    databaseId: CANONICAL_DATABASE_ID,
    backedUpAt: new Date().toISOString(),
    templatesCount: templatesSnap.size,
    configDocsCount: configSnap.size,
    deletedTombstonesCount: deletedIds.length,
    templates: backupTemplates,
    config: backupConfig
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size < 50) {
    throw new Error(`Backup verification failed at ${backupPath}`);
  }
  console.log(`[Restore] Backup written & verified: ${backupPath} (${templatesSnap.size} template docs, ${deletedIds.length} tombstones)`);

  // 2. Validate each of the 7 approved READY Smart Canvas templates strictly
  const deletedSet = new Set(deletedIds);
  const toRestore = APPROVED_RESTORE_IDS.map((id) => {
    if (deletedSet.has(id)) {
      throw new Error(`TOMBSTONE SAFETY BLOCK: Approved ID '${id}' exists in deleted_template_ids!`);
    }
    const seedTpl = SEED_TEMPLATES.find((t) => t.id === id);
    if (!seedTpl) {
      throw new Error(`Missing approved seed template '${id}' in src/data/templatesData.ts`);
    }
    if (seedTpl.engine !== 'SMART_TEMPLATE') {
      throw new Error(`Engine mismatch on '${id}': expected SMART_TEMPLATE, got '${seedTpl.engine}'`);
    }
    const check = validateTemplateReadiness(seedTpl, { strictPublish: false });
    if (!check.ready) {
      throw new Error(`Readiness validation failed for '${id}': ${check.errors.join('; ')}`);
    }
    return seedTpl;
  });

  // 3. Write ONLY the 7 approved templates (leaving tpl_full_swag_1, tpl_gold_noir, tombstones, banners, faceswap_scenes untouched)
  const nowIso = new Date().toISOString();
  for (const tpl of toRestore) {
    const cleanDoc = JSON.parse(
      JSON.stringify({
        ...tpl,
        isActive: true,
        updatedAt: nowIso,
        restoredBy: 'restore_approved_ready_templates_v4'
      })
    );
    await db.collection('templates').doc(tpl.id).set(cleanDoc, { merge: false });
    console.log(`[Restore] Wrote READY ${tpl.type} template: ${tpl.id} ("${tpl.title}", engine=${tpl.engine})`);
  }

  // Bump catalog revision safely
  await db.collection('config').doc('catalog_metadata').set(
    {
      revision: FieldValue.increment(1),
      catalogRevision: FieldValue.increment(1),
      lastUpdatedAt: nowIso,
      lastSyncAt: nowIso,
      lastRestoredIds: [...APPROVED_RESTORE_IDS],
      updatedBy: 'restore_approved_ready_templates_v4'
    },
    { merge: true }
  );

  // 4. Read-back verification
  const postSnap = await db.collection('templates').get();
  const postConfigDeleted = await db.collection('config').doc('deleted_template_ids').get();
  const postDeletedIds: string[] = Array.isArray(postConfigDeleted.data()?.ids) ? postConfigDeleted.data()!.ids : [];
  const postDeletedSet = new Set(postDeletedIds);

  const visibleActiveDocs: any[] = [];
  const inactiveDocs: any[] = [];
  postSnap.forEach((doc: any) => {
    const d = doc.data();
    if (postDeletedSet.has(doc.id)) return;
    if (d.isActive === false) inactiveDocs.push(d);
    else visibleActiveDocs.push(d);
  });

  const postBanners = await db.collection('config').doc('banners').get();
  const postFaceswap = await db.collection('config').doc('faceswap_scenes').get();
  const bannersArr = Array.isArray(postBanners.data()?.banners)
    ? postBanners.data()!.banners
    : Array.isArray(postBanners.data()?.items)
    ? postBanners.data()!.items
    : [];
  const scenesArr = Array.isArray(postFaceswap.data()?.scenes)
    ? postFaceswap.data()!.scenes
    : Array.isArray(postFaceswap.data()?.items)
    ? postFaceswap.data()!.items
    : [];

  console.log('\n=== POST-RESTORE READ-BACK VERIFICATION ===');
  console.log(`Visible Active Public Templates: ${visibleActiveDocs.length} (Expected: 8 = tpl_full_swag_1 + 6 Photo + 1 Video)`);
  for (const d of visibleActiveDocs) {
    console.log(`  - ${d.id} | ${d.title} | type=${d.type} | engine=${d.engine} | model=${d.recipe?.model || d.model}`);
  }
  console.log(`Inactive Draft Templates: ${inactiveDocs.length} (${inactiveDocs.map((d) => d.id).join(', ')})`);
  console.log(`Preserved Tombstones: ${postDeletedIds.length}`);
  console.log(`Active Banners: ${bannersArr.filter((b: any) => b?.isActive !== false).length} / ${bannersArr.length}`);
  console.log(`FaceSwap Scenes: ${scenesArr.filter((s: any) => s?.isActive !== false && s?.status !== 'draft').length} published / ${scenesArr.length} total`);
}

main().catch((err) => {
  console.error('[Restore FATAL]:', err);
  process.exit(1);
});
