<p align="center">
  <img src="assets/omk-hero-banner.png" alt="Oh My Kamisama — One command. Many agents." />
</p>

<h1 align="center">oh-my-kamisama</h1>

<p align="center">
  <b>명령 하나. 에이전트 여럿. 수상할 만큼의 자신감.</b><br/>
  <sub>익스트림 바이브 코딩용 로컬 멀티-CLI 컨덕터.</sub>
</p>

<p align="center">
  <a href="#설치"><img alt="npm" src="https://img.shields.io/badge/npm-oh--my--kamisama-cf68ff?style=flat-square&logo=npm"/></a>
  <a href="#요구-사항"><img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-3c873a?style=flat-square&logo=node.js&logoColor=white"/></a>
  <img alt="platform" src="https://img.shields.io/badge/macOS%20%7C%20Linux%20%7C%20WSL-444?style=flat-square"/>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/>
  <img alt="status" src="https://img.shields.io/badge/status-vibe%20coding%20grade-cf68ff?style=flat-square"/>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>한국어</b>
</p>

<p align="center">
  <code>omk</code>는 네이티브 <code>claude</code> 세션을 <b>컨덕터</b>로 만듭니다. 작업을 계획하고,
  각 조각을 <code>codex</code> / <code>claude</code> / <code>gemini</code>에 위임하고,<br/>
  워커가 만든 <b>실제 git diff</b>를 읽고, 테스트를 돌린 뒤에야 완료를 선언합니다 —
  매 턴을 <b>디스크에 아티팩트</b>로 남기면서.
</p>

```bash
omk "관리자 액션에 감사 로그 추가하고 검증해줘"
```

> *Oh my god? No. Oh my Kamisama.*

<p align="center">
  <img src="assets/omk-shell.png" alt="omk 인터랙티브 셸 — 컨덕터가 계획하고 codex에 위임하며 라이브 워커 보드를 스트리밍하고 테스트로 검증" width="680" />
</p>

---

## 목차

