import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const J = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
const err = (m: string, s = 400, code?: string) => J({ error: m, code }, s);
async function setting(key: string): Promise<string> {
  const { data } = await sb.from("myb_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}
let SALT = "";
async function hashPin(pin: string) {
  if (!SALT) SALT = await setting("pin_salt");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + SALT));
  return "h$" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// [FIX 2026-08-03 · K] 일괄등록 기본 PIN("0000") 해시. 이 값으로 로그인하면 변경을 요구한다.
const DEFAULT_PIN_HASH = await hashPin("0000");
// 2026-07-23: 사용자 피드백("무료 진단이라는 설명과 실제가 안 맞음") 반영 — 마케팅/SEO 랜딩페이지에서
// 소개하는 대표 진단들을 개인(비학급) 이용자도 실제로 무료 이용 가능하도록 확장(3종 → 8종).
const FREE_SLUGS = ["hs_series", "ms_series", "es_dream", "subject_rec", "subject_pick", "roadmap", "study", "interview", "ms_hsfit"];
// 2026-07-30: 학년 미선택/오선택으로 "고등"이 잘못 기본 추천되던 버그(신규 가입 시 grade가 비어있거나
// 인식 불가 형식으로 저장되던 문제)의 서버측 방어. 신규 학생 생성 시에만 검증(기존 학생 grade는 절대 덮어쓰지 않음).
const VALID_GRADES = new Set(["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"]);
function normalizeGrade(g: unknown): string {
  const s = String(g ?? "").trim();
  return VALID_GRADES.has(s) ? s : "";
}
const HIDDEN_TESTS = new Set(["ai_skill", "career_mature", "multi_iq", "study_emotion", "study_manage", "mock_exam", "admission_nav", "reading"]);

type TestDef = { title: string; desc: string; audience: string; scale: string; cat: string; steps: Record<string, number>; free?: boolean };
const TESTS: Record<string, TestDef> = {
  es_dream: { title: "초등 진로 탐험", desc: "14가지 질문으로 내가 좋아하는 것 찾기", audience: "초등 3~6학년", scale: "likert", cat: "진로", steps: { es: 1 }, free: true },
  es_habit: { title: "초등 공부습관 진단", desc: "숨은 공부 힘 5가지 체크 → 습관 처방", audience: "초등 3~6학년", scale: "yesno", cat: "공부", steps: { es: 2 } },
  hs_series: { title: "고등 계열성향 진단", desc: "70문항으로 7개 계열 성향을 정밀 분석", audience: "고등학생", scale: "likert", cat: "진로", steps: { hs: 1 }, free: true },
  ms_series: { title: "중등 계열성향 진단", desc: "49문항으로 나에게 맞는 계열 찾기", audience: "중학생", scale: "likert", cat: "진로", steps: { ms: 1 }, free: true },
  subject_rec: { title: "고교학점제 과목 추천", desc: "계열 → 학과 → 학교 교육과정표 → 선택과목 조합 설계", audience: "중3·고등", scale: "pick", cat: "진학", steps: { hs: 2 } },
  subject_pick: { title: "고교학점제 과목 선택 진단", desc: "36문항으로 6개 학습영역을 재고 2022 개정 교육과정 과목 조합을 설계", audience: "중3·고1·고2", scale: "likert", cat: "진학", steps: { hs: 2 }, free: true },
  study: { title: "대학합격 공부 진단", desc: "국어·수학·사회·과학·영어 등급 기반 과목별 학습전략", audience: "고등학생", scale: "grade", cat: "공부", steps: { hs: 3 } },
  ms_study: { title: "중등 공부습관 진단", desc: "6가지 공부습관 체크 → 습관 처방전", audience: "중학생", scale: "yesno", cat: "공부", steps: { ms: 2 } },
  reading: { title: "독서역량 진단", desc: "독서 습관·독해·기록·확장을 전공 탐색과 연결", audience: "고등학생", scale: "yesno", cat: "공부", steps: { hs: 6 } },
  roadmap: { title: "학생부 로드맵 진단", desc: "학종 평가요소와 세특·창체·독서·행특 연결성 점검", audience: "고등학생", scale: "yesno", cat: "진학", steps: { hs: 4 } },
  inquiry: { title: "과제탐구 준비도 진단", desc: "탐구 6단계 자가진단과 주제 설계 가이드", audience: "고등학생", scale: "yesno", cat: "공부", steps: { hs: 5 } },
  future: { title: "미래역량 진단", desc: "리더십·창의성·문제해결·소통·프로젝트·전략적사고와 AI 질문·검증·표현 원칙을 함께 점검", audience: "고등학생", scale: "likert", cat: "역량", steps: { hs: 9 } },
  ai_skill: { title: "AI 활용역량 진단", desc: "AI 이해·프롬프트·검증·윤리 4영역 진단", audience: "초·중·고등", scale: "yesno", cat: "역량", steps: { es: 3, ms: 6, hs: 8 } },
  hs_essay: { title: "고입·과기원 소개서 준비도 진단", desc: "중학생은 고입 소개서, 고등학생은 과기원·특수대학 서류형 소개서 준비도를 점검", audience: "중3·고등", scale: "yesno", cat: "진학", steps: { ms: 4, hs: 6 } },
  interview: { title: "대입 면접 준비도 진단", desc: "학생부 기반 질문, 전공 연결 답변, 꼬리질문 대응 점검", audience: "고3·N수", scale: "yesno", cat: "진학", steps: { hs: 7 } },
  track_fit: { title: "전형 적합도 진단", desc: "교과·학종·논술·정시 4개 전형 적합도를 진단합니다", audience: "고2·고3", scale: "yesno", cat: "진학", steps: { hs: 10 } },
  ms_hsfit: { title: "고교 유형 적합도 진단", desc: "일반고·과학고·외고·자사고 중 나에게 맞는 고교 유형과 진학 로드맵", audience: "중학 2·3학년", scale: "yesno", cat: "진학", steps: { ms: 8 } },
  value_work: { title: "직업가치관 진단", desc: "직업가치관·진로성숙도·다중지능을 연결해 나에게 맞는 직업 방향과 강점 능력을 점검", audience: "초등 고학년·중학생", scale: "yesno", cat: "진로", steps: { es: 3, ms: 5 } },
  career_mature: { title: "진로성숙도 진단", desc: "자기이해·진로계획 등 5영역 진로 준비 수준 점검", audience: "중·고등학생", scale: "yesno", cat: "진로", steps: { ms: 10, hs: 12 } },
  study_emotion: { title: "학습정서·시험불안 진단", desc: "시험불안·학습동기·자기효능감·집중관리 4영역 마음 점검", audience: "중·고등학생", scale: "yesno", cat: "역량", steps: { ms: 11, hs: 13 } },
  multi_iq: { title: "다중지능 진단", desc: "8가지 지능 중 나의 강점 지능 찾기 + 진로·활동 제안", audience: "초·중등", scale: "yesno", cat: "역량", steps: { es: 4, ms: 12 } },
  study_manage: { title: "공부관리 진단", desc: "학습 시간·오답·계획·실행관리 5가지 루틴을 점검합니다", audience: "초4~고3", scale: "yesno", cat: "공부", steps: { es: 5, ms: 13, hs: 14 } },
  gifted_ready: { title: "초등 영재 준비도 진단", desc: "관찰·탐구·창의·논리·표현 준비도를 초등 눈높이에 맞게 점검합니다", audience: "초4~초6", scale: "yesno", cat: "역량", steps: { es: 4 } },
  mock_exam: { title: "모의고사 성적 분석", desc: "내신·모의고사 등급 해석과 과목별 약점 관리를 점검합니다", audience: "중3~고3", scale: "yesno", cat: "공부", steps: { ms: 15, hs: 15 } },
  admission_nav: { title: "입시전형 내비게이터", desc: "학생부·수능·전형이해·일정·상담 준비 균형을 진단합니다", audience: "고1~고3", scale: "yesno", cat: "진학", steps: { hs: 16 } },
  story_writer: { title: "AI 동화작가", desc: "주제·인물·구성·표현·AI 윤리까지 창작 과정을 점검합니다", audience: "초4~고3", scale: "yesno", cat: "역량", steps: { es: 7, ms: 16, hs: 17 } },
  ai_inquiry: { title: "AI 과제탐구", desc: "질문 설계·자료 검증·출처 확인·보고서화 준비도를 점검합니다", audience: "초5~고3", scale: "yesno", cat: "공부", steps: { es: 8, ms: 17, hs: 18 } },
};
for (const k of FREE_SLUGS) if (TESTS[k]) TESTS[k].free = true;
const LABELS = ["인문", "사회", "자연", "공학", "의생명", "교육", "예체능"];
const FUT_LABELS = ["리더십", "창의성", "문제해결", "소통", "프로젝트", "전략적사고"];
const FUT_KEYS = ["lead", "creative", "solve", "comm", "project", "strategy"];
const SUBJ = ["국어", "수학", "사회", "과학", "영어"];
const BUCKET_NAMES: Record<string, string[]> = {
  inquiry: ["주제 선정", "질문 설계", "자료 조사", "탐구 수행", "결과 정리", "발표·기록"],
  ms_study: ["계획", "집중", "복습", "정리·요약", "시험 전략", "마인드"],
  roadmap: ["학교생활", "창체활동", "교과·내신", "세특", "행특·종합"],
  ai_skill: ["AI 이해·활용", "프롬프트", "검증·비판", "윤리·책임"],
  es_habit: ["숙제·준비", "집중", "말하기 복습", "생활 리듬", "마음 습관"],
  reading: ["독서 습관", "독해 전략", "독서 기록", "확장 독서"],
  track_fit: ["교과전형", "학생부종합", "논술전형", "정시(수능)"],
  ms_hsfit: ["일반고", "과학고·영재고", "외고·국제고", "자사고"],
  value_work: ["능력발휘·성취", "자율성", "안정성", "사회적 인정", "사회봉사", "창의·자기계발"],
  career_mature: ["자기이해", "직업세계 이해", "진로계획", "진로 태도", "의사결정"],
  study_emotion: ["시험불안 관리", "학습동기", "자기효능감", "집중·스트레스 관리"],
  multi_iq: ["언어", "논리수학", "공간", "신체운동", "음악", "대인", "자기성찰", "자연친화"],
  study_manage: ["계획", "집중", "오답", "반복", "점검"],
  gifted_ready: ["관찰", "탐구", "창의", "논리", "표현"],
  mock_exam: ["등급해석", "오답분석", "시간전략", "과목균형", "피드백"],
  admission_nav: ["학생부", "수능", "전형이해", "일정관리", "상담준비"],
  story_writer: ["주제", "인물", "구성", "표현", "윤리"],
  ai_inquiry: ["질문설계", "자료검증", "탐구실행", "출처표기", "보고서화"],
};
// [F-PATCH 2026-08-03 · subject_pick] 고교학점제 과목 선택 진단 6개 학습영역
const AREA_SP = ["언어·문해", "수리·논리", "외국어·국제", "사회·인간", "자연·탐구", "기술·창작"];
const REC_KEYS = ["s1","s2","s3","s4","s5","s6","s7"];

function scoreSeries(answers: number[], buckets: number[], n = 7, labels = LABELS): Record<string, unknown> {
  const sums = new Array(n).fill(0);
  answers.forEach((v, i) => { const b = buckets[i]; if (b >= 0 && b < n) sums[b] += Math.max(1, Math.min(5, v | 0)); });
  const order = [...Array(n).keys()].sort((a, b) => sums[b] - sums[a] || a - b);
  return { kind: "series", labels, scores: sums, best: order[0], second: order[1], worst: order[n - 1], worst2: order[n - 2] };
}
function scoreChecklist(slug: string, answers: number[], qtexts: string[]): Record<string, unknown> {
  let type = 0, items: number[] = answers;
  if (slug === "hs_essay") { type = Math.max(1, Math.min(4, answers[0] | 0)); items = answers.slice(1); }
  const flags = items.map((v) => (v | 0) === 1);
  const ready = flags.filter(Boolean).length;
  const weak = flags.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0);
  return { kind: "checklist", type, ready, total: flags.length, pct: Math.round(ready / flags.length * 100), flags, weak, qtexts };
}
function scoreBucketCheck(slug: string, answers: number[], buckets: number[], qtexts: string[]): Record<string, unknown> {
  const names = BUCKET_NAMES[slug] ?? [];
  const flags = answers.map((v) => (v | 0) === 1);
  const per = names.map((_n, b) => {
    const idx = buckets.map((x, i) => x === b ? i : -1).filter((i) => i >= 0);
    const ok = idx.filter((i) => flags[i]).length;
    return { ok, total: idx.length };
  });
  const weakBuckets = per.map((p, b) => p.ok < p.total ? b : -1).filter((b) => b >= 0);
  const ready = flags.filter(Boolean).length;
  return { kind: "bucketcheck", names, per, weakBuckets, ready, total: flags.length, pct: Math.round(ready / flags.length * 100), flags, qtexts };
}
function scoreGrades(answers: number[]): Record<string, unknown> {
  const grades = answers.map((v) => Math.max(1, Math.min(5, v | 0)));
  return { kind: "grades", subjects: SUBJ, grades };
}
const gradeBand = (g: number) => g <= 1 ? "band1" : (g <= 3 ? "band2" : "band3");

