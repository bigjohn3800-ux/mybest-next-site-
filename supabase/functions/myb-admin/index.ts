import { createClient } from "jsr:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ALLOWED_ORIGINS = new Set([
  "https://mybest-next-edu.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
  "http://127.0.0.1:8888",
  "http://127.0.0.1:3000",
]);
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = !origin || ALLOWED_ORIGINS.has(origin) ? (origin || "https://mybest-next-edu.netlify.app") : "https://mybest-next-edu.netlify.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET,POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}
let SALT = "";
async function setting(k: string) { const { data } = await sb.from("myb_settings").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
async function hashPw(pw: string) { if (!SALT) SALT = await setting("pin_salt"); const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + SALT)); return "h$" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
// [FIX 2026-08-03 · D] 감사 로그. admin_audit_logs 테이블은 있었으나 코드에서 아무도 쓰지 않았다.
// 되돌릴 수 없는 동작만 남긴다. 로깅 실패가 본 동작을 막지 않는다.
async function audit(actor: any, action: string, target: string, detail?: unknown) {
  try {
    await sb.from("admin_audit_logs").insert({
      actor_id: actor?.id ?? null, actor_name: actor?.username ?? null,
      actor_role: actor?.role ?? null, action, target,
      detail: detail == null ? null : JSON.parse(JSON.stringify(detail)),
    });
  } catch (_e) { /* 무시 */ }
}

async function auth(token: string) {
  if (!token) return null;
  const { data } = await sb.from("myb_admin_sessions").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) { await sb.from("myb_admin_sessions").delete().eq("token", token); return null; }
  return data as { username: string; role: string; scope: string | null };
}
const TOTAL_TESTS = 27;   // [FIX 2026-08-03] mybest TESTS 27종과 불일치. 26/14 · 진행바 186% 해소
const SERIES_LABELS = ["인문", "사회", "자연", "공학", "의생명", "교육", "예체능"];
const LEVELS = ["es", "ms", "hs"];

