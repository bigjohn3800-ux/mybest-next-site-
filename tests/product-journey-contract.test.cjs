const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('all inline JavaScript blocks parse independently', () => {
  const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=|type\s*=\s*["']application\/ld\+json/i.test(match[1]))
    .map((match) => match[2].trim())
    .filter(Boolean);
  assert.ok(blocks.length > 0);
  blocks.forEach((source) => new Function(source));
});

test('the four-step journey is visible from selection through action save', () => {
  for (const label of ['진단 선택', '진단 완료', '결과 이해', '행동 저장']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /aria-label="진단 여정"/);
  assert.match(html, /saveRecommendedAction/);
  assert.match(html, /myb_action_/);
});

test('pause and resume preserve progress without a browser confirm dialog', () => {
  assert.match(html, /function showResumeDialog/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /savedAt:new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(html, /confirm\(`이전에/);
});

test('loading, empty, and error states are announced and retryable', () => {
  for (const state of ["'loading'", "'empty'", "'error'"]) assert.match(html, new RegExp(state));
  assert.match(html, /role="\$\{role\}" aria-live="polite"/);
  assert.match(html, /다시 시도/);
  assert.match(html, /답변은 이 브라우저에 그대로 남아 있습니다/);
});

test('keyboard focus and mobile result readability have explicit contracts', () => {
  assert.match(html, /:focus-visible/);
  assert.match(html, /e\.key==='Escape'/);
  assert.match(html, /@media\(max-width:480px\)/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /resultHeading\.focus\(\)/);
});

test('result explanation names reason, evidence, limitations, and local-only scope', () => {
  for (const label of ['추천 이유:', '근거:', '한계:']) assert.match(html, new RegExp(label));
  assert.match(html, /다른 기기에는 자동 동기화되지 않습니다/);
  assert.match(html, /이 브라우저에 별도로 저장됩니다/);
});

test('every local asset referenced by the main journey exists in the deploy bundle', () => {
  const refs = [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((ref) => ref.startsWith('/assets/'));

  assert.ok(refs.length > 0);
  for (const ref of refs) {
    const assetPath = path.join(__dirname, '..', ref.replace(/^\//, ''));
    assert.ok(fs.existsSync(assetPath), `missing deploy asset: ${ref}`);
  }
});
