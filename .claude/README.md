# OncoLens · Configuración de Claude Code + OpenSpec

Propuesta B (implementadores por bounded context + guardianes transversales), con
`bulk-archive` y `traceability-auditor` solo al cierre de cada sprint, y un `sprint-orchestrator`
en segundo plano para la fase de ejecución. Alineada con el **PRD v1.3** (slicing v2).

## Flujo de un sprint

```
/sprint-start S<n>   (sesión principal · humano aprueba)       → PR de planificación → merge humano
/sprint-run S<n>     (lanza sprint-orchestrator en 2.º plano)  → PRs [L1D-nn] → merges humanos
/sprint-close S<n>   (sesión principal · humano cierra)         → PR de cierre → merge humano
```

| Fase | Quién | Qué pasa |
|---|---|---|
| `/sprint-start` | Sesión principal | Linear → historias · `openspec list` · `backlog-to-change` por historia · **Gate 1** en lote · grafo y oleadas · **aprobación humana** · PR del plan |
| `/sprint-run` | `sprint-orchestrator` (nivel 1) | Oleadas → implementadores (nivel 2, worktree) → **Gate 2** (guardianes, nivel 2) → PR listo · vuelve solo para pedir merges o si un gate falla 2 veces |
| `/sprint-close` | Sesión principal | Control · `/opsx:verify` global · `/opsx:bulk-archive` · `traceability-auditor` · demo + retro · **cierre humano** |

### Jerarquía de agentes (profundidad 3)

```
Sesión principal (humano)                                         nivel 0
 └─ sprint-orchestrator  (Opus)                                   nivel 1
     ├─ clinical-platform-dev · ai-services-dev · frontend-dev    nivel 2
     └─ privacy-guardian · contract-keeper · clinical-language-auditor · ai-eval-runner
        · design-principles-reviewer                                                       nivel 2
            (nivel 3 libre: un implementador puede lanzar Explore)
traceability-auditor: nivel 1, lanzado por /sprint-close
```

Requiere Claude Code ≥ 2.1.219 (anidamiento por defecto hasta 3 niveles); `settings.json` lo fija
explícitamente con `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3`.

## Agentes (`.claude/agents/`)

| Agente | Modelo | Rol | Herramientas |
|---|---|---|---|
| `sprint-orchestrator` | opus | Ejecuta el sprint por oleadas; preloads `implement-story`, `gate-review` | Hereda todas (incl. Agent y MCP de Linear); 2.º plano; memoria de proyecto |
| `clinical-platform-dev` | sonnet | clinical-api, Prisma, BFF `apps/web/app/api`, infra | Hereda; **worktree** |
| `ai-services-dev` | sonnet | rag-orchestrator, corpus, datasets sintéticos | Hereda; **worktree** |
| `frontend-dev` | sonnet | UI de `apps/web` (Atomic Design) | Hereda; **worktree** |
| `privacy-guardian` | opus | PII, desidentificación, aislamiento de Backend 2, datos reales, secretos | Solo lectura |
| `contract-keeper` | sonnet | Drift Zod ↔ Pydantic ↔ OpenAPI ↔ api-contracts ↔ deltas | Solo lectura |
| `design-principles-reviewer` | opus | SOLID y CUPID por change y por lote de 2–3 changes; prioriza lo que confunde a un agente; refactor mínimo por hallazgo | Solo lectura |
| `clinical-language-auditor` | sonnet | RN-23, RN-19, citas, orden por aplicabilidad, avisos no bloqueantes | Solo lectura |
| `ai-eval-runner` | sonnet | Suite OL-06 contra baseline y metas | Lectura + reporte en `reports/eval/` |
| `traceability-auditor` | opus | L1D ↔ change ↔ spec ↔ PRD ↔ test ↔ PR; `03-trazabilidad.md`; estado en Linear | Hereda, sin Agent |
| `requirements-analyst` · `architecture-advisor` · `backlog-writer` · `backlog-auditor` | opus | Fase de backlog (skill `decompose-prd`) — **actualizados a PRD v1.3** | Ya existían |

## Skills propias (`.claude/skills/`)

| Skill | Invocación | Propósito |
|---|---|---|
| `sprint-start` | Solo manual `/sprint-start S<n>` | Abre el sprint (pasos 1–7) |
| `sprint-run` | Solo manual `/sprint-run S<n>` | Lanza/reanuda el orquestador |
| `sprint-close` | Solo manual `/sprint-close S<n>` | Cierra el sprint (pasos 1–6) |
| `implement-story` | Orquestador o `/implement-story L1D-<nn>` | Una historia de punta a punta hasta el PR |
| `backlog-to-change` | `/sprint-start` o manual | Historia → `/opsx:propose` con trazabilidad |
| `gate-review` | `/sprint-start` (gate1), orquestador (gate2) | Guardianes en paralelo + veredicto consolidado |
| `sync-contracts` | Implementadores | Exporta/regenera/compara contratos |
| `run-ai-eval` | Implementadores, Gate 2, `/sprint-close` | Fork en `ai-eval-runner` |
| `preflight-real-data` | Solo manual | Checklist de G-Piloto (S6) |
| `decompose-prd` | Ya existía | PRD → backlog — **actualizada a PRD v1.3** |

