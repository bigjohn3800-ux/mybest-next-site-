/*! ev-gate.js v2 — 에듀버스 공용 이용권한 게이트 + 후기 수집   2026-08-15  삼성-운영
 *
 *  왜 이 파일이 있는가
 *    서비스 24종이 각자 구현하면 하나만 틀려도 그 서비스는 한도가 없는 것과 같습니다.
 *    구현은 여기 한 벌만 두고, 각 서비스는 script 한 줄만 붙입니다.
 *
 *  ★ 안전장치 — 모드는 DB 가 정합니다 (otn_gate_config)
 *      off      아무것도 하지 않음
 *      observe  판정만 하고 막지 않음. 콘솔에 「막혔을 것」을 남김   ← 지금 전 서비스 기본값
 *      enforce  실제로 막음
 *    otn_grants 가 아직 0행이라 지금 enforce 로 켜면 전원이 막힙니다.
 *    배선을 먼저 끝내고, 권한 원장이 채워진 뒤 DB 한 줄로 서비스별로 올립니다.
 *    **배포를 다시 하지 않아도 됩니다.**
 *
 *  붙이는 법
 *    <script src="/assets/ev-gate.js" data-ev-service="chunk" defer></script>
 *
 *  쓰는 법
 *    if (!(await EVGate.take())) return;         // 유료·한도 기능 직전
 *    await EVGate.review({ page: '/result' });   // 결과가 나온 직후 별점 묻기
 */
