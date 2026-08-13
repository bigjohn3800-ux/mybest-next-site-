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

test('diagnosis selection progressively reveals one grade with time and value guidance', () => {
  assert.match(html, /먼저 현재 학년대를 선택하세요/);
  assert.match(html, /각 진단은 10~20분/);
  assert.match(html, /완료 즉시 결과와 다음 행동/);
  assert.match(html, /id="gradeFilterStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /aria-pressed=/);
  assert.match(html, /onkeydown="gradeFilterKey\(event,this/);
  assert.match(html, /e\.key==='Enter'\|\|e\.key===' '/);
  assert.match(html, /style="display:\$\{target===lv\?'':'none'\}"/);
});

test('public result samples explain reason, evidence, limitation, and saved next action honestly', () => {
  const sample = fs.readFileSync(path.join(__dirname, '..', 'sample.html'), 'utf8');
  for (const label of ['추천 이유:', '근거:', '한계:', '다음 행동']) assert.match(sample, new RegExp(label));
  assert.match(sample, /보고서 형식 예시이며 개인의 실제 결과나 진로 판정이 아닙니다/);
  assert.match(sample, /공개 샘플 데이터가 아직 준비되지 않아 현재는 보고서 구조만 보여드립니다/);
  assert.match(sample, /내 결과 받고 다음 행동 저장하기/);
});
