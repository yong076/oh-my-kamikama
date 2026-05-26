<p align="center">
  <img src="assets/omk-hero-banner.png" alt="Oh My Kamisama — One command. Many agents." />
</p>

<h1 align="center">oh-my-kamikama</h1>

<p align="center">
  <b>명령 하나, 에이전트 여럿, 약간 수상한 자신감.</b><br/>
  <sub>익스트림 바이브 코딩용 로컬 멀티-CLI 컨덕터.</sub>
</p>

<p align="center">
  <a href="#설치"><img alt="npm" src="https://img.shields.io/badge/npm-oh--my--kamikama-cf68ff?style=flat-square&logo=npm"/></a>
  <a href="#요구사항"><img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-3c873a?style=flat-square&logo=node.js&logoColor=white"/></a>
  <img alt="platform" src="https://img.shields.io/badge/macOS%20%7C%20Linux%20%7C%20WSL-444?style=flat-square"/>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/>
  <img alt="status" src="https://img.shields.io/badge/status-vibe%20coding%20grade-cf68ff?style=flat-square"/>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>한국어</b>
</p>

`omk`는 Claude와 Gemini한테 작업을 두고 잠깐 다투게 시키고, 그 결과를 Codex가 받아 구현하게 만듭니다. 실행은 사라지는 채팅 한 통이 아니라 디스크 위 파일로 남습니다.

```bash
omk "실패한 auth 테스트 고치고 검증해줘"
```

> Oh my god? 아니, Oh my Kamisama.

---

## 목차

