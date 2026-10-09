# OncoLens · Configuración de Claude Code + OpenSpec

Propuesta B (implementadores por bounded context + guardianes transversales), con
`bulk-archive` y `traceability-auditor` solo al cierre de cada sprint, y un `sprint-orchestrator`
en segundo plano para la fase de ejecución. Alineada con el **PRD v1.3** (slicing v2).

## Flujo de un sprint

```
/sprint-start S<n>   (sesión principal · humano aprueba; también Pre-S1)       → PR de planificación → merge humano
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
| `frontend-dev` | sonnet | UI de `apps/web` (Atomic Design); se revisa a sí mismo con el loop visual | Hereda; **worktree**; Playwright MCP + Chrome DevTools MCP (solo este agente) |
| `privacy-guardian` | opus | PII, desidentificación, aislamiento de Backend 2, datos reales, secretos; en `apps/web`, OWASP web (XSS, secretos en el bundle, CSP y clickjacking, CSRF, validación, dependencias) | Solo lectura |
| `contract-keeper` | sonnet | Contract-first y provider-driven: spec antes que el código, nada generado a mano, oasdiff, verificación del proveedor, secuencia `contract → test → feat → refactor` | Solo lectura |
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
| `sprint-close` | Solo manual `/sprint-close S<n>` | Cierra el sprint (pasos 1–6), incluido `/security-review` sobre el diff del sprint |
| `implement-story` | Orquestador o `/implement-story L1D-<nn>` | Una historia de punta a punta hasta el PR |
| `backlog-to-change` | `/sprint-start` o manual | Historia → `/opsx:propose` con trazabilidad |
| `gate-review` | `/sprint-start` (gate1), orquestador (gate2) | Guardianes en paralelo + veredicto consolidado |
| `sync-contracts` | Implementadores (primera tarea de `## contratos`) | Spec del proveedor → validar → oasdiff → generar tipos, clientes y Zod/Pydantic → commit `contract(L1D-nn)` |
| `run-ai-eval` | Implementadores, Gate 2, `/sprint-close` | Fork en `ai-eval-runner` |
| `visual-check` | `frontend-dev` (precargada), tras el verde y antes del refactor | Loop visual: estados, consola, red, accesibilidad, rendimiento y capturas en navegador real contra Compose local con seed sintético; evidencia para el Gate 2 |
| `preflight-real-data` | Solo manual | Checklist de G-Piloto (S6) |
| `decompose-prd` | Ya existía | PRD → backlog — **actualizada a PRD v1.3** |

## Skills estándar necesarias (no se crean aquí)

| Origen | Skills | Para qué | Cómo se obtienen |
|---|---|---|---|
| **OpenSpec** (perfil extendido) | `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:update`, `/opsx:sync`, `/opsx:archive`, `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard` | Ciclo SDD; `verify` y `bulk-archive` son imprescindibles | Ya generados en el repo (`.claude/commands/opsx/`); cada máquina configura el perfil (ver Instalación) |
| **Claude Code (incluidas)** | `/code-review`, `/security-review`, `/simplify`, `/run`, `/init` | Revisión adicional de PRs, arranque de la app | Vienen con Claude Code |
| **fullstack-dev-skills** (plugin) | `typescript-pro`, `api-designer`, `postgres-pro`, `nextjs-developer`, `react-expert`, `fastapi-expert`, `python-pro`, `rag-architect`, `playwright-expert`, `test-master`, `security-reviewer` | Referencia técnica por capa para los implementadores | Plugin ya instalado en el equipo del autor |
| **design** (plugin) | `ux-copy`, `accessibility-review` | Texto de UI no prescriptivo y WCAG 2.1 AA | Plugin `design` |
| **MCP (loop visual)** | Playwright MCP (`@playwright/mcp@0.0.83`) · Chrome DevTools MCP (`chrome-devtools-mcp@1.10.1`) | Que `frontend-dev` vea su propio output | Declarados inline en `frontend-dev` (`mcpServers`); se arrancan con `npx` solo mientras corre ese agente |
| **MCP** | Linear (proyecto `OncoLens-1`, equipo `L1D`, [tablero](https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues)) | Historias, estados, relaciones | Conector de Linear |
| **CLI** | `gh` (GitHub CLI) | PRs desde el orquestador | `brew install gh && gh auth login` |