// ── entitlement2.ts 의 validateClassEntitlement 인라인 복사 (2026-07-23, 프로젝트 inline 컨벤션) ──
// teacher(담임)가 설정하려는 class entitlement가 inst 상한을 초과하지 않는지 검증.
type EntRow = { allowed: boolean; max_attempts_per_student: number | null; usage_start: string | null; usage_end: string | null };
function validateClassEntitlement(instEnt: EntRow | null, classEnt: EntRow): string[] {
  const violations: string[] = [];
  if (!instEnt) return violations; // school 상한 미설정 → 제약 없음
  if (!instEnt.allowed && classEnt.allowed) violations.push("cannot_enable_disallowed");
  if (instEnt.max_attempts_per_student !== null) {
    if (classEnt.max_attempts_per_student === null || classEnt.max_attempts_per_student > instEnt.max_attempts_per_student) violations.push("attempts_exceeds_cap");
  }
  if (instEnt.usage_start) { if (!classEnt.usage_start || classEnt.usage_start < instEnt.usage_start) violations.push("start_before_cap"); }
  if (instEnt.usage_end) { if (!classEnt.usage_end || classEnt.usage_end > instEnt.usage_end) violations.push("end_after_cap"); }
  return violations;
}
// teacher scope(단일 UUID·콤마목록·JSON배열 모두 허용) → class_id 배열
function parseScopeIds(scope: string | null | undefined): string[] {
  if (!scope) return [];
  try { const p = JSON.parse(scope); if (Array.isArray(p)) return p.map((x) => String(x)); } catch { /* not json */ }
  return String(scope).split(",").map((s) => s.trim()).filter(Boolean);
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randCode(n: number) { let s = ""; for (let i = 0; i < n; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; return s; }
function normEnt(e:any): EntRow & { test_slug: string } {
  return {
    test_slug: String(e?.test_slug ?? "").trim(),
    allowed: e?.allowed !== false,
    max_attempts_per_student: e?.max_attempts_per_student == null || e?.max_attempts_per_student === "" ? null : Number(e.max_attempts_per_student),
    usage_start: e?.usage_start ? String(e.usage_start) : null,
    usage_end: e?.usage_end? String(e.usage_end) : null,
  };
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  const J = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: CORS });
  const err = (m: string, s = 400) => J({ error: m }, s);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/myb-admin/, "") || "/";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  try {
    if (path === "/login") {
      const { username, password } = body;
      const { data: a } = await sb.from("myb_admins").select("*").eq("username", String(username ?? "").trim()).maybeSingle();
      if (!a || a.pass_hash !== await hashPw(String(password ?? ""))) return err("아이디 또는 비밀번호가 올바르지 않습니다", 403);
      const token = crypto.randomUUID() + crypto.randomUUID();
     await sb.from("myb_admin_sessions").insert({ token, username: a.username, role: a.role, scope: a.scope });
      return J({ token, role: a.role, display_name: a.display_name, scope: a.scope, institution_id: a.institution_id ?? null });
    }
    if (path === "/sample") {
      const slug = url.searchParams.get("slug") ?? "";
      const { data: at } = await sb.from("myb_attempts").select("id,test_slug,result,created_at").eq("test_slug", slug).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!at) return err("샘플이 없습니다", 404);
      return J({ sample: { test_slug: at.test_slug, result: at.result } });
    }

    const me = await auth(String(body.token ?? url.searchParams.get("token") ?? ""));
    if (!me) return err("로그인이 필요합니다", 401);
    // [FIX 2026-08-03 · A1] 보류돼 있던 scope 가드를 활성화했다. 실제 구현은 아래
    // "scope 미지정 계정 차단" 블록(라우트 분기 직전)에 있다 — 여기서 다시 켜지 말 것.
    // 여기에 두지 않은 이유: 이 시점에는 adminRow() 가 아직 초기화 전(TDZ)이라
    // myb_admins 현재 행을 읽을 수 없다. 세션 스냅샷만으로는 판정이 틀린다(아래 주석 참고).
    // teacher.scope 는 레거시 단일 학급코드("ABC123") 또는 신규 scope_class_ids(UUID 배열/콤마목록)를 모두 담을 수 있음.
    function teacherScopeClassIds(): string[] { return parseScopeIds(me.scope).filter((s) => /^[0-9a-f-]{20,}$/i.test(s)); }
    const scoped = (q: any) => {
      if (me.role === "school" && me.scope) q = q.ilike("school", "%" + me.scope + "%");
      if (me.role === "teacher" && me.scope) {
        const ids = teacherScopeClassIds();
        q = ids.length ? q.in("id", ids) :q.eq("code", String(me.scope).toUpperCase());
      }
      return q;
    };

    // ── 기관 계층용 헬퍼 (세션은 institution_id 를 담지 않으므로 username 으로 조회·메모이즈) ──
    let _adminRow: { id: number; institution_id: string | null; scope: string | null; role: string | null } | null | undefined = undefined;
    async function adminRow() {
      if (_adminRow === undefined) {
        const { data } = await sb.from("myb_admins").select("id,institution_id,scope,role").eq("username", me!.username).maybeSingle();
        _adminRow = (data as any) ?? null;
      }
      return _adminRow;
}
    async function myInstitutionId() { return (await adminRow())?.institution_id ?? null; }
    // 기관(institution) 단위 접근권한: super=전체, school=자기기관, teacher=불가
    async function canAccessInst(instId: string) {
      if (me.role === "super") return true;
      if (me.role === "school") { const iid = await myInstitutionId(); return !!iid && iid === instId; }
      return false;
    }
    // institution_id 파라미터 미지정 시 school 은 자기 기관으로 폴백(super 는 명시 필수 — 폴백 없음)
    async function resolveInstId(raw: unknown): Promise<string> {
      const v = raw != null ? String(raw).trim() : "";
      if (v) return v;
      if (me.role === "school") return (await myInstitutionId()) ?? "";
      return "";
    }
    // 학급 로드 + 접근권한 검증. {ok, cls} | {ok:false, status, msg}
    async function loadClassForAccess(classId: string): Promise<any> {
      const { data: cls } = await sb.from("myb_classes").select("id,code,name,school,institution_id").eq("id", classId).maybeSingle();
      if (!cls) return { ok: false, status: 404, msg: "학급을 찾을 수 없습니다" };
      if (me.role === "super") return { ok: true, cls };
      if (me.role === "school") {
        const iid = await myInstitutionId();
        if (!iid || (cls as any).institution_id !== iid) return { ok: false, status: 403, msg: "권한이 없습니다" };
        return { ok: true, cls };
      }
      if (me.role === "teacher") {
        const ids = parseScopeIds((await adminRow())?.scope);
        if (!ids.includes(String((cls as any).id))) return { ok: false, status: 403, msg: "권한이 없습니다" };
        return { ok: true, cls };
      }
      return { ok: false, status: 403, msg: "권한이 없습니다" };
    }

    // [FIX 2026-08-03 · A1] scope 미지정 계정 차단 — 이 아래 모든 라우트에 적용된다.
    // 구멍이었던 것: scoped() 와 checkStudentScope() 는 scope 가 비면 아무 조건도 걸지 않아
    // 전 기관 조회는 물론 학생 삭제(복구 불가)·PIN 재설정·일괄처리까지 그대로 통과시켰다.
    // 판정 기준은 세션 스냅샷(me)이 아니라 myb_admins 의 현재 행이다. 세션은 로그인 시점의
    // role/scope 를 들고 있어 승급·강등이 반영되지 않는다(예: super 로 올려도 기존 세션은 school).
    // 조회 실패(계정 삭제 등)는 거부로 처리한다 — fail-closed.
    // /logout 은 예외: 자기 세션만 지우고 데이터를 노출하지 않으므로 막으면 빠져나갈 수 없다.
    if (path !== "/logout") {
      const live = await adminRow();
      const liveRole = String(live?.role ?? "");
      const liveScope = String(live?.scope ?? "").trim();
      // [FIX 2026-08-06] school 역할은 scope 가 아니라 institution_id 로 묶인다. 정상 학교 계정이 차단되던 문제.
      if (!live || (liveRole !== "super" && !liveScope && !live.institution_id)) {
        return err("이 계정에는 담당 기관/학급이 지정되어 있지 않습니다. 최고관리자에게 문의하세요.", 403);
      }
      // [FIX 2026-08-24 · 회장님 신고 1,2] me.scope/me.role 은 /login 시점 세션 스냅샷이라, 로그인
      // 이후 /class_assign_teacher 등으로 담임 scope 가 바뀌어도(=새 학급 배정) 이미 로그인해 있던
      // 담임 세션은 계속 옛 scope 를 써서 scoped()·teacherScopeClassIds() 가 새 학급을 걸러냈다.
      // (재로그인해야만 반영되던 문제.) 여기서부터는 방금 조회한 myb_admins 현재 행(live)으로
      // me 를 갱신해, 이 지점 이후의 모든 scoped() 필터링이 최신 권한을 즉시 반영하게 한다.
      // adminRow() 는 메모이즈돼 있어 추가 DB 호출은 없다. 승급/강등도 같은 이유로 즉시 반영된다.
      me.role = liveRole || me.role;
      me.scope = live.scope ?? me.scope;
    }

 if (path === "/filters") {
      // 2026-07-30: 계층형 필터(지역→학교급→학교→학년→학급) 지원 위해 school_level/region/학급별 학년 목록을 추가.
      // 과거 버그: grades 를 scoped() 없이 myb_students 전체에서 조회 — 교사가 자기 학교를 선택해도
      // 무관한 다른 학교의 학년까지 전부 노출되던 원인. classId 를 scoped 된 학급 목록으로 제한해 수정.
      let q = sb.from("myb_classes").select("id,code,name,school,school_level,region"); q = scoped(q);
      const { data: cls } = await q;
      const classes = cls ?? [];
      const ids = classes.map((c) => c.id);
      let studGrades: any[] = [];
      if (ids.length) { const { data: gr } = await sb.from("myb_students").select("class_id,grade").in("class_id", ids).limit(20000); studGrades = gr ?? []; }
      const gradesByClass: Record<string, Set<string>> = {};
      studGrades.forEach((g) => { const gv = (g.grade || "").trim(); if (!gv || !g.class_id) return; (gradesByClass[g.class_id] ?? (gradesByClass[g.class_id] = new Set())).add(gv); });
      const schools = [...new Set(classes.map((c) => (c.school || "").trim()).filter(Boolean))].sort();
      const grades = [...new Set(studGrades.map((g) => (g.grade || "").trim()).filter(Boolean))].sort();
      const classesOut = classes.map((c) => ({
        id: c.id, code: c.code, name: c.name, school: c.school,
        school_level: c.school_level ?? null, region: c.region ?? null,
      grades: [...(gradesByClass[c.id] ?? [])].sort(),
      }));
      return J({ schools, grades, classes: classesOut });
    }

    // ── 학생 일괄 등록 (B4) ──
    if (path === "/students_bulk") {
      const classId = String(body.class_id ?? "").trim();
      const grade = String(body.grade ?? "").trim();
      const rawNames = Array.isArray(body.names) ? body.names : [];
      if (!classId) return err("학급을 선택하세요", 400);
      const names = rawNames.map((n: unknown) => String(n ?? "").trim()).filter((n: string) => n.length > 0 && n.length <= 40);
      if (!names.length) return err("등록할 이름이 없습니다", 400);
      if (names.length > 200) return err("한 번에 최대 200명까지 등록할 수 있습니다", 400);
      let cq = sb.from("myb_classes").select("id,code,name,school,max_students").eq("id", classId); cq = scoped(cq);
      const { data: cls } = await cq.maybeSingle();
      if (!cls) return err("학급을 찾을 수 없거나 권한이 없습니다", 403);
      const { count: existing } = await sb.from("myb_students").select("id", { count: "exact", head: true }).eq("class_id", classId);
      const cur = existing?? 0;
      const cap = cls.max_students ?? 40;
      if (cur + names.length > cap) return err(`정원 초과: 현재 ${cur}명 + 등록 ${names.length}명 > 정원 ${cap}명`, 400);
      const { data: existRows } = await sb.from("myb_students").select("name").eq("class_id", classId);
      const existNames = new Set((existRows ?? []).map((r) => (r.name || "").trim()));
      const seen = new Set<string>();
      const dupes: string[] = [];
      names.forEach((n) => { if (existNames.has(n) || seen.has(n)) dupes.push(n); seen.add(n); });
      // INSERT (token=gen_random_uuid 자동, pin 기본 '0000' — 2026-07-22: 반드시 해시로 저장.
      // 과거엔 평문 "0000"으로 저장돼 학생이 학급코드+이름+PIN으로 재로그인 시 항상
      // "이미 등록된 이름입니다. PIN이 일치하지 않습니다" 오류가 나던 버그였음. 기존 데이터도
      // fix_plaintext_student_pins 마이그레이션으로 백필 완료.
      const defaultPinHash = await hashPw("0000");
      // [FIX 2026-08-03 · J] 화면 안내는 "동명이인도 등록된다"인데 DB엔 (class_id,name) 유일 제약이 있다.
      // 중복을 걸러내지 않아 1명만 겹쳐도 배치 전체가 unique violation 으로 실패하고 있었다.
      const dupSet = new Set(dupes);
      const freshNames = names.filter((n: string) => !dupSet.has(n));
      if (!freshNames.length) return err("입력한 이름이 모두 이미 등록돼 있습니다: " + dupes.slice(0,10).join(", "), 400);
      const insertRows = freshNames.map((n) => ({ class_id: classId, name: n, pin: defaultPinHash, grade }));
    const { data: created, error: insErr } = await sb.from("myb_students").insert(insertRows).select("id,name,token,grade");
      if (insErr) return err("등록 실패: " + insErr.message, 500);
      return J({ ok: true, class: { code: cls.code, name: cls.name, school: cls.school }, created: created ?? [], count: (created ?? []).length, duplicates: [...new Set(dupes)] });
    }

    if (path === "/overview") {
      const { school, grade, code } = body;
      let cq = sb.from("myb_classes").select("id,code,name,school,plan,expires_at,max_students,school_level,region"); cq = scoped(cq);
      if (school) cq = cq.ilike("school", "%" + school + "%");
      if (code) cq = cq.eq("code", String(code).toUpperCase());
const { data: classes } = await cq;
      const clsById: Record<string, any> = {}; (classes ?? []).forEach((c) => clsById[c.id] = c);
      const ids = (classes ?? []).map((c) => c.id);
      let students: any[] = [];
      if (ids.length) { let sq = sb.from("myb_students").select("id,name,grade,class_id,created_at").in("class_id", ids); if (grade) sq = sq.eq("grade", grade); const { data } = await sq.limit(5000); students = data ?? []; }
      const sids = students.map((s) => s.id);
      let ats: any[] = [];
      if (sids.length) { const { data } = await sb.from("myb_attempts").select("student_id,test_slug,created_at").in("student_id", sids).limit(20000); ats = data ?? []; }
      const byStu: Record<string, { slugs: Set<string>; last: string; cnt: number }> = {};
      ats.forEach((a) => { const b = byStu[a.student_id] ?? (byStu[a.student_id] = { slugs: new Set(), last: "", cnt: 0 }); b.slugs.add(a.test_slug); b.cnt++; if (a.created_at > b.last) b.last = a.created_at; });
      // 2026-07-30: school_level/region은 NEIS 검색으로 학급 생성 시 선택 저장(myb-school 연동, admin.html 새 학급 발급 폼). 기존 학급은 null(='미지정').
      const rows = students.map((s) => { const b = byStu[s.id]; const c = clsById[s.class_id] ?? {}; return { id: s.id, name: s.name, grade: s.grade, school: c.school, class_name: c.name, code: c.code, class_id: s.class_id,   /* [FIX 2026-08-03 · B2] 동명 학급 구분용. 없어서 학급 비교표가 합쳐지고 있었다 */ plan: c.plan, school_level: c.school_level ?? null, region: c.region ?? null, done: b ? b.slugs.size : 0, total: TOTAL_TESTS, attempts: b ? b.cnt : 0, last_at: b ? b.last : null }; });
      rows.sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
      const summary = { students: rows.length, attempts: ats.length, classes: (classes ?? []).length, completed: rows.filter((r) => r.done >= 5).length, avg_done: rows.length ? Math.round(rows.reduce((x, r) => x + r.done, 0) / rows.length * 10) / 10 : 0 };
      return J({ role: me.role, summary, classes: classes ?? [], students:rows });
    }

    if (path === "/class_report") {
      const { school, grade, code } = body;
      let cq = sb.from("myb_classes").select("id,code,name,school,plan,expires_at,max_students,starts_at"); cq = scoped(cq);
      if (school) cq = cq.ilike("school", "%" + school + "%");
      if (code) cq = cq.eq("code", String(code).toUpperCase());
      const { data: classes } = await cq;
      const clsById: Record<string, any> = {}; (classes ?? []).forEach((c) => clsById[c.id] = c);
      const ids = (classes ?? []).map((c) => c.id);
      let students: any[] = [];
      if (ids.length) { let sq = sb.from("myb_students").select("id,name,grade,class_id,created_at").in("class_id", ids); if (grade) sq = sq.eq("grade", grade); const { data } = await sq.limit(5000); students = data ?? []; }
      const sids = students.map((s) => s.id);
      const stuById: Record<string, any> = {}; students.forEach((s) => stuById[s.id] = s);
      let ats: any[] = [];
      if (sids.length) { const { data } = await sb.from("myb_attempts").select("student_id,test_slug,result,created_at").in("student_id", sids).order("created_at", { ascending: false }).limit(20000); ats = data ?? []; }
      // keep only the latest attempt per (student, slug)
      const latest: Record<string,any> = {};
      ats.forEach((a) => { const k = a.student_id + "|" + a.test_slug; if (!latest[k]) latest[k] = a; });
      const latestArr = Object.values(latest) as any[];

      // per-student aggregation
      const byStu: Record<string, { slugs: Set<string>; last: string; cnt: number; series?: number; seriesScore?: number; pctSum: number; pctCnt: number }> = {};
      sids.forEach((id) => byStu[id] = { slugs: new Set(), last: "", cnt: 0, pctSum: 0, pctCnt: 0 });
      ats.forEach((a) => { const b = byStu[a.student_id]; if (!b) return; b.slugs.add(a.test_slug); b.cnt++; if (a.created_at > b.last) b.last = a.created_at; });
      // representative series + pct from latest attempts
      latestArr.forEach((a) => {
        const b = byStu[a.student_id]; if (!b) return; const r = a.result || {};
        if ((a.test_slug === "hs_series" || a.test_slug === "ms_series") && r.kind === "series" && typeof r.best === "number") {
     const sc = Array.isArray(r.scores) ? (r.scores[r.best] ?? 0) : 0;
          if (b.series === undefined || sc > (b.seriesScore ?? -1)) { b.series = r.best; b.seriesScore = sc; }
        }
      if (typeof r.pct === "number") { b.pctSum += r.pct; b.pctCnt++; }
      });

      // participation per diagnostic (slug) — based on latest attempts (unique student per slug)
 const partMap: Record<string, Set<string>> = {};
      latestArr.forEach((a) => { (partMap[a.test_slug] ?? (partMap[a.test_slug] = new Set())).add(a.student_id); });
      const N = students.length || 1;
      const participation = Object.keys(partMap).map((slug) => ({ slug, count: partMap[slug].size, rate: Math.round(partMap[slug].size / N * 100) })).sort((a, b) => b.count - a.count);

      // 계열 분포 (hs_series + ms_series latest attempts)
      const seriesDist = SERIES_LABELS.map(() => 0);
      let seriesN = 0;
      latestArr.forEach((a) => { const r = a.result || {}; if((a.test_slug === "hs_series" || a.test_slug === "ms_series") && r.kind === "series" && typeof r.best === "number" && r.best >= 0 && r.best < SERIES_LABELS.length) { seriesDist[r.best]++; seriesN++; } });

      // 진단별 평균 점수 (pct 보유 진단)
      const pctAgg: Record<string, { sum: number; cnt: number }> = {};
      latestArr.forEach((a) => { const r = a.result || {}; if (typeof r.pct === "number") { const g = pctAgg[a.test_slug] ?? (pctAgg[a.test_slug] = { sum: 0, cnt: 0 }); g.sum += r.pct; g.cnt++; } });
      const avgScores = Object.keys(pctAgg).map((slug) => ({ slug, avg: Math.round(pctAgg[slug].sum / pctAgg[slug].cnt), count: pctAgg[slug].cnt })).sort((a, b) => b.count - a.count);

      // per-student rows + low participation list
      const studentRows = students.map((s) => {
        const b = byStu[s.id]; const c = clsById[s.class_id] ?? {};
        return {
          id: s.id, name: s.name, grade: s.grade, class_name: c.name, code: c.code,
          done: b ? b.slugs.size : 0, total: TOTAL_TESTS, attempts: b ? b.cnt : 0, last_at: b ? b.last : null,
          series: b && b.series !== undefined ? SERIES_LABELS[b.series]: null,
          avg_pct: b && b.pctCnt ? Math.round(b.pctSum / b.pctCnt) : null,
        };
      });
      studentRows.sort((a, b) => b.done - a.done || (b.last_at ?? "").localeCompare(a.last_at ?? ""));
      const lowParticipation = studentRows.filter((r) => r.done === 0).map((r) => ({ name: r.name, grade: r.grade, class_name: r.class_name, done: r.done }));
      const lowActive = studentRows.filter((r) => r.done > 0 && r.done < 3).map((r) => ({ name: r.name, grade: r.grade, class_name: r.class_name, done: r.done }));

      const summary = {
        students: students.length,
        classes: (classes ?? []).length,
        attempts: ats.length,
        unique_diagnostics: latestArr.length,
        completed5: studentRows.filter((r) => r.done >= 5).length,
        none: lowParticipation.length,
        avg_done: students.length ? Math.round(studentRows.reduce((x, r) => x + r.done, 0) / students.length * 10) / 10 : 0,
        participation_rate: students.length ? Math.round(studentRows.filter((r) => r.done > 0).length / students.length * 100) : 0,
      };
      const classInfo = (classes ?? []).map((c) => ({ code: c.code, name: c.name, school: c.school, plan: c.plan, expires_at: c.expires_at, starts_at: c.starts_at, max_students: c.max_students }));

      return J({ role: me.role, generated_at: new Date().toISOString(), summary, classes: classInfo, participation, seriesDist, seriesN, seriesLabels: SERIES_LABELS, avgScores, lowParticipation, lowActive, students: studentRows });
    }

    if (path === "/student") {
      const sid = String(body.student_id ?? "");
      const { data: st } = await sb.from("myb_students").select("id,name,grade,class_id, myb_classes(code,name,school)").eq("id", sid).maybeSingle();
      if (!st) return err("학생을 찾을 수 없습니다", 404);
      if (me.role === "teacher" && me.scope) {
        const ids = teacherScopeClassIds();
       const ok = ids.length ? ids.includes(String((st as any).class_id)) : (st as any).myb_classes?.code === String(me.scope).toUpperCase();
        if (!ok) return err("권한이 없습니다", 403);
    }
      const { data: ats } = await sb.from("myb_attempts").select("id,test_slug,result,created_at").eq("student_id", sid).order("created_at", { ascending: false });
    return J({ student: { name: st.name, grade: st.grade, school: (st as any).myb_classes?.school, class_name: (st as any).myb_classes?.name, code: (st as any).myb_classes?.code }, attempts: ats ?? [] });
    }

    if (path === "/logout") { await sb.from("myb_admin_sessions").delete().eq("token", body.token); return J({ ok: true }); }

    // ── 관리자 계정 관리 (super 전용) ──
    if (path === "/admins_list") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const { data } = await sb.from("myb_admins").select("id,username,role,scope,display_name,created_at").order("created_at", { ascending: false });
      return J({ admins: data ?? [] });
    }
    // 관리자 생성 (super→super|school|teacher, 레거시 scope 문자열 호환 / school→teacher, 기관강제)
    if (path === "/admin_create") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      if (!username || !password) return err("아이디·비밀번호를 확인하세요", 400);
      let role = String(body.role ?? "").trim();
      let institution_id = body.institution_id != null ? String(body.institution_id) : null;
      let scope: string | null = body.scope != null ? String(body.scope).trim() : null;
      if (me.role === "school") {
        role = "teacher"; // school 은 teacher 만 생성
        institution_id = await myInstitutionId(); // 자기 기관 강제
        if (!institution_id) return err("소속 기관이 없습니다", 400);
      } else if (!["super", "school", "teacher"].includes(role)) {
        return err("아이디·비밀번호·역할을 확인하세요", 400);
    }
      // 기관 지정 시 존재 확인
      if (institution_id) {
        const { data: inst } = await sb.from("myb_institutions").select("id").eq("id", institution_id).maybeSingle();
        if (!inst) return err("기관을 찾을 수 없습니다", 404);
      }
      // teacher: scope_class_ids(신규) 우선 — 지정 시 기관 소속 검증 후 JSON 저장. 미지정 시 레거시 scope 문자열 유지.
      if (role === "teacher" && Array.isArray(body.scope_class_ids)) {
        const rawIds = body.scope_class_ids.map((x: unknown) => String(x));
        if (rawIds.length && institution_id) {
          const { data: chk} = await sb.from("myb_classes").select("id").in("id", rawIds).eq("institution_id", institution_id);
          const okIds = new Set((chk ?? []).map((c: any) => c.id));
       const bad = rawIds.filter((x) => !okIds.has(x));
          if (bad.length) return err("해당 기관 소속이 아닌 학급이 포함되어 있습니다: " + bad.join(", "), 400);
        }
        scope = JSON.stringify(rawIds);
      }
      const display_name = String(body.display_name ?? "").trim() || username;
      const { data: dup } = await sb.from("myb_admins").select("id").eq("username", username).maybeSingle();
      if (dup) return err("이미 존재하는 아이디입니다", 409);
      const pass_hash = await hashPw(password);
      const { data, error } = await sb.from("myb_admins").insert({ username, pass_hash, role, scope, display_name, institution_id }).select("id,username,role,scope,display_name,institution_id,created_at").maybeSingle();
      if (error) return err("생성 실패: " + error.message, 500);
      return J({ ok: true, admin: data });
    }
    if (path === "/admin_update") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const id = body.id;
      if (!id) return err("id가 필요합니다", 400);
      const patch: Record<string, unknown> = {};
      if (body.role != null) {
        if (!["super", "school", "teacher"].includes(String(body.role))) return err("역할 값이 올바르지 않습니다", 400);
        // [FIX 2026-08-03 · F] 최고관리자가 스스로를 강등해 잠기는 것을 막는다.
        // [FIX2 2026-08-03] 세션 레코드에는 myb_admins.id 가 없어 me.id 로는 비교가 안 된다. username 으로 대조한다.
        const { data: tgt0 } = await sb.from("myb_admins").select("username,role").eq("id", id).maybeSingle();
        if (tgt0 && (tgt0 as any).username === me.username && String(body.role) !== "super")
          return err("본인의 권한은 낮출 수 없습니다", 400);
        patch.role = String(body.role);
      }
      if (body.scope !== undefined) patch.scope =body.scope == null ? null : String(body.scope).trim();
      if (body.display_name != null) patch.display_name = String(body.display_name).trim();
      if (!Object.keys(patch).length) return err("변경할 항목이 없습니다", 400);
      const { data, error } = await sb.from("myb_admins").update(patch).eq("id", id).select("id,username,role,scope,display_name,created_at").maybeSingle();
      if (error) return err("수정 실패: " + error.message, 500);
      if (!data) return err("대상을 찾을 수 없습니다", 404);
      return J({ ok: true, admin: data });
    }
    if (path === "/admin_delete") {
      const id = body.admin_id ?? body.id; // 신규 admin_id / 레거시 id 모두 허용
      if (!id) return err("admin_id가 필요합니다", 400);
      const { data: target } = await sb.from("myb_admins").select("id,username,role,institution_id").eq("id", id).maybeSingle();
      if (!target) return err("대상을 찾을 수 없습니다", 404);
      if ((target as any).username === me.username) return err("본인 계정은 삭제할 수 없습니다", 400);
      // [FIX 2026-08-03 · F] 마지막 최고관리자를 지우면 아무도 복구할 수 없다.
      if ((target as any).role === "super") {
        const { count: superCnt } = await sb.from("myb_admins").select("id", { count: "exact", head: true }).eq("role", "super");
        if ((superCnt ?? 0) <= 1) return err("최고관리자가 1명뿐입니다. 다른 최고관리자를 먼저 추가하세요", 400);
      }
      if (me.role !== "super") {
        const iid = await myInstitutionId();
        if (me.role !== "school" || !iid || (target as any).institution_id !== iid || (target as any).role !== "teacher") return err("권한이 없습니다", 403);
      }
      const { error } = await sb.from("myb_admins").delete().eq("id", id);
      if (error) return err("삭제 실패: " + error.message, 500);
      return J({ ok: true });
    }

    // ── 비밀번호 변경 (본인, super는 타인 초기화 가능) ──
    if (path === "/change_password") {
      const new_password = String(body.new_password ?? "");
      // [FIX 2026-08-03 · N] 화면은 8자를 요구하는데 서버가 4자를 받고 있었다.
      if (new_password.length < 8) return err("새 비밀번호는 8자 이상이어야 합니다", 400);
      const targetUsername = body.target_username ? String(body.target_username).trim() : null;
      if (targetUsername && targetUsername !== me.username) {
        if (me.role !== "super") return err("권한이 없습니다", 403);
        const pass_hash = await hashPw(new_password);
        const { error } = await sb.from("myb_admins").update({ pass_hash }).eq("username", targetUsername);
        if (error) return err("변경 실패: " + error.message, 500);
        return J({ ok: true });
      }
      const old_password = String(body.old_password ?? "");
      const{ data: a } = await sb.from("myb_admins").select("pass_hash").eq("username", me.username).maybeSingle();
      if (!a || a.pass_hash !== await hashPw(old_password)) return err("현재 비밀번호가 올바르지 않습니다", 403);
      const pass_hash = await hashPw(new_password);
      const { error } = await sb.from("myb_admins").update({ pass_hash }).eq("username", me.username);
      if (error) return err("변경 실패: " + error.message, 500);
      return J({ ok: true });
    }

    // ── 학생 개별 수정/삭제 ──
    async function checkStudentScope(sid: string) {
  const { data: st } = await sb.from("myb_students").select("id,class_id, myb_classes(code,school)").eq("id", sid).maybeSingle();
      if (!st) return null;
      const cls = (st as any).myb_classes;
      if (me.role === "teacher" && me.scope) {
        const ids = teacherScopeClassIds();
        const ok = ids.length ? ids.includes(String((st as any).class_id)) : cls?.code === String(me.scope).toUpperCase();
        if (!ok) return false;
      }
      if (me.role === "school" && me.scope && !(cls?.school || "").includes(me.scope)) return false;
      return st;
    }
    if (path === "/update_student") {
      const sid = String(body.student_id ?? "");
      if (!sid) return err("student_id가 필요합니다", 400);
      const scoped2 = await checkStudentScope(sid);
      if (scoped2 === false) return err("권한이 없습니다", 403);
      if (!scoped2) return err("학생을 찾을 수 없습니다", 404);
      const patch: Record<string, unknown> = {};
      if (body.name != null && String(body.name).trim()) patch.name = String(body.name).trim();
      if (body.grade !== undefined) patch.grade = body.grade == null ? null : String(body.grade).trim();
      if (!Object.keys(patch).length) return err("변경할 항목이 없습니다", 400);
      const { data, error } = await sb.from("myb_students").update(patch).eq("id", sid).select("id,name,grade").maybeSingle();
      if (error) return err("수정 실패: " + error.message, 500);
      return J({ ok: true, student: data });
    }
    // [NEW 2026-08-03] 학생 PIN 재설정.
    // 지금까지는 PIN 을 잊으면 학생을 삭제하고 다시 만드는 수밖에 없었고,
    // 그러면 응시기록이 함께 사라졌다.
    if (path === "/student_pin_reset") {
      const sid = String(body.student_id ?? "");
      if (!sid) return err("student_id가 필요합니다", 400);
      const target = await checkStudentScope(sid);
      if (target === false) return err("권한이 없습니다", 403);
      if (!target) return err("학생을 찾을 수 없습니다", 404);
      const raw = String(body.new_pin ?? "").trim();
      if (!/^[0-9]{4}$/.test(raw)) return err("PIN 은 숫자 4자리여야 합니다", 400);
      const pin = await hashPw(raw);
      const { error } = await sb.from("myb_students").update({ pin }).eq("id", sid);
      if (error) return err("변경 실패: " + error.message, 500);
      await audit(me, "student_pin_reset", sid, { name: (target as any)?.name ?? null });
      return J({ ok: true });
    }

    // [E1 2026-08-03] 학생 대량 처리. 지금까지 단건뿐이라 40명 정리에 80클릭이 들었다.
    // 삭제는 되돌릴 수 없으므로 상한(200)과 범위검사를 반드시 통과시킨다.
    if (path === "/students_bulk_action") {
      const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.map((v: unknown) => String(v ?? "")).filter(Boolean) : [];
      const action = String(body.action ?? "");
      if (!ids.length) return err("대상 학생을 선택하세요", 400);
      if (ids.length > 200) return err("한 번에 최대 200명까지 처리할 수 있습니다", 400);
      if (["delete", "grade", "move"].indexOf(action) < 0) return err("action 값이 올바르지 않습니다", 400);

      // 한 명이라도 권한 밖이면 통째로 거부한다. 부분 실행은 되돌리기가 더 어렵다.
      const okIds: string[] = [];
      for (const sid of ids) {
        const t = await checkStudentScope(sid);
        if (t === false) return err("권한 밖의 학생이 포함돼 있습니다", 403);
        if (t) okIds.push(sid);
      }
      if (!okIds.length) return err("대상을 찾을 수 없습니다", 404);

      if (action === "delete") {
        await sb.from("myb_attempts").delete().in("student_id", okIds);
        const { error } = await sb.from("myb_students").delete().in("id", okIds);
        if (error) return err("삭제 실패: " + error.message, 500);
        await audit(me, "students_bulk_delete", okIds.slice(0, 50).join(","), { count: okIds.length });
        return J({ ok: true, done: okIds.length });
      }
      if (action === "grade") {
        const grade = String(body.grade ?? "").trim();
        if (!grade) return err("학년을 입력하세요", 400);
        const { error } = await sb.from("myb_students").update({ grade }).in("id", okIds);
        if (error) return err("변경 실패: " + error.message, 500);
        await audit(me, "students_bulk_grade", okIds.slice(0, 50).join(","), { count: okIds.length, grade });
        return J({ ok: true, done: okIds.length });
      }
      // move — 학급 이동. 대상 학급도 내 권한 안이어야 한다.
      const toId = String(body.to_class_id ?? "");
      if (!toId) return err("이동할 학급을 선택하세요", 400);
      let cq = sb.from("myb_classes").select("id,name,max_students").eq("id", toId); cq = scoped(cq);
      const { data: toCls } = await cq.maybeSingle();
      if (!toCls) return err("이동할 학급을 찾을 수 없거나 권한이 없습니다", 403);
      const { count: cur } = await sb.from("myb_students").select("id", { count: "exact", head: true }).eq("class_id", toId);
      if ((cur ?? 0) + okIds.length > ((toCls as any).max_students ?? 40))
        return err("이동 후 정원을 초과합니다 (" + ((cur ?? 0) + okIds.length) + " / " + ((toCls as any).max_students ?? 40) + ")", 400);
      const { error } = await sb.from("myb_students").update({ class_id: toId }).in("id", okIds);
      if (error) return err("이동 실패: " + error.message, 500);
      await audit(me, "students_bulk_move", okIds.slice(0, 50).join(","), { count: okIds.length, to: (toCls as any).name });
      return J({ ok: true, done: okIds.length });
    }

    // [E6 2026-08-03] 학급 만료일 연장. class_meta_update 가 expires_at 을 지원하지 않아
    // 관리자 콘솔에서는 연장 자체가 불가능했다.
    if (path === "/class_extend") {
      const cid = String(body.class_id ?? "");
      const months = Math.min(24, Math.max(1, (body.months | 0) || 12));
      if (!cid) return err("class_id가 필요합니다", 400);
      let q = sb.from("myb_classes").select("id,name,expires_at"); q = scoped(q.eq("id", cid));
      const { data: cls } = await q.maybeSingle();
      if (!cls) return err("학급을 찾을 수 없거나 권한이 없습니다", 403);
      const base = new Date(String((cls as any).expires_at ?? "") || Date.now());
      const now = new Date();
      const from = base > now ? base : now;   // 이미 만료됐으면 오늘부터 센다
      from.setMonth(from.getMonth() + months);
      const next = from.toISOString().slice(0, 10);
      const { error } = await sb.from("myb_classes").update({ expires_at: next }).eq("id", cid);
      if (error) return err("연장 실패: " + error.message, 500);
      await audit(me, "class_extend", cid, { name: (cls as any).name, from: (cls as any).expires_at, to: next, months });
      return J({ ok: true, expires_at: next });
    }

    // ── 학급 담당교사 지정 (super/school 전용, 신규 2026-08-23) ──
    // [FIX · 회장님 신고] 학교·기관관리자가 학급을 만들어도 어떤 담임(teacher) 계정과도 연결되지 않아,
    // 그 담임이 로그인해 "학생 일괄 등록"을 열어도 방금 만든 학급이 대상학급 목록에 보이지 않았다.
    // 원인: /filters·/students_bulk 는 myb_admins.scope(학급 id 배열)로만 학급을 거르는데, 학급 발급
    // 시점에 아무도 그 배열을 채워주지 않았다. 이 라우트는 scope 배열에 학급 id를 "추가"만 한다 —
    // 기존 scope 값·다른 학급 연결은 건드리지 않는다(추가 전용, 회귀 위험 0).
    if (path === "/teachers_list") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      let q = sb.from("myb_admins").select("id,username,display_name,institution_id").eq("role", "teacher");
      if (me.role === "school") {
        const iid = await myInstitutionId();
        if (!iid) return J({ teachers: [] });
        q = q.eq("institution_id", iid);
      }
      const { data, error } = await q.order("display_name", { ascending: true });
      if (error) return err("조회 실패: " + error.message, 500);
      return J({ teachers: data ?? [] });
    }
    if (path === "/class_assign_teacher") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      const classId = String(body.class_id ?? "").trim();
      const teacherId = body.teacher_id;
      if (!classId || !teacherId) return err("학급과 담당교사를 선택하세요", 400);
      const access = await loadClassForAccess(classId);
      if (!access.ok) return err(access.msg, access.status);
      const { data: teacher } = await sb.from("myb_admins").select("id,username,role,institution_id,scope").eq("id", teacherId).maybeSingle();
      if (!teacher || (teacher as any).role !== "teacher") return err("담당교사를 찾을 수 없습니다", 404);
      if (me.role === "school") {
        const iid = await myInstitutionId();
        if (!iid || (teacher as any).institution_id !== iid) return err("소속 기관이 다른 교사는 지정할 수 없습니다", 403);
      }
      const ids = parseScopeIds((teacher as any).scope);
      if (!ids.includes(classId)) ids.push(classId);
      const { error } = await sb.from("myb_admins").update({ scope: JSON.stringify(ids) }).eq("id", (teacher as any).id);
      if (error) return err("지정 실패: " + error.message, 500);
      await audit(me, "class_assign_teacher", classId, { teacher: (teacher as any).username });
      return J({ ok: true });
    }

    if (path === "/delete_student") {
      const sid = String(body.student_id ?? "");
      if (!sid) return err("student_id가 필요합니다", 400);
      const scoped2 = await checkStudentScope(sid);
      if (scoped2 === false) return err("권한이 없습니다", 403);
      if (!scoped2) return err("학생을 찾을 수 없습니다", 404);
      await sb.from("myb_attempts").delete().eq("student_id", sid);
      const { error } = await sb.from("myb_students").delete().eq("id", sid);
      if (error) return err("삭제 실패: " + error.message, 500);
      await audit(me, "student_delete", sid, { name: (scoped2 as any)?.name ?? null });
      return J({ ok:true });
    }

    // ── 학부모/보호자 회원 조회 ──
    if (path === "/accounts_list") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      let studentFilter: string[] | null = null;
      if (me.role === "school") {
        const iid = await myInstitutionId();
        if (!iid) return J({ accounts: [] });
        const { data: classes } = await sb.from("myb_classes").select("id").eq("institution_id", iid);
        const clsIds = (classes ?? []).map((c: any) => c.id);
        if (!clsIds.length) return J({ accounts: [] });
        const { data: students } = await sb.from("myb_students").select("id").in("class_id", clsIds).limit(20000);
        studentFilter = (students ?? []).map((s: any) => s.id);
        if (!studentFilter.length) return J({ accounts: [] });
      }
      let q = sb.from("myb_accounts").select("id,role,email,phone,display_name,student_id,created_at,last_login_at,status").order("created_at", { ascending: false }).limit(1000);
      if (studentFilter) q = q.in("student_id", studentFilter);
      const { data,error } = await q;
      if (error) return err("조회 실패: " + error.message, 500);
      return J({ accounts: data ?? [] });
    }

    // ── 매출·구독·만료·사용량 대시보드 위젯 (super/school) ──
