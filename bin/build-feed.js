#!/usr/bin/env node
// npm `bin` target for `slowgram`. Thin: delegate to cli.main(); render any
// thrown error and exit non-zero. All argument parsing, UI and build logic live
// in cli.js / ui.js / pipeline.js.
import { main } from './cli.js';
import { ui } from './ui.js';

try {
  await main(process.argv.slice(2));
} catch (error) {
  ui.pause();
  ui.error(`Failed: ${error.message}`);
  process.exit(1);
}
