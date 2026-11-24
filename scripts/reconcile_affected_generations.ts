import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const dryRun = !applyMode;
  const tplArg = args.find((a) => a.startsWith('--template='));
  const templateId = tplArg ? tplArg.split('=')[1]?.trim() : 'tpl_full_swag_1';

  const { prodDb, getDatabaseGuardState } = await import('../src/services/db/database.ts');
  const { mediaStorage } = await import('../src/services/storage/mediaStorage.ts');
  const { reconcileAffectedGenerations } = await import('../server.ts');

  const guard = getDatabaseGuardState();
  if (guard.blocked) {
    console.error(`[RECONCILE] Blocked by database guard: ${guard.blockedReason}`);
    process.exit(1);
  }

  console.log(`[RECONCILE] Initializing authoritative database & storage...`);
  await prodDb.readyPromise;

  console.log(
    `[RECONCILE] Running generation reconciliation (dryRun=${dryRun}, template=${templateId || 'ALL'})...`
  );
  const summary = await reconcileAffectedGenerations(prodDb, mediaStorage, {
    dryRun,
    templateId: templateId === 'all' ? undefined : templateId,
    actorEmail: 'cli_reconcile_script'
  });

  console.log('\n=== RECONCILIATION SUMMARY ===');
  console.log(`Mode            : ${summary.dryRun ? 'DRY-RUN (no writes)' : 'APPLIED (Firestore updated)'}`);
  console.log(`Template Filter : ${summary.templateFilter}`);
  console.log(`Scanned         : ${summary.scanned}`);
  console.log(`Restored Valid  : ${summary.restoredValid}`);
  console.log(`Refunded Once   : ${summary.refundedMissing}`);
  console.log(`Already Settled : ${summary.skippedAlreadyRefunded}`);
  console.log(`Errors          : ${summary.errors}`);

  if (summary.items.length > 0) {
    console.log('\nDetails:');
    for (const item of summary.items) {
      console.log(
        ` - [${item.action}] gen=${item.generationId} user=${item.userId} tpl=${item.templateId} (${item.previousStatus}): ${item.details}`
      );
    }
  }

  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[RECONCILE FATAL]', err);
  process.exit(1);
});