if (path === "/billing_widgets") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      let cq = sb.from("myb_classes").select("id,code,name,school,plan,expires_at,max_students"); cq = scoped(cq);
      const { data: classes } = await cq;
      const clsIds = (classes ?? []).map((c) => c.id);

      let orders: any[] = [];
      if (clsIds.length || me.role === "super") {
        let oq = sb.from("myb_orders").select("id,order_id,class_id,plan,amount,status,created_at,paid_at");
 if (me.role !== "super") oq = oq.in("class_id", clsIds.length ? clsIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data } = await oq.order("created_at", { ascending: false }).limit(2000);
        orders = data ?? [];
      }
      const paid = orders.filter((o) => o.status === "paid");
      const now = new Date();
      const monthStart= new Date(now.getFullYear(), now.getMonth(), 1);
      const revenue = {
        total_paid: paid.reduce((s, o) => s + (o.amount || 0), 0),
        total_paid_count: paid.length,
        this_month: paid.filter((o) => o.paid_at && new Date(o.paid_at) >= monthStart).reduce((s, o) => s + (o.amount || 0), 0),
        this_month_count: paid.filter((o) => o.paid_at && new Date(o.paid_at) >=monthStart).length,
      };

      const activeClasses = (classes ?? []).filter((c) => c.plan && (!c.expires_at || new Date(c.expires_at) >= now));
      const byPlan: Record<string, number>= {};
      activeClasses.forEach((c) => { byPlan[c.plan] = (byPlan[c.plan] ?? 0) + 1; });
      const subscriptions = { active_count: activeClasses.length, by_plan: byPlan, total_classes: (classes ?? []).length };

      const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
      const d7 = new Date(now); d7.setDate(d7.getDate() + 7);
      const expiring = {
        d1: (classes?? []).filter((c) => c.expires_at && new Date(c.expires_at) <= d1 && new Date(c.expires_at) >= now).map((c) => ({ code: c.code, name: c.name, school: c.school, expires_at: c.expires_at })),
d7: (classes ?? []).filter((c) => c.expires_at && new Date(c.expires_at) <= d7 && new Date(c.expires_at) >= now).map((c) => ({ code: c.code, name: c.name, school: c.school, expires_at: c.expires_at })),
      };

      let usage = { attempts_30d: 0, attempts_total: 0 };
      if (clsIds.length) {
        const { data: stu } = await sb.from("myb_students").select("id").in("class_id", clsIds).limit(5000);
        const sids = (stu ?? []).map((s) => s.id);
        if (sids.length) {
          const since30 = new Date(now); since30.setDate(since30.getDate() - 30);
          const { count: c30 } = await sb.from("myb_attempts").select("id", { count: "exact", head: true }).in("student_id", sids).gte("created_at", since30.toISOString());
          const { count: cAll } = await sb.from("myb_attempts").select("id", { count: "exact", head: true }).in("student_id", sids);
          usage = { attempts_30d: c30 ?? 0, attempts_total: cAll ?? 0 };
        }
      }

      return J({ role: me.role, generated_at: new Date().toISOString(), revenue, subscriptions, expiring, usage });
    }

