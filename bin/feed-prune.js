import fs from 'fs';
import path from 'path';

// Remove photo dirs in .s3-mirror that are no longer in the source set so the
// mirror (and the subsequent S3 --delete) matches the current photos exactly.
//
// With { dryRun: true } it reports what it *would* prune without touching the
// mirror. --skip-sync uses this: that flag is billed as a safe "build but don't
// upload" run, so it must not fs.rmSync renditions out of the mirror — deleting
// them there would let a later --sync-only push those deletes to S3 with no
// delete list ever shown at build time. (f-45)
//
// Returns the list of pruned (or, in dry-run mode, prunable) directory names.
export function pruneMirror(dir, keepIds, { dryRun = false } = {}) {
  const pruned = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !keepIds.has(entry.name)) {
      if (!dryRun) {
        fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
      }
      console.log(`  ➤ ${dryRun ? 'would prune' : 'pruned'} ${entry.name}`);
      pruned.push(entry.name);
    }
  }
  return pruned;
}
