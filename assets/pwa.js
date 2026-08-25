/* 마이베스트 NEXT — 앱 설치 도우미
 *
 * 하는 일 두 가지
 *  1) 서비스 워커를 등록해 앱으로 설치 가능한 상태로 만든다.
 *  2) 아직 설치하지 않은 사람에게만 설치 방법을 알려 준다.
 *     · 안드로이드/크롬 — 브라우저가 주는 설치 창을 띄우는 버튼
 *     · 아이폰/사파리   — 설치 창이 없으므로 "공유 → 홈 화면에 추가" 안내
 *
 * 원칙: 이미 앱으로 열었거나, 한 번 닫은 사람에게는 다시 띄우지 않는다.
 *       진단을 푸는 도중에는 절대 방해하지 않는다.
 */
(function () {
  'use strict';

  var KEY = 'mbn_install_dismissed';
  var deferred = null;

  /* ── 1. 서비스 워커 ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  /* ── 판별 ── */
  function installed() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isSafari() {
    var ua = navigator.userAgent;
    return /safari/i.test(ua) && !/crios|fxios|edgios|chrome/i.test(ua);
  }
  function dismissed() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function busy() {
    /* 아래 상황에서는 절대 띄우지 않는다.
       · 진단을 푸는 중 — 흐름을 끊으면 안 된다
       · 쿠키·개인정보 동의창(#ls-banner)이 떠 있을 때 — 화면 아래를 먼저 차지하고 있어
         두 개가 겹쳐 보이고, 동의가 더 급한 일이다
       · 다른 모달이 열려 있을 때 */
    if (document.querySelector('.quizwrap, #quiz, .qbox')) return true;
    if (visible(document.getElementById('ls-banner'))) return true;
    if (document.querySelector('.modal.open, .mbn-sheet')) return true;
    return false;
  }
  /* 지금 바쁘면 잠시 뒤 다시 본다 — 동의창을 닫고 나면 그때 안내한다 */
  function whenFree(fn) {
    var tries = 0;
    (function tick() {
      if (installed() || dismissed()) return;
      if (!busy()) { fn(); return; }
      if (++tries > 60) return;          /* 2분간 계속 바쁘면 포기 */
      setTimeout(tick, 2000);
    })();
  }

  /* ── 스타일 ── */
  function styles() {
    if (document.getElementById('mbn-pwa-css')) return;
    var s = document.createElement('style');
    s.id = 'mbn-pwa-css';
    s.textContent =
      '.mbn-ib{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:9998;' +
      'width:min(560px,calc(100% - 24px));background:#fff;border:1px solid #E7E4FB;' +
      'border-radius:16px;box-shadow:0 10px 34px rgba(27,42,74,.18);padding:14px 16px;' +
      'display:flex;gap:12px;align-items:center;font-family:inherit;animation:mbnUp .28s ease-out}' +
      '@keyframes mbnUp{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}' +
      '@media (prefers-reduced-motion:reduce){.mbn-ib{animation:none}}' +
      '.mbn-ib img{width:44px;height:44px;border-radius:11px;flex:none}' +
      '.mbn-ib .mbn-tx{flex:1;min-width:0}' +
      '.mbn-ib b{display:block;font-size:14.5px;color:#23284A;font-weight:700;line-height:1.35}' +
      '.mbn-ib span{display:block;font-size:12.5px;color:#5C617C;margin-top:2px;line-height:1.45}' +
      '.mbn-ib button{border:0;border-radius:10px;padding:9px 14px;font-size:13.5px;font-weight:700;' +
      'cursor:pointer;font-family:inherit;white-space:nowrap}' +
      '.mbn-go{background:#6C5CE7;color:#fff}' +
      '.mbn-x{background:transparent;color:#8C90A8;padding:9px 6px !important;font-weight:600 !important}' +
      '.mbn-sheet{position:fixed;inset:0;z-index:9999;background:rgba(20,24,40,.5);' +
      'display:flex;align-items:flex-end;justify-content:center;padding:14px;animation:mbnFade .2s ease-out}' +
      '@keyframes mbnFade{from{opacity:0}to{opacity:1}}' +
      '.mbn-card{background:#fff;border-radius:20px;width:min(460px,100%);padding:20px 20px 16px;' +
      'font-family:inherit;max-height:86vh;overflow:auto}' +
      '.mbn-card h3{margin:0 0 4px;font-size:17px;color:#23284A;font-weight:800}' +
      '.mbn-card p{margin:0 0 14px;font-size:13.5px;color:#5C617C;line-height:1.6}' +
      '.mbn-step{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid #F0EEF9}' +
      '.mbn-step i{flex:none;width:23px;height:23px;border-radius:50%;background:#F1EEFF;color:#6C5CE7;' +
      'font-style:normal;font-size:12.5px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}' +
      '.mbn-step div{font-size:14px;color:#23284A;line-height:1.55}' +
      '.mbn-step em{font-style:normal;color:#6C5CE7;font-weight:700}' +
      '.mbn-close{width:100%;margin-top:14px;background:#F4F3FB;color:#23284A;border:0;border-radius:12px;' +
      'padding:13px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit}' +
      '@media (prefers-color-scheme:dark){' +
      '.mbn-ib,.mbn-card{background:#1E2230;border-color:#2E3448}' +
      '.mbn-ib b,.mbn-card h3,.mbn-step div{color:#E9EBF3}' +
      '.mbn-ib span,.mbn-card p{color:#A0A7BD}' +
      '.mbn-step{border-color:#2B3145}.mbn-step i{background:#2B2748;color:#A99BFF}' +
      '.mbn-close{background:#2A3042;color:#E9EBF3}}';
    document.head.appendChild(s);
  }

  /* ── 하단 안내 바 ── */
  function bar(text, sub, label, onGo) {
    if (document.querySelector('.mbn-ib')) return;
    styles();
    var d = document.createElement('div');
    d.className = 'mbn-ib';
    d.setAttribute('role', 'region');
    d.setAttribute('aria-label', '앱 설치 안내');
    d.innerHTML =
      '<img src="/icons/icon-192.png" alt="">' +
      '<div class="mbn-tx"><b>' + text + '</b><span>' + sub + '</span></div>' +
      '<button class="mbn-go" type="button">' + label + '</button>' +
      '<button class="mbn-x" type="button" aria-label="닫기">✕</button>';
    d.querySelector('.mbn-go').addEventListener('click', function () { onGo(d); });
    d.querySelector('.mbn-x').addEventListener('click', function () {
      remember(); d.remove();
    });
    document.body.appendChild(d);
  }

  /* ── 아이폰 안내 시트 ── */
  function iosSheet() {
    styles();
    var w = document.createElement('div');
    w.className = 'mbn-sheet';
    w.innerHTML =
      '<div class="mbn-card" role="dialog" aria-modal="true" aria-label="홈 화면에 추가하는 방법">' +
      '<h3>홈 화면에 추가하기</h3>' +
      '<p>세 번만 누르면 끝납니다. 다음부터는 앱 아이콘으로 바로 열려요.</p>' +
      '<div class="mbn-step"><i>1</i><div>화면 아래 <em>공유 버튼</em>(⬆︎ 네모에서 화살표가 나온 모양)을 누르세요.</div></div>' +
      '<div class="mbn-step"><i>2</i><div>목록을 내려 <em>홈 화면에 추가</em>를 고르세요.</div></div>' +
      '<div class="mbn-step"><i>3</i><div>오른쪽 위 <em>추가</em>를 누르면 바탕화면에 아이콘이 생깁니다.</div></div>' +
      '<button class="mbn-close" type="button">알겠습니다</button></div>';
    function close() { w.remove(); }
    w.querySelector('.mbn-close').addEventListener('click', function () { remember(); close(); });
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(w);
  }

  /* ── 안드로이드: 브라우저가 설치 창을 줄 때 ── */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (installed() || dismissed()) return;
    setTimeout(function () {
      whenFree(function () {
        bar('마이베스트 앱으로 쓰기', '홈 화면에 추가하면 한 번에 열려요.', '설치',
          function (el) {
            el.remove();
            deferred.prompt();
            deferred.userChoice.then(function (r) {
              if (r.outcome === 'accepted') remember();
              deferred = null;
            });
          });
      });
    }, 2500);
  });

  window.addEventListener('appinstalled', function () {
    remember();
    var el = document.querySelector('.mbn-ib');
    if (el) el.remove();
  });

  /* ── 아이폰: 설치 창이 없으므로 직접 안내 ── */
  window.addEventListener('load', function () {
    if (!isIOS() || !isSafari() || installed() || dismissed()) return;
    setTimeout(function () {
      whenFree(function () {
        bar('마이베스트 앱으로 쓰기', '홈 화면에 추가하면 한 번에 열려요.', '방법 보기',
          function (el) { el.remove(); iosSheet(); });
      });
    }, 2500);
  });

  /* 다른 화면에서 직접 부를 수 있게 열어 둔다 (예: 설정 메뉴의 "앱으로 설치") */
  window.MBNInstall = function () {
    if (installed()) { alert('이미 앱으로 실행 중입니다.'); return; }
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); return; }
    if (isIOS()) { iosSheet(); return; }
    alert('브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 눌러 주세요.');
  };
})();