- [왜 만들었나](#왜-만들었나)
- [컨덕터는 어떻게 동작하나](#컨덕터는-어떻게-동작하나)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [인터랙티브 셸](#인터랙티브-셸)
- [모드](#모드)
- [디스크의 아티팩트](#디스크의-아티팩트)
- [명령어 레퍼런스](#명령어-레퍼런스)
- [설정](#설정)
- [예시](#예시)
- [콕핏 모드](#콕핏-모드-cmux)
- [어디에 들어맞나](#어디에-들어맞나-omo--omx--cmux)
- [설계 원칙](#설계-원칙)
- [테스트](#테스트)
- [로드맵](#로드맵)
- [머치](#머치)
- [라이선스](#라이선스)

---

## 왜 만들었나

대부분의 AI 코딩 도구는 **하나의 런타임**에 최적화돼 있습니다.

| 도구 | 잘하는 것 | 못 하는 것 |
|---|---|---|
| Codex 레이어 | Codex 워크플로·훅·스킬·팀 | 프로바이더 교차 의견 |
| Claude Code 레이어 | Claude 세션·계획·권한 | 멀티 실행자 핸드오프 |
| Gemini CLI | 독립적인 세 번째 시선 | 장시간 오케스트레이션 |
| opencode / OMO | 터미널 네이티브 모델 레인 | 포그라운드/백그라운드 패킷 라우팅 |
| OMX | 지속 목표·팀·HUD | 독립 어드바이저 스웜 |

`omk`는 지루하지만 쓸모 있는 길을 갑니다 — **네이티브 도구는 그대로 두고, 명령 하나로 협업시키기.**

토큰 절약 도구가 *아닙니다*. 작업이 모호하거나 위험하거나, 한 모델의 첫 답으로는 부족할 만큼 클 때 **에이전트의 주의를 더 쏟는** 것이 핵심입니다 — 그리고 그 작업을 사라지는 채팅 안에 숨기지 않고 **보이고 감사 가능하게** 만드는 것.

`oh-my-kamisama`는 **이미 쓰는 AI 코딩 CLI들 위의 명령 레이어**입니다. Claude Code, Codex CLI, Gemini CLI, opencode, OMX, OMO, cmux를 대체하지 않습니다. 협업시킬 뿐입니다.

<p align="center">
  <img src="assets/omk-kamisama.png" alt="Oh My Kamisama" width="320" />
</p>

---

## 컨덕터는 어떻게 동작하나

대표 모드(`omk conduct`, 그리고 셸에서 평문 작업의 기본값)는 네이티브 `claude` 세션을 **컨덕터**로 만듭니다. 직접 파일을 고치지 않고 — 계획하고, 워커 CLI에 위임하고, 실제로 무엇이 바뀌었는지 읽고, 다음 단계를 정합니다. 매 턴 엄격한 JSON 엔벌로프를 돌려주고, `omk`는 그걸 라이브 화면으로 그립니다.

```text
당신: omk "관리자 액션에 감사 로그 추가하고 검증해줘"

  ┌─ 컨덕터 (claude 세션) ──────────────────────────────────────────┐
  │  • 매 턴 갱신되는 라이브 ☐ / ◐ / ☑ 플랜을 유지              │
  │  • 각 단계를 알맞은 워커에 위임:                              │
  │       codex   → 구현            (workspace-write)              │
  │       claude  → 추론 / 리뷰     (acceptEdits)                 │
  │       gemini  → 잡일 / 웹 검색                                 │
  │  • ◀── 워커가 만든 실제 `git diff`를 받아 봄                  │
  │  • "done" 전에 프로젝트 테스트/빌드를 실제로 돌림            │
  └──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   .omk/runs/<run>/  →  plan.json · turn-N.json · turn-N.diff
                        session.json · verify-N.txt · <agent>.N.out
```

블랙박스가 아니라 Claude Code처럼 느껴지게 하는 것들:

- **라이브 플랜 체크리스트.** 컨덕터가 `☐ / ◐ / ☑` 플랜을 유지하며 매 턴 다시 내보내, 지금 어디인지 항상 보입니다.
- **스트리밍 워커.** 각 위임이 경과 시간·스트림 바이트·현재 활동(편집 중인 파일, 방금 실행한 명령)을 보여주는 애니메이션 상태 줄로 표시됩니다 — 멈춘 대기가 아닙니다.
- **실제 diff 인식.** 라운드마다 컨덕터는 워커의 말이 아니라 *실제* `git diff`를 받습니다. 빈/잘못된 diff는 잡혀서 다시 위임됩니다.
- **검증 게이트.** 변경된 리포에서 done을 선언하기 전에 프로젝트 자체 테스트/빌드(`npm test`, `cargo test`, `go test`, `make test`)를 돌리고 결과를 되먹입니다. 검증 안 된 작업을 조용히 "완료"라 하지 않습니다.
- **병렬 격리.** 여러 워커를 동시에 보낼 때 각자 일회용 `git worktree`에서 실행하고 변경을 병합합니다 — 동시 에이전트가 서로 충돌하지 않습니다.
- **요란한 실패.** 워커 타임아웃·크래시·쿼터 오류가 digest에 묻히지 않고 즉시 표면화됩니다.
- **재개 가능.** 매 실행이 `claude` 세션 id와 턴 기록을 저장해, `omk resume`이 정확히 멈춘 지점에서 이어갑니다.

> 에이전트는 소원을 들어주는 기계이고, 모호한 소원을 곧이곧대로 들어줍니다. 컨덕터의 일은 — 누가 "완료"라 부르기 전에 — 빠진 제약을 끄집어내고, 실제로 무엇이 바뀌었는지 보고, 검증하는 것입니다.

워커 호출은 의도적으로 네이티브를 유지합니다. 프로바이더 인증·모델 선택·계정 한도는 프로바이더 CLI에 남습니다.

```text
claude -p --output-format json --permission-mode acceptEdits   "<워커 작업>"
codex  exec --skip-git-repo-check --json -s workspace-write     "<워커 작업>"
gemini --skip-trust --approval-mode auto_edit -p                "<워커 작업>"
```

---

## 설치

### npm에서

```bash
npm install -g oh-my-kamisama
```

### 이 저장소에서

```bash
git clone https://github.com/yong076/oh-my-kamisama
cd oh-my-kamisama
npm install -g .
```

### 설치 없이 바로 실행

```bash
./bin/omk doctor
./bin/omk "이 리포 요약하고 안전한 첫 개선 하나 제안해줘"
```

> `npm install -g .`는 `OMK_SKIP_AGENTCAT_INSTALL=1`이 없으면 Agent Cat Connectors 설치를 자동 실행합니다. 나중에 `omk connect`로도 됩니다.

### 요구 사항

**핵심**

- `claude` CLI — 인증됨
- `codex` CLI — 인증됨
- `gemini` CLI — 인증됨
- macOS, Linux, 또는 WSL + Bash
- Node.js 20+

**선택**

- `cmux` — 콕핏 모드
- `omx` / `oh-my-codex` — 향후 지속 목표/팀 어댑터
- `opencode` — 향후 스카우트/리뷰어 레인
- `agentcat` / Agent Cat Connectors — 사용량·쿼터·활동 스냅샷

### 설정 점검

```bash
omk doctor    # 명령 표면 점검 (프로바이더 인증은 아님)
omk tools     # omk가 호출 가능한 것 목록
omk agents    # 실시간 쿼터/활동 (Agent Cat Connectors 필요)
```

---

## 빠른 시작

지금 리포에서 인터랙티브 컨덕터 열기:

```bash
cd /path/to/repo
omk
```

…그리고 작업을 타이핑하면 됩니다. 셸에서 평문 작업은 **컨덕터**로 돕니다.

원샷으로도:

```bash
omk conduct --repo ~/work/app "파서 회귀 버그 고치고 관련 테스트 돌려줘"
omk resume  --repo ~/work/app            # 마지막 실행 이어가기
```

> 커맨드라인의 맨손 `omk "작업"`은 쿼터 기반 단일 실행자 [`omk auto`](#omk-auto--쿼터-기반-단일-실행자)를 씁니다. CLI에서 멀티 에이전트 루프를 원하면 `omk conduct`를 쓰세요 (셸 **안에서** 작업을 타이핑하면 이게 기본값입니다).

### 자주 쓰는 한 줄

```bash
# 다른 리포에 컨덕터
omk conduct --repo ~/work/app "관리자 감사 뷰를 테스트와 함께 만들어줘"

# 어드바이저만 — 코드 편집이 아니라 결정
omk advise  --repo ~/work/app "user_roles 마이그레이션의 가장 안전한 경로 검토"

# 백그라운드 장시간 실행 + 관찰
omk bg   --repo ~/work/app "설정 화면 리팩터링하고 검증해줘"
omk ps   --repo ~/work/app
omk tail --repo ~/work/app latest
```

---

## 인터랙티브 셸

인자 없이 인터랙티브 터미널에서 `omk`를 실행하면 Claude-Code 스타일 런치 화면 + 실시간 에이전트 상태 + 연결된 컨덕터가 있는 작은 REPL이 뜹니다 (위 스크린샷):

```text
╭ ✻ Welcome to Oh My Kamisama! v0.8.0 ──────────────────────────╮
│   cwd:   ~/work/app                                            │
│   mode:  conduct    route: codex    state: working            │
│   Codex 71% 7d · Claude 92% 7d · Gemini 96% daily             │
╰────────────────────────────────────────────────────────────────╯
🐱 관리자 액션에 감사 로그 추가하고 검증해줘
```

평문은 작업으로 취급돼 현재 모드로 돕니다. TTY 셸은 실제 터미널 에디터(`bin/omk-repl.js`)를 씁니다 — 화살표 이동, 멀티라인 입력(Shift/Meta+Enter 또는 `\`+Enter), 히스토리, 슬래시 자동완성, 라이브 컨덕터 화면. 비대화형 stdin은 더 단순한 Bash 루프로 떨어져 스크립트·테스트가 깔끔합니다.

| 명령 | 하는 일 |
|---|---|
| `/conduct TASK` | 멀티 에이전트 컨덕터 실행 (계획·위임·diff·검증) |
| `/resume [run\|latest]` | 이전 컨덕터 실행 재개 |
| `/mode conduct\|auto\|run\|claude\|gemini\|advise\|bg\|cockpit` | 평문 작업 실행 방식 설정 |
| `/agents` | 상태·쿼터·활동·추천 라우트 새로고침 |
| `/context` | 리포 브랜치·스크립트·표면·라우트 |
| `/diff` | git 상태와 diff 통계 |
| `/cost` | Agent Cat 사용량/비용 요약 |
| `/tasks`, `/task TEXT`, `/done ID` | 로컬 `.omk` 작업 큐 |
| `/ps`, `/logs latest`, `/tail latest`, `/watch latest`, `/kill latest` | 백그라운드 잡 제어 |
| `/repo PATH` | 대상 저장소 전환 |
| `/refresh`, `/screen`, `/route`, `/connect`, `/tools`, `/status`, `/doctor` | 상태 & 설정 |
| `/! git status` | 리포 안에서 셸 명령 실행 |
| `/help`, `/shortcuts`, `/exit` | 도움말, 단축키, 종료 |

---

## 모드

### `omk conduct` — 멀티 에이전트 컨덕터

대표 모드. `claude` 세션이 계획하고, `codex` / `claude` / `gemini`에 위임하고, 실제 diff를 읽고, 검증합니다 — [컨덕터는 어떻게 동작하나](#컨덕터는-어떻게-동작하나) 참고.

```bash
omk conduct --repo ~/work/app "관리자 액션에 감사 로그 추가하고 검증해줘"
```

조절값: `OMK_CONDUCT_MAX_TURNS`, `OMK_CONDUCT_CONCURRENCY`, `OMK_CONDUCT_VERIFY=0`(테스트 게이트 생략), `OMK_CONDUCT_WORKTREES=0`(격리 worktree 대신 리포에서 직접).

### `omk resume` — 이전 컨덕터 실행 이어가기

매 실행이 세션 id와 턴 기록을 저장합니다. `omk resume`은 그걸 재사용하고, 현재 리포 diff를 컨덕터에 다시 보여주며 이어갑니다.

```bash
omk resume --repo ~/work/app                # 최근 실행
omk resume --repo ~/work/app 2026-05-30T17-15-26Z-build-the-feature
```

### `omk auto` — 쿼터 기반 단일 실행자

Agent Cat Connectors를 확인하고 **하나의** 실행자를 직접 돌립니다.

1. Codex나 Claude 중 쓸 수 있는 쪽을 먼저.
2. 둘 다 가능하면 남은 **쿼터가 더 많은** 쪽.
3. 둘 다 안 될 때만 Gemini — `OMK_ALLOW_GEMINI_FALLBACK=1`이 없으면 **먼저 묻습니다**.

```bash
omk auto --repo ~/work/app "billing export 고치고 검증해줘"
```

### `omk run` — 어드바이저 파이프라인

원조 3-레인 파이프라인: Claude 어드바이저와 Gemini 어드바이저가 각각 구조화된 읽기(접근·다이브 질문·AI-DLC 게이트·리스크·검증)를 쓰고, Codex가 두 아티팩트를 맥락으로 구현합니다.

```bash
omk run --repo ~/work/app "checkout 쿠폰 검증 고치고 테스트 돌려줘"
```

### `omk advise` — 어드바이저만

다음 단계가 **코드 편집이 아니라 결정**이어야 할 때. Claude와 Gemini가 읽기를 내놓고, 실행자는 돌지 않습니다.

```bash
omk advise --repo ~/work/app "이 캐시를 Redis로 옮겨야 할까?"
```

### `omk claude` / `omk gemini` — 직접 실행자

라우팅을 건너뛰고 한 프로바이더를 바로 씁니다.

```bash
omk claude --repo ~/work/app "설정 크래시 고치고 검증 요약해줘"
```

### `omk bg` — 백그라운드 잡

백그라운드 슈퍼바이저로 파이프라인을 돌리고 잡 상태를 `.omk/bg/`에 남깁니다. 슈퍼바이저와 `omk kill`은 런처만이 아니라 **전체 워커 프로세스 트리**를 정리합니다.

```bash
omk bg   --repo ~/work/app "billing 설정 페이지 현대화"
omk ps   --repo ~/work/app
omk tail --repo ~/work/app latest
omk kill --repo ~/work/app latest
```

---

## 디스크의 아티팩트

매 컨덕터 실행은 타임스탬프가 찍힌, 감사 가능하고 재개 가능한 패킷을 남깁니다.

```text
.omk/runs/<timestamp>-<task>/
├── task.txt            ← 원래 작업
├── session.json        ← claude 세션 id + 상태 (omk resume이 사용)
├── plan.json           ← 최신 ☐/◐/☑ 플랜
├── turn-0.json         ← 각 컨덕터 턴: 들어온 메시지, 나간 엔벌로프
├── turn-0.diff         ← 그 라운드 후의 실제 git diff
├── codex.0.out         ← 각 워커의 캡처된 출력
└── verify-1.txt        ← 검증(테스트/빌드) 결과
```

어드바이저 파이프라인(`omk run` / `omk advise`)은 자체 패킷(`RUN.md`, `claude.md`, `gemini.md`, `codex.out/err`)을, `omk bg`는 슈퍼바이저 기록(`status`, `pid`, `stdout.log`, `stderr.log`, `run_dir.txt`)을 추가로 남깁니다.

덕분에 **실패는 디버깅 가능**, **좋은 조언은 재사용 가능**, **리뷰는 비동기 가능** — 스크롤백을 뒤지는 대신 나중에 패킷을 열면 됩니다.

---

## 명령어 레퍼런스

```bash
omk                                      # 인터랙티브 셸 (평문 작업 → 컨덕터)
omk "task"                               # 원샷, 쿼터 기반 auto
omk shell    [--repo PATH]               # 워크스페이스 전용 셸

omk conduct  [--repo PATH] "task"        # 멀티 에이전트 컨덕터 (계획/위임/diff/검증)
omk resume   [--repo PATH] [run|latest]  # 이전 컨덕터 실행 재개
omk auto     [--repo PATH] "task"        # 쿼터 기반 단일 실행자
omk run      [--repo PATH] "task"        # 어드바이저 파이프라인 (Claude + Gemini → Codex)
omk advise   [--repo PATH] "task"        # 어드바이저만
omk claude   [--repo PATH] "task"        # 직접 Claude 실행자
omk gemini   [--repo PATH] "task"        # 직접 Gemini 실행자

omk bg       [--repo PATH] "task"        # 백그라운드 파이프라인
omk cockpit  [--repo PATH] "task"        # cmux 콕핏 + bg

omk agents                               # 실시간 에이전트 표
omk connect                              # Agent Cat Connectors 설치/확인
omk context  [--repo PATH]               # 리포 스냅샷
omk diff     [--repo PATH]               # git 상태 + diff 통계
omk cost                                 # Agent Cat 사용량/비용 요약

omk tasks    [--repo PATH]               # 로컬 작업 큐 목록
omk task     [--repo PATH] <add|done|list> [...]

omk watch    [--repo PATH] [job-id|latest]
omk ps       [--repo PATH]
omk logs     [--repo PATH] [job-id|latest]
omk tail     [--repo PATH] [job-id|latest]
omk kill     [--repo PATH] <job-id|latest>

omk tools                                # omk가 호출 가능한 것
omk status                               # 짧은 상태 줄
omk doctor                               # 진단
```

---

## 설정

환경 변수로 동작을 조절합니다. 필수는 없습니다.

| 변수 | 기본 | 효과 |
|---|---|---|
| `OMK_CONDUCT_MAX_TURNS` | `12` | 컨덕터가 멈추기 전 최대 턴 수. |
| `OMK_CONDUCT_CONCURRENCY` | `3` | 라운드당 병렬 워커 최대 수. |
| `OMK_CONDUCT_VERIFY` | 켜짐 | `0`이면 done 전 테스트/빌드 게이트 생략. |
| `OMK_CONDUCT_WORKTREES` | 켜짐 | `0`이면 병렬 워커를 격리 worktree 대신 리포에서 직접 실행. |
| `OMK_DELEGATE_TIMEOUT_MS` | `180000` | 워커당 타임아웃. |
| `OMK_ALLOW_GEMINI_FALLBACK` | 미설정 | auto 모드가 **묻지 않고** Gemini로 폴백. |
| `OMK_KEEP_GOING` | 미설정 | 어드바이저가 실패해도 `omk run`이 Codex까지 진행. |
| `OMK_SKIP_AGENTCAT_INSTALL` | 미설정 | `npm install` 시 Agent Cat Connectors 설치 생략. |
| `OMK_WATCH_INTERVAL` | `2` | `omk watch` 새로고침 간격(초). |
| `OMK_READLINE_REPL` | 미설정 | 터미널 에디터 대신 단순 readline 셸 사용. |
| `OMK_NO_INTRO` / `OMK_ASCII` | 미설정 | 인트로 애니메이션 생략 / 색·이모지 제거. |

---

## 예시

### 기능을 검증과 함께 출하

```bash
omk conduct --repo ~/work/api "공개 API에 레이트 리미팅 추가하고 테스트도 추가"
```

컨덕터가 단계를 계획하고, codex가 (격리 worktree에서) 구현하고, diff를 되읽고, `npm test`를 돌려 초록일 때만 완료를 보고합니다.

### 장시간 실행을 이어받기

```bash
omk conduct --repo ~/work/api "user_roles를 새 스키마로 마이그레이션"
# …자리 비웠다가 돌아와서…
omk resume  --repo ~/work/api
```

### 편집 전 계획 압박

```bash
omk advise --repo ~/work/api "user_roles 마이그레이션의 가장 안전한 경로 검토"
```

### 장시간 실행 걸어두고 자리 비우기

```bash
omk bg   --repo ~/work/site "옛 테마 토큰 교체하고 스크린샷 검증"
omk tail --repo ~/work/site latest
```

---

## 콕핏 모드 (cmux)

`omk cockpit`은 watch 페인과 runner 페인이 있는 cmux 워크스페이스를 열어, 장시간 작업을 숨은 백그라운드 프로세스가 아니라 **보이는 관제실**로 만듭니다.

```bash
omk cockpit --repo ~/work/product "관리자 감사 뷰 1차 만들기"
```

```text
┌─ watch ──────────────────────┬─ runner ─────────────────────┐
│  status: running             │  omk bg + omk tail           │
│  stdout/stderr tail …        │  실시간 로그 …               │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 어디에 들어맞나 (omo / omx / cmux)

`oh-my-kamisama`는 로컬 도구들 **위에** 앉습니다.

```text
┌──────────────────────────────────────────────────────────┐
│  omk        ← 컨덕터, 실행 패킷, 아티팩트, 라우팅        │
├──────────────────────────────────────────────────────────┤
│  codex    ─ 구현 실행자            (workspace-write)      │
│  claude   ─ 컨덕터 + 추론/리뷰 워커                      │
│  gemini   ─ 잡일 / 웹 검색 워커                          │
├──────────────────────────────────────────────────────────┤
│  opencode ─ 선택: 스카우트 / 리뷰어 레인                 │
│  OMO      ─ 선택: 모델 레인 / 터미널 네이티브 플로우     │
│  OMX      ─ 선택: 지속 목표·팀·HUD                       │
│  cmux     ─ 보이는 페인 / 장시간 런타임                  │
│  agentcat ─ 실시간 쿼터·활동·비용 스냅샷                 │
└──────────────────────────────────────────────────────────┘
```

`omk`는 어느 것도 대체하지 않습니다. 같이 놀게 하는 컨덕터일 뿐입니다. 더 긴 로드맵은 [`docs/strategy.md`](docs/strategy.md)와 [`docs/competitive-scan.md`](docs/competitive-scan.md) 참고.

---

## 설계 원칙

- **네이티브 CLI는 네이티브로.** `omk`는 조율할 뿐, 프로바이더를 흉내 내지 않습니다.
- **diff가 말보다 낫다.** 컨덕터는 디스크에서 실제로 바뀐 것을 근거로 추론합니다.
- **"done" 전에 검증.** 검증 안 된 작업은 끝난 작업이 아닙니다.
- **아티팩트가 기억보다 낫다.** 매 실행이 재개 가능한, 들여다볼 수 있는 파일을 남깁니다.
- **가시성이 중요하다.** 장시간 작업은 볼 수 있어야 하고, 실패는 요란해야 합니다.
- **토큰 절약은 북극성이 아니다.** 더 나은 결과가 북극성입니다.

---

## 테스트

로컬 스위트는 완전 오프라인입니다 — 가짜 `claude` / `codex` / `gemini` / `cmux` 명령을 써서 모델 토큰을 한 푼도 안 씁니다.

```bash
npm test
```

어드바이저 파이프라인, 콕핏 생성기, 셸 모드와 슬래시 명령, auto 라우팅, 리포 표면 탐지, Node REPL, 그리고 컨덕터를 커버합니다 — 플랜/diff/worktree/검증 경로, resume, REPL→컨덕터 배선까지.

라이브 프로바이더 대상 정량 스모크:

```bash
scripts/quant-smoke.sh 2
```

---

## 로드맵

컨덕터에 출하됨: 라이브 플랜, 스트리밍 워커, 실제-diff 인식, 검증 게이트, worktree 격리, resume.

다음:

- [ ] 평문 작업 라우팅 통일 — `omk "task"`와 셸 동작 일치
- [ ] `omk bg --conduct` — 어드바이저 파이프라인이 아니라 컨덕터를 백그라운드로
- [ ] OMX 어댑터 — 실행 패킷을 OMX 지속 목표로
- [ ] opencode / OMO 스카우트 + 리뷰어 레인
- [ ] 콕핏 v2 — 리뷰 / QA / 릴리스 레인을 페인으로

---

## 머치

<p align="center">
  <img src="assets/omk-merch.png" alt="Oh My Kamisama 비공식 머치 컨셉" width="720" />
</p>

공식 머치는 없습니다. 한 모델이 모든 결정을 혼자 내려야 한다고 믿는 사람들을 위한 경고 라벨일 뿐.

---

## 라이선스

MIT © [yong076](https://github.com/yong076)
