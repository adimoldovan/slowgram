// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parse } from '../bin/cli.js';

const opts = (over = {}) => ({
  rebuildAll: false, skipConvert: false, skipResize: false, skipSync: false, ...over,
});

describe('parse', () => {
  it('bare invocation resolves to help', () => {
    expect(parse([])).toEqual({ command: 'help', options: opts(), error: null });
  });
  it('help and -h resolve to help', () => {
    expect(parse(['help']).command).toBe('help');
    expect(parse(['-h']).command).toBe('help');
    expect(parse(['--help']).command).toBe('help');
  });
  it('--version and -v resolve to version', () => {
    expect(parse(['--version']).command).toBe('version');
    expect(parse(['-v']).command).toBe('version');
  });
  it('build with no flags', () => {
    expect(parse(['build'])).toEqual({ command: 'build', options: opts(), error: null });
  });
  it('build collects its flags', () => {
    expect(parse(['build', '--rebuild-all', '--skip-sync']).options).toEqual(
      opts({ rebuildAll: true, skipSync: true })
    );
    expect(parse(['build', '--skip-convert', '--skip-resize']).options).toEqual(
      opts({ skipConvert: true, skipResize: true })
    );
  });
  it('check and sync take no flags', () => {
    expect(parse(['check']).command).toBe('check');
    expect(parse(['sync']).command).toBe('sync');
  });
  it('rejects build flags on check/sync', () => {
    expect(parse(['check', '--rebuild-all']).error).toMatch(/--rebuild-all/);
    expect(parse(['sync', '--skip-sync']).error).toMatch(/--skip-sync/);
  });
  it('rejects an unknown subcommand', () => {
    const r = parse(['frobnicate']);
    expect(r.error).toMatch(/frobnicate/);
  });
  it('rejects an unknown flag', () => {
    const r = parse(['build', '--turbo']);
    expect(r.error).toMatch(/--turbo/);
  });
});