(function (global) {
  'use strict';

  var URL_ = 'https://onqisdgxwuvlxehjvoto.supabase.co';
  var KEY_ = 'sb_publishable_z3KmGPFA4RKka5e_tDWD5A_-CUDC7t8';

  var me = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    for (var i = s.length - 1; i >= 0; i--) if (s[i].src && s[i].src.indexOf('ev-gate') >= 0) return s[i];
    return null;
  })();
  function attr(n, d) { return (me && me.getAttribute(n)) || d; }

  var CFG = {
    service: attr('data-ev-service', global.EV_SERVICE || ''),
    contact: attr('data-ev-contact', 'https://eduverse.mybestedu.ai/'),
    pricing: attr('data-ev-pricing', 'https://eduverse.mybestedu.ai/'),
    login:   attr('data-ev-login', '/auth.html')
  };

  var sb = null;
  function client() {
    if (sb) return sb;
    if (global.EV_SB) { sb = global.EV_SB; return sb; }
    if (!global.supabase || !global.supabase.createClient) return null;
    sb = global.supabase.createClient(URL_, KEY_, { auth: { flowType: 'implicit', persistSession: true } });
    return sb;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(k, v) {
    try { if (v === undefined) return global.localStorage.getItem(k); global.localStorage.setItem(k, v); }
    catch (e) { return null; }
  }

  /* ---------- 공통 창 ---------- */
  var CSS = '\
.evg-back{position:fixed;inset:0;background:rgba(20,16,40,.55);display:flex;align-items:center;\
justify-content:center;padding:18px;z-index:99999}\
.evg-box{background:#fff;color:#221D33;border-radius:16px;max-width:420px;width:100%;padding:22px;\
box-shadow:0 20px 60px rgba(0,0,0,.25);font:15px/1.65 Pretendard,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}\
.evg-box h2{margin:0 0 10px;font-size:17px}.evg-box p{margin:0 0 14px;color:#4A4361}\
.evg-meter{background:#EFEBFF;border-radius:9px;padding:9px 12px;font-size:13.5px;color:#4A2ED4;margin:0 0 14px}\
.evg-acts{display:flex;gap:8px;flex-wrap:wrap}\
.evg-acts a,.evg-acts button{font:inherit;cursor:pointer;border-radius:9px;padding:9px 14px;\
border:1px solid #E9E5F6;background:#fff;color:#221D33;text-decoration:none;display:inline-block}\
.evg-acts .evg-pri{background:#4A2ED4;border-color:#4A2ED4;color:#fff;font-weight:600}\
.evg-acts a:focus-visible,.evg-acts button:focus-visible,.evg-star:focus-visible{outline:2px solid #4A2ED4;outline-offset:2px}\
.evg-stars{display:flex;gap:4px;margin:0 0 14px}\
.evg-star{font-size:30px;line-height:1;background:none;border:0;cursor:pointer;padding:2px 4px;color:#C9C2E0;border-radius:8px}\
.evg-star[aria-pressed="true"]{color:#F0A93B}\
.evg-ta{width:100%;font:inherit;border:1px solid #E9E5F6;border-radius:9px;padding:9px;margin:0 0 12px;\
background:#fff;color:#221D33;box-sizing:border-box}\
@media (prefers-color-scheme:dark){.evg-box{background:#1E1932;color:#F2EFFA}.evg-box p{color:#CFC8E4}\
.evg-meter{background:#2A2246;color:#BCA9FF}\
.evg-acts a,.evg-acts button,.evg-ta{background:#1E1932;color:#F2EFFA;border-color:#332C4A}\
.evg-acts .evg-pri{background:#BCA9FF;border-color:#BCA9FF;color:#1A1430}\
.evg-star{color:#5A5378}}\
@media (prefers-reduced-motion:reduce){.evg-back,.evg-star{transition:none}}';

  function styleOnce() {
    if (document.getElementById('evg-style')) return;
    var st = document.createElement('style'); st.id = 'evg-style'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function modal(html, label) {
    styleOnce();
    var back = document.createElement('div');
    back.className = 'evg-back';
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', label || '알림');
    back.innerHTML = '<div class="evg-box">' + html + '</div>';
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (back.parentNode) back.parentNode.removeChild(back);
    }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    var f = back.querySelector('button,a,textarea'); if (f) f.focus();
    return { el: back, close: close };
  }

  /* ---------- 차단 안내 ---------- */
  var COPY = {
    login_required: { h: '로그인이 필요합니다', p: '이 기능은 로그인한 뒤에 이용하실 수 있습니다.',
      a: [{ t: '로그인하러 가기', href: CFG.login, pri: 1 }] },
    not_granted: { h: '아직 이용 권한이 없습니다',
      p: '개인 구독을 시작하시거나, 소속 기관을 통해 배정받으시면 바로 이용하실 수 있습니다.',
      a: [{ t: '이용 안내 보기', href: CFG.pricing, pri: 1 }, { t: '문의하기', href: CFG.contact }] },
    quota_learner: { h: '배정된 횟수를 모두 쓰셨습니다',
      p: '이번에 회원님께 배정된 이용 횟수가 끝났습니다. 다음 배정이 시작되면 다시 이용하실 수 있습니다.',
      a: [{ t: '이용 안내 보기', href: CFG.pricing, pri: 1 }, { t: '닫기', close: 1 }] },
    quota_org: { h: '기관에 배정된 횟수가 끝났습니다',
      p: '회원님 개인의 문제가 아닙니다. 소속 기관 전체에 배정된 이용 횟수를 모두 사용했습니다. 담당 선생님이나 관리자께 말씀해 주시면 추가 배정이 가능합니다.',
      a: [{ t: '닫기', close: 1, pri: 1 }] },
    expired: { h: '이용 기간이 지났습니다',
      p: '배정된 이용 기간이 끝났습니다. 담당 선생님이나 관리자께 문의해 주세요.',
      a: [{ t: '문의하기', href: CFG.contact, pri: 1 }, { t: '닫기', close: 1 }] },
    error: { h: '잠시 연결이 어렵습니다',
      p: '권한을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요. 계속되면 문의해 주십시오.',
      a: [{ t: '다시 시도', reload: 1, pri: 1 }, { t: '문의하기', href: CFG.contact }] }
  };
  function pick(r) {
    if (!r) return COPY.error;
    if (r.reason === 'login_required') return COPY.login_required;
    if (r.reason === 'quota_exceeded') return r.scope === 'org' ? COPY.quota_org : COPY.quota_learner;
    if (r.reason === 'not_granted') return COPY.not_granted;
    if (r.reason === 'expired') return COPY.expired;
    return COPY.error;
  }
  function block(r) {
    var c = pick(r);
    var meter = (r && r.max_uses != null && r.used != null)
      ? '<div class="evg-meter">사용 ' + esc(r.used) + ' / 배정 ' + esc(r.max_uses) + '</div>' : '';
    var acts = c.a.map(function (b, i) {
      var cls = b.pri ? 'evg-pri' : '';
      return b.href ? '<a class="' + cls + '" href="' + esc(b.href) + '">' + esc(b.t) + '</a>'
                    : '<button class="' + cls + '" data-evg="' + i + '">' + esc(b.t) + '</button>';
    }).join('');
    var m = modal('<h2>' + esc(c.h) + '</h2><p>' + esc(c.p) + '</p>' + meter
                + '<div class="evg-acts">' + acts + '</div>', c.h);
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-evg]');
      if (!b) return;
      var spec = c.a[parseInt(b.getAttribute('data-evg'), 10)];
      if (spec && spec.reload) { location.reload(); return; }
      m.close();
    });
    return m;
  }

  /* ---------- 본체 ---------- */
  function newRef() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
  var _gate = null;
  async function gate(feature) {
    var s = client();
    if (!s || !CFG.service) return { mode: 'off', access: null, error: 'not_configured' };
    var r = await s.rpc('otn_gate', { p_service: CFG.service, p_feature: feature || '*' });
    if (r.error) return { mode: 'off', access: null, error: r.error.message };
    return r.data || { mode: 'off', access: null };
  }

  var EVGate = {
    service: function () { return CFG.service; },

    mode: async function (feature) { _gate = await gate(feature); return _gate.mode; },

    // 소비 없이 판단만
    check: async function (feature) {
      var g = await gate(feature);
      var a = g.access || {};
      return {
        mode: g.mode, allowed: !!a.allowed, endsAt: a.ends_at, used: a.used, usedTotal: a.used_total,
        maxUses: a.max_uses, maxPerLearner: a.max_uses_per_learner,
        remaining: a.remaining, deniedBy: a.denied_by, source: a.source, error: g.error
      };
    },

    // 실제 1회 차감. 같은 ref 는 두 번 세지 않습니다.
    consume: async function (opt) {
      opt = opt || {};
      var s = client();
      if (!s || !CFG.service) return { ok: false, reason: 'not_configured' };
      var r = await s.rpc('otn_access_consume', {
        p_service: CFG.service, p_feature: opt.feature || '*', p_ref: opt.ref || newRef()
      });
      if (r.error) return { ok: false, reason: 'error', message: r.error.message };
      return r.data || { ok: false, reason: 'error' };
    },

    block: block,

    // 대부분의 서비스가 쓸 한 줄.
    //   off      → 항상 true
    //   observe  → 항상 true. 막혔을 상황이면 콘솔에 남깁니다 (소비하지 않음)
    //   enforce  → 실제로 막고, 통과할 때 1회 차감
    take: async function (opt) {
      opt = opt || {};
      var g = await gate(opt.feature);

      if (g.mode === 'off') return true;

      if (g.mode === 'observe') {
        var a = g.access || {};
        if (!a.allowed) {
          try {
            console.info('[ev-gate] observe — 지금이 enforce 였다면 막혔습니다.',
              { service: CFG.service, feature: opt.feature || '*', denied_by: a.denied_by });
          } catch (e) {}
        }
        return true;
      }

      var r = await EVGate.consume(opt);
      if (r && r.ok && (r.charged || r.idempotent)) return true;
      block(r);
      return false;
    },

    // 남은 횟수 배지
    badge: async function (el, feature) {
      var a = await EVGate.check(feature);
      if (!el) return a;
      if (!a.allowed || (a.maxPerLearner == null && a.maxUses == null)) { el.textContent = ''; return a; }
      el.textContent = a.remaining != null ? ('남은 횟수 ' + a.remaining + '회')
                                           : ('사용 ' + (a.usedTotal || 0) + ' / ' + a.maxUses);
      return a;
    },

    /* ---------- 후기 ---------- *
     * 결과가 나온 직후에만 부르십시오. 가치를 받은 순간이 아니면 아무도 남기지 않습니다.
     *   await EVGate.review({ page: '/result' });
     * 같은 서비스 기준 30일에 한 번, 「다음에」 두 번이면 90일 침묵합니다.
     */
    review: async function (opt) {
      opt = opt || {};
      var s = client();
      if (!s || !CFG.service) return false;
      var kQ = 'evg.rv.' + CFG.service, kS = 'evg.rvskip.' + CFG.service;
      var now = Date.now();
      if (!opt.force) {
        var until = parseInt(store(kQ) || '0', 10);
        if (until && now < until) return false;
      }
      var u = await s.auth.getUser();
      if (!u.data || !u.data.user) return false;      // 익명 후기는 받지 않습니다
      var uid = u.data.user.id;

      var rating = 0;
      var m = modal(
        '<h2>방금 나온 결과, 도움이 되셨나요?</h2>'
      + '<div class="evg-stars" role="group" aria-label="별점">'
      + [1,2,3,4,5].map(function(i){
          return '<button class="evg-star" data-s="'+i+'" aria-pressed="false" aria-label="'+i+'점">★</button>';
        }).join('')
      + '</div>'
      + '<div id="evg-more" style="display:none"><textarea class="evg-ta" id="evg-body" rows="3" '
      + 'maxlength="1000" placeholder="한 줄만 더 남겨 주시면 큰 도움이 됩니다 (선택)"></textarea></div>'
      + '<div class="evg-acts"><button class="evg-pri" id="evg-send">보내기</button>'
      + '<button id="evg-skip">다음에</button></div>'
      + '<p class="evg-meter" id="evg-msg" style="display:none"></p>',
        '후기 남기기');

      var box = m.el;
      box.addEventListener('click', function (e) {
        var st = e.target.closest && e.target.closest('.evg-star');
        if (st) {
          rating = parseInt(st.getAttribute('data-s'), 10);
          box.querySelectorAll('.evg-star').forEach(function (b) {
            b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-s'),10) <= rating ? 'true' : 'false');
          });
          // 4~5점에만 한 줄을 폅니다. 좋은 후기가 길게 옵니다.
          box.querySelector('#evg-more').style.display = rating >= 4 ? 'block' : 'none';
          if (rating <= 3 && rating > 0) {
            box.querySelector('#evg-more').style.display = 'block';
            box.querySelector('#evg-body').placeholder = '무엇이 아쉬우셨나요? 고치는 데 쓰겠습니다 (선택)';
          }
          return;
        }
        if (e.target.id === 'evg-skip') {
          var n = parseInt(store(kS) || '0', 10) + 1;
          store(kS, String(n));
          store(kQ, String(now + (n >= 2 ? 90 : 7) * 864e5));
          m.close();
          return;
        }
        if (e.target.id === 'evg-send') {
          if (!rating) { var w = box.querySelector('#evg-msg'); w.style.display='block'; w.textContent='별을 하나 눌러 주세요.'; return; }
          e.target.disabled = true;
          s.from('otn_feedback').insert({
            user_id: uid, service_code: CFG.service, page: opt.page || location.pathname,
            rating: rating, body: (box.querySelector('#evg-body') || {}).value || null,
            plan_at_time: opt.plan || null
          }).then(function (res) {
            store(kQ, String(now + 30 * 864e5));
            store(kS, '0');
            var w = box.querySelector('#evg-msg'); w.style.display = 'block';
            w.textContent = res.error ? ('보내지 못했습니다. ' + res.error.message) : '고맙습니다. 잘 받았습니다.';
            if (!res.error) setTimeout(m.close, 1200); else e.target.disabled = false;
          });
        }
      });
      return true;
    }
  };

  /* ---------- 행동 계측 ----------
   * 후기는 잘 안 남깁니다. 클릭·머문 시간·완료는 남습니다.
   * 자동으로 도는 것 — 화면 열림 · 머문 시간 · 이탈
   * 손으로 부르는 것 — EVGate.track('report_open') · EVGate.done('diagnosis')
   * 마크업으로 — <button data-ev-track="report_open">
   * 비로그인 방문자도 셉니다. 개인정보는 담지 않습니다.
   */
  var SID = (function () {
    try {
      var k = 'evg.sid', v = sessionStorage.getItem(k);
      if (!v) { v = (global.crypto && crypto.randomUUID ? crypto.randomUUID()
                    : 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
                sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 's-' + Date.now(); }
  })();

  var T0 = Date.now(), sentDwell = false, uid = null;

  function send(rows, keepalive) {
    if (!CFG.service || !rows.length) return;
    try {
      fetch(URL_ + '/rest/v1/otn_usage_events', {
        method: 'POST', keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', apikey: KEY_,
                   Authorization: 'Bearer ' + KEY_, Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      }).catch(function () {});
    } catch (e) {}
  }
  function row(feature, extra) {
    var r = { service_code: CFG.service, feature_code: feature, quantity: 1,
              session_id: SID, page: location.pathname };
    if (uid) r.user_id = uid;
    if (extra && extra.dwell_ms != null) r.dwell_ms = extra.dwell_ms;
    if (extra && extra.meta) r.meta = extra.meta;
    return r;
  }

  EVGate.track = function (feature, meta) { send([row(feature || 'click', { meta: meta })]); };
  EVGate.done  = function (feature, meta) {
    send([row('complete', { meta: Object.assign({ of: feature || null }, meta || {}),
                            dwell_ms: Date.now() - T0 })]);
  };

  (function telemetry() {
    // 로그인한 사람이면 user_id 를 붙인다. 없으면 익명으로 센다.
    try {
      var c = client();
      if (c && c.auth && c.auth.getUser) {
        c.auth.getUser().then(function (u) {
          if (u && u.data && u.data.user) uid = u.data.user.id;
        }).catch(function () {});
      }
    } catch (e) {}

    var start = function () { send([row('view')]); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    // 클릭 계측 — data-ev-track 이 붙은 것만
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-ev-track]');
      if (!t) return;
      EVGate.track(t.getAttribute('data-ev-track') || 'click');
    }, true);

    // 머문 시간 — 탭을 덮거나 떠날 때 한 번만
    var flush = function () {
      if (sentDwell) return; sentDwell = true;
      send([row('dwell', { dwell_ms: Date.now() - T0 })], true);
    };
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
    global.addEventListener('pagehide', flush);
  })();

  // 결과 화면에서 자동으로 별점 묻기.
  // 서비스는 script 태그에 data-ev-review="auto" 만 붙이면 됩니다.
  // 결과가 화면에 나온 뒤 12초 뒤에 한 번. 30일 1회 규칙은 그대로입니다.
  if ((me && me.getAttribute('data-ev-review')) === 'auto') {
    var fired = false;
    var ask = function () {
      if (fired) return; fired = true;
      setTimeout(function () { EVGate.review({ page: location.pathname }); }, 12000);
    };
    var probe = function () {
      // 결과로 볼 만한 신호가 있으면 묻는다
      if (document.querySelector('[data-ev-result]')) return ask();
      if (/result|report|리포트|결과/i.test(location.pathname + location.search)) return ask();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', probe);
    } else { probe(); }
    // 나중에 그려지는 화면도 잡는다 (SPA)
    try {
      new MutationObserver(function () {
        if (!fired && document.querySelector('[data-ev-result]')) ask();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  global.EVGate = EVGate;
})(typeof window !== 'undefined' ? window : this);