async function getQuestions(slug: string) {
  const { data, error } = await sb.from("myb_questions").select("ord,q_text,bucket").eq("test_slug", slug).order("ord");
  if (error) throw error;
  return data!;
}
async function student(token: string) {
  const { data } = await sb.from("myb_students").select("*, myb_classes(id,code,name,school,school_level,expires_at,plan,active,starts_at,max_uses,allow_expired_review)").eq("token", token).maybeSingle();
  return data;
}

// [F-PATCH 2026-08-03 · R9] 이번 분기 추천 활동카드 산출
// 리포트(myb-report)와 같은 규칙을 쓴다. 표준 6분기 · 학교급별 카드 세트.
const ACT_QNM = ["설계기", "평가기", "도약기", "결실기", "정리기", "전환기"];
function actQuarterNow(): number {
  const t = new Date(); const md = (t.getMonth() + 1) * 100 + t.getDate();
  if (md >= 302 && md <= 430) return 1;
  if (md >= 501 && md <= 630) return 2;
  if (md >= 701 && md <= 825) return 3;
  if (md >= 826 && md <= 1031) return 4;
  if (md >= 1101 && md <= 1231) return 5;
  return 6;
}
function actGuOf(grade: unknown): number {
  const g = String(grade ?? "");
  if (/초/.test(g)) return 2334;
  if (/중/.test(g)) return 2332;
  return 2330;
}
async function actTierOf(studentId: string, gu: number, grade: unknown): Promise<string> {
  if (gu === 2334) {                       // 초등: 학년으로 (3~4 기본 / 5~6 도전)
    const m = String(grade ?? "").match(/([1-6])/);
    return (m && Number(m[1]) >= 5) ? "std" : "bas";
  }
  const { data } = await sb.from("myb_attempts").select("result")
    .eq("student_id", studentId).eq("test_slug", "study")
    .order("created_at", { ascending: false }).limit(1);
  const rr: any = (data && data[0] && data[0].result) || null;
  const g: number[] = (rr && Array.isArray(rr.grades))
    ? rr.grades.map((v: any) => Number(v) || 0).filter((v: number) => v > 0) : [];
  if (!g.length) return "std";
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  return avg <= 2.5 ? "dep" : (avg <= 4.0 ? "std" : "bas");
}
const ACT_UP: Record<string, string> = { bas: "std", std: "dep", dep: "dep" };
async function actCardsFor(st: any, q: number) {
  const gu = actGuOf(st.grade);
  const tier = await actTierOf(st.id, gu, st.grade);
  let keys: string[] = [];
  if (gu === 2334) {
    // 초등 — 「초등 진로 탐험」 결과의 1·2순위 계열
    const { data } = await sb.from("myb_attempts").select("result")
      .eq("student_id", st.id).eq("test_slug", "es_dream")
      .order("created_at", { ascending: false }).limit(1);
    const r: any = (data && data[0] && data[0].result) || null;
    if (!r) return { gu, tier, quarter: q, cards: [], need: "es_dream" };
    const b = (Number(r.best) || 0) + 1, s2 = (Number(r.second) || 1) + 1;
    keys = [`s${b}${q}_${tier}`, `s${s2}${q}_${tier}`];
  } else {
    // 중·고 — 「고교학점제 과목 선택 진단」 결과의 1·2순위 학습영역
    const { data } = await sb.from("myb_attempts").select("result")
      .eq("student_id", st.id).eq("test_slug", "subject_pick")
      .order("created_at", { ascending: false }).limit(1);
    const r: any = (data && data[0] && data[0].result) || null;
    if (!r) return { gu, tier, quarter: q, cards: [], need: "subject_pick" };
    const AK = ["L", "M", "E", "S", "N", "T"];
    const b = Number(r.best ?? 0), s2 = Number(r.second ?? 1);
    keys = [`${AK[b]}${q}_${tier}`, `${AK[s2]}${q}_${tier}`, `${AK[b]}${q}_${ACT_UP[tier]}`];
  }
  keys = keys.filter((v, i, a) => a.indexOf(v) === i);
  const { data: blks } = await sb.from("myb_blocks").select("cond_key,title,body")
    .eq("gu_no", gu).eq("section", "act_card").in("cond_key", keys).order("sort_no");
  const cards = (blks ?? []).map((x: any) => ({
    key: x.cond_key, gu, quarter: q, title: String(x.title ?? ""),
    lead: String(x.body ?? "").split("\n")[0].slice(0, 120),
  }));
  return { gu, tier, quarter: q, cards, need: null };
}
async function blocksBy(gu_no: number, section: string, keys?: string[]) {
  let q = sb.from("myb_blocks").select("*").eq("gu_no", gu_no).eq("section", section);
  if (keys) q = q.in("cond_key", keys.length ? keys : ["-"]);
  const { data } = await q.order("sort_no");
  return data ?? [];
}
const expired = (cls: { expires_at?: string | null }) => !!cls?.expires_at && new Date(cls.expires_at + "T23:59:59") < new Date();
const notStarted = (cls: { starts_at?: string | null }) => !!cls?.starts_at && new Date(cls.starts_at + "T00:00:00") > new Date();
function gateMsg(cls: any): string {
  if (cls?.active === false) return "현재 정지된 학급입니다. 선생님께 문의하세요";
  if (notStarted(cls)) return "아직 이용 시작 전입니다 (" + cls.starts_at + "부터 이용 가능)";
  if (expired(cls)) return "이용 기간이 만료되었습니다. 기존 결과는 계속 볼 수 있어요";
  return "";
}
async function verifyTeacher(code: unknown, pin: unknown) {
  const { data: cls } = await sb.from("myb_classes").select("*").eq("code", String(code ?? "").toUpperCase()).maybeSingle();
  if (!cls || cls.teacher_pin !== await hashPin(String(pin))) return null;
  return cls;
}
async function adminSession(token: unknown) {
  const t = String(token ?? "");
  if (!t) return null;
  const { data } = await sb.from("myb_admin_sessions").select("*").eq("token", t).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) {
    await sb.from("myb_admin_sessions").delete().eq("token", t);
    return null;
  }
  return data as { username: string; role: string; scope?: string | null };
}