## Hooks (`.claude/settings.json` + `.claude/hooks/`)

| Evento | Script | Efecto |
|---|---|---|
| `SessionStart` | `session-context.sh` | Inyecta changes activos y el último `S<n>-status.md` |
| `PreToolUse` Edit/Write | `guard-sensitive-paths.sh` | Bloquea `.env`, claves, certificados y rutas de datos reales |
| `PreToolUse` Edit/Write | `require-active-change.sh` | Sin change activo no se edita `apps/`, `packages/`, `infra/`. Hotfix: crear `.claude/HOTFIX` o `ONCOLENS_HOTFIX=1` |
| `PreToolUse` Edit/Write | `guard-generated.sh` | Bloquea la edición manual de lo generado desde el spec (`packages/api-contracts/src/`, que incluye los schemas Zod compartidos en `src/zod/`, y `apps/rag-orchestrator/app/schemas/generated/`): se regenera con `npm run contracts:generate` |
| `PreToolUse` Bash `git commit *` | `pre-commit-gate.sh` | Escaneo de secretos/PII en lo staged · **higiene de tests**: bloquea `.skip`/`.only`/`xit`/`xfail` añadidos y tests eliminados sin el *trailer* `Test-Removal:` (mover un test no cuenta) · `openspec validate --all --strict` |
| `PreToolUse` Write/Edit, **solo en `clinical-platform-dev`** (frontmatter) | `tdd-guard-pilot.sh` | Piloto de TDD Guard en el S1: bloquea implementación sin test en rojo y registra decisión y latencia en `reports/tdd-guard/pilot.jsonl`; inactivo si `tdd-guard` no está instalado |
| `PreToolUse` `mcp__playwright__*`, `mcp__chrome-devtools__*` | `guard-visual-loop.sh` | Loop visual solo contra `localhost`/`127.0.0.1` y nunca con `REAL_ANONYMIZED_ENABLED`/`REAL_IDENTIFIED_ENABLED` activos (entorno o `.env`) |

Permisos: `gh pr merge` y los `push` forzados o directos a `main` están **denegados**: el merge es
siempre humano. Los hooks requieren `python3` y `git`.

## Instalación

Los comandos `/opsx:*` (`.claude/commands/opsx/`) y las skills `openspec-*` ya están en el repo,
generados con OpenSpec 1.14.1 y el perfil extendido. Cada desarrollador solo configura su máquina:

```bash
npm install -g @fission-ai/openspec@latest
openspec config set profile custom
openspec config set workflows '["propose","explore","new","continue","apply","update","ff","sync","archive","bulk-archive","verify","onboard"]'
brew install gh && gh auth login
chmod +x .claude/hooks/*.sh
```

Tras actualizar OpenSpec, `openspec update` regenera esos archivos (commit aparte, sin editarlos a
mano). Después, en Claude Code: `/opsx:onboard` (opcional) y `/sprint-start S1`.

## Loop visual del frontend (Playwright MCP + Chrome DevTools MCP)

`frontend-dev` comprueba su propio output en un navegador real sin que nadie abra el navegador
(skill `visual-check`): con los AC en verde y antes del refactor recorre los estados del change y
revisa consola, red, accesibilidad, rendimiento y capturas a 375 y 1280 px.

| Herramienta | Para qué |
|---|---|
| Playwright MCP | Recorrer flujos y leer el árbol de accesibilidad (barato en tokens); capturas por breakpoint |
| Chrome DevTools MCP | Consola (violaciones de CSP, hidratación), red (solo `/api/*`, sin PII en URLs, `Origin`, cookies) y trazas de rendimiento |