- [왜 만들었나](#왜-만들었나)
- [무엇인가](#무엇인가)
- [파이프라인](#파이프라인)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [인터랙티브 셸](#인터랙티브-셸)
- [모드](#모드)
- [코크핏 모드 (cmux)](#코크핏-모드-cmux)
- [디스크 아티팩트](#디스크-아티팩트)
- [명령어 레퍼런스](#명령어-레퍼런스)
- [환경 변수](#환경-변수)
- [예제](#예제)
- [omo / omx / cmux 와의 관계](#omo--omx--cmux-와의-관계)
- [설계 원칙](#설계-원칙)
- [테스트](#테스트)
- [로드맵](#로드맵)
- [굿즈](#굿즈)
- [라이선스](#라이선스)

---

## 왜 만들었나

요즘 AI 코딩 도구는 대부분 런타임 하나에 최적화돼 있습니다.

| 도구 | 잘하는 것 | 못 하는 것 |
|---|---|---|
| Codex 레이어 | Codex 워크플로, 훅, 스킬, 팀 | 다른 프로바이더의 세컨드 오피니언 |
| Claude Code 레이어 | Claude 세션, 플래닝, 권한 관리 | 멀티 실행자 핸드오프 |
| Gemini CLI | 독립적인 서드 오피니언 | 장기 오케스트레이션 |
| opencode / OMO | 터미널 네이티브 모델 레인 | 포그라운드·백그라운드 패킷 라우팅 |
| OMX | 영속 목표, 팀, HUD | 독립적인 어드바이저 스웜 |
| cmux | 가시화된 장기 실행 패널 | 실행 패킷·아티팩트 |

`omk`는 지루하지만 쓸모 있는 길을 갑니다. 네이티브 도구는 그대로 두고, 한 명령에서 협력하게 만드는 쪽.

토큰을 아끼자고 만든 도구가 아닙니다. 작업이 모호하거나 위험하거나, 한 모델 한 번으로는 부족할 만큼 클 때 에이전트 주의력을 더 쓰자는 쪽입니다.

> 에이전트는 소원을 들어주는 기계입니다. 모호한 소원은 자주 글자 그대로 들어줍니다.
> `omk`는 divecode의 "지니 원칙(genie principle)"을 빌립니다. 실행자가 소원을 들어주기 전에, 어드바이저가 먼저 빠진 제약·리스크·게이트·검증을 끌어올려야 한다는 것.

---

## 무엇인가

<p align="center">
  <img src="assets/omk-kamisama.png" alt="Oh My Kamisama" width="360" />
</p>

`oh-my-kamikama`는 이미 쓰고 있는 AI 코딩 CLI 위에 얹는 명령 계층입니다. Claude Code, Codex CLI, Gemini CLI, opencode, OMX, OMO, cmux를 대체하지 않습니다. 조율합니다.

작업을 하나 던지면, 여러 네이티브 코딩 에이전트가 각자 다른 각도로 그 작업을 들여다본 결과를 아티팩트로 기록하고, 마지막 실행을 Codex에게 그 컨텍스트와 함께 넘깁니다.

특히 이런 상황에 강합니다.

- "원하는 건 아는데, 구현 경로가 흐릿하다."
- "토큰 좀 써도 된다, 결과만 더 좋으면."
- "Claude/Gemini/Codex가 다 한 번씩 건드려봤으면 좋겠다. 수동으로는 싫고."
- "오래 걸리는 에이전트 작업이 한 터미널에 숨지 말고 cmux로 보였으면 좋겠다."

마법은 아닙니다.

- 각 CLI는 자기 인증과 로그인이 필요합니다.
- 어드바이저 출력은 컨텍스트이지 권위가 아닙니다.
- Codex는 여전히 직접 리포를 살피고 변경을 검증해야 합니다.
- 실패한 에이전트는 숨기지 않고 그대로 드러냅니다.

---

## 파이프라인

지금의 코어 파이프라인:

```text
사용자 작업
  ├─▶ Claude 어드바이저  ─▶ claude.md 작성   (plan 모드, 읽기 전용)
  ├─▶ Gemini 어드바이저  ─▶ gemini.md 작성   (plan 모드, 읽기 전용)
  └─▶ Codex 실행자       ─▶ 두 아티팩트 읽고, 구현, 검증, 요약
                            codex.prompt.md, codex.out, codex.err, RUN.md 남김
```

각 어드바이저는 같은 형식의 분석을 돌려줍니다.

- 추천 접근법
- 다이브 질문 (Dive questions)
- AI-DLC 단계와 게이트 *(Inception → Construction → Operations)*
- 리스크
- 검증 계획
- Codex가 피해야 할 것

네이티브 호출은 일부러 단순하게 둡니다. 프로바이더 인증, 모델 선택, 로컬 정책, 계정 한도는 모두 프로바이더 CLI에 맡깁니다.

```text
claude --print --permission-mode plan         "<advisor prompt>"
gemini --skip-trust --approval-mode plan -p   "<advisor prompt>"
codex  exec --skip-git-repo-check -C <repo>
            -s workspace-write                "<executor prompt>"
```

긴 작업이면 백그라운드로 돌리고 cmux 코크핏을 같이 엽니다.

```text
omk cockpit
  └─▶ cmux 워크스페이스
       ├─ 왼쪽 패널:  omk watch   (상태, pid, stdout/stderr 꼬리)
       └─ 오른쪽 패널: omk bg + omk tail
```

---

## 설치

### npm에서 (배포 후)

```bash
npm install -g oh-my-kamikama
```

### 이 저장소에서

```bash
git clone https://github.com/yong076/oh-my-kamikama
cd oh-my-kamikama
npm install -g .
```

### 설치 없이 바로 실행

```bash
./bin/omk doctor
./bin/omk "이 리포 요약하고 안전한 첫 개선 제안해줘"
```

> `npm install -g .`은 `OMK_SKIP_AGENTCAT_INSTALL=1`이 없으면 Agent Cat Connectors 인스톨러도 같이 돌립니다. 직접 돌리려면 `omk connect`.

### 요구사항

필수:

- `claude` CLI — 인증 완료
- `codex` CLI — 인증 완료
- `gemini` CLI — 인증 완료
- Bash 깔린 macOS, Linux 또는 WSL
- Node.js 20+

선택:

- `cmux` — 코크핏 모드용
- `omx` / `oh-my-codex` — 추후 영속 목표·팀 어댑터용
- `opencode` — 추후 스카우트·리뷰어 레인용
- `agentcat` / Agent Cat Connectors — 사용량·쿼터·활동 스냅샷용

### 설치 확인

```bash
omk doctor    # 명령 표면 점검 (프로바이더 인증 점검은 따로)
omk tools     # omk가 부를 수 있는 도구 나열
omk agents    # 실시간 쿼터·활동 (Agent Cat Connectors 필요)
```

---

## 빠른 시작

지금 리포에서 인터랙티브 컨덕터 열기:

```bash
cd /path/to/repo
omk
```

또는 단일 작업:

```bash
omk "파서 회귀 버그 고치고 관련 테스트 돌려줘"
```

인자 없는 작업은 기본적으로 `omk auto`로 들어갑니다. Auto 모드는 Agent Cat의 쿼터와 가용성을 보고 Codex나 Claude를 먼저 고른 다음, 둘 다 안 될 때만 Gemini로 넘어갑니다. Gemini 폴백 전에는 인터랙티브에서 한 번 확인을 묻습니다. Gemini 쿼터가 귀하거나 다른 계정에 묶인 경우가 많아서입니다.

### 자주 쓰는 한 줄

```bash
# 다른 리포 대상으로 풀 3-레인 파이프라인
omk run --repo ~/work/app "checkout 쿠폰 검증 고치고 테스트 돌려줘"

# 어드바이저만 (코드 변경 없음)
omk advise --repo ~/work/app "user_roles 마이그레이션 안전한 경로 검토"

# 백그라운드 잡 + tail
omk bg   --repo ~/work/app "설정 화면 리팩터하고 검증해줘"
omk ps   --repo ~/work/app
omk tail --repo ~/work/app latest

# 긴 작업용 cmux 코크핏
omk cockpit --repo ~/work/app "테스트와 노트 포함해서 기능 출시해줘"
```

---

## 인터랙티브 셸

인자 없이 `omk`를 실행하면 작은 REPL이 뜹니다. 헤더에 실시간 에이전트 상태가 같이 보입니다.

```text
🐱  Oh My Kamisama v0.8.0
repo:  ~/work/app
mode:  auto
route: claude
------------------------------------------------------------------------
agents: Codex 70% 7d ok | Claude 92% 7d ok | Gemini 94% Gemini Pro ok
activity: walking
------------------------------------------------------------------------
type a task, /agents for detail, /context for repo, /exit to quit

🐱
```

일반 텍스트는 작업으로 보고 현재 모드에서 돌립니다. 슬래시 명령으로 셸을 제어합니다.

> TTY 세션은 Node readline 셸(`bin/omk-repl.js`)을 써서 평범한 터미널 편집—백스페이스, 화살표 이동, 명령 히스토리—을 지원합니다. 비인터랙티브 stdin은 Bash 폴백 그대로라 테스트와 스크립트는 단순합니다.

| 명령 | 동작 |
|---|---|
| `/mode auto` | Agent Cat 쿼터·가용성으로 실행자 선택 |
| `/mode run` | 풀 Claude + Gemini + Codex 파이프라인 |
| `/mode claude` | Claude 직접 실행 |
| `/mode gemini` | Gemini 직접 실행 |
| `/mode advise` | 어드바이저만, 코드 변경 없음 |
| `/mode bg` | 백그라운드 잡 시작 |
| `/mode cockpit` | 작업마다 cmux 코크핏 열기 |
| `/agents` | 상태·쿼터·활동·추천 라우트 갱신 |
| `/refresh` | 런치 화면 다시 그리기 |
| `/route` | 지금 auto 라우트 출력 |
| `/connect` | Agent Cat Connectors 설치·점검 |
| `/context` | 리포 브랜치·스크립트·표면·라우트 |
| `/diff` | git status 와 diff 통계 |
| `/cost` | Agent Cat 사용량·비용 요약 |
| `/tasks` | 로컬 `.omk` 작업 큐 나열 |
| `/task TEXT` | 로컬 작업 추가 |
| `/done ID` | 로컬 작업 완료 처리 |
| `/repo PATH` | 대상 저장소 전환 |
| `/ps`, `/logs latest`, `/tail latest` | 백그라운드 잡 제어 |
| `/! git status` | 리포 안에서 셸 명령 실행 |
| `/exit` | 종료 |

세션 예시:

```text
$ omk
🐱 설정 버그 검토하고 테스트와 함께 고쳐줘
🐱 /agents
🐱 /mode cockpit
🐱 admin 감사 화면 만들고 검증해줘
🐱 /exit
```

> 셸은 요즘 코딩 에이전트 CLI에서 쓸 만한 부분—슬래시 명령, 빠른 리포 컨텍스트, 사용량·비용 뷰, diff 뷰, 작은 로컬 작업 큐—을 일부러 흉내 냈습니다. 독점 에이전트 소스를 박아 넣거나 재사용하진 않습니다.

---

## 모드

### `omk auto` — 쿼터 기반 라우팅

Auto 모드는 Agent Cat Connectors를 확인하고 지금 프로바이더 상황을 보여준 다음, 실행자를 고릅니다.

1. Codex나 Claude 중 쓸 수 있는 쪽을 먼저 본다.
2. 둘 다 가능하면 남은 쿼터가 더 많은 쪽을 고른다.
3. 둘 다 불가일 때만 Gemini를 쓴다.
4. `OMK_ALLOW_GEMINI_FALLBACK=1`이 없는 한 Gemini 폴백 전에 묻는다.

```bash
omk auto --repo ~/work/app "billing export 고치고 검증해줘"
```

Agent Cat Connectors가 없으면 `omk`가 설치를 시도합니다. 사용량 스냅샷 데이터를 못 얻으면 단순한 CLI 가용성으로 폴백합니다.

### `omk run` — 풀 포그라운드 파이프라인

원래 3-레인 파이프라인: Claude 어드바이저 → Gemini 어드바이저 → Codex 실행자. 에이전트가 끝날 때까지 터미널이 멈춰 있습니다.

```bash
omk run --repo ~/work/app "checkout 쿠폰 검증 고치고 테스트 돌려줘"
```

### `omk claude` / `omk gemini` — 직접 실행자

어드바이저 스웜을 건너뛰고 한 프로바이더만 바로 씁니다. Auto 모드는 보통 Gemini 폴백 전에 묻지만, `omk gemini`는 직접 부른 거니까 묻지 않고 바로 돌립니다.

```bash
omk claude --repo ~/work/app "설정 크래시 고치고 검증 내용 요약해줘"
omk gemini --repo ~/work/app "문서 생성기 고쳐줘"
```

### `omk advise` — 어드바이저만

다음 단계가 코드 편집이 아니라 결정이어야 할 때 씁니다. Claude와 Gemini가 구조화된 분석만 내놓고 Codex는 부르지 않습니다.

```bash
omk advise --repo ~/work/app "이 캐시 Redis로 옮기는 게 맞을까?"
```

### `omk bg` — 백그라운드 잡

같은 파이프라인을 백그라운드 슈퍼바이저로 시작하고, 잡 상태를 `.omk/bg/` 아래에 남깁니다.

```bash
omk bg   --repo ~/work/app "billing 설정 페이지 현대화해줘"
omk ps   --repo ~/work/app
omk logs --repo ~/work/app latest
omk tail --repo ~/work/app latest
omk kill --repo ~/work/app latest    # 멈춰야 할 때
```

---

## 코크핏 모드 (cmux)

`omk cockpit`은 두 패널짜리 cmux 워크스페이스를 만듭니다.

```text
┌──────────────────────────────┬──────────────────────────────┐
│  omk watch                   │  omk bg "<task>"             │
│  ─────────                   │  omk tail latest             │
│  status: running             │                              │
│  pid:    48211               │  [10:24:31] planner    ok    │
│  stdout tail: ...            │  [10:24:32] researcher ok    │
│  stderr tail: ...            │  [10:24:35] coder      ok    │
│                              │  [10:24:37] reviewer   ok    │
│                              │  [10:24:39] optimizer  ok    │
└──────────────────────────────┴──────────────────────────────┘
```

```bash
omk cockpit --repo ~/work/app "대시보드 필터 끝내고 e2e 검증해줘"
```

작업이 오래 걸리고, 숨은 백그라운드 프로세스 말고 보이는 컨트롤룸이 필요할 때 쓰세요.

이건 더 큰 그림의 기초입니다. `omk`가 cmux 네이티브 에이전트 코크핏이 되어서, Claude·Codex·Gemini·OMX·OMO·opencode·QA·리뷰·릴리스 레인이 숨은 서브프로세스가 아니라 가시화된 패널이 되는 그림.

### Watch 대시보드

```bash
omk watch --repo ~/work/app latest

# 갱신 주기(초) 커스텀
OMK_WATCH_INTERVAL=5 omk watch --repo ~/work/app latest
```

---

## 디스크 아티팩트

포그라운드 실행은 매번 타임스탬프가 붙은 아티팩트 디렉토리를 남깁니다.

```text
.omk/runs/<timestamp>-<task>/
├── RUN.md              ← 최종 요약 패킷
├── task.txt            ← 원본 작업 텍스트
├── claude.md           ← Claude 어드바이저: 접근법·리스크·검증·피할 것
├── gemini.md           ← Gemini 어드바이저: 같은 형식, 독립적 추론
├── codex.prompt.md     ← Codex가 받은 정확한 프롬프트
├── codex.out           ← Codex stdout
└── codex.err           ← Codex stderr
```

백그라운드 실행은 슈퍼바이저 기록을 더합니다.

```text
.omk/bg/<timestamp>-<task>/
├── status              ← queued | running | done | failed
├── pid
├── started.txt
├── finished.txt
├── task.txt
├── repo.txt
├── stdout.log
├── stderr.log
└── run_dir.txt         ← .omk/runs/... 패킷으로 향하는 포인터
```

정리하면:

- **실패도 디버깅됨** — 어떤 어드바이저 레인이 죽어도 진단이 남습니다.
- **성공한 조언은 재사용됨** — `claude.md`와 `gemini.md`는 평범한 마크다운입니다.
- **리뷰는 비동기** — `RUN.md`를 나중에 열면 됩니다. 스크롤백을 뒤질 일 없습니다.

---

## 명령어 레퍼런스

```bash
omk                                      # 인터랙티브 셸
omk "task"                               # auto 모드 단발 실행
omk shell    [--repo PATH]               # 특정 워크스페이스용 셸

omk auto     [--repo PATH] "task"        # 쿼터 기반 라우팅
omk run      [--repo PATH] "task"        # 풀 3-레인 파이프라인
omk claude   [--repo PATH] "task"        # Claude 직접 실행
omk gemini   [--repo PATH] "task"        # Gemini 직접 실행
omk advise   [--repo PATH] "task"        # 어드바이저만

omk bg       [--repo PATH] "task"        # 백그라운드 파이프라인
omk cockpit  [--repo PATH] "task"        # cmux 코크핏 + bg

omk agents                               # 실시간 에이전트 테이블
omk connect                              # Agent Cat Connectors 설치·점검
omk context  [--repo PATH]               # 리포 스냅샷
omk diff     [--repo PATH]               # git status + diff 통계
omk cost                                 # Agent Cat 사용량·비용 요약

omk tasks    [--repo PATH]               # 로컬 작업 큐
omk task     [--repo PATH] <add|done|list> [...]

omk watch    [--repo PATH] [job-id|latest]
omk ps       [--repo PATH]
omk logs     [--repo PATH] [job-id|latest]
omk tail     [--repo PATH] [job-id|latest]
omk kill     [--repo PATH] <job-id|latest>

omk tools                                # omk가 부를 수 있는 도구
omk status                               # 한 줄 상태
omk doctor                               # 진단
```

---

## 환경 변수

동작은 환경 변수로 바꿉니다. 필수는 없습니다.

| 변수 | 기본 | 효과 |
|---|---|---|
| `OMK_KEEP_GOING` | 미설정 | 켜면 어드바이저가 실패해도 `omk run`이 Codex까지 진행합니다. 실패한 어드바이저도 아티팩트와 진단을 남깁니다. |
| `OMK_ALLOW_GEMINI_FALLBACK` | 미설정 | 켜면 auto 모드가 Gemini로 폴백할 때 인터랙티브 확인을 묻지 않습니다. |
| `OMK_SKIP_AGENTCAT_INSTALL` | 미설정 | `npm install -g` 때 Agent Cat Connectors 인스톨러를 건너뜁니다. |
| `OMK_WATCH_INTERVAL` | `2` | `omk watch` 갱신 주기(초). |

---

## 예제

### 여러 관점으로 버그 고치기

```bash
omk --repo ~/work/api "refresh-token 레이스 고치고 회귀 테스트 추가해줘"
```

벌어지는 일:

1. Claude가 리스크와 빠진 제약을 나열한다.
2. Gemini가 별도로 실패 모드를 분석한다.
3. Codex가 두 아티팩트를 보면서 수정을 구현한다.
4. 리뷰용으로 `.omk/runs/<timestamp>.../RUN.md`가 남는다.

### 구현 전에 플랜에 압력 걸기

```bash
omk advise --repo ~/work/api "user_roles 마이그레이션 안전한 경로 검토"
```

다음 단계가 코드 편집이 아니라 결정이어야 할 때.

### 긴 실행 시작하고 나중에 돌아오기

```bash
omk bg   --repo ~/work/site "옛 테마 토큰 교체하고 스크린샷 검증해줘"
omk ps   --repo ~/work/site
omk tail --repo ~/work/site latest
omk logs --repo ~/work/site latest    # 끝나면 최종 패킷
```

### cmux 코크핏 열기

```bash
omk cockpit --repo ~/work/product "admin 감사 화면 1차 빌드"
```

### 어드바이저 하나가 죽어도 계속

```bash
OMK_KEEP_GOING=1 omk --repo ~/work/app "어드바이저 하나 죽어도 진행해줘"
```

---

## omo / omx / cmux 와의 관계

`oh-my-kamikama`는 로컬 도구들 위에 얹힙니다.

```text
┌──────────────────────────────────────────────────────────┐
│  omk          ← 실행 패킷, 아티팩트, 라우팅, 코크핏       │
├──────────────────────────────────────────────────────────┤
│  Claude   ─ 독립 어드바이저   (plan 모드, 읽기 전용)      │
│  Gemini   ─ 독립 어드바이저   (plan 모드, 읽기 전용)      │
│  Codex    ─ 최종 실행자       (workspace-write)           │
├──────────────────────────────────────────────────────────┤
│  opencode ─ 선택적 스카우트·리뷰어 레인                    │
│  OMO      ─ 선택적 모델 레인·터미널 네이티브 플로우        │
│  OMX      ─ 선택적 영속 목표·팀·HUD                       │
│  cmux     ─ 가시화된 패널·장기 실행 런타임                 │
│  agentcat ─ 실시간 쿼터·활동·비용 스냅샷                  │
└──────────────────────────────────────────────────────────┘
```

`omk`는 어느 것도 대체하지 않습니다. 같이 놀게 하는 컨덕터일 뿐입니다.

긴 로드맵은 [`docs/strategy.md`](docs/strategy.md)와 [`docs/competitive-scan.md`](docs/competitive-scan.md) 참고.

---

## 설계 원칙

- 네이티브 CLI는 네이티브로 둔다. `omk`는 조율할 뿐, 프로바이더를 흉내내지 않는다.
- 아티팩트가 메모리를 이긴다. 실행은 검사 가능한 파일을 남긴다.
- 어드바이저는 컨텍스트를 넓힌다. 최종 판단은 실행자가 한다.
- 가시성이 중요하다. 장기 실행은 지켜볼 수 있어야 한다.
- 실패는 데이터다. 실패한 레인은 사라지지 말고 진단을 남긴다.
- 토큰 절약은 북극성이 아니다. 더 나은 결과가 북극성이다.

---

## 테스트

로컬 테스트 스위트 (오프라인, 모델 토큰 안 씀):

```bash
npm test
```

가짜 `claude`·`gemini`·`codex`·`cmux` 명령으로 다음을 오프라인 커버합니다.

- 파이프라인 형태
- 코크핏 제너레이터
- 셸 모드와 슬래시 명령
- auto 라우팅 결정
- 리포 표면 감지

실제 프로바이더 상대 정량 스모크:

```bash
scripts/quant-smoke.sh 2
```

로컬 패키지를 전역 설치하고 `omk run`을 반복하면서 실행 상태·지속시간·Claude/Gemini 어드바이저 종료 코드·Codex 센티넬 감지·아티팩트 수·실행 디렉토리를 CSV로 남깁니다.

> 정량 스모크는 진짜 모델 호출이 필요한 때만 돌리세요.

---

## 로드맵

단기:

- [ ] OMX 어댑터 — omk 실행 패킷을 OMX 영속 목표로 푸시
- [ ] OMO 스카우트 레인 — 터미널 네이티브 네 번째 오피니언
- [ ] opencode 리뷰어 레인 — 실행 뒤 리뷰 패스
- [ ] 코크핏 v2 — 리뷰·QA·릴리스 레인을 패널로 추가
- [ ] 셸 헤더의 Agent Cat 사용량 뷰 보강

장기:

쓸 만한 에이전트 컨트롤룸 하나. 한 명령으로 작업이 시작되고, 한 자리에서 무엇이 돌고 있는지 보이고, 모든 레인이 나중에 열어볼 수 있는 파일을 남기는 형태.

---

## 굿즈

<p align="center">
  <img src="assets/omk-merch.png" alt="Oh My Kamisama unofficial merch concept" width="720" />
</p>

공식 굿즈는 없습니다. 한 모델이 모든 결정을 혼자 내려야 한다고 믿는 사람들을 위한 경고 라벨일 뿐입니다.

---

## 라이선스

MIT © [yong076](https://github.com/yong076)
