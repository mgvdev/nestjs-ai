import { describe, expect, it } from 'vitest';
import { interpolate } from './prompt.types.js';
import { PromptRegistry } from './prompt-registry.service.js';

describe('interpolate', () => {
  it('replaces placeholders', () => {
    expect(interpolate('Hi {{name}}!', { name: 'Max' })).toBe('Hi Max!');
  });

  it('throws on a missing variable', () => {
    expect(() => interpolate('Hi {{name}}')).toThrowError(/Missing variable/);
  });
});

describe('PromptRegistry', () => {
  it('registers and renders a prompt', () => {
    const registry = new PromptRegistry();
    registry.register({ name: 'greet', template: 'Hello {{who}}.' });
    expect(registry.render('greet', { who: 'world' })).toBe('Hello world.');
  });

  it('uses the latest version by default and a specific version on request', () => {
    const registry = new PromptRegistry();
    registry.register({ name: 'sys', version: 'v1', template: 'v1 {{x}}' });
    registry.register({ name: 'sys', version: 'v2', template: 'v2 {{x}}' });
    expect(registry.render('sys', { x: 'a' })).toBe('v2 a');
    expect(registry.render('sys', { x: 'a' }, { version: 'v1' })).toBe('v1 a');
  });

  it('throws on duplicate (name, version)', () => {
    const registry = new PromptRegistry();
    registry.register({ name: 'p', version: 'v1', template: 'a' });
    expect(() =>
      registry.register({ name: 'p', version: 'v1', template: 'b' }),
    ).toThrowError(/already registered/);
  });

  it('throws for an unknown prompt', () => {
    const registry = new PromptRegistry();
    expect(() => registry.render('nope')).toThrowError(/Unknown prompt/);
  });
});