Reglas:
- **Privacidad.** Lo que ve el navegador entra al contexto del modelo, que corre en la nube: solo
  `localhost` y seed sintético. El hook `guard-visual-loop.sh` lo impone (`--allowed-origins` de
  Playwright MCP no es una frontera de seguridad). Chrome DevTools MCP arranca con
  `--no-performance-crux --no-usage-statistics`: por defecto enviaría las URLs de las trazas y
  estadísticas a Google.
- **Evidencia, no gate.** El gate son los tests E2E de la CI. Cada fallo del loop se convierte
  primero en un test en rojo. El Gate 2 exige el bloque `## visual-check` (PASS o PENDIENTE con
  motivo) y pasa la sección Red a `privacy-guardian` y la de Estados a `clinical-language-auditor`.
- **Un loop a la vez.** Los worktrees comparten los puertos del Compose: candado en
  `$(git rev-parse --git-common-dir)/oncolens-visual-check.lock`.
- **Solo en `frontend-dev`.** Los servidores se declaran inline en su frontmatter: sus herramientas
  no cargan el contexto de la sesión principal ni del orquestador. Versiones fijadas; se suben a
  mano, en un commit propio.
- Las capturas van a `reports/visual/` (ignorado por git).

## Enfoque del backend: SDD + contract-first + TDD, provider-driven

| Enfoque | Dónde se aplica |
|---|---|
| **SDD** (OpenSpec) | Un change por historia; `proposal → specs → design → tasks` antes del código; Gate 1 sobre artefactos; `/opsx:verify` sobre el código; hook "sin change activo no hay código" |
| **Contract-first / spec-first** | `apps/<backend>/openapi.yaml` es la fuente única (US-033). El spec y `contracts/examples/` cambian **antes** que el código (`sync-contracts`, primera tarea de `## contratos`, commit `contract(L1D-nn)`); tipos, clientes y Zod/Pydantic se **generan**; `contracts:breaking` (oasdiff) contra `main`; hook `guard-generated.sh` |
| **Provider-driven** | Cada backend es proveedor de su contrato y lo **verifica** en sus tests de integración (respuestas validadas contra su spec, US-214); los consumidores solo usan clientes generados. Sin Pact: un equipo, dos consumidores conocidos, contrato congelado en Pre-S1 |
| **TDD** | Por AC: `test(L1D-nn)` en rojo (falla por la razón esperada) → `feat(L1D-nn)` en verde → `refactor(L1D-nn)`; el reporte incluye la salida en rojo y en verde; el Gate 2 comprueba la secuencia de commits |

Secuencia de commits de un change con API: `contract → test → feat → refactor`. `contract-keeper`
la verifica en el Gate 2.

## TDD: política, niveles y piloto de TDD Guard

La política vive en `CLAUDE.md` (Política TDD): **TDD proporcional al riesgo** (matriz: estricto en
doble bucle en reglas RN, services con lógica y endpoints; test del AC primero en UI; test después
en migraciones, infra y configuración; `evaluate` en prompts y modelos; DEC, ADR y *spikes* exentos).
La aplican cuatro capas, de la más barata a la más cara:

| Capa | Qué impide | Cómo |
|---|---|---|
| `pre-commit-gate.sh` (determinista, local) | Desactivar o borrar tests para pasar la suite | Bloquea el commit; `Test-Removal: <motivo>` solo si el AC cambió en la spec |
| Lint de tests en la CI (US-213) | Lo mismo en la CI, ACs sin test de aceptación, `vi.mock` de módulos propios; cobertura de líneas cambiadas como alerta | `@vitest/eslint-plugin`, `no-restricted-syntax`, `flake8-pytest-style`, `check-ac-coverage` y `diff-cover` |
| `gate-review` (Gate 2) | Orden `test → feat`, rojo y verde con evidencia, higiene, nombres | Evidencia del implementador + diff; mocks fuera del borde los reporta `design-principles-reviewer` (hallazgo 7) |
| Piloto TDD Guard (S1, `clinical-platform-dev`) | Implementar sin test en rojo o más de lo que pide el test, **mientras se edita** | Hook de su frontmatter; un modelo valida cada edición |

