// Zero-dependency terminal UI. Pure helpers (capability detection, palette, bar,
// formatters) are exported and unit-tested; the stateful Ui controller below
// wires them to process.stdout. Used as a module singleton (export `ui`) so the
// signature-locked wrappers in pipeline.js can emit output without taking a ui
// argument, and so everything degrades together off-TTY.

// NO_COLOR wins; FORCE_COLOR=0 disables; FORCE_COLOR set (else) forces on;
// otherwise color follows the TTY. Matches the supports-color/chalk convention.
export function colorEnabled({ env, isTTY }) {
  if (env.NO_COLOR != null) return false;
  if (env.FORCE_COLOR === '0') return false;
  if (env.FORCE_COLOR != null) return true;
  return Boolean(isTTY);
}

// Animation (spinners, the redrawn bar, \r updates) only on a real TTY.
export function animationEnabled({ isTTY }) {
  return Boolean(isTTY);
}

const CODES = {
  bold: 1, dim: 2, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, gray: 90,
};

export function makePalette(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
  return Object.fromEntries(Object.entries(CODES).map(([name, code]) => [name, wrap(code)]));
}

export function renderBar(step, total, width = 20) {
  const ratio = total <= 0 ? 0 : Math.max(0, Math.min(1, step / total));
  const filled = Math.round(ratio * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

export function pluralize(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}
