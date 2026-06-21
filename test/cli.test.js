// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parse } from '../bin/cli.js';

const opts = (over = {}) => ({
  rebuildAll: false,
  skipConvert: false,
  skipResize: false,
  skipSync: false,
  assumeYes: false,
  ...over,
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
  it('build accepts --yes and -y', () => {
    expect(parse(['build', '--yes']).options).toEqual(opts({ assumeYes: true }));
    expect(parse(['build', '-y']).options).toEqual(opts({ assumeYes: true }));
  });
  it('sync accepts --yes and -y', () => {
    expect(parse(['sync', '--yes'])).toEqual({
      command: 'sync',
      options: opts({ assumeYes: true }),
      error: null,
    });
    expect(parse(['sync', '-y']).options).toEqual(opts({ assumeYes: true }));
  });
  it('check and sync take no build flags', () => {
    expect(parse(['check']).command).toBe('check');
    expect(parse(['sync']).command).toBe('sync');
  });
  it('rejects build flags on check/sync', () => {
    expect(parse(['check', '--rebuild-all']).error).toMatch(/--rebuild-all/);
    expect(parse(['sync', '--skip-sync']).error).toMatch(/--skip-sync/);
  });
  it('rejects --yes on check', () => {
    expect(parse(['check', '--yes']).error).toMatch(/--yes/);
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
