import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from '../src/utils.js';

test('parses plain JSON', () => {
  assert.deepEqual(parseJson('{"ok":true}'), { ok: true });
});
test('parses fenced JSON', () => {
  assert.deepEqual(parseJson('```json\n{"ok":true}\n```'), { ok: true });
});
test('parses JSON embedded in prose', () => {
  assert.deepEqual(parseJson('result:\n{"ok":true}\nend'), { ok: true });
});
