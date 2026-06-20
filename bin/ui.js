// Zero-dependency terminal UI. Pure helpers (capability detection, palette, bar,
// formatters) are exported and unit-tested; the stateful Ui controller below
// wires them to process.stdout. Used as a module singleton (export `ui`) so the
// signature-locked wrappers in pipeline.js can emit output without taking a ui
// argument, and so everything degrades together off-TTY.

import process from 'process';

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

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Ui {
  constructor({ stream = process.stdout, env = process.env } = {}) {
    this.stream = stream;
    this.color = colorEnabled({ env, isTTY: stream.isTTY });
    this.animate = animationEnabled({ isTTY: stream.isTTY });
    this.c = makePalette(this.color);
    this.phases = [];
    this.phaseIndex = 0;
    this.timer = null;
    this.frame = 0;
    this.spinnerText = '';
    this.barLineActive = false;
  }

  write(s) { this.stream.write(s); }
  line(s = '') { this.clearActiveLine(); this.write(`${s}\n`); }

  banner(version) {
    if (!this.animate) { this.line(`slowgram ${version}`); return; }
    const { cyan, dim, bold } = this.c;
    this.line();
    this.line(bold(cyan('  ░▒▓ slowgram ▓▒░')));
    this.line(dim('  a slower way to share photos') + dim(`  v${version}`));
    this.line();
  }

  startPhases(names) { this.phases = names; this.phaseIndex = 0; }

  // Advance the step-based bar to the named phase and (re)draw it.
  phase(name, detail) {
    this.stopSpinner();
    this.phaseIndex = Math.max(this.phaseIndex, this.phases.indexOf(name) + 1);
    this.drawBar(name, detail);
  }

  drawBar(name, detail) {
    const total = this.phases.length || 1;
    const bar = renderBar(this.phaseIndex, total);
    const label = `Phase ${this.phaseIndex}/${total} · ${name}${detail ? ` · ${detail}` : ''}`;
    const text = `${this.c.cyan(bar)} ${this.c.dim(label)}`;
    if (this.animate) {
      this.clearActiveLine();
      this.write(text);
      this.barLineActive = true;
    } else {
      this.line(label);
    }
  }

  clearActiveLine() {
    if (this.barLineActive && this.animate) {
      this.write('\r\x1b[2K');
      this.barLineActive = false;
    }
  }

  // Indeterminate work: an animated spinner on a TTY, otherwise a single line.
  spinner(text) {
    this.spinnerText = text;
    if (!this.animate) {
      this.line(`… ${text}`);
      return {
        update: (t) => this.line(`… ${t}`),
        succeed: (t) => this.line(`${this.c.green('✓')} ${t ?? text}`),
        fail: (t) => this.line(`${this.c.red('✗')} ${t ?? text}`),
      };
    }
    this.clearActiveLine();
    this.frame = 0;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.write(`\r\x1b[2K${this.c.cyan(SPINNER_FRAMES[this.frame])} ${this.spinnerText}`);
    }, 80);
    if (this.timer.unref) this.timer.unref();
    this.write(`${this.c.cyan(SPINNER_FRAMES[0])} ${this.spinnerText}`);
    return {
      update: (t) => { this.spinnerText = t; },
      succeed: (t) => { this.stopSpinner(); this.line(`${this.c.green('✓')} ${t ?? this.spinnerText}`); },
      fail: (t) => { this.stopSpinner(); this.line(`${this.c.red('✗')} ${t ?? this.spinnerText}`); },
    };
  }

  stopSpinner() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.animate) this.write('\r\x1b[2K');
  }

  success(s) { this.line(`${this.c.green('✓')} ${s}`); }
  warn(s) { this.line(`${this.c.yellow('⚠')} ${s}`); }
  error(s) { this.line(`${this.c.red('✗')} ${s}`); }
  info(s) { this.line(`${this.c.dim('•')} ${s}`); }

  // Boxed key/value table.
  summary(title, rows) {
    const labelW = Math.max(...rows.map(([l]) => l.length), title.length);
    const valueW = Math.max(...rows.map(([, v]) => String(v).length), 0);
    const inner = labelW + valueW + 3;
    const top = `┌${'─'.repeat(inner)}┐`;
    const sep = `├${'─'.repeat(inner)}┤`;
    this.line();
    this.line(this.c.dim(top));
    this.line(this.c.dim('│ ') + this.c.bold(title.padEnd(inner - 2)) + this.c.dim(' │'));
    this.line(this.c.dim(sep));
    for (const [label, value] of rows) {
      const text = `${label.padEnd(labelW)}  ${String(value).padStart(valueW)}`;
      this.line(this.c.dim('│ ') + text.padEnd(inner - 2) + this.c.dim(' │'));
    }
    this.line(this.c.dim(`└${'─'.repeat(inner)}┘`));
  }

  // Stop and clear any animation so a readline prompt or error writes cleanly.
  pause() { this.stopSpinner(); this.clearActiveLine(); }
  resume() { /* next phase()/spinner() call redraws; nothing to restore */ }
  stop() { this.pause(); }
}

export const ui = new Ui();
