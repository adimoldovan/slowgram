#!/usr/bin/env node
// Thin entrypoint. All build logic — including the planPhoto/reportUpdates I/O
// wrappers — lives in feed-build.js so it can be imported and unit-tested without
// running the build. This file exists only to invoke run() when the script is
// executed directly (node bin/build-feed.js [options]). (f-59)
import { run } from './feed-build.js';

try {
  await run();
  console.log('✅ All done!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
