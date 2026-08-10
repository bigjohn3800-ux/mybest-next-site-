const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const callbackPath = path.join(root, 'auth-callback.html');
const htmlBuffer = fs.readFileSync(callbackPath);
const html = htmlBuffer.toString('utf8');
const netlify = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');

test('callback is ASCII-safe valid UTF-8 markup with a stable identity', () => {
  assert.equal(Buffer.from(html, 'utf8').compare(htmlBuffer), 0);
  assert.doesNotMatch(html, /\uFFFD/);
  assert.match(html, /<html lang="en" data-eduverse-callback="mybestnext-v2">/);
  assert.doesNotMatch(html, /[^\x00-\x7F]/);
  assert.match(html, /<h1>Connecting your sign-in<\/h1>/);
  assert.match(html, /<title>EDUVERSE Sign-in \| MyBest NEXT<\/title>/);
});

test('canonical scripts load in order without embedded credential markers', () => {
  const sdk = html.indexOf('@supabase/supabase-js@2');
  const env = html.indexOf('/assets/env.js');
  const auth = html.indexOf('/assets/eduverse-auth.js');
  assert.ok(sdk >= 0 && sdk < env && env < auth);
  assert.doesNotMatch(html, /service_role|sb_secret_|SUPABASE_SERVICE_ROLE|private[_-]?key/i);
});

test('callback is authorization-neutral and cannot mint myb-admin state', () => {
  assert.doesNotMatch(html, /myb_adm_|myb-admin|user_metadata|app_metadata|ev_role/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie/i);
  assert.match(html, /EduverseAuth\.getUser\(\)/);
});

test('direct and EDUVERSE subpath callbacks scrub query and fragment', () => {
  assert.match(html, /\/s\/mybestnext\/auth-callback\.html/);
  assert.match(html, /history\.replaceState\(null, '', callbackPath\)/);
  assert.doesNotMatch(html, /location\.(hash|search)/);
  assert.match(html, /location\.replace\(home\)/);
});

test('configuration and session failures scrub the URL and fail closed', () => {
  assert.match(html, /if \(!window\.EduverseAuth \|\| !window\.EduverseAuth\.configured\)/);
  assert.match(html, /function failClosed\(\)/);
  assert.match(html, /\.catch\(failClosed\)/);
  const scrubCalls = html.match(/scrubCallbackUrl\(\)/g) || [];
  assert.ok(scrubCalls.length >= 4);
});

test('exact callback redirect is a distinct rule before SPA catch-all', () => {
  const callback = netlify.indexOf('from = "/auth-callback.html"');
  const catchAll = netlify.indexOf('from = "/*"');
  assert.ok(callback >= 0 && callback < catchAll);
  const between = netlify.slice(callback, catchAll);
  assert.match(between, /to = "\/auth-callback\.html"/);
  assert.match(between, /status = 200/);
  const catchAllPrefix = netlify.slice(Math.max(0, catchAll - 40), catchAll);
  assert.match(catchAllPrefix, /\[\[redirects\]\]/);
});