// ── 세금계산서: 목록 조회 (super/school) ──
    if (path === "/tax_invoice_list") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      let cq = sb.from("myb_classes").select("id,code,name,school"); cq = scoped(cq);
      const { data: classes } = await cq;
      const clsIds = (classes ?? []).map((c) => c.id);
      const clsById: Record<string, any> = {}; (classes ?? []).forEach((c) => clsById[c.id] = c);
      let oq = sb.from("myb_orders").select("id,order_id,class_id,plan,amount,status,paid_at,tax_invoice_status,tax_biz_name,tax_biz_reg_no,tax_biz_email,tax_requested_at,tax_issued_at").eq("status", "paid");
      if (me.role !== "super") oq = oq.in("class_id", clsIds.length ? clsIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data: orders, error } = await oq.order("paid_at", { ascending: false }).limit(500);
      if (error) return err("조회 실패: " + error.message, 500);
      const rows = (orders ?? []).map((o) => ({ ...o, class: clsById[o.class_id] ? { code: clsById[o.class_id].code, name: clsById[o.class_id].name, school: clsById[o.class_id].school } : null }));
      return J({ orders: rows });
    }

    // ── 세금계산서: 요청 등록 (super/school) ──
    if (path === "/tax_invoice_request") {
      if (me.role !== "super" && me.role !== "school") return err("권한이 없습니다", 403);
      const order_id = String(body.order_id ?? "");
      const biz_name = String(body.biz_name ?? "").trim();
      const biz_reg_no = String(body.biz_reg_no ?? "").trim();
      const biz_email = String(body.biz_email ?? "").trim();
      if (!order_id || !biz_name || !biz_reg_no || !biz_email) return err("사업자명·사업자번호·이메일을 모두 입력하세요", 400);
      const { data: ord } = await sb.from("myb_orders").select("id,class_id,status").eq("order_id", order_id).maybeSingle();
      if (!ord || ord.status !== "paid") return err("결제 완료된 주문이 아닙니다", 400);
      if (me.role === "school" && me.scope) {
        const { data: cls } = await sb.from("myb_classes").select("school").eq("id", ord.class_id).maybeSingle();
        if (!cls || !(cls.school || "").includes(me.scope)) return err("권한이 없습니다", 403);
     }
      const { error } = await sb.from("myb_orders").update({
        tax_invoice_status: "requested", tax_biz_name: biz_name, tax_biz_reg_no: biz_reg_no, tax_biz_email: biz_email,
        tax_requested_at: new Date().toISOString(),
      }).eq("id", ord.id);
      if (error) return err("요청 등록 실패: " + error.message, 500);
      return J({ ok: true });
  }

    // ── 세금계산서: 발행완료 처리 (super 전용 — 실제 발행은 운영자가 외부 계산서 서비스로 수동 처리 후 이 상태만 기록) ──
    if (path === "/tax_invoice_issue") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const order_id = String(body.order_id ?? "");
      const { data: ord } = await sb.from("myb_orders").select("id,tax_invoice_status").eq("order_id", order_id).maybeSingle();
      if (!ord || ord.tax_invoice_status !== "requested") return err("발행 대기 중인 요청이 아닙니다", 400);
      const { error } = await sb.from("myb_orders").update({ tax_invoice_status: "issued", tax_issued_at: new Date().toISOString() }).eq("id", ord.id);
      if (error) return err("처리 실패: " + error.message, 500);
      return J({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 기관 계층 API (2026-07-23) — inst / admin / class / entitlement
    // 권한: super=전체, school=자기 institution_id 자원, teacher=자기 scope 학급
    // ═══════════════════════════════════════════════════════════════════

    // ── 기관 생성 (super) ──
    if (path === "/inst_create") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const name = String(body.name ?? "").trim();
      if (!name) return err("기관명을 입력하세요", 400);
      const type = String(body.type ?? "school").trim() || "school";
      let groups = Array.isArray(body.school_level_groups) ? body.school_level_groups.map((g: unknown) => String(g)).filter((g: string) => LEVELS.includes(g)) : [];
      if (!groups.length) groups = ["es", "ms", "hs"];
      const rec: Record<string, unknown> = {
        name, type, school_level_groups: groups,
        usage_start: body.usage_start ? String(body.usage_start) : null,
        usage_end: body.usage_end ? String(body.usage_end) : null,
        contact_email: body.contact_email ? String(body.contact_email).trim() : null,
        memo: body.memo ? String(body.memo) : null,
      };
      if (body.status && ["active", "inactive", "suspended"].includes(String(body.status))) rec.status = String(body.status);
      const { data, error } = await sb.from("myb_institutions").insert(rec).select("*").maybeSingle();
      if (error) return err("생성 실패: " + error.message, 500);
      return J({ ok: true, institution: data });
    }

    // ── 기관 목록 + 학급/학생 수 (super) ──
    if (path === "/inst_list") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const { data: insts } = await sb.from("myb_institutions").select("*").order("created_at", { ascending: false });
      const { data: cls } = await sb.from("myb_classes").select("id,institution_id").not("institution_id", "is", null);
      const clsByInst: Record<string, string[]> = {};
      (cls ??[]).forEach((c: any) => { (clsByInst[c.institution_id] ?? (clsByInst[c.institution_id] = [])).push(c.id); });
      const allClsIds = (cls ?? []).map((c: any) => c.id);
      const stuByClass: Record<string, number> = {};
      if (allClsIds.length) {
        const { data: stu } = await sb.from("myb_students").select("class_id").in("class_id", allClsIds).limit(20000);
       (stu ?? []).forEach((s: any) => { stuByClass[s.class_id] = (stuByClass[s.class_id] ?? 0) + 1; });
      }
      const institutions = (insts ?? []).map((i: any) => {
        const ids = clsByInst[i.id] ?? [];
        const student_count = ids.reduce((n, cid) => n + (stuByClass[cid] ?? 0), 0);
        return { ...i, class_count: ids.length, student_count };
      });
      return J({ ok: true, institutions });
    }

    // ── 기관 수정 (super) ──
    if (path === "/inst_update") {
      if (me.role !== "super") return err("권한이 없습니다", 403);
      const id = String(body.id ?? "");
      if (!id) return err("id가 필요합니다", 400);
      const p = body.patch ?? {};
      const patch: Record<string, unknown> = {};
      if (p.name !=null && String(p.name).trim()) patch.name = String(p.name).trim();
      if (p.type != null && String(p.type).trim()) patch.type = String(p.type).trim();
      if (p.school_level_groups !== undefined) {
        const g = Array.isArray(p.school_level_groups) ? p.school_level_groups.map((x: unknown) => String(x)).filter((x: string) => LEVELS.includes(x)) : [];
        patch.school_level_groups = g.length ? g : ["es", "ms", "hs"];
      }
      if (p.usage_start !== undefined) patch.usage_start = p.usage_start ? String(p.usage_start) : null;
      if (p.usage_end !== undefined) patch.usage_end = p.usage_end ? String(p.usage_end) : null;
      if (p.contact_email !== undefined) patch.contact_email = p.contact_email ? String(p.contact_email).trim() : null;
    if (p.memo !== undefined) patch.memo = p.memo ? String(p.memo) : null;
      if (p.status !== undefined && ["active", "inactive", "suspended"].includes(String(p.status))) patch.status = String(p.status);
      if (!Object.keys(patch).length) return err("변경할 항목이 없습니다", 400);
      const { data, error } = await sb.from("myb_institutions").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) return err("수정 실패: " + error.message, 500);
      if (!data) return err("대상을 찾을 수 없습니다", 404);
      return J({ ok: true, institution: data });
    }

    // ── 기관 통계 (super 전체 / school 자기관) ──
    if (path === "/inst_stats") {
      const id = await resolveInstId(body.id);
      if (!id) return err("id가 필요합니다", 400);
      if (!(await canAccessInst(id))) return err("권한이 없습니다", 403);
      const { data: classes } = await sb.from("myb_classes").select("id,name").eq("institution_id", id);
      const clsIds = (classes ?? []).map((c: any) => c.id);
      let students: any[] = [];
      if (clsIds.length) { const { data } = await sb.from("myb_students").select("id,class_id").in("class_id", clsIds).limit(20000); students = data ?? []; }
      const stuByClass: Record<string, string[]> = {};
      students.forEach((s: any) => { (stuByClass[s.class_id] ?? (stuByClass[s.class_id] = [])).push(s.id); });
      const sids = students.map((s: any) => s.id);
      let ats: any[] = [];
      if (sids.length) { const { data } = await sb.from("myb_attempts").select("student_id,test_slug").in("student_id", sids).limit(50000); ats = data ?? []; }
      const stuToClass: Record<string, string> = {};
      students.forEach((s: any) => { stuToClass[s.id] = s.class_id; });
      const attemptByClass: Record<string, number> = {};
      const perTest: Record<string, number> = {};
      ats.forEach((a: any) => { const cid = stuToClass[a.student_id]; if (cid) attemptByClass[cid] = (attemptByClass[cid] ?? 0) + 1; perTest[a.test_slug] = (perTest[a.test_slug] ?? 0) + 1; });
      const classStats = (classes ?? []).map((c: any) => ({ id: c.id, name: c.name, student_count: (stuByClass[c.id] ?? []).length, attempt_count: attemptByClass[c.id] ?? 0 }));
      const per_test = Object.keys(perTest).map((k) => ({ test_slug: k, count: perTest[k] })).sort((a, b) => b.count - a.count);
      return J({ ok: true, stats: { classes: classStats, totals: { students: students.length, attempts: ats.length }, per_test } });
    }

    // ── 관리자 목록 (super 전체 / school 자기관) ──
    if (path === "/admin_list") {
      const institution_id = await resolveInstId(body.institution_id);
      if (!institution_id) return err("institution_id가 필요합니다", 400);
      if (!(await canAccessInst(institution_id))) return err("권한이 없습니다", 403);
      const { data } = await sb.from("myb_admins").select("id,username,role,scope,display_name,institution_id,created_at").eq("institution_id", institution_id).order("created_at", { ascending: false });
      return J({ ok: true, admins: data ?? [] });
    }

    // ── 관리자 비밀번호 초기화 (super 전체 / school 자기관 teacher) ──
    if (path === "/admin_reset_pw") {
      const admin_id = body.admin_id;
      const new_password = String(body.new_password ?? "");
      if (!admin_id) return err("admin_id가 필요합니다", 400);
      // [FIX 2026-08-03 · N] 화면은 8자를 요구하는데 서버가 4자를 받고 있었다.
      if (new_password.length < 8) return err("새 비밀번호는 8자 이상이어야 합니다", 400);
      const { data: target } = await sb.from("myb_admins").select("id,role,institution_id").eq("id", admin_id).maybeSingle();
      if (!target) return err("대상을 찾을 수 없습니다", 404);
      if (me.role !== "super") {
        const iid = await myInstitutionId();
        if (me.role !== "school" || !iid || (target as any).institution_id !== iid || (target as any).role !== "teacher") return err("권한이 없습니다", 403);
      }
      const pass_hash = await hashPw(new_password);
      const { error } = await sb.from("myb_admins").update({ pass_hash }).eq("id", admin_id);
      if (error) return err("변경 실패: " + error.message, 500);
      return J({ ok: true });
    }

    // ── 기관 소속 학급 생성 (school/teacher) — 코드·교사PIN 발급 ──
    if (path === "/class_create_inst") {
      if (me.role !== "school" && me.role !== "teacher" && me.role !== "super") return err("권한이 없습니다", 403);
  const name = String(body.name ?? "").trim();
      if (!name) return err("학급명을 입력하세요", 400);
      let institution_id = body.institution_id != null ? String(body.institution_id) : null;
      if (me.role === "school" || me.role === "teacher") {
        institution_id = await myInstitutionId(); // 자기 기관 강제
        if (!institution_id) return err("소속 기관이 없습니다", 400);
      } else if (!institution_id) { return err("institution_id가 필요합니다", 400); }
      const { data: inst } = await sb.from("myb_institutions").select("id,name").eq("id", institution_id).maybeSingle();
      if (!inst) return err("기관을 찾을 수 없습니다", 404);
      const grade = body.grade != null ? String(body.grade).trim() : "";
      // 유니크 학급코드 발급
      let code = "";
      for (let i = 0; i < 10; i++) { const cand = randCode(6); const { data: ex } = await sb.from("myb_classes").select("id").eq("code", cand).maybeSingle(); if (!ex) { code = cand; break; } }
      if (!code) return err("학급코드 생성 실패, 다시 시도하세요", 500);
      const pinPlain = String(Math.floor(1000 + Math.random() * 9000)); // 4자리 평문 PIN
      const teacher_pin = await hashPw(pinPlain); // "h$"+sha256(pin+salt)
      const rec = { code, name, school: (inst as any).name ?? "", teacher_pin, institution_id, plan: "paid" };
      const { data: created, error } = await sb.from("myb_classes").insert(rec).select("id,code,name,school,institution_id,max_students").maybeSingle();
      if (error) return err("학급 생성 실패: " + error.message, 500);
      return J({ ok: true, class: created, grade, teacher_pin: pinPlain });
    }

    // ── 기관 entitlement 조회 (super 전체 / school 자기관) ──
    if (path === "/ent_inst_get") {
      const institution_id = await resolveInstId(body.institution_id);
      if (!institution_id) return err("institution_id가 필요합니다", 400);
      if (!(await canAccessInst(institution_id))) return err("권한이 없습니다", 403);
      const { data } = await sb.from("myb_inst_entitlements").select("id,test_slug,allowed,max_attempts_per_student,usage_start,usage_end").eq("institution_id", institution_id).order("test_slug");
      return J({ ok: true, entitlements: data ?? [] });
    }

    // ── 기관 entitlement 저장/upsert (super/school) ──
    if (path === "/ent_inst_save") {
      const institution_id = await resolveInstId(body.institution_id);
      if (!institution_id) return err("institution_id가 필요합니다", 400);
      if (!(await canAccessInst(institution_id))) return err("권한이 없습니다", 403);
      const list = Array.isArray(body.entitlements) ? body.entitlements : [];
      const rows= list.map(normEnt).filter((e: any) => e.test_slug).map((e: any) => ({
        institution_id, test_slug: e.test_slug, allowed: e.allowed, max_attempts_per_student: e.max_attempts_per_student,
     usage_start: e.usage_start, usage_end: e.usage_end, updated_at: new Date().toISOString(),
      }));
      if (!rows.length) return err("저장할 entitlement가 없습니다", 400);
      const { error } = await sb.from("myb_inst_entitlements").upsert(rows, { onConflict: "institution_id,test_slug" });
      if (error) return err("저장 실패: " + error.message, 500);
      return J({ ok: true });
    }

    // ── 학급 entitlement 조회 (super/school/teacher) — inst 상한 + 학급 조정값 ──
    if (path === "/ent_class_get") {
      const class_id = String(body.class_id ?? "");
      if (!class_id) return err("class_id가 필요합니다", 400);
      const acc = await loadClassForAccess(class_id);
      if (!acc.ok) return err(acc.msg, acc.status);
      const instId = (acc.cls as any).institution_id;
      let inst_caps: any[] = [];
      if (instId) { const { data } = await sb.from("myb_inst_entitlements").select("test_slug,allowed,max_attempts_per_student,usage_start,usage_end").eq("institution_id", instId).order("test_slug"); inst_caps = data ?? []; }
      const { data: ce } = await sb.from("myb_class_entitlements").select("id,test_slug,allowed,max_attempts_per_student,usage_start,usage_end").eq("class_id", class_id).order("test_slug");
      return J({ ok: true, inst_caps, class_entitlements: ce ?? [] });
    }

    // ── 학급 entitlement 저장 (teacher/school) — inst 상한 서버검증 후 upsert ──
    if (path === "/ent_class_save") {
      const class_id = String(body.class_id ?? "");
      if (!class_id) return err("class_id가 필요합니다", 400);
      const acc = await loadClassForAccess(class_id);
      if (!acc.ok) return err(acc.msg, acc.status);
      const instId = (acc.cls as any).institution_id;
      // inst 상한 로드(test_slug 별 맵)
      const instMap: Record<string, EntRow> = {};
      if (instId) {
        const { data: ie } = await sb.from("myb_inst_entitlements").select("test_slug,allowed,max_attempts_per_student,usage_start,usage_end").eq("institution_id", instId);
        (ie ?? []).forEach((r: any) => { instMap[r.test_slug] = { allowed: r.allowed, max_attempts_per_student: r.max_attempts_per_student, usage_start: r.usage_start, usage_end: r.usage_end }; });
      }
      const list = Array.isArray(body.entitlements) ? body.entitlements : [];
      const drafts = list.map(normEnt).filter((e: any) => e.test_slug);
      if (!drafts.length) return err("저장할 entitlement가 없습니다", 400);
      // 서버검증: inst 상한 초과 시 저장 거부
      const violations: { test_slug: string; reason: string }[] = [];
      for (const d of drafts) {
        const vs = validateClassEntitlement(instMap[d.test_slug] ?? null,{ allowed: d.allowed, max_attempts_per_student: d.max_attempts_per_student, usage_start: d.usage_start, usage_end: d.usage_end });
        vs.forEach((r) => violations.push({ test_slug: d.test_slug, reason: r }));
      }
      if (violations.length) return J({ ok: false, violations });
      const rows = drafts.map((e: any) => ({ class_id, test_slug: e.test_slug, allowed: e.allowed, max_attempts_per_student: e.max_attempts_per_student, usage_start: e.usage_start, usage_end: e.usage_end, updated_at: new Date().toISOString() }));
      const { error } = await sb.from("myb_class_entitlements").upsert(rows, { onConflict: "class_id,test_slug" });
      if (error) return err("저장 실패: " + error.message, 500);
      return J({ ok: true });
    }

    if (path === "/class_meta_update") {
      const class_id = String(body.class_id ?? "");
      if (!class_id) return err("class_id가 필요합니다", 400);
      const acc = await loadClassForAccess(class_id);
      if (!acc.ok) return err(acc.msg, acc.status);
      const patch: Record<string, unknown> = {};
      if (body.region !== undefined) patch.region = body.region || null;
      if (body.school_level !== undefined) patch.school_level = body.school_level || null;
      if (body.school !== undefined && String(body.school).trim()) patch.school = String(body.school).trim();
      if (!Object.keys(patch).length) return err("변경할 값이 없습니다", 400);
      const { data, error } = await sb.from("myb_classes").update(patch).eq("id", class_id).select("id,code,name,school,region,school_level").maybeSingle();
      if (error) return err("수정 실패: " + error.message, 500);
      return J({ ok: true, class: data });
    }


    // ── [2026-08-03] 문의(consultations) 관리 ──────────────────────────────
    // 회장님 지시: 들어온 문의에 "연락했다"를 기록할 자리가 없어 놓치는 일을 막는다.
    // 기존 status(text, default 'pending')·admin_note 컬럼을 그대로 쓰고 responded_at/responded_by 만 추가했다.
    // 권한: 이 블록은 위쪽 [A1] scope 가드 아래에 있고, 전화번호가 든 개인정보 테이블이므로
    //       거기에 더해 super 만 통과시킨다(판정은 세션 스냅샷이 아니라 myb_admins 현재 행).
    const CONSULT_STATUSES = ["pending", "contacted", "in_progress", "done", "spam"];
    async function isSuperLive() { return String((await adminRow())?.role ?? "") === "super"; }
    // 자동 인증요청·테스트 건 판정 — 목록 기본 필터에서 빼고 "미응답" 집계에서도 제외한다.
    function isNoiseRow(r: any) {
      const t = String(r?.consultation_type ?? "");
      const m = String(r?.message ?? "");
      const n = String(r?.name ?? "");
      return t.startsWith("[온내회원 인증요청]") || m.startsWith("[온내회원 인증요청]") || n.includes("테스트");
    }

    if (path === "/consultations_list") {
      if (!(await isSuperLive())) return err("권한이 없습니다", 403);
      const limit = Math.min(Math.max(Number(body.limit ?? 200) || 200, 1), 500);
      const offset = Math.max(Number(body.offset ?? 0) || 0, 0);
      let q = sb.from("consultations").select("*", { count: "exact" });
      const st = String(body.status ?? "").trim();
      if (st && st !== "all") q = q.eq("status", st);
      const ty = String(body.type ?? "").trim();
      if (ty) q = q.eq("consultation_type", ty);
      // PostgREST or() 는 콤마·괄호·% 로 구문이 깨지므로 검색어에서 제거한 뒤 넘긴다.
      const kw = String(body.q ?? "").replace(/[,()%*\\]/g, " ").trim();
      if (kw) q = q.or(["name", "phone", "email", "message", "institution_name", "organization_name", "student_name"].map((c) => c + ".ilike.%" + kw + "%").join(","));
      const { data, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) return err("조회 실패: " + error.message, 500);
      // 배지·필터탭용 집계는 항상 전체 기준(현재 필터와 무관)
      const { data: allRows } = await sb.from("consultations").select("id,status,consultation_type,name,message").limit(5000);
      const counts: Record<string, number> = { all: 0, pending: 0, contacted: 0, in_progress: 0, done: 0, spam: 0 };
      let pendingReal = 0, noise = 0;
      (allRows ?? []).forEach((r: any) => {
        const k = String(r.status ?? "pending");
        counts.all += 1;
        counts[k] = (counts[k] ?? 0) + 1;
        if (isNoiseRow(r)) { noise += 1; return; }
        if (k === "pending") pendingReal += 1;
      });
      const types = [...new Set((allRows ?? []).map((r: any) => String(r.consultation_type ?? "")).filter(Boolean))].sort();
      return J({ rows: data ?? [], total: count ?? 0, counts, pending_real: pendingReal, noise_count: noise, types, statuses: CONSULT_STATUSES });
    }

    if (path === "/consultation_update") {
      if (!(await isSuperLive())) return err("권한이 없습니다", 403);
      const id = String(body.id ?? "").trim();
      if (!id) return err("id가 필요합니다", 400);
      const { data: cur } = await sb.from("consultations").select("id,status,responded_at").eq("id", id).maybeSingle();
      if (!cur) return err("문의를 찾을 수 없습니다", 404);
      const patch: Record<string, unknown> = {};
      if (body.status !== undefined) {
        const st = String(body.status).trim();
        if (!CONSULT_STATUSES.includes(st)) return err("알 수 없는 상태값입니다", 400);
        patch.status = st;
        // 최초 응답 시각 보존 — 이미 찍혀 있으면 덮어쓰지 않는다.
        if (st !== "pending" && !(cur as any).responded_at) {
          patch.responded_at = new Date().toISOString();
          patch.responded_by = me.username;
        }
      }
      if (body.admin_note !== undefined) patch.admin_note = body.admin_note == null ? null : String(body.admin_note);
      if (!Object.keys(patch).length) return err("변경할 값이 없습니다", 400);
      const { data, error } = await sb.from("consultations").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) return err("저장 실패: " + error.message, 500);
      await audit(me, "consultation_update", id, { status: patch.status ?? null, note_changed: body.admin_note !== undefined });
      return J({ ok: true, row: data });
    }

    if (path === "/consultations_bulk_status") {
      if (!(await isSuperLive())) return err("권한이 없습니다", 403);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((x: unknown) => String(x ?? "").trim()).filter(Boolean))] : [];
      if (!ids.length) return err("선택된 문의가 없습니다", 400);
      if (ids.length > 500) return err("한 번에 최대 500건까지 처리합니다", 400);
      const st = String(body.status ?? "").trim();
      if (!CONSULT_STATUSES.includes(st)) return err("알 수 없는 상태값입니다", 400);
      const { data: cur } = await sb.from("consultations").select("id,responded_at").in("id", ids);
      const found = (cur ?? []).map((r: any) => String(r.id));
      if (!found.length) return err("문의를 찾을 수 없습니다", 404);
      const { error: e1 } = await sb.from("consultations").update({ status: st }).in("id", found);
      if (e1) return err("일괄 변경 실패: " + e1.message, 500);
      // responded_at 이 비어 있는 건만 도장을 찍는다(최초 응답 시각 보존).
      const fresh = (cur ?? []).filter((r: any) => !r.responded_at).map((r: any) => String(r.id));
      let stamped = 0;
      if (st !== "pending" && fresh.length) {
        const { error: e2 } = await sb.from("consultations").update({ responded_at: new Date().toISOString(), responded_by: me.username }).in("id", fresh);
        if (!e2) stamped = fresh.length;
      }
      await audit(me, "consultation_bulk_status", "bulk:" + found.length, { status: st, ids: found });
      return J({ ok: true, updated: found.length, stamped });
    }

    return err("not found", 404);
  } catch (e) { return err("server error: " + (e as Error).message, 500); }
});
