// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { colorEnabled, animationEnabled, makePalette, renderBar, pluralize, Ui } from '../bin/ui.js';

describe('colorEnabled', () => {
  it('is on for a TTY with no color env vars', () => {
    expect(colorEnabled({ env: {}, isTTY: true })).toBe(true);
  });
  it('is off for a non-TTY with no color env vars', () => {
    expect(colorEnabled({ env: {}, isTTY: false })).toBe(false);
  });
  it('NO_COLOR (any value) wins over a TTY', () => {
    expect(colorEnabled({ env: { NO_COLOR: '' }, isTTY: true })).toBe(false);
    expect(colorEnabled({ env: { NO_COLOR: '1' }, isTTY: true })).toBe(false);
  });
  it('FORCE_COLOR=0 disables even on a TTY', () => {
    expect(colorEnabled({ env: { FORCE_COLOR: '0' }, isTTY: true })).toBe(false);
  });
  it('FORCE_COLOR set (non-zero) forces on even off-TTY', () => {
    expect(colorEnabled({ env: { FORCE_COLOR: '1' }, isTTY: false })).toBe(true);
  });
  it('NO_COLOR beats FORCE_COLOR', () => {
    expect(colorEnabled({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, isTTY: true })).toBe(false);
  });
});

describe('animationEnabled', () => {
  it('follows isTTY', () => {
    expect(animationEnabled({ isTTY: true })).toBe(true);
    expect(animationEnabled({ isTTY: false })).toBe(false);
  });
});

describe('makePalette', () => {
  it('wraps with ANSI codes when enabled', () => {
    expect(makePalette(true).red('x')).toBe('\x1b[31mx\x1b[0m');
  });
  it('returns the string unchanged when disabled', () => {
    expect(makePalette(false).red('x')).toBe('x');
    expect(makePalette(false).bold('y')).toBe('y');
  });
});

describe('renderBar', () => {
  it('is all empty at zero', () => {
    expect(renderBar(0, 8, 8)).toBe('[░░░░░░░░]');
  });
  it('is all full at completion', () => {
    expect(renderBar(8, 8, 8)).toBe('[████████]');
  });
  it('is half full at the midpoint', () => {
    expect(renderBar(4, 8, 8)).toBe('[████░░░░]');
  });
  it('clamps out-of-range and a zero total to empty', () => {
    expect(renderBar(99, 8, 8)).toBe('[████████]');
    expect(renderBar(-1, 8, 8)).toBe('[░░░░░░░░]');
    expect(renderBar(1, 0, 8)).toBe('[░░░░░░░░]');
  });
});

describe('pluralize', () => {
  it('uses the singular for 1', () => {
    expect(pluralize(1, 'photo')).toBe('1 photo');
  });
  it('adds s by default for non-1', () => {
    expect(pluralize(0, 'photo')).toBe('0 photos');
    expect(pluralize(3, 'photo')).toBe('3 photos');
  });
  it('honors an explicit plural', () => {
    expect(pluralize(2, 'rendition', 'renditions')).toBe('2 renditions');
  });
});

// A minimal Writable-like sink that records writes and lets us fake isTTY.
function fakeStream(isTTY) {
  const chunks = [];
  return {
    isTTY,
    columns: 80,
    write: (s) => { chunks.push(s); return true; },
    output: () => chunks.join(''),
    clearLine: () => {},
    cursorTo: () => {},
  };
}

describe('Ui controller', () => {
  it('runs a full phase sequence off-TTY without throwing and emits plain text', () => {
    const stream = fakeStream(false);
    const ui = new Ui({ stream, env: {} });
    ui.banner('1.0.0');
    ui.startPhases(['Pull', 'Process', 'Sync']);
    ui.phase('Pull');
    const sp = ui.spinner('downloading');
    sp.update('↓ 3 downloaded');
    sp.succeed('done');
    ui.phase('Process', 'photo-1');
    ui.success('built photo-1');
    ui.warn('a warning');
    ui.summary('Summary', [['processed', '3'], ['reused', '1']]);
    ui.stop();
    const out = stream.output();
    expect(out).toContain('Summary');
    expect(out).toContain('built photo-1');
    expect(out).not.toContain('\r'); // no carriage returns off-TTY
    expect(out).not.toContain('\x1b['); // no color codes off-TTY
  });

  it('runs the same sequence in TTY mode without throwing', () => {
    const stream = fakeStream(true);
    const ui = new Ui({ stream, env: { FORCE_COLOR: '1' } });
    ui.banner('1.0.0');
    ui.startPhases(['Pull']);
    ui.phase('Pull');
    const sp = ui.spinner('x');
    sp.fail('nope');
    ui.pause();
    ui.resume();
    ui.stop();
    expect(stream.output().length).toBeGreaterThan(0);
  });
});