// ---------------------------------------------------------------------------
// entitlement2 (기관 계층 진단별 entitlement 판정) — _shared/entitlement2.ts 인라인 복사
// (2026-07-23, 프로젝트 inline 컨벤션: 함수별 배포 단위 일관성 유지 목적. 원본은
// supabase/functions/_shared/entitlement2.ts — 로직 변경 시 두 파일 모두 갱신)
// 판정순서: ① 학급 institution_id NULL → legacy allow(회귀 금지) ② 기관 status/기간
// ③ 학교급 매칭 ④ inst entitlement ⑤ class entitlement 병합(min/교집합) ⑥ attempts 횟수
// ---------------------------------------------------------------------------
type SchoolLevel = "es" | "ms" | "hs";
type EntRow = { allowed: boolean; max_attempts_per_student: number | null; usage_start: string | null; usage_end: string | null };
type InstitutionInfo = { status: string; usage_start: string | null; usage_end: string | null; school_level_groups: string[] };
type DecideTestInput = {
  today: string; testSlug: string; classInstitutionId: string | null;
  institution: InstitutionInfo | null; instEnt: EntRow | null; classEnt: EntRow | null; attemptsUsed: number;
};
type DenyReason = "status" | "period" | "level_mismatch" | "not_allowed" | "quota" | "no_student";
type TestEntitlement = {
  allowed: boolean; reason: DenyReason | "legacy" | "ok"; maxAttempts: number | null; attemptsUsed: number;
  attemptsRemaining: number | null; periodStart: string | null; periodEnd: string | null;
};
function levelOfSlug(slug: string): SchoolLevel | null {
  if (slug.startsWith("es_")) return "es";
  if (slug.startsWith("ms_")) return "ms";
  if (slug.startsWith("hs_")) return "hs";
  return null;
}
function minCap(a: number | null | undefined, b: number | null | undefined): number | null {
  const av = a === null || a === undefined ? Infinity : a;
  const bv = b === null || b === undefined ? Infinity : b;
  const m = Math.min(av, bv);
  return m === Infinity ? null : m;
}
function latestStart(dates: (string | null | undefined)[]): string | null {
  const xs = dates.filter((d): d is string => !!d);
  if (!xs.length) return null;
  return xs.reduce((a, b) => (a > b ? a : b));
}
function earliestEnd(dates: (string | null | undefined)[]): string | null {
  const xs = dates.filter((d): d is string => !!d);
  if (!xs.length) return null;
  return xs.reduce((a, b) => (a < b ? a : b));
}
function withinPeriod(today: string, start: string | null, end: string | null): boolean {
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}
function decideTestEntitlement(input: DecideTestInput): TestEntitlement {
  const base = { maxAttempts: null as number | null, attemptsUsed: input.attemptsUsed, attemptsRemaining: null as number | null, periodStart: null as string | null, periodEnd: null as string | null };
  if (input.classInstitutionId === null) return { allowed: true, reason: "legacy", ...base };
  const inst = input.institution;
  if (!inst || inst.status !== "active") return { allowed: false, reason: "status", ...base };
  if (!withinPeriod(input.today, inst.usage_start, inst.usage_end)) {
    return { allowed: false, reason: "period", ...base, periodStart: inst.usage_start, periodEnd: inst.usage_end };
  }
  const level = levelOfSlug(input.testSlug);
  if (level && !inst.school_level_groups.includes(level)) return { allowed: false, reason: "level_mismatch", ...base };
  const ie = input.instEnt;
  const ce = input.classEnt;
  if (ie && !ie.allowed) return { allowed: false, reason: "not_allowed", ...base };
  if (ce && !ce.allowed) return { allowed: false, reason: "not_allowed", ...base };
  const effStart = latestStart([inst.usage_start, ie?.usage_start, ce?.usage_start]);
  const effEnd = earliestEnd([inst.usage_end, ie?.usage_end, ce?.usage_end]);
  if (!withinPeriod(input.today, effStart, effEnd)) {
    return { allowed: false, reason: "period", ...base, periodStart: effStart, periodEnd: effEnd };
  }
  const effMax = minCap(ie?.max_attempts_per_student, ce?.max_attempts_per_student);
  if (effMax !== null && input.attemptsUsed >= effMax) {
    return { allowed: false, reason: "quota", maxAttempts: effMax, attemptsUsed: input.attemptsUsed, attemptsRemaining: 0, periodStart: effStart, periodEnd: effEnd };
  }
  const remaining = effMax === null ? null : Math.max(0, effMax - input.attemptsUsed);
  return { allowed: true, reason: "ok", maxAttempts: effMax, attemptsUsed: input.attemptsUsed, attemptsRemaining: remaining, periodStart: effStart, periodEnd: effEnd };
}
/** 학생(studentId)이 특정 진단(testSlug)을 응시 가능한지 DB 조회 후 판정. institution_id NULL 학급은 legacy allow(회귀 금지). */
async function checkTestEntitlement(studentId: string, testSlug: string): Promise<TestEntitlement> {
  const today = new Date().toISOString().slice(0, 10);
  const deny = (reason: DenyReason): TestEntitlement => ({ allowed: false, reason, maxAttempts: null, attemptsUsed: 0, attemptsRemaining: null, periodStart: null, periodEnd: null });
  const { data: stRow } = await sb.from("myb_students").select("id, class_id").eq("id", studentId).maybeSingle();
  if (!stRow) return deny("no_student");
  const { data: klass } = await sb.from("myb_classes").select("id, institution_id").eq("id", (stRow as { class_id: string }).class_id).maybeSingle();
  const classInstitutionId = (klass as { institution_id?: string | null } | null)?.institution_id ?? null;
  // ① 레거시 학급 — 조기 반환(불필요한 조회 절감. attemptsRemaining은 legacy에서 항상 null이라 카운트 불필요)
  if (classInstitutionId === null) {
    return decideTestEntitlement({ today, testSlug, classInstitutionId: null, institution: null, instEnt: null, classEnt: null, attemptsUsed: 0 });
  }
  const { count: attemptsUsed } = await sb.from("myb_attempts").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("test_slug", testSlug);
  const [{ data: inst }, { data: instEnt }, { data: classEnt }] = await Promise.all([
    sb.from("myb_institutions").select("status, usage_start, usage_end, school_level_groups").eq("id", classInstitutionId).maybeSingle(),
    sb.from("myb_inst_entitlements").select("allowed, max_attempts_per_student, usage_start, usage_end").eq("institution_id", classInstitutionId).eq("test_slug", testSlug).maybeSingle(),
    sb.from("myb_class_entitlements").select("allowed, max_attempts_per_student, usage_start, usage_end").eq("class_id", (klass as { id: string }).id).eq("test_slug", testSlug).maybeSingle(),
  ]);
  const institution: InstitutionInfo | null = inst ? {
    status: (inst as { status: string }).status,
    usage_start: (inst as { usage_start: string | null }).usage_start,
    usage_end: (inst as { usage_end: string | null }).usage_end,
    school_level_groups: ((inst as { school_level_groups?: string[] }).school_level_groups) ?? [],
  } : null;
  return decideTestEntitlement({ today, testSlug, classInstitutionId, institution, instEnt: (instEnt as EntRow | null) ?? null, classEnt: (classEnt as EntRow | null) ?? null, attemptsUsed: attemptsUsed ?? 0 });
}
/** myb_students 조인 결과에서 개인(비학급, IND 자동생성 클래스) 여부 판정 — FREE_SLUGS 로직과 동일 기준 재사용 */
function isIndividualClass(cls0: any): boolean {
  return String(cls0?.code ?? "").startsWith("IND") || cls0?.school === "개인 이용자";
}
/** entitlement2 deny 결과를 gate 응답 형태로 변환 */
function gateOf(te: TestEntitlement) {
  return { reason: te.reason, detail: { maxAttempts: te.maxAttempts, attemptsUsed: te.attemptsUsed, attemptsRemaining: te.attemptsRemaining, periodStart: te.periodStart, periodEnd: te.periodEnd } };
}

