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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}
let SALT = "";
async function setting(k: string) { const { data } = await sb.from("myb_settings").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
async function hashPw(pw: string) { if (!SALT) SALT = await setting("pin_salt"); const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + SALT)); return "h$" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function auth(token: string) {
  if (!token) return null;
  const { data } = await sb.from("myb_admin_sessions").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) { await sb.from("myb_admin_sessions").delete().eq("token", token); return null; }
  return data as { username: string; role: string; scope: string | null };
}
const TOTAL_TESTS = 14;
const SERIES_LABELS = ["인문", "사회", "자연", "공학", "의생명", "교육", "예체능"];

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
      return J({ token, role: a.role, display_name: a.display_name, scope: a.scope });
    }
    if (path === "/sample") {
      const slug = url.searchParams.get("slug") ?? "";
      const { data: at } = await sb.from("myb_attempts").select("id,test_slug,result,created_at").eq("test_slug", slug).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!at) return err("샘플이 없습니다", 404);
      return J({ sample: { test_slug: at.test_slug, result: at.result } });
    }

    const me = await auth(String(body.token ?? url.searchParams.get("token") ?? ""));
    if (!me) return err("로그인이 필요합니다", 401);
    const scoped = (q: any) => {
      if (me.role === "school" && me.scope) q = q.ilike("school", "%" + me.scope + "%");
      if (me.role === "teacher" && me.scope) q = q.eq("code", String(me.scope).toUpperCase());
      return q;
    };

    if (path === "/filters") {
      let q = sb.from("myb_classes").select("code,name,school"); q = scoped(q);
      const { data: cls } = await q;
      const schools = [...new Set((cls ?? []).map((c) => (c.school || "").trim()).filter(Boolean))].sort();
      const { data: gr } = await sb.from("myb_students").select("grade");
      const grades = [...new Set((gr ?? []).map((g) => (g.grade || "").trim()).filter(Boolean))].sort();
      return J({ schools, grades, classes: (cls ?? []).map((c) => ({ code: c.code, name: c.name, school: c.school })) });
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
      // 대상 학급 조회 + scope 검증
      let cq = sb.from("myb_classes").select("id,code,name,school,max_students").eq("id", classId); cq = scoped(cq);
      const { data: cls } = await cq.maybeSingle();
      if (!cls) return err("학급을 찾을 수 없거나 권한이 없습니다", 403);
      // 정원 검증
      const { count: existing } = await sb.from("myb_students").select("id", { count: "exact", head: true }).eq("class_id", classId);
      const cur = existing ?? 0;
      const cap = cls.max_students ?? 40;
      if (cur + names.length > cap) return err(`정원 초과: 현재 ${cur}명 + 등록 ${names.length}명 > 정원 ${cap}명`, 400);
      // 중복 이름 표기용 기존 이름
      const { data: existRows } = await sb.from("myb_students").select("name").eq("class_id", classId);
      const existNames = new Set((existRows ?? []).map((r) => (r.name || "").trim()));
      const seen = new Set<string>();
      const dupes: string[] = [];
      names.forEach((n) => { if (existNames.has(n) || seen.has(n)) dupes.push(n); seen.add(n); });
      // INSERT (token=gen_random_uuid 자동, pin 기본 '0000')
      const insertRows = names.map((n) => ({ class_id: classId, name: n, pin: "0000", grade }));
      const { data: created, error: insErr } = await sb.from("myb_students").insert(insertRows).select("id,name,token,grade");
      if (insErr) return err("등록 실패: " + insErr.message, 500);
      return J({ ok: true, class: { code: cls.code, name: cls.name, school: cls.school }, created: created ?? [], count: (created ?? []).length, duplicates: [...new Set(dupes)] });
    }

    if (path === "/overview") {
      const { school, grade, code } = body;
      let cq = sb.from("myb_classes").select("id,code,name,school,plan,expires_at,max_students"); cq = scoped(cq);
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
      const rows = students.map((s) => { const b = byStu[s.id]; const c = clsById[s.class_id] ?? {}; return { id: s.id, name: s.name, grade: s.grade, class_id: s.class_id, school: c.school, class_name: c.name, code: c.code, plan: c.plan, done: b ? b.slugs.size : 0, total: TOTAL_TESTS, attempts: b ? b.cnt : 0, last_at: b ? b.last : null }; });
      rows.sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
      const summary = { students: rows.length, attempts: ats.length, classes: (classes ?? []).length, completed: rows.filter((r) => r.done >= 5).length, avg_done: rows.length ? Math.round(rows.reduce((x, r) => x + r.done, 0) / rows.length * 10) / 10 : 0 };
      return J({ role: me.role, summary, classes: classes ?? [], students: rows });
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
      const latest: Record<string, any> = {};
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
      latestArr.forEach((a) => { const r = a.result || {}; if ((a.test_slug === "hs_series" || a.test_slug === "ms_series") && r.kind === "series" && typeof r.best === "number" && r.best >= 0 && r.best < SERIES_LABELS.length) { seriesDist[r.best]++; seriesN++; } });

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
          series: b && b.series !== undefined ? SERIES_LABELS[b.series] : null,
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
      if (me.role === "teacher" && me.scope && (st as any).myb_classes?.code !== String(me.scope).toUpperCase()) return err("권한이 없습니다", 403);
      if (me.role === "school" && me.scope && !String((st as any).myb_classes?.school ?? "").toLowerCase().includes(String(me.scope).toLowerCase())) return err("권한이 없습니다", 403);
      const { data: ats } = await sb.from("myb_attempts").select("id,test_slug,result,created_at").eq("student_id", sid).order("created_at", { ascending: false });
      return J({ student: { name: st.name, grade: st.grade, school: (st as any).myb_classes?.school, class_name: (st as any).myb_classes?.name, code: (st as any).myb_classes?.code }, attempts: ats ?? [] });
    }

    // ── 학생 정보 수정 ──
    if (path === "/student_update") {
      const sid = String(body.student_id ?? "").trim();
      if (!sid) return err("student_id가 필요합니다", 400);
      const { data: st } = await sb.from("myb_students").select("id,name,grade,class_id").eq("id", sid).maybeSingle();
      if (!st) return err("학생을 찾을 수 없습니다", 404);
      // 현재 소속 학급이 관리자 스코프 내인지 검증
      let cq = sb.from("myb_classes").select("id").eq("id", st.class_id); cq = scoped(cq);
      const { data: curCls } = await cq.maybeSingle();
      if (!curCls) return err("권한이 없습니다", 403);
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const n = String(body.name).trim();
        if (!n || n.length > 40) return err("이름은 1~40자로 입력하세요", 400);
        patch.name = n;
      }
      if (body.grade !== undefined) {
        const g = String(body.grade).trim();
        if (g.length > 20) return err("학년은 20자 이내로 입력하세요", 400);
        patch.grade = g;
      }
      if (body.pin !== undefined && String(body.pin).trim() !== "") {
        const p = String(body.pin).trim();
        if (!/^\d{4}$/.test(p)) return err("PIN은 4자리 숫자여야 합니다", 400);
        patch.pin = p;
      }
      if (body.class_id !== undefined && String(body.class_id) !== String(st.class_id)) {
        const nid = String(body.class_id).trim();
        let nq = sb.from("myb_classes").select("id,max_students").eq("id", nid); nq = scoped(nq);
        const { data: ncls } = await nq.maybeSingle();
        if (!ncls) return err("이동할 학급을 찾을 수 없거나 권한이 없습니다", 403);
        const { count } = await sb.from("myb_students").select("id", { count: "exact", head: true }).eq("class_id", nid);
        if ((count ?? 0) + 1 > (ncls.max_students ?? 40)) return err("이동 대상 학급의 정원을 초과합니다", 400);
        patch.class_id = nid;
      }
      if (!Object.keys(patch).length) return err("변경할 내용이 없습니다", 400);
      const { data: upd, error: uErr } = await sb.from("myb_students").update(patch).eq("id", sid).select("id,name,grade,class_id").maybeSingle();
      if (uErr) return err("수정 실패: " + uErr.message, 500);
      return J({ ok: true, student: upd });
    }

    // ── 학생 삭제 (응시 기록 포함 하드 삭제) ──
    if (path === "/student_delete") {
      const sid = String(body.student_id ?? "").trim();
      if (!sid) return err("student_id가 필요합니다", 400);
      const { data: st } = await sb.from("myb_students").select("id,class_id").eq("id", sid).maybeSingle();
      if (!st) return err("학생을 찾을 수 없습니다", 404);
      let cq = sb.from("myb_classes").select("id").eq("id", st.class_id); cq = scoped(cq);
      const { data: cls } = await cq.maybeSingle();
      if (!cls) return err("권한이 없습니다", 403);
      const { error: aErr } = await sb.from("myb_attempts").delete().eq("student_id", sid);
      if (aErr) return err("삭제 실패(응시 기록): " + aErr.message, 500);
      const { error: dErr } = await sb.from("myb_students").delete().eq("id", sid);
      if (dErr) return err("삭제 실패: " + dErr.message, 500);
      return J({ ok: true });
    }

    if (path === "/logout") { await sb.from("myb_admin_sessions").delete().eq("token", body.token); return J({ ok: true }); }

    return err("not found", 404);
  } catch (e) { return err("server error: " + (e as Error).message, 500); }
});
