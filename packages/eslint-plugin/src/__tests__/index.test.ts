import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import plugin, { recommended, rules } from '../index.js';

describe('the plugin', () => {
  it('names every rule in the recommended config, and nothing else', () => {
    const configured = Object.keys(recommended.rules ?? {}).map((id) =>
      id.replace('use-everywhere/', ''),
    );
    expect(configured.sort()).toEqual(Object.keys(rules).sort());
  });

  it('gives every rule a description and a docs link', () => {
    for (const [id, rule] of Object.entries(rules)) {
      expect(rule.meta?.docs?.description, id).toBeTruthy();
      expect(rule.meta?.docs?.url, id).toBe(`https://rxova.github.io/use-everywhere/eslint/${id}/`);
    }
  });

  it('exposes the config on the plugin, the way flat config loads it', () => {
    expect(plugin.configs?.recommended).toBe(recommended);
  });

  // The end-to-end check the unit tests cannot make: that the plugin object,
  // the rule ids and the config all agree well enough for ESLint itself to run.
  it('reports through a real Linter run', () => {
    const messages = new Linter().verify(`function Cart() { return defineStore('cart'); }`, [
      recommended,
    ]);

    expect(messages.map((message) => message.ruleId)).toContain(
      'use-everywhere/define-at-module-scope',
    );
  });
});