**Por qué TDD Guard solo como piloto:** es el único control que actúa durante la edición y no
después, pero añade una llamada a un modelo por edición y su propio README recomienda empezar con
su sucesor, Probity, cuyas instrucciones de TDD aún son más básicas. El piloto mide si su valor
compensa la latencia y los falsos positivos; la retro del S1 decide (`sprint-close`, paso 5).

Montaje del piloto (una vez por máquina y en el primer change de `clinical-api` que cree
`vitest.config.ts`):

```bash
npm install -g tdd-guard
npm install --save-dev tdd-guard-vitest   # en apps/clinical-api
```

En `apps/clinical-api/vitest.config.ts`, el reporter con la raíz **calculada** (cada worktree tiene
otra ruta): `reporters: ['default', ['tdd-guard-vitest', { projectRoot: path.resolve(__dirname, '../..') }]]`.
Valida con el modelo por defecto de TDD Guard a través del SDK de Claude Code (sin API key aparte).
Su configuración **sí está versionada** (`.claude/tdd-guard/data/config.json`, para que cada worktree
la tenga): `ignorePatterns` con los valores por defecto de TDD Guard más lo que la matriz no exige en
TDD estricto (Prisma, SQL, migraciones, infra, CI, contratos, lo generado y la configuración). El
resto de sus datos (`.claude/tdd-guard/data/*`) y las métricas del piloto (`reports/tdd-guard/`) están
en `.gitignore`. El piloto termina en la retro del S1, sin prórroga.

**Mutation testing:** StrykerJS sobre auth, autorización y cifrado es US-185 (S6, si hay capacidad,
PRD B-13 y G-10); no se adelanta sin decisión de planning.

## Revisión de diseño (SOLID y CUPID)

`design-principles-reviewer` corre en el Gate 2 de cada change con código y, en modo lote, al
terminar el último change de un grupo de 2–3 relacionados (columna `lote` del plan). Orden:
**P1** lo que confunde a un agente (efecto lateral oculto, vocabulario ajeno al dominio, regla
duplicada, invariante mezclada) → **P2** (DIP, LSP de fakes, OCP por tipo) → **P3** (idiomático,
ISP, componible). Bloqueante si un P1 toca una RN; Mayor = refactor mínimo antes del PR; Menor =
nota en el PR. En `apps/web` revisa además la regla de oro (componentes `.tsx`: 100 líneas = alerta para
revisar si hay más de un concepto, 150 líneas = límite duro de la CI; dividir siempre por concepto) y el uso de custom hooks, compound components, render
props y providers en ambas direcciones: falta de patrón y sobre-patronear (YAGNI primero). Insumos deterministas (US-213, FEAT-PL1, Sprint 1): `npm run quality` y
`npm run quality:report` → `reports/quality/latest.json`, con ESLint y Ruff (umbrales en
`quality-thresholds.json`, pendientes de definir en refinamiento) y `dependency-cruiser` e
`import-linter` para capas y DIP.

## Convenciones

- **Linear:** proyecto único **OncoLens-1** (`P-L1D-1`, equipo `L1D`, workspace `l1der-lab-mjbc`), tablero https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues. Features = issues padre; historias = sub-issues con milestone = sprint (`Pre-S1`, `Sprint 1`…`Sprint 6`, `Si hay capacidad`, `Post-MVP`). Ningún agente crea proyectos ni equipos; el Markdown de `backlog/` es la fuente y Linear el espejo.

- Change `l1d-<nn>-<slug>` · rama `feat/l1d-<nn>-<slug>` · PR `[L1D-<nn>] …`.
- Escenarios con `[US-xxx AC-n]` y `[AC-xx.y]`; tests con `US-xxx AC-n` en el nombre.
- Estado del sprint en `backlog/sprints/S<n>-{plan,status,trazabilidad,cierre}.md`.
- Prioridad de fuentes: `docs/PRD.md` v1.3 > `readme.md` > `CLAUDE.md`.