// 2026-07-23: 진로 상담 AI 챗봇(과목추천 결과 페이지). ANTHROPIC_API_KEY 비밀값이 설정되면 실제 LLM이 답변하고,
// 설정되지 않았을 때는 학생의 실제 진단 결과(학과·과목·진로)를 기반으로 한 맞춤형 규칙 기반 답변으로 부드럽게 대체(회귀 위험 0).
const CHAT_MODEL = "claude-3-5-haiku-20241022";
async function llmAnswer(system: string, user: string): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CHAT_MODEL, max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const txt = ((j.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("").trim();
    return txt || null;
  } catch (_e) {
    return null;
  }
}
function fallbackSubjectAnswer(question: string, pk: string, major: any, curriculumOk: number): string {
  const q = question;
  const normal = major?.subj_normal || "학교 교육과정을 확인해 주세요";
  const career = major?.subj_career || "";
  const fusion = major?.subj_fusion || "";
  const jobs = major?.jobs || "";
  const name = major?.name ? `'${major.name}'` : `${pk}계열`;
  const explain = major?.explain || "";
  const wantsJob = /직업|취업|진로|졸업 후|일자리/.test(q);
  const wantsWhy = /왜|이유|근거/.test(q);
  const wantsAlt = /다른|대신|바꾸|비슷한|차이/.test(q);
  const wantsCollege = /대학|입시|수시|정시|학종/.test(q);
  const lines: string[] = [];
  lines.push(`${name} 관심 학생을 기준으로 답해 드릴게요.`);
  if (wantsWhy) lines.push(`${name}은(는) ${explain || "학생의 흥미·역량 프로필과 맞닿은 학과"}로 추천됐어요. 일반선택 과목(${normal})이 기초를, 진로선택 과목(${career || normal})이 전공 연결을 담당해요.`);
  else if (wantsAlt) lines.push(`비슷한 계열 안에서는 융합선택 과목(${fusion || career || normal})으로 관심사를 넓혀볼 수 있어요. 학교에 해당 과목이 없다면 공동교육과정이나 온라인 보충 과정을 담임·진로 선생님과 상의해 보세요.`);
  else if (wantsJob) lines.push(`${name} 전공과 연결되는 진로 분야는 ${jobs || "학과 설명을 참고해 주세요"}예요. 구체적인 진로는 학년이 올라가며 활동·탐구 경험으로 더 뚜렷해져요.`);
  else if (wantsCollege) lines.push(`대입 전형에서는 과목 선택 자체보다 '왜 그 과목을 골랐고 무엇을 배웠는지'가 학생부에 드러나는 것이 중요해요. ${career || normal} 과목 수업 내용을 탐구활동과 연결해 보세요.`);
  else lines.push(`추천 조합은 일반선택 ${normal}${career ? `, 진로선택 ${career}` : ""}${fusion ? `, 융합선택 ${fusion}` : ""} 이에요. 궁금한 과목명을 짚어 다시 물어보면 더 자세히 설명해 드릴게요.`);
  if (!curriculumOk) lines.push("학교 교육과정 편제표에 해당 과목이 없을 수도 있으니, 담임·진로 선생님과 꼭 확인해 보세요.");
  lines.push("※ 이 답변은 참고용이며, 최종 과목 선택은 학교 상담을 통해 확정하세요.");
  return lines.join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/mybest/, "") || "/";
  try {
    if (req.method === "GET" && (path === "/" || path === "")) {
      return new Response(await setting("shell_xhtml"), { headers: { "Content-Type": "application/xhtml+xml; charset=utf-8", "Cache-Control": "no-cache" } });
    }
    if (req.method === "GET" && path === "/api/app") {
      return new Response(await setting("app_html"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" } });
    }
    if (path === "/api/tests") {
      const filtered = Object.fromEntries(Object.entries(TESTS).filter(([slug]) => !HIDDEN_TESTS.has(slug)));
      // 2026-07-23: entitlement v2 배선 — token 쿼리파라미터가 있을 때만 진단별 ent(잔여횟수) 배지 정보를 덧붙인다.
      // 기존 프런트는 token 없이 호출하므로(무배포 상태) 응답 형태·값 100% 동일(회귀 위험 0).
      const token = url.searchParams.get("token") ?? "";
      if (!token) return J({ tests: filtered });
      const st = await student(token);
      if (!st) return J({ tests: filtered });
      const cls0 = st.myb_classes ?? {};
      if (isIndividualClass(cls0)) return J({ tests: filtered });
      const { data: klass } = await sb.from("myb_classes").select("institution_id").eq("id", st.class_id).maybeSingle();
      const instId = (klass as { institution_id?: string | null } | null)?.institution_id ?? null;
      const withEnt: Record<string, unknown> = {};
      if (instId === null) {
        for (const [slug, def] of Object.entries(filtered)) withEnt[slug] = { ...def, ent: { allowed: true, remaining: null, until: null } };
      } else {
        // 기관 연결 학급만 진입(현재 0건) — slug별 조회를 병렬화해 응답 지연 최소화
        const entries = Object.entries(filtered);
        const results = await Promise.all(entries.map(([slug]) => checkTestEntitlement(st.id, slug)));
        entries.forEach(([slug, def], i) => {
          const te = results[i];
          withEnt[slug] = { ...def, ent: { allowed: te.allowed, remaining: te.attemptsRemaining, until: te.periodEnd } };
        });
      }
      return J({ tests: withEnt });
    }
    if (path === "/api/majors") {
      const { data, error } = await sb.from("myb_majors").select("id,series,name,explain,jobs,subj_normal,subj_career,subj_fusion").order("series").order("id");
      if (error) return err("조회 실패: " + error.message, 500);
      return new Response(JSON.stringify({ majors: data ?? [], series_labels: LABELS }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
    }
    if (path === "/api/questions") {
      const slug = url.searchParams.get("slug") ?? "";
      if (!TESTS[slug]) return err("unknown test");
      // 2026-07-23: entitlement v2 배선 — token 쿼리파라미터가 있을 때만 응시 가능 여부를 체크한다.
      // 기존 프런트는 token 없이 호출하므로(무배포 상태) 이 분기는 타지 않음(회귀 위험 0).
      const token = url.searchParams.get("token") ?? "";
      if (token) {
        const st = await student(token);
        if (st) {
          const cls0 = st.myb_classes ?? {};
          if (!isIndividualClass(cls0)) {
            const te = await checkTestEntitlement(st.id, slug);
            if (!te.allowed) return J({ ok: false, gate: gateOf(te) });
          }
        }
      }
      return J({ slug, scale: TESTS[slug].scale, questions: await getQuestions(slug) });
    }
    // [F-PATCH 2026-08-03 · R14] act_log / inquiry_note 는 GET 도 쓴다.
    // 이 게이트가 GET 을 먼저 404 로 막고 있어서 두 라우트가 조회되지 않았다.
    if (req.method !== "POST" && !path.startsWith("/api/me") && !path.startsWith("/api/attempt") && !path.startsWith("/api/act_log") && !path.startsWith("/api/inquiry_note") && !path.startsWith("/api/school_subjects")) return err("not found", 404);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // [FIX 2026-08-03 · K] 일괄등록 학생은 PIN 이 전원 "0000" 이라
    // 학급코드 + 이름만 알면 같은 반 누구로든 로그인할 수 있었다.
    // 로그인 자체는 막지 않고, 앱이 PIN 변경 화면을 먼저 띄우도록 플래그를 내려준다.
    // [N-03 2026-08-03] 학교 교육과정 편제표.
    // 고교학점제 과목 추천의 가장 흔한 실패는 "추천받은 과목이 우리 학교에 없다" 는 것이다.
    // 지금까지는 결과지에 "편제표를 확인하세요" 라고 글로만 안내했다.
    // 학교가 한 번 등록해두면 추천 결과에서 개설/미개설이 자동으로 갈린다.
    if (path === "/api/school_subjects") {
      const norm = (v: unknown) => String(v ?? "").replace(/[\s()（）]/g, "").toLowerCase();

      // GET — 학생/교사 누구나 조회 (자기 학교 것만)
      if (req.method === "GET") {
        const sk = norm(url.searchParams.get("school"));
        if (!sk) return err("학교명이 필요합니다");
        const { data, error } = await sb.from("mybx_school_subjects")
          .select("subject,category,grades,note,is_open,school_name")
          .eq("school_key", sk).order("category").order("subject");
        if (error) return err("조회 실패: " + error.message, 500);
        const rows = data ?? [];
        return J({
          school: rows.length ? rows[0].school_name : "",
          registered: rows.length,
          subjects: rows,
        });
      }

      if (req.method === "POST") {
        const me = await adminSession(body.admin_token);
        if (!me || !["super", "internal", "school", "teacher"].includes(me.role))
          return err("관리자 로그인이 필요합니다", 403, "ADMIN_REQUIRED");
        const schoolName = String(body.school ?? "").trim();
        if (!schoolName) return err("학교명을 입력하세요");
        const sk = norm(schoolName);

        // 전체 교체 모드 — 편제표는 해마다 통째로 바뀌므로 이 방식이 자연스럽다.
        const list = Array.isArray(body.subjects) ? body.subjects : [];
        if (list.length > 400) return err("한 번에 최대 400개까지 등록할 수 있습니다");
        const CATS = ["공통", "일반선택", "진로선택", "융합선택", "기타"];
        const seen = new Set<string>();
        const rows: Record<string, unknown>[] = [];
        for (const it of list) {
          const subject = String((it && (it as any).subject) ?? "").trim().slice(0, 60);
          if (!subject || seen.has(subject)) continue;
          seen.add(subject);
          const cat = String((it as any).category ?? "").trim();
          rows.push({
            school_key: sk, school_name: schoolName, subject,
            category: CATS.indexOf(cat) >= 0 ? cat : null,
            grades: String((it as any).grades ?? "").trim().slice(0, 20) || null,
            note: String((it as any).note ?? "").trim().slice(0, 120) || null,
            is_open: (it as any).is_open === false ? false : true,
            updated_by: me.username ?? null,
          });
        }
        await sb.from("mybx_school_subjects").delete().eq("school_key", sk);
        if (rows.length) {
          const { error } = await sb.from("mybx_school_subjects").insert(rows);
          if (error) return err("저장 실패: " + error.message, 500);
        }
        return J({ ok: true, school: schoolName, saved: rows.length, skipped: list.length - rows.length });
      }
      return err("지원하지 않는 방식입니다", 405);
    }

    if (path === "/api/student/pin") {
      const { token, old_pin, new_pin } = body;
      const st0 = await student(String(token ?? ""));
      if (!st0) return err("로그인이 필요합니다", 401);
      if (!/^[0-9]{4}$/.test(String(new_pin ?? ""))) return err("새 PIN 은 숫자 4자리여야 합니다");
      if (String(new_pin) === "0000") return err("0000 은 사용할 수 없습니다. 다른 번호를 정해 주세요");
      const okOld = (await hashPin(String(old_pin ?? ""))) === st0.pin;
      if (!okOld) return err("현재 PIN 이 일치하지 않습니다", 403);
      const { error } = await sb.from("myb_students").update({ pin: await hashPin(String(new_pin)) }).eq("id", st0.id);
      if (error) return err("변경 실패: " + error.message, 500);
      return J({ ok: true });
    }

    if (path === "/api/student/join") {
      const { class_code, name, pin, grade } = body;
      if (!class_code || !name || !pin) return err("학급코드, 이름, PIN을 모두 입력하세요");
      const { data: cls } = await sb.from("myb_classes").select("*").eq("code", String(class_code).toUpperCase()).maybeSingle();
      // [FIX 2026-08-23 · 회장님 신고] "학급코드를 찾을 수 없습니다"는 사실이지만 원인을 알려주지 않았다.
      // 코드 오타 학생 입장에서 로그인 실패 사유를 즉시 알 수 있도록 "코드가 틀렸다"는 것을 명시한다.
      if (!cls) return err("학급코드가 올바르지 않습니다. 코드를 다시 확인해 주세요");
      const gm0 = gateMsg(cls); if (gm0) return err(gm0, 403);
      const hp = await hashPin(String(pin));
      const { data: ex } = await sb.from("myb_students").select("*").eq("class_id", cls.id).eq("name", name).maybeSingle();
      if (ex) {
        // [FIX 2026-08-23] 이름은 있는데 PIN이 다른 경우 — "이름이 틀렸다"가 아니라 "PIN이 틀렸다"임을 명확히.
        if (ex.pin !== hp) return err("이름은 등록되어 있지만 PIN이 일치하지 않습니다. PIN을 다시 확인해 주세요", 403);
        // 기존 학생은 요청으로 들어온 grade를 절대 반영하지 않는다 — 최초 등록 학년(ex.grade)을 그대로 유지.
        return J({ token: ex.token, name: ex.name, grade: ex.grade, class_name: cls.name, school: cls.school,
          plan: cls.plan ?? "free", must_change_pin: hp === DEFAULT_PIN_HASH });
      }
      const gradeNorm = normalizeGrade(grade);
      if (!gradeNorm) return err("학년을 선택하세요 (예: 중1, 고1)");
      const { count } = await sb.from("myb_students").select("id", { count: "exact", head: true }).eq("class_id", cls.id);
      if ((count ?? 0) >= (cls.max_students ?? 40)) {
        // [FIX 2026-08-23 · 회장님 신고] 입력한 이름이 명단에 없어 "신규 학생"으로 처리되려다 정원에 걸린 경우,
        // 화면엔 "정원이 다 찼습니다"만 보여서 실제로는 이름을 잘못 입력한 학생도 정원 탓으로 오해했다.
        // 학급에 이미 등록된 학생이 있다면(=선생님이 명단을 등록해둔 학급) 이름 확인을 우선 안내하고,
        // 정원 사실 자체는 괄호로 남겨 정보 손실은 없게 한다. 학급이 아직 완전히 비어 있을 때만(정말 첫 학생부터
        // 정원 초과라는 극단적 설정) 기존처럼 정원 메시지를 그대로 보여준다.
        if ((count ?? 0) > 0) {
          return err("입력한 이름을 찾을 수 없습니다. 선생님이 등록한 이름과 정확히 같은지 다시 확인해 주세요. (신규 학생으로는 학급 정원이 가득 차 등록할 수 없습니다)", 403);
        }
        return err("학급 정원이 가득 찼습니다. 선생님께 문의하세요", 403);
      }
      const { data: st, error } = await sb.from("myb_students").insert({ class_id: cls.id, name, pin: hp, grade: gradeNorm }).select().single();
      if (error) return err("가입 실패: " + error.message);
      return J({ token: st.token, name: st.name, grade: st.grade, class_name: cls.name, school: cls.school, plan: cls.plan ?? "free", created: true });
    }

    // 개인(비학급) 진입 — 학급코드 없이 이름·PIN만으로 1인 전용 클래스를 자동 생성해 기존 학생 join 경로와 동일한 데이터 구조를 재사용.
    // FREE_SLUGS(무료 8종)만 이용 가능(plan:"free")하며, 기존 학급/학생 데이터·로직은 전혀 건드리지 않음(추가 전용, 회귀 위험 0).
    if (path === "/api/student/join_individual") {
      const { name, pin, grade } = body;
      if (!name || !pin) return err("이름과 PIN을 입력하세요");
      const gradeNormInd = normalizeGrade(grade);
      if (!gradeNormInd) return err("학년을 선택하세요 (예: 중1, 고1)");
      const hp = await hashPin(String(pin));
      let code = "";
      for (let i = 0; i < 5; i++) {
        const cand = "IND" + Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
        const { data: dup } = await sb.from("myb_classes").select("id").eq("code", cand).maybeSingle();
        if (!dup) { code = cand; break; }
      }
      if (!code) return err("일시적 오류입니다. 잠시 후 다시 시도해 주세요", 500);
      const { data: cls, error: clsErr } = await sb.from("myb_classes").insert({
        code, name: "[개인] " + String(name).slice(0, 20), school: "개인 이용자",
        teacher_pin: await hashPin(crypto.randomUUID()), max_students: 1, active: true,
        expires_at: "2099-12-31", plan: "free",
      }).select().single();
      if (clsErr) return err("가입 실패: " + clsErr.message);
      const { data: st2, error: stErr } = await sb.from("myb_students").insert({ class_id: cls.id, name, pin: hp, grade: gradeNormInd }).select().single();
      if (stErr) return err("가입 실패: " + stErr.message);
      return J({ token: st2.token, name: st2.name, grade: st2.grade, class_name: cls.name, school: cls.school, plan: cls.plan ?? "free", created: true, individual: true });
    }

    if (path === "/api/submit") {
      const { token, slug, answers } = body;
      const st = await student(String(token ?? ""));
      if (!st) return err("로그인이 필요합니다", 401);
      const cls0 = st.myb_classes ?? {};
      const gm = gateMsg(cls0); if (gm) return err(gm, 403, "gate");
      if (!TESTS[slug]) return err("unknown test");
      const isIndividual = isIndividualClass(cls0);
      if ((cls0.plan ?? "free") !== "paid" && !FREE_SLUGS.includes(slug)) {
        // 개인(비학급, code가 IND로 시작) 이용자에게는 "선생님께 요청" 문구가 맞지 않으므로 분기.
        return err(
          isIndividual
            ? "이 진단은 아직 개인 무료 이용에는 포함되지 않았어요. 학교·학급으로 도입하면 전체 진단을 이용할 수 있어요."
            : "이 진단은 유료 플랜에서 이용할 수 있어요. 선생님께 플랜 업그레이드를 요청해 주세요!",
          402,
          "upgrade",
        );
      }
      if (cls0.max_uses != null) {
        const { count: used } = await sb.from("myb_attempts").select("id", { count: "exact", head: true }).eq("student_id", st.id);
        if ((used ?? 0) >= cls0.max_uses) return err("이용 가능 횟수(" + cls0.max_uses + "회)를 모두 사용했습니다. 기존 결과는 계속 볼 수 있어요. 추가 이용은 선생님께 문의하세요", 403, "limit");
      }
      // 2026-07-23: entitlement v2 배선 — 학급 소속 학생만(개인/비학급 계정 제외) 기관 계층 entitlement를 추가로 체크.
      // institution_id NULL 학급(현재 9개 전부)은 checkTestEntitlement가 항상 legacy allow 반환 → 기존 플로우 무변화(회귀 위험 0).
      if (!isIndividual) {
        const te = await checkTestEntitlement(st.id, slug);
        if (!te.allowed) return J({ ok: false, gate: gateOf(te) });
      }
      const qs = await getQuestions(slug);
      if (!Array.isArray(answers) || (slug === "subject_rec" ? answers.length < 3 : answers.length !== qs.length)) return err(`답변 수가 올바르지 않습니다 (${answers?.length}/${qs.length})`);
      const buckets = qs.map((q) => q.bucket);
      const texts = qs.map((q) => q.q_text);
      let result: Record<string, unknown>;
      if (slug === "future") { result = scoreSeries(answers, buckets, 6, FUT_LABELS); result.kind = "future"; }
      else if (slug === "study") result = scoreGrades(answers);
      else if (slug === "subject_pick") {
        // scoreSeries 재사용(6영역). kind 만 "areas" 로 바꿔 리포트가 계열 경로와 구분하게 한다.
        const rr = scoreSeries(answers, buckets, 6, AREA_SP);
        rr.kind = "areas";
        result = rr;
      }
      else if (slug === "subject_rec") {
        const pick = Math.max(1, Math.min(7, answers[0] | 0));
        const majorId = answers[1] ? Math.max(0, answers[1] | 0) : 0;
        let major = null;
        if (majorId) {
          const { data: m } = await sb.from("myb_majors").select("id,series,name,explain,jobs,subj_normal,subj_career,subj_fusion").eq("id", majorId).maybeSingle();
          if (m && Number(m.series) === pick) major = m;
        }
        result = { kind: "pick", pick, labels: LABELS, major_id: major?.id ?? null, major, curriculum_check: answers[2] ? (answers[2] | 0) : 0 };
      }
      else if (["inquiry","ms_study","roadmap","ai_skill","es_habit","reading","track_fit","ms_hsfit","value_work","career_mature","study_emotion","multi_iq","study_manage","gifted_ready","mock_exam","admission_nav","story_writer","ai_inquiry"].includes(slug)) result = scoreBucketCheck(slug, answers, buckets, texts);
      else if (TESTS[slug].scale === "likert") result = scoreSeries(answers, buckets);
      else result = scoreChecklist(slug, answers, texts);
      const { data: at, error } = await sb.from("myb_attempts").insert({ student_id: st.id, test_slug: slug, answers, result }).select("id,created_at").single();
      if (error) return err("저장 실패: " + error.message);
      return J({ attempt_id: at.id, result });
    }

    if (path === "/api/chat") {
      const { token, question, attempt_id } = body;
      const q = String(question ?? "").trim();
      if (!q) return err("질문을 입력해 주세요");
      if (q.length > 400) return err("질문은 400자 이내로 입력해 주세요");
      const st = await student(String(token ?? ""));
      if (!st) return err("로그인이 필요합니다", 401);
      const { count: recent } = await sb.from("myb_chat_log").select("id", { count: "exact", head: true }).eq("student_id", st.id).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((recent ?? 0) >= 20) return err("질문이 너무 많아요. 잠시 후 다시 시도해 주세요", 429);
      let at: any = null;
      if (attempt_id) {
        const { data } = await sb.from("myb_attempts").select("*").eq("id", attempt_id).eq("student_id", st.id).eq("test_slug", "subject_rec").maybeSingle();
        at = data;
      } else {
        const { data } = await sb.from("myb_attempts").select("*").eq("student_id", st.id).eq("test_slug", "subject_rec").order("created_at", { ascending: false }).limit(1).maybeSingle();
        at = data;
      }
      if (!at) return err("먼저 고교학점제 과목추천 진단을 완료해 주세요", 400);
      const r = at.result as Record<string, unknown>;
      const pk = LABELS[((r.pick as number) || 1) - 1];
      const major = r.major as any;
      const system = `너는 한국 고등학생 진로진학을 도와주는 다정하고 신뢰가는 상담 선생님이야. 학생의 계열(${pk}) 및 학과(${major?.name ?? "미선택"}) 진단 결과를 참고해서, 단순 과목명 나열이 아니라 학생의 관심사·역량과 연결한 맞춤 설명을 6문장 이내 한국어로 답해. 대입 합격을 보장하는 표현은 쓰지 말고, 확정 어려운 사안은 학교·교사 상담을 권해.`;
      const userMsg = `[진단 결과] 추천 계열: ${pk}\n학과: ${major?.name ?? "미선택"}\n설명: ${major?.explain ?? ""}\n일반선택: ${major?.subj_normal ?? ""}\n진로선택: ${major?.subj_career ?? ""}\n융합선택: ${major?.subj_fusion ?? ""}\n관련 진로: ${major?.jobs ?? ""}\n\n[학생 질문]\n${q}`;
      let answer = await llmAnswer(system, userMsg);
      let source = "anthropic";
      if (!answer) { answer = fallbackSubjectAnswer(q, pk, major, (r.curriculum_check as number) || 0); source = "fallback"; }
      await sb.from("myb_chat_log").insert({ student_id: st.id, attempt_id: at.id, question: q, answer, source });
      return J({ answer, source });
    }

    // [F-PATCH 2026-08-03 · R9] 활동 체크·완료 기록
    // 활동카드 300장이 "보여주고 끝"이 되지 않도록, 학생이 상태를 남길 수 있게 한다.
    // 기존 라우트·테이블은 건드리지 않는다. mybx_act_log 만 읽고 쓴다.
    // [F-PATCH 2026-08-03 · R12] 탐구 기록장 (N-02)
    // 진단이 아니라 학생이 자기 활동을 서술하는 도구다. 새 슬러그를 만들지 않고
    // 대시보드 도구로 둔다. 활동카드에서 승격해 들어올 수도 있다(act_key/act_gu).
    if (path === "/api/inquiry_note") {
      const FIELDS = ["title","field","q_question","q_motive","p_method","p_data",
                      "r_result","r_diff","l_learned","l_next"];
      if (req.method === "GET") {
        const st = await student(url.searchParams.get("token") ?? "");
        if (!st) return err("로그인이 필요합니다", 401);
        const one = url.searchParams.get("id");
        let q = sb.from("mybx_inquiry_note").select("*").eq("student_id", st.id);
        if (one) q = q.eq("id", Number(one) | 0);
        const { data, error } = await q.order("updated_at", { ascending: false }).limit(60);
        if (error) return err("조회 실패: " + error.message, 500);
        const notes = data ?? [];
        return J({ notes, summary: { total: notes.length, done: notes.filter((n: any) => n.status === "done").length } });
      }
      if (req.method === "POST") {
        // [FIX 2026-08-25 · 회장님 신고 4] 요청 본문은 라우팅 직전(위쪽 `const body = ...`)에서
        // 이미 한 번 읽혔다. Request 의 body 스트림은 한 번만 읽을 수 있어 여기서 req.json() 을
        // 다시 부르면 항상 예외 → catch 로 {} 가 되고, b.token 이 비어 student("") 가 null 이라
        // 로그인 상태인데도 401 "로그인이 필요합니다" 가 떴다(= 탐구기록·활동기록이 저장 불가).
        // 이미 파싱해 둔 body 를 그대로 쓴다.
        const b = body as Record<string, unknown>;
        const st = await student(String(b.token ?? ""));
        if (!st) return err("로그인이 필요합니다", 401);
        const row: Record<string, unknown> = { student_id: st.id };
        for (const f of FIELDS) {
          if (b[f] != null) row[f] = String(b[f]).slice(0, f === "title" ? 80 : 1200);
        }
        const stt = String(b.status ?? "draft");
        if (["draft","done"].indexOf(stt) < 0) return err("status 값이 올바르지 않습니다");
        row.status = stt;
        if (b.act_key != null) {
          const k = String(b.act_key).trim().slice(0, 40);
          if (!/^[A-Za-z0-9_]{2,40}$/.test(k)) return err("act_key 값이 올바르지 않습니다");
          row.act_key = k;
          const g = Number(b.act_gu) | 0;
          if ([2330, 2332, 2334].indexOf(g) < 0) return err("act_gu 값이 올바르지 않습니다");
          row.act_gu = g;
        }
        if (b.id) {
          const id = Number(b.id) | 0;
          const { data, error } = await sb.from("mybx_inquiry_note").update(row)
            .eq("id", id).eq("student_id", st.id).select("*").maybeSingle();
          if (error) return err("저장 실패: " + error.message, 500);
          if (!data) return err("기록을 찾을 수 없습니다", 404);
          return J({ ok: true, note: data });
        }
        if (!row.title) row.title = "제목 없는 탐구 기록";
        const { data, error } = await sb.from("mybx_inquiry_note").insert(row).select("*").single();
        if (error) return err("저장 실패: " + error.message, 500);
        return J({ ok: true, note: data });
      }
      return err("지원하지 않는 방식입니다", 405);
    }

    if (path === "/api/act_log") {
      const ACT_GU = [2330, 2332, 2334];
      if (req.method === "GET") {
        const st = await student(url.searchParams.get("token") ?? "");
        if (!st) return err("로그인이 필요합니다", 401);
        let q = sb.from("mybx_act_log")
          .select("id,gu_no,card_key,quarter,status,started_at,done_at,memo,updated_at")
          .eq("student_id", st.id);
        const qp = url.searchParams.get("quarter");
        if (qp) q = q.eq("quarter", Math.max(1, Math.min(6, Number(qp) | 0)));
        const { data, error } = await q.order("updated_at", { ascending: false }).limit(300);
        if (error) return err("조회 실패: " + error.message, 500);
        const logs = data ?? [];
        const done = logs.filter((x: any) => x.status === "done").length;
        const qNow = actQuarterNow();
        const rec = await actCardsFor(st, qNow);
        return J({ logs, summary: { total: logs.length, done },
          quarter: qNow, quarter_name: ACT_QNM[qNow - 1], recommend: rec });
      }
      if (req.method === "POST") {
        // [FIX 2026-08-25 · 회장님 신고 4] 요청 본문은 라우팅 직전(위쪽 `const body = ...`)에서
        // 이미 한 번 읽혔다. Request 의 body 스트림은 한 번만 읽을 수 있어 여기서 req.json() 을
        // 다시 부르면 항상 예외 → catch 로 {} 가 되고, b.token 이 비어 student("") 가 null 이라
        // 로그인 상태인데도 401 "로그인이 필요합니다" 가 떴다(= 탐구기록·활동기록이 저장 불가).
        // 이미 파싱해 둔 body 를 그대로 쓴다.
        const b = body as Record<string, unknown>;
        const st = await student(String(b.token ?? ""));
        if (!st) return err("로그인이 필요합니다", 401);
        const gu = Number(b.gu_no) | 0;
        const key = String(b.card_key ?? "").trim().slice(0, 40);
        const qt = Math.max(1, Math.min(6, Number(b.quarter) | 0));
        const stt = String(b.status ?? "planned");
        if (ACT_GU.indexOf(gu) < 0) return err("gu_no 값이 올바르지 않습니다");
        if (!/^[A-Za-z0-9_]{2,40}$/.test(key)) return err("card_key 값이 올바르지 않습니다");
        if (["planned", "doing", "done"].indexOf(stt) < 0) return err("status 값이 올바르지 않습니다");
        const now = new Date().toISOString();
        const row: Record<string, unknown> = {
          student_id: st.id, gu_no: gu, card_key: key, quarter: qt, status: stt,
          memo: b.memo == null ? null : String(b.memo).slice(0, 300),
        };
        if (stt === "doing" || stt === "done") row.started_at = now;
        row.done_at = (stt === "done") ? now : null;
        const { data, error } = await sb.from("mybx_act_log")
          .upsert(row, { onConflict: "student_id,gu_no,card_key" })
          .select("id,gu_no,card_key,quarter,status,done_at").single();
        if (error) return err("저장 실패: " + error.message, 500);
        return J({ ok: true, log: data });
      }
      return err("지원하지 않는 방식입니다", 405);
    }

    if (path === "/api/me") {
      const st = await student(url.searchParams.get("token") ?? "");
      if (!st) return err("로그인이 필요합니다", 401);
      const { data: ats } = await sb.from("myb_attempts").select("id,test_slug,result,created_at").eq("student_id", st.id).order("created_at", { ascending: false }).limit(100);
      const cls = st.myb_classes ?? {};
      const { data: asg } = await sb.from("myb_assignments").select("id,test_slug,title,due_date,created_at").eq("class_id", st.class_id).eq("active", true).order("created_at", { ascending: false });
      const assignments = (asg ?? []).map((a) => ({ id: a.id, test_slug: a.test_slug, test_title: TESTS[a.test_slug]?.title ?? a.test_slug, title: a.title, due_date: a.due_date, done: (ats ?? []).some((x) => x.test_slug === a.test_slug && x.created_at >= a.created_at) }));
      // [FIX 2026-08-25 · 회장님 신고 1~3] 학교급(초/중/고)을 프런트가 판정할 근거를 함께 내려준다.
      // 지금까지 프런트는 학생의 grade 문자열에서 초/중/고 글자만 찾아 학교급을 정했는데,
      // 일괄등록 학생은 grade 가 비어 있는 경우가 대부분(현재 282명)이라 판정이 실패했고,
      // 그때 "대상 학교급 없음"으로 처리돼 초·중·고 세 묶음이 전부 활성화됐다.
      // 학급의 school_level("초등"/"중등"/"고등")과 학교명("○○초등학교")을 근거로 추가한다.
      return J({ name: st.name, grade: st.grade, class_name: cls.name, school: cls.school, school_level: cls.school_level ?? null, plan: cls.plan ?? "free", expires_at: cls.expires_at ?? null, max_uses: cls.max_uses ?? null, used: (ats ?? []).length, gate: gateMsg(cls), assignments, attempts: ats ?? [] });
    }

    if (path === "/api/attempt") {
      const st = await student(url.searchParams.get("token") ?? "");
      if (!st) return err("로그인이 필요합니다", 401);
      const id = url.searchParams.get("id");
      const { data: at } = await sb.from("myb_attempts").select("*").eq("id", id).eq("student_id", st.id).maybeSingle();
      if (!at) return err("기록을 찾을 수 없습니다", 404);
      let blocks: unknown[] = [];
      const r = at.result as Record<string, unknown>;
      if (at.test_slug === "interview") {
        const keys = ((r.weak as number[]) ?? []).map((i) => "item" + (i + 1));
        blocks = [...await blocksBy(2307, "trend"), ...await blocksBy(2307, "interview_fix", keys)];
      } else if (at.test_slug === "hs_essay") {
        blocks = await blocksBy(2331, "hs_essay", ["type" + Math.max(1, Math.min(4, (r.type as number) || 1)), "write1", "write2", "write3", "write4"]);
      } else if (at.test_slug === "study") {
        const grades = (r.grades as number[]) ?? [];
        const keys = grades.map((g, i) => SUBJ[i] + "/" + gradeBand(g));
        blocks = [...await blocksBy(2303, "study_method", keys), ...await blocksBy(2303, "edu_trend")];
      } else if (at.test_slug === "inquiry") {
        blocks = await blocksBy(2306, "step_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "step" + (b + 1)));
      } else if (at.test_slug === "ms_study") {
        blocks = await blocksBy(2312, "habit_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "habit" + (b + 1)));
      } else if (at.test_slug === "roadmap") {
        blocks = await blocksBy(2305, "roadmap_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "area" + (b + 1)));
      } else if (at.test_slug === "ai_skill") {
        blocks = await blocksBy(2400, "ai_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "area" + (b + 1)));
      } else if (at.test_slug === "es_habit") {
        blocks = await blocksBy(2501, "es_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "area" + (b + 1)));
      } else if (at.test_slug === "reading") {
        blocks = await blocksBy(2509, "read_guide", ((r.weakBuckets as number[]) ?? []).map((b) => "area" + (b + 1)));
      } else if (at.test_slug === "subject_rec") {
        blocks = await blocksBy(2302, "subject_rec", [REC_KEYS[((r.pick as number) || 1) - 1]]);
      } else if (at.test_slug === "track_fit" || at.test_slug === "ms_hsfit" || at.test_slug === "value_work" || at.test_slug === "career_mature" || at.test_slug === "study_emotion" || at.test_slug === "multi_iq" || at.test_slug === "study_manage" || at.test_slug === "gifted_ready" || at.test_slug === "mock_exam" || at.test_slug === "admission_nav" || at.test_slug === "story_writer" || at.test_slug === "ai_inquiry") {
        blocks = await blocksBy(0, "insight", [at.test_slug]);
      } else if (at.test_slug === "future") {
        const keys = [FUT_KEYS[r.best as number], FUT_KEYS[r.worst as number], FUT_KEYS[r.worst2 as number]].filter(Boolean);
        blocks = await blocksBy(2314, "future_guide", keys);
      }
      return J({ attempt: at, student: { name: st.name, grade: st.grade, school: st.myb_classes?.school, class_name: st.myb_classes?.name }, blocks });
    }

    if (path === "/api/teacher/class") {
      const me = await adminSession(body.admin_token);
      // [FIX 2026-08-23 · 회장님 신고] teacher(담임/학급관리자) 역할은 "새 학급 발급" 버튼이 화면엔
      // 보이는데 여기서 항상 막혀 있었다. teacher 도 자기 학급을 스스로 발급할 수 있게 허용한다.
      // (school/super 가 발급한 학급은 특정 담임에게 자동으로 연결되지 않는다 — 그건 별개 문제이며
      // myb-admin 관리자 콘솔의 "학급 관리 → 담당교사 지정"에서 명시적으로 배정한다.)
      if (!me || !["super", "internal", "school", "teacher"].includes(me.role)) return err("관리자 로그인이 필요합니다", 403, "ADMIN_REQUIRED");
      const { name, teacher_pin, max_students, months, max_uses, starts_at } = body;
      // [FIX 2026-08-03 · A2/A3] region·school_level 이 저장되지 않아 학급 16개 전부 region=NULL 이었고,
      // 화면의 지역 필터 3곳이 영구히 "미지정"만 표시하고 있었다.
      // 만료일도 body.expires_at 을 읽지 않아 달력에서 무엇을 고르든 오늘+12개월로 덮어썼다.
      // [FIX 2026-08-25 · 회장님 신고] school 역할 관리자가 화면의 "학교·기관명"란에 직접 입력해도
      // scope가 지정돼 있으면 무조건 me.scope 값으로 덮어써서, 입력한 학교명이 저장되지 않고
      // 교사 화면(학급 관리 목록)에 다른/빈 학교명으로 보이던 버그. 화면 입력값을 우선하고,
      // 아무것도 입력하지 않았을 때만 기존처럼 scope를 기본값으로 쓴다.
      const typedSchool = typeof body.school === "string" ? body.school.trim() : "";
      const school = typedSchool || (me.role === "school" ? (me.scope || "") : "");
      if (!name || !teacher_pin) return err("학급명과 교사 PIN을 입력하세요");
      if (!/^[0-9]{4,8}$/.test(String(teacher_pin))) return err("교사 PIN은 숫자 4~8자리여야 합니다");
      const code = Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
      const exp = new Date(); exp.setMonth(exp.getMonth() + (Math.min(24, Math.max(1, (months | 0) || 12))));
      // 화면에서 고른 만료일이 있으면 그것을 쓴다. 형식이 어긋나면 기존 계산값으로 되돌린다.
      const expPicked = /^\d{4}-\d{2}-\d{2}$/.test(String(body.expires_at ?? "")) ? String(body.expires_at) : "";
      const ins: Record<string, unknown> = { code, name, school: school ?? "", teacher_pin: await hashPin(String(teacher_pin)), max_students: Math.min(200, Math.max(5, (max_students | 0) || 40)), expires_at: expPicked || exp.toISOString().slice(0, 10) };
      if (body.region) ins.region = String(body.region).trim().slice(0, 40);
      if (body.school_level) ins.school_level = String(body.school_level).trim().slice(0, 20);
      if (max_uses !== undefined && max_uses !== null && max_uses !== "") ins.max_uses = Math.max(1, max_uses | 0);
      if (starts_at) ins.starts_at = starts_at;
      const { data, error } = await sb.from("myb_classes").insert(ins).select().single();
      if (error) return err("생성 실패: " + error.message);
      // [FIX 2026-08-23 · 회장님 신고] teacher 본인이 발급한 학급은 자기 자신의 myb_admins.scope(학급 id 배열)에
      // 즉시 추가한다 — 그래야 myb-admin 콘솔의 "학생 일괄 등록" 대상학급 목록에 방금 만든 학급이 바로 보인다.
      // 지금까지는 아무도 이 배열을 채워주지 않아, teacher 가 직접 만든 학급조차 자기 화면에 나타나지 않았다.
      // 실패해도 학급 발급 자체(이미 성공)는 막지 않는다 — scope 갱신은 부가 동작.
      if (me.role === "teacher") {
        try {
          const { data: row } = await sb.from("myb_admins").select("id,scope").eq("username", me.username).maybeSingle();
          if (row) {
            // myb-admin/index.ts의 parseScopeIds()와 동일한 파싱 규칙(인라인 복사, 프로젝트 컨벤션):
            // JSON 배열이면 그대로, 아니면 레거시 콤마목록/단일 학급코드(UUID 1개)로 취급 — 어느 쪽이든
            // 기존 값을 잃지 않고 그대로 보존한 뒤 새 학급 id만 추가한다.
            let ids: string[] = [];
            const raw = row.scope;
            if (raw) {
              try {
                const parsed = JSON.parse(String(raw));
                ids = Array.isArray(parsed) ? parsed.map((x: unknown) => String(x)) : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
              } catch {
                ids = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
              }
            }
            if (!ids.includes(String(data.id))) ids.push(String(data.id));
            await sb.from("myb_admins").update({ scope: JSON.stringify(ids) }).eq("id", row.id);
          }
        } catch (_e) { /* 무시 — 발급 자체는 이미 성공 */ }
      }
      return J({ code: data.code, name: data.name, max_students: data.max_students, expires_at: data.expires_at, starts_at: data.starts_at, max_uses: data.max_uses, active: data.active, plan: data.plan ?? "free" });
    }

    if (path === "/api/teacher/update") {
      const { code, teacher_pin, expires_at, add_months, max_uses, max_students, active, starts_at } = body;
      const cls = await verifyTeacher(code, teacher_pin);
      if (!cls) return err("학급코드 또는 PIN이 올바르지 않습니다", 403);
      const upd: Record<string, unknown> = {};
      if (expires_at !== undefined) upd.expires_at = expires_at || null;
      if (add_months) { const base = cls.expires_at ? new Date(cls.expires_at) : new Date(); base.setMonth(base.getMonth() + (add_months | 0)); upd.expires_at = base.toISOString().slice(0, 10); }
      if (max_uses !== undefined) upd.max_uses = (max_uses === null || max_uses === "") ? null : Math.max(1, max_uses | 0);
      if (max_students !== undefined) upd.max_students = Math.min(200, Math.max(5, (max_students | 0) || 40));
      if (active !== undefined) upd.active = !!active;
      if (starts_at !== undefined) upd.starts_at = starts_at || null;
      const { error } = await sb.from("myb_classes").update(upd).eq("id", cls.id);
      if (error) return err("수정 실패: " + error.message);
      return J({ ok: true, class: { code: cls.code, name: cls.name, expires_at: upd.expires_at ?? cls.expires_at, max_uses: upd.max_uses !== undefined ? upd.max_uses : cls.max_uses, max_students: upd.max_students ?? cls.max_students, active: upd.active !== undefined ? upd.active : cls.active, starts_at: upd.starts_at !== undefined ? upd.starts_at : cls.starts_at } });
    }

    if (path === "/api/teacher/assign") {
      const { code, teacher_pin, test_slug, due_date, title } = body;
      const cls = await verifyTeacher(code, teacher_pin);
      if (!cls) return err("학급코드 또는 PIN이 올바르지 않습니다", 403);
      if (!TESTS[test_slug]) return err("unknown test");
      const { data, error } = await sb.from("myb_assignments").insert({ class_id: cls.id, test_slug, due_date: due_date || null, title: title || null }).select().single();
      if (error) return err("배정 실패: " + error.message);
      return J({ ok: true, assignment: { id: data.id, test_slug, test_title: TESTS[test_slug].title, due_date: data.due_date } });
    }

    if (path === "/api/teacher/assign_delete") {
      const { code, teacher_pin, id } = body;
      const cls = await verifyTeacher(code, teacher_pin);
      if (!cls) return err("학급코드 또는 PIN이 올바르지 않습니다", 403);
      const { error } = await sb.from("myb_assignments").update({ active: false }).eq("id", id).eq("class_id", cls.id);
      if (error) return err("삭제 실패: " + error.message);
      return J({ ok: true });
    }

    if (path === "/api/teacher/assignments") {
      const { code, teacher_pin } = body;
      const cls = await verifyTeacher(code, teacher_pin);
      if (!cls) return err("학급코드 또는 PIN이 올바르지 않습니다", 403);
      const { data: asg } = await sb.from("myb_assignments").select("*").eq("class_id", cls.id).eq("active", true).order("created_at", { ascending: false });
      const { data: sts } = await sb.from("myb_students").select("id,name").eq("class_id", cls.id);
      const sids = (sts ?? []).map((s) => s.id);
      let ats: any[] = [];
      if (sids.length) { const { data } = await sb.from("myb_attempts").select("student_id,test_slug,created_at").in("student_id", sids); ats = data ?? []; }
      const total = (sts ?? []).length;
      const list = (asg ?? []).map((a) => {
        const doneIds = new Set(ats.filter((x) => x.test_slug === a.test_slug && x.created_at >= a.created_at).map((x) => x.student_id));
        const notDone = (sts ?? []).filter((s) => !doneIds.has(s.id)).map((s) => s.name);
        return { id: a.id, test_slug: a.test_slug, test_title: TESTS[a.test_slug]?.title ?? a.test_slug, title: a.title, due_date: a.due_date, created_at: a.created_at, done: doneIds.size, total, not_done: notDone };
      });
      return J({ assignments: list });
    }

    if (path === "/api/teacher/overview") {
      const { code, teacher_pin } = body;
      const cls = await verifyTeacher(code, teacher_pin);
      if (!cls) return err("학급코드 또는 PIN이 올바르지 않습니다", 403);
      const { data: sts } = await sb.from("myb_students").select("id,name,grade,created_at").eq("class_id", cls.id).order("name");
      const ids = (sts ?? []).map((s) => s.id);
      let ats: Record<string, unknown>[] = [];
      if (ids.length) {
        const { data } = await sb.from("myb_attempts").select("id,student_id,test_slug,result,created_at").in("student_id", ids).order("created_at", { ascending: false });
        ats = data ?? [];
      }
      return J({ class: { code: cls.code, name: cls.name, school: cls.school, max_students: cls.max_students, expires_at: cls.expires_at, starts_at: cls.starts_at, max_uses: cls.max_uses, active: cls.active, plan: cls.plan ?? "free", gate: gateMsg(cls) }, students: sts ?? [], attempts: ats });
    }

    // 2026-07-23: 90.compliance-module 표준 — 만 14세 미만 법정대리인 동의 로그 저장.
    // 기존 라우트 무변경(추가 전용). anon은 이 API를 통해서만 myb_consents에 쓸 수 있음(RLS로 직접 접근 차단).
    if (path === "/api/consent") {
      const { student_ref, guardian_email, consented } = body;
      const isValidEmail = (v: unknown): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (!isValidEmail(guardian_email)) return err("보호자 이메일이 올바르지 않습니다");
      if (consented !== true) return err("동의(consented=true) 값이 필요합니다");
      const ref = student_ref != null ? String(student_ref).slice(0, 200) : null;
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const { data, error } = await sb.from("myb_consents").insert({
        service: "mybest", student_ref: ref, guardian_email, consented: true,
        ip, user_agent: req.headers.get("user-agent") ?? null,
      }).select("id,consented_at").single();
      if (error) return err("동의 저장 실패: " + error.message, 500);
      return J({ ok: true, id: data.id, consented_at: data.consented_at });
    }

    if (path === "/api/admin/blocks") {
      const pin = await setting("admin_pin");
      if (String(body.pin) !== pin) return err("관리자 PIN이 올바르지 않습니다", 403);
      const { data } = await sb.from("myb_blocks").select("*").order("gu_no").order("sort_no");
      return J({ blocks: data ?? [] });
    }
    if (path === "/api/admin/block_update") {
      const pin = await setting("admin_pin");
      if (String(body.pin) !== pin) return err("관리자 PIN이 올바르지 않습니다", 403);
      const { id, title, body: b, tips } = body;
      const upd: Record<string, unknown> = { title, body: b };
      if (tips !== undefined && tips !== null) upd.tips = tips;
      const { error } = await sb.from("myb_blocks").update(upd).eq("id", id);
      if (error) return err(error.message);
      return J({ ok: true });
    }

    return err("not found", 404);
  } catch (e) {
    return err("server error: " + (e as Error).message, 500);
  }
});
