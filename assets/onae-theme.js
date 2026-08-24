/* ============================================================================
   onae-theme.js — 테마 3종 + 한/영 전환 위젯 v1.0.0
   ----------------------------------------------------------------------------
   위치(정본) : 0.core-info/22.book-module/14.design-mo/onae-theme.js
   작성       : 2026-07-29 (관제센터 세션 · 회장님 지시)
   짝 파일    : onae-theme.css (위젯·테마 스타일) / onae-responsive.css (반응형)

   ■ 적용 (사이트에서 딱 두 줄)
       <link rel="stylesheet" href="/assets/onae-responsive.css">
       <link rel="stylesheet" href="/assets/onae-theme.css">
       <script src="/assets/onae-theme.js" defer></script>
     ↑ CSS 2줄은 링크만 해서는 화면이 안 바뀐다(responsive 는 html.onae-rwd 아래에만
       규칙이 있고, theme 는 data-onae-theme 아래에만 있다).
       이 스크립트가 로드돼야 비로소 적용된다 = <script> 한 줄이 켜고 끄는 스위치.

   ■ 사이트별 영어 사전 (선택)
     같은 폴더에 onae-i18n.<사이트키>.js 를 두고 먼저 로드하면 된다:
       window.ONAE_I18N_EN = { "무료 체험": "Free trial", ... };
     내장 사전보다 사이트 사전이 우선한다.

   ■ 하지 않는 것 (정직하게)
     - 자동 번역이 아니다. 사전에 없는 문장은 한국어 그대로 남는다.
       패널에 그 사실을 표시한다. 사전을 채우는 만큼 영어화가 올라간다.
     - 서버·DB에서 내려오는 콘텐츠 본문은 번역하지 않는다(UI·안내문 위주).
   ========================================================================== */
