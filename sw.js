/* 마이베스트 NEXT — 서비스 워커
 *
 * 목표: 앱 아이콘으로 열었을 때 즉시 뜨고, 지하철·비행기처럼 네트워크가 끊겨도
 *       최소한 "지금 오프라인입니다" 화면 대신 앱 껍데기가 보이게 한다.
 *
 * 원칙 (중요 — 함부로 바꾸지 말 것)
 *  1) 진단 문항·응시 결과 등 API 응답은 절대 캐시하지 않는다.
 *     supabase.co 로 나가는 요청은 이 워커가 손대지 않고 그대로 통과시킨다.
 *     (캐시하면 남의 결과가 보이거나 옛 문항이 뜨는 사고가 난다.)
 *  2) HTML 은 "네트워크 우선" — 배포한 새 화면이 바로 반영돼야 한다.
 *     실패했을 때만 캐시본을 쓴다.
 *  3) 아이콘·CSS·JS 같은 정적 파일은 "캐시 우선" — 빠르게 뜨는 게 이득이고,
 *     버전을 올리면 통째로 갈린다.
 *  4) POST 등 조회가 아닌 요청은 건드리지 않는다.
 */

const VERSION = 'mbn-v1-20260825';
const SHELL = 'shell-' + VERSION;
const ASSETS = 'assets-' + VERSION;

/* 설치 직후 미리 받아 둘 것 — 오프라인에서도 첫 화면이 뜨게 하는 최소 묶음 */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 하나라도 실패해도 설치는 진행
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 새 버전이 준비됐을 때 페이지가 "지금 바꿔"라고 알려주면 즉시 교체 */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

function isHTML(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                         // 원칙 4
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // 원칙 1 — API·외부는 통과
  if (url.pathname.startsWith('/functions/')) return;

  if (isHTML(req)) {
    // 원칙 2 — 네트워크 우선, 실패 시 캐시, 그것도 없으면 첫 화면
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // 원칙 3 — 정적 파일은 캐시 우선
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
    })
  );
});