## Skills estándar necesarias (no se crean aquí)

| Origen | Skills | Para qué | Cómo se obtienen |
|---|---|---|---|
| **OpenSpec** (perfil extendido) | `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:update`, `/opsx:sync`, `/opsx:archive`, `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard` | Ciclo SDD; `verify` y `bulk-archive` son imprescindibles | `openspec init --tools claude` + `openspec config profile` + `openspec update` |
| **Claude Code (incluidas)** | `/code-review`, `/security-review`, `/simplify`, `/run`, `/init` | Revisión adicional de PRs, arranque de la app | Vienen con Claude Code |
| **fullstack-dev-skills** (plugin) | `typescript-pro`, `api-designer`, `postgres-pro`, `nextjs-developer`, `react-expert`, `fastapi-expert`, `python-pro`, `rag-architect`, `playwright-expert`, `test-master`, `security-reviewer` | Referencia técnica por capa para los implementadores | Plugin ya instalado en el equipo del autor |
| **design** (plugin) | `ux-copy`, `accessibility-review` | Texto de UI no prescriptivo y WCAG 2.1 AA | Plugin `design` |
| **MCP** | Linear (proyecto `OncoLens-1`, equipo `L1D`, [tablero](https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues)) | Historias, estados, relaciones | Conector de Linear |
| **CLI** | `gh` (GitHub CLI) | PRs desde el orquestador | `brew install gh && gh auth login` |

## Hooks (`.claude/settings.json` + `.claude/hooks/`)

| Evento | Script | Efecto |
|---|---|---|
| `SessionStart` | `session-context.sh` | Inyecta changes activos y el último `S<n>-status.md` |
| `PreToolUse` Edit/Write | `guard-sensitive-paths.sh` | Bloquea `.env`, claves, certificados y rutas de datos reales |
| `PreToolUse` Edit/Write | `require-active-change.sh` | Sin change activo no se edita `apps/`, `packages/`, `infra/`. Hotfix: crear `.claude/HOTFIX` o `ONCOLENS_HOTFIX=1` |
| `PreToolUse` Bash `git commit *` | `pre-commit-gate.sh` | Escaneo de secretos/PII en lo staged + `openspec validate --all --strict` |

Permisos: `gh pr merge` y los `push` forzados o directos a `main` están **denegados**: el merge es
siempre humano. Los hooks requieren `python3` y `git`.

## Instalación

```bash
npm install -g @fission-ai/openspec@latest
openspec init --tools claude
openspec config profile
openspec update
brew install gh && gh auth login
chmod +x .claude/hooks/*.sh
```

En `openspec config profile` selecciona además `new, continue, ff, verify, bulk-archive, onboard`.
Después, en Claude Code: `/opsx:onboard` (opcional) y `/sprint-start S1`.

## Revisión de diseño (SOLID y CUPID)

`design-principles-reviewer` corre en el Gate 2 de cada change con código y, en modo lote, al
terminar el último change de un grupo de 2–3 relacionados (columna `lote` del plan). Orden:
**P1** lo que confunde a un agente (efecto lateral oculto, vocabulario ajeno al dominio, regla
duplicada, invariante mezclada) → **P2** (DIP, LSP de fakes, OCP por tipo) → **P3** (idiomático,
ISP, componible). Bloqueante si un P1 toca una RN; Mayor = refactor mínimo antes del PR; Menor =
nota en el PR. Insumos deterministas (US-213, FEAT-PL1, Sprint 1): `npm run quality` y
`npm run quality:report` → `reports/quality/latest.json`, con ESLint y Ruff (umbrales en
`quality-thresholds.json`, pendientes de definir en refinamiento) y `dependency-cruiser` e
`import-linter` para capas y DIP.

## Convenciones

- **Linear:** proyecto único **OncoLens-1** (`P-L1D-1`, equipo `L1D`, workspace `l1der-lab-mjbc`), tablero https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues. Features = issues padre; historias = sub-issues con milestone = sprint (`Pre-S1`, `Sprint 1`…`Sprint 6`, `Si hay capacidad`, `Post-MVP`). Ningún agente crea proyectos ni equipos; el Markdown de `backlog/` es la fuente y Linear el espejo.

- Change `l1d-<nn>-<slug>` · rama `feat/l1d-<nn>-<slug>` · PR `[L1D-<nn>] …`.
- Escenarios con `[US-xxx AC-n]` y `[AC-xx.y]`; tests con `US-xxx AC-n` en el nombre.
- Estado del sprint en `backlog/sprints/S<n>-{plan,status,trazabilidad,cierre}.md`.
- Prioridad de fuentes: `docs/PRD.md` v1.3 > `readme.md` > `CLAUDE.md`.