(function () {
  'use strict';
  if (window.__ONAE_SWITCHER__) return;
  window.__ONAE_SWITCHER__ = true;

  var LS_THEME = 'onae.theme';
  var LS_LANG  = 'onae.lang';
  var THEMES = [
    { id: 'default',  ko: '밝은',   en: 'Light',    dot: '#143A6B' },
    { id: 'dark',     ko: '어두운', en: 'Dark',     dot: '#4FD1A5' },
    { id: 'cute',     ko: '귀여운', en: 'Cute',     dot: '#E8548E' },
    { id: 'contrast', ko: '고대비', en: 'Contrast', dot: '#3FD9C0' }
  ];

  /* ---------- 저장소 (사파리 프라이빗 모드 등에서 예외가 나도 죽지 않게) ---------- */
  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ======================================================================
     1. 테마
     ====================================================================== */
  /* 위젯 버튼의 눌림 표시를 현재 상태에 맞춘다.
     버튼 클릭이든 콘솔 API(ONAE_UI.theme/lang)든 항상 같은 결과가 되도록 한 곳에서 처리. */
  function syncButtons() {
    var t = get(LS_THEME, 'default'), l = get(LS_LANG, 'ko');
    var i, els = document.querySelectorAll('[data-onae-theme-btn]');
    for (i = 0; i < els.length; i++) {
      els[i].setAttribute('aria-pressed', String(els[i].getAttribute('data-onae-theme-btn') === t));
    }
    els = document.querySelectorAll('[data-onae-lang-btn]');
    for (i = 0; i < els.length; i++) {
      els[i].setAttribute('aria-pressed', String(els[i].getAttribute('data-onae-lang-btn') === l));
    }
  }

  function applyTheme(id) {
    var el = document.documentElement;
    if (id && id !== 'default') el.setAttribute('data-onae-theme', id);
    else el.removeAttribute('data-onae-theme');
    set(LS_THEME, id || 'default');
    syncButtons();
  }

  /* ======================================================================
     2. 한/영 — 사전 기반 치환
     ====================================================================== */

  /* 교육 서비스 공통 UI 어휘. 긴 문장부터 시도하도록 아래에서 정렬한다. */
  var DICT = {
    // 내비게이션·구조
    '홈': 'Home', '소개': 'About', '서비스': 'Services', '요금': 'Pricing',
    '가격': 'Pricing', '요금제': 'Plans', '문의': 'Contact', '문의하기': 'Contact us',
    '공지사항': 'Notices', '공지': 'Notice', '자주 묻는 질문': 'FAQ', '도움말': 'Help',
    '이용약관': 'Terms of Service', '개인정보처리방침': 'Privacy Policy',
    '환불정책': 'Refund Policy', '사업자정보': 'Business Info', '고객센터': 'Support',
    '더보기': 'More', '자세히 보기': 'Learn more', '전체보기': 'View all',
    '검색': 'Search', '설정': 'Settings', '메뉴': 'Menu', '닫기': 'Close',
    '뒤로': 'Back', '다음': 'Next', '이전': 'Previous', '처음으로': 'Back to start',
    '목록': 'List', '대시보드': 'Dashboard', '마이페이지': 'My Page',
    '관리자': 'Admin', '보관함': 'Library', '즐겨찾기': 'Favorites',

    // 계정·전환
    '로그인': 'Log in', '로그아웃': 'Log out', '회원가입': 'Sign up',
    '무료 회원가입': 'Sign up free', '무료 가입하기': 'Sign up free',
    '가입하기': 'Sign up', '시작하기': 'Get started', '무료로 시작하기': 'Start free',
    '지금 시작하기': 'Start now', '무료 체험': 'Free trial', '무료 체험하기': 'Try it free',
    '체험하기': 'Try it', '바로 시작': 'Start now', '계정': 'Account',
    '비밀번호': 'Password', '비밀번호 재설정': 'Reset password',
    '이메일': 'Email', '이름': 'Name', '닉네임': 'Nickname',
    '휴대폰 번호': 'Phone number', '전화번호': 'Phone',

    // 결제
    '결제': 'Payment', '결제하기': 'Pay now', '결제 완료': 'Payment complete',
    '결제 실패': 'Payment failed', '구독': 'Subscription', '구독하기': 'Subscribe',
    '구독 중': 'Subscribed', '구매': 'Purchase', '구매하기': 'Buy now',
    '장바구니': 'Cart', '주문': 'Order', '주문내역': 'Order history',
    '영수증': 'Receipt', '환불': 'Refund', '취소': 'Cancel', '해지': 'Unsubscribe',
    '무료': 'Free', '유료': 'Paid', '월': 'month', '연': 'year',
    '원': 'KRW', '할인': 'Discount', '쿠폰': 'Coupon', '적립금': 'Credits',

    // 행동
    '확인': 'OK', '저장': 'Save', '저장하기': 'Save', '수정': 'Edit',
    '삭제': 'Delete', '추가': 'Add', '등록': 'Register', '등록하기': 'Register',
    '제출': 'Submit', '보내기': 'Send', '공유': 'Share', '공유하기': 'Share',
    '복사': 'Copy', '복사됨': 'Copied', '다운로드': 'Download',
    '인쇄': 'Print', '새로고침': 'Refresh', '불러오기': 'Load',
    '신청': 'Apply', '신청하기': 'Apply now', '예약': 'Reserve', '예약하기': 'Book now',
    '참여하기': 'Join', '도전하기': 'Try it', '다시하기': 'Try again',
    '계속하기': 'Continue', '건너뛰기': 'Skip', '완료': 'Done',

    // 학습·교육 도메인
    '학습': 'Learning', '수업': 'Class', '강의': 'Lecture', '강좌': 'Course',
    '과정': 'Course', '단원': 'Unit', '차시': 'Lesson', '문제': 'Question',
    '정답': 'Correct answer', '오답': 'Wrong answer', '해설': 'Explanation',
    '퀴즈': 'Quiz', '진단': 'Diagnosis', '진단하기': 'Start diagnosis',
    '진단 결과': 'Diagnosis result', '결과': 'Result', '점수': 'Score',
    '레벨': 'Level', '진도': 'Progress', '학습 진도': 'Learning progress',
    '리포트': 'Report', '보고서': 'Report', '통계': 'Statistics',
    '학생': 'Student', '선생님': 'Teacher', '교사': 'Teacher', '학부모': 'Parent',
    '학교': 'School', '학년': 'Grade', '과목': 'Subject',
    '진로': 'Career path', '진학': 'Admissions', '입시': 'College admissions',
    '생활기록부': 'Student record', '학생부': 'Student record',
    '포트폴리오': 'Portfolio', '자기소개서': 'Personal statement',
    '면접': 'Interview', '교과서': 'Textbook', '여행': 'Travel',
    '체험': 'Experience', '활동': 'Activity', '도서': 'Books', '책': 'Book',

    // 상태·안내
    '불러오는 중': 'Loading', '로딩 중': 'Loading', '처리 중': 'Processing',
    '잠시만 기다려 주세요': 'Please wait a moment',
    '오류가 발생했습니다': 'Something went wrong',
    '다시 시도해 주세요': 'Please try again',
    '내용이 없습니다': 'Nothing here yet',
    '검색 결과가 없습니다': 'No results found',
    '로그인이 필요합니다': 'Please log in first',
    '준비 중입니다': 'Coming soon',
    '필수': 'Required', '선택': 'Optional',
    '새로운': 'New', '인기': 'Popular', '추천': 'Recommended',
    '오늘': 'Today', '어제': 'Yesterday', '이번 주': 'This week',
    '전체': 'All', '기타': 'Other',

    // 조직
    '오늘과내일의학교': 'School of Today and Tomorrow',
    '가르치는사람들': 'Teachers Guild'
  };

  var siteDict = window.ONAE_I18N_EN || {};
  var MERGED = {};
  var k;
  for (k in DICT) if (Object.prototype.hasOwnProperty.call(DICT, k)) MERGED[k] = DICT[k];
  for (k in siteDict) if (Object.prototype.hasOwnProperty.call(siteDict, k)) MERGED[k] = siteDict[k];

  /* 긴 열쇠말부터 치환해야 "무료 회원가입"이 "무료"+"회원가입"으로 쪼개지지 않는다 */
  var KEYS = Object.keys(MERGED).sort(function (a, b) { return b.length - a.length; });

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, SVG: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var HANGUL = /[가-힣]/;

  var origText = [];   // [ {node, ko} ]
  var origAttr = [];   // [ {el, name, ko} ]
  var scanned = false;
  var stats = { total: 0, hit: 0 };

  /* ★ 반쪽 번역 금지 규칙
     "무료 회원가입으로 시작하세요" 를 부분 치환하면
     "Sign up free으로 시작하세요" 가 되어 오히려 더 조잡해진다.
     그래서 두 단계로만 바꾼다:
       ① 문장 전체가 사전에 있으면 통째로 교체한다 (버튼·라벨 대부분이 여기 해당)
       ② 부분 치환은 그 결과에 한글이 하나도 안 남을 때만 채택한다
     둘 다 아니면 한국어 원문을 그대로 둔다 — 섞인 문장을 만들지 않는다. */
  function translate(s) {
    var trimmed = s.trim();
    if (!trimmed) return { text: s, changed: false };

    // ① 전체 일치
    if (Object.prototype.hasOwnProperty.call(MERGED, trimmed)) {
      return { text: s.split(trimmed).join(MERGED[trimmed]), changed: true };
    }
    // 문장부호만 다른 경우도 전체 일치로 본다 (예: "무료 체험!" / "결제하기 →")
    var core = trimmed.replace(/^[\s"'“”‘’(\[]+|[\s"'“”‘’)\]!?.·…→>»<«|]+$/g, '');
    if (core && Object.prototype.hasOwnProperty.call(MERGED, core)) {
      return { text: s.split(core).join(MERGED[core]), changed: true };
    }

    // ② 부분 치환 — 한글이 전부 사라질 때만 채택
    var out = s;
    for (var i = 0; i < KEYS.length; i++) {
      if (out.indexOf(KEYS[i]) !== -1) out = out.split(KEYS[i]).join(MERGED[KEYS[i]]);
    }
    if (out !== s && !HANGUL.test(out)) return { text: out, changed: true };

    return { text: s, changed: false };
  }

  function collect() {
    if (scanned) return;
    scanned = true;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p || SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('.onae-switcher')) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !HANGUL.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) origText.push({ node: n, ko: n.nodeValue });

    var els = document.body.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest('.onae-switcher')) continue;
      for (var a = 0; a < ATTRS.length; a++) {
        var v = els[i].getAttribute(ATTRS[a]);
        if (v && HANGUL.test(v)) origAttr.push({ el: els[i], name: ATTRS[a], ko: v });
      }
    }
  }

  function applyLang(lang) {
    set(LS_LANG, lang);
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'ko');
    if (lang !== 'en') {
      for (var i = 0; i < origText.length; i++) origText[i].node.nodeValue = origText[i].ko;
      for (var j = 0; j < origAttr.length; j++) origAttr[j].el.setAttribute(origAttr[j].name, origAttr[j].ko);
      updateNote();
      return;
    }
    collect();
    stats.total = 0; stats.hit = 0;
    for (var p = 0; p < origText.length; p++) {
      var r = translate(origText[p].ko);
      stats.total++; if (r.changed) stats.hit++;
      origText[p].node.nodeValue = r.text;
    }
    for (var q = 0; q < origAttr.length; q++) {
      origAttr[q].el.setAttribute(origAttr[q].name, translate(origAttr[q].ko).text);
    }
    updateNote();
  }

  /* ======================================================================
     3. 위젯
     ====================================================================== */
  var noteEl = null;
  function updateNote() {
    if (!noteEl) return;
    var lang = get(LS_LANG, 'ko');
    if (lang !== 'en') {
      noteEl.textContent = '영어는 UI·안내문 위주로 번역됩니다.';
    } else {
      var pct = stats.total ? Math.round((stats.hit / stats.total) * 100) : 0;
      noteEl.textContent = 'Translated ' + stats.hit + '/' + stats.total +
        ' text blocks (' + pct + '%). Untranslated text stays in Korean.';
    }
  }

  function build() {
    var lang = get(LS_LANG, 'ko');
    var theme = get(LS_THEME, 'default');

    var box = document.createElement('div');
    box.className = 'onae-switcher';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', '화면 설정 / Display settings');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'onae-switcher__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '디자인·언어 바꾸기 / Change design and language');
    toggle.textContent = '🎨';

    var panel = document.createElement('div');
    panel.className = 'onae-switcher__panel';

    var l1 = document.createElement('p');
    l1.className = 'onae-switcher__label';
    l1.textContent = '디자인 / Design';
    var row1 = document.createElement('div');
    row1.className = 'onae-switcher__row';

    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'onae-switcher__btn';
      b.setAttribute('data-onae-theme-btn', t.id);
      b.setAttribute('aria-pressed', String(theme === t.id));
      var dot = document.createElement('span');
      dot.className = 'onae-switcher__dot';
      dot.style.background = t.dot;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(t.ko));
      b.addEventListener('click', function () {
        applyTheme(t.id);
        row1.querySelectorAll('[data-onae-theme-btn]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-onae-theme-btn') === t.id));
        });
      });
      row1.appendChild(b);
    });

    var l2 = document.createElement('p');
    l2.className = 'onae-switcher__label';
    l2.textContent = '언어 / Language';
    var row2 = document.createElement('div');
    row2.className = 'onae-switcher__row';

    [{ id: 'ko', t: '한국어' }, { id: 'en', t: 'English' }].forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'onae-switcher__btn';
      b.setAttribute('data-onae-lang-btn', o.id);
      b.setAttribute('aria-pressed', String(lang === o.id));
      b.textContent = o.t;
      b.addEventListener('click', function () {
        applyLang(o.id);
        row2.querySelectorAll('[data-onae-lang-btn]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-onae-lang-btn') === o.id));
        });
      });
      row2.appendChild(b);
    });

    noteEl = document.createElement('p');
    noteEl.className = 'onae-switcher__note';

    panel.appendChild(l1); panel.appendChild(row1);
    panel.appendChild(l2); panel.appendChild(row2);
    panel.appendChild(noteEl);
    box.appendChild(panel);
    box.appendChild(toggle);
    document.body.appendChild(box);

    toggle.addEventListener('click', function () {
      var open = box.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target)) {
        box.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        box.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    updateNote();
  }

  /* ======================================================================
     4. 시동
     ====================================================================== */
  /* 하단 고정 내비게이션이 있는 사이트에서 위젯이 그 위에 겹치는 것을 피한다.
     (오늘뭐하지처럼 하단 탭바가 있는 서비스가 있다 — 실측으로 찾아 비켜준다) */
  function avoidBottomBar() {
    var box = document.querySelector('.onae-switcher');
    if (!box) return;
    var vh = window.innerHeight, lift = 0;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest('.onae-switcher')) continue;
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.height === 0 || r.height > 140) continue;      // 전체 오버레이는 제외
      if (r.width < window.innerWidth * 0.5) continue;      // 화면 폭 절반 미만이면 탭바 아님
      if (Math.abs(r.bottom - vh) > 6) continue;            // 화면 맨 아래에 붙어 있어야 함
      if (r.height > lift) lift = r.height;
    }
    box.style.bottom = lift ? ('calc(' + Math.round(lift + 10) + 'px + env(safe-area-inset-bottom))') : '';
  }

  var rt = null;
  function scheduleAvoid() {
    if (rt) clearTimeout(rt);
    rt = setTimeout(avoidBottomBar, 180);
  }

  function boot() {
    document.documentElement.classList.add('onae-rwd');   // 반응형 CSS 켜기
    applyTheme(get(LS_THEME, 'default'));
    build();
    if (get(LS_LANG, 'ko') === 'en') applyLang('en');
    scheduleAvoid();
    window.addEventListener('resize', scheduleAvoid);
    window.addEventListener('load', scheduleAvoid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 콘솔에서 수동 제어 (검수용) */
  window.ONAE_UI = {
    theme: applyTheme,
    lang: applyLang,
    dict: MERGED,
    version: '1.0.0'
  };
})();
