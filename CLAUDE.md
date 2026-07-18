# 마이베스트 NEXT (mybest-next-site)

## 프로젝트 실체 (주의)

- 저장소 이름과 달리 **Next.js 아님**. 빌드 툴체인 없는 **바닐라 JS 정적 HTML 사이트** (package.json 없음).
- 각 화면 = 독립 `.html` 파일 + 인라인 `<script>`. 배포는 **Netlify** (`netlify.toml`), **git push 즉시 프로덕션 배포**됨.
- 백엔드 = **Supabase Edge Functions** (project ref `onqisdgxwuvlxehjvoto`): `myb-admin`(관리자), `mybest`(학생 앱), `mybpay`(결제), `myb-report`(보고서) 등.

## 주요 파일

- `admin.html` — 관리자 SPA (로그인/학생 목록/수정/삭제/상담자료/학급 리포트/CSV). `#app` innerHTML 교체 방식.
- `index.html` — 학생/학부모 메인. `report.html` — A4/B4 보고서 뷰어. `d/*.html` — 진단 콘텐츠 27종.
- `supabase/functions/myb-admin/index.ts` — 관리자 Edge Function 소스 (repo가 단일 진실 원천).

## 백엔드 작업 규칙

- Edge Function 수정 후 배포: `npx supabase functions deploy myb-admin --project-ref onqisdgxwuvlxehjvoto --no-verify-jwt`
  - **`--no-verify-jwt` 필수** — 프런트가 publishable apikey만 보냄. 누락 시 전 엔드포인트 401.
- 테이블: `myb_students(id,name,grade,class_id,pin,token)`, `myb_classes(id,code,name,school,plan,max_students)`, `myb_attempts(student_id,test_slug,result)`, `myb_admins`, `myb_admin_sessions`.
- 관리자 role: `super`(전체) / `school`(학교 스코프) / `teacher`(학급 스코프). 권한은 서버 `scoped()` 헬퍼로 강제 — 프런트에 권한 게이트 두지 말 것.
- CORS 허용 origin: Netlify 도메인 + `localhost:8888/3000`. 로컬 테스트는 3000 또는 8888 포트만.

## 반드시 사용할 스킬

| 작업 | 스킬 |
|---|---|
| 디자인/UI 작업 | `frontend-design` (기존 다크 카드 admin 스타일과 일관성 유지) |
| 코드 변경 검증 | `verify` (실제 플로우 구동 — 로컬 서버 + 브라우저) |
| 커밋 전 리뷰 | `review-changes` |
| 인증/PIN/관리자 등 보안 민감 변경 | `security-review` |
| Supabase Edge Function/DB 작업 | `supabase`, `supabase-postgres-best-practices` |
| 브라우저 E2E 확인 | `playwright-skill` 또는 `claude-in-chrome` |

## 로컬 실행

```bash
python3 -m http.server 3000   # http://localhost:3000/admin.html (CORS 허용 포트)
```

API는 절대 URL이라 로컬에서도 원격 Edge Function 호출됨 — **로컬 테스트도 프로덕션 DB를 만짐**. 수정/삭제 테스트는 반드시 테스트 학급/학생으로만.
