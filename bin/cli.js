// CLI surface for slowgram. parse() is pure (no env, no I/O) so it is fully
// unit-tested; main() (added later) validates env vars and dispatches to the
// pipeline runners.

const BUILD_FLAGS = {
  '--rebuild-all': 'rebuildAll',
  '--skip-convert': 'skipConvert',
  '--skip-resize': 'skipResize',
  '--skip-sync': 'skipSync',
};

export const HELP_TEXT = `
Usage: slowgram <command> [options]

Commands:
  build            Pull the bucket, process new/edited photos, then sync to S3
  check            Report what a build would rebuild or prune, then exit (read-only)
  sync             Upload the existing .s3-mirror to S3 (no rebuild)
  help             Show this help
  --version, -v    Show the version

build options:
  --rebuild-all    Reprocess every source photo (default: only new or edited)
  --skip-convert   Skip WebP conversion (when reprocessing)
  --skip-resize    Skip resizing (when reprocessing)
  --skip-sync      Build into .s3-mirror but do NOT upload

Environment:
  SLOWGRAM_SOURCE_PATH   Source images (your full library)   [build, check]
  SLOWGRAM_BUCKET_NAME   Target S3 bucket                    [build, check, sync]
  AWS_REGION             AWS region (or config.json aws.region)
  (AWS credentials via the standard AWS credential chain)
`;

function emptyOptions() {
  return { rebuildAll: false, skipConvert: false, skipResize: false, skipSync: false };
}

export function parse(argv) {
  const options = emptyOptions();
  const [first, ...rest] = argv;

  if (first === undefined || first === 'help' || first === '-h' || first === '--help') {
    return { command: 'help', options, error: null };
  }
  if (first === '--version' || first === '-v') {
    return { command: 'version', options, error: null };
  }

  if (!['build', 'check', 'sync'].includes(first)) {
    return { command: 'help', options, error: `Unknown command: ${first}` };
  }

  for (const arg of rest) {
    const key = BUILD_FLAGS[arg];
    if (!key) {
      return { command: first, options, error: `Unknown flag: ${arg}` };
    }
    if (first !== 'build') {
      return { command: first, options, error: `${arg} is only valid for "build"` };
    }
    options[key] = true;
  }

  return { command: first, options, error: null };
}
