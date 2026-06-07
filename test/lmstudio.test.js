import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseRepetition } from '../server/services/lmstudio.js';

test('collapseRepetition tames runaway model loops', () => {
  const loop = `The voice and tone are ${'they are '.repeat(300)}done.`;
  const out = collapseRepetition(loop);
  assert.ok(out.length < 200, `expected short output, got ${out.length}`);
  assert.ok(out.includes('The voice and tone are'));
  assert.ok(out.includes('done.'));
});

test('collapseRepetition collapses single-word repeats and leaves normal text alone', () => {
  assert.equal(collapseRepetition('this is is is is fine'), 'this is fine');
  assert.equal(collapseRepetition('a clean, ordinary sentence.'), 'a clean, ordinary sentence.');
});
