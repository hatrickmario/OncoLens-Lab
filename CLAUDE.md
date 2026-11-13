# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado

**MVP académico construido y en `main`**, solo con datos sintéticos: `apps/web` (Next.js BFF con panel conversacional), `apps/clinical-api` (Express 5 + Prisma), `apps/rag-orchestrator` (FastAPI + LangGraph), `packages/` (`api-contracts`, `clinical-catalogs`, `clinical-language`, `test-support`), `infra/docker/` (Compose), `scripts/`, `contracts/`, `data/` (sintético y corpus público), `eval/`, `openspec/` (changes y specs) y `docs/architecture/adr/`. Lo que se construyó y lo que quedó fuera está en el «Estado actual» de `readme.md`. Repositorio público: https://github.com/hatrickmario/OncoLens-Lab (rama `main`, cambios vía PR). `prompts.md` vive solo en el repo (registro de prompts del Máster AI4Devs).

**Fase:** el MVP se entregó en los sprints Pre-S1 a S6 (Demo 6). El S7 trata **solo** de las mejoras del RAG que salieron del feedback de la Demo 6. Este fichero no registra resultados de sprint: el estado, los planes, las deudas y los cierres están en `backlog/sprints/S<n>-*.md`.

**Backlog:** Markdown en `backlog/` (fuente) y Linear como espejo, en el proyecto **OncoLens-1** ([tablero](https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues)). Features e historias en `backlog/features/FEAT-*.md`; índice, puntos y recortes en `backlog/features/README.md`; lo archivado fuera de Linear (Post-MVP y «si hay capacidad») en `backlog/sprints/V2-Post-MVP.md`; además `01-requisitos.md`, `02-adrs.md`, `03-trazabilidad.md` y `04-auditoria.md`. Cada Feature e historia lleva su `> Linear: L1D-NN` (o la marca de que no está publicada). Los IDs publicados (`US-xxx`, `ADR-<n>`, `DEC-<nn>`, `L1D-nn`) son **inmutables**. `backlog/_piloto-v1/` es la primera corrida, archivada: no leerla ni ampliarla. Documentación, dominio y valores de enums en **español** (`sintetico`, `requiere_revision`, `cuarentena_pii`, `analisis_ia`, `seed`, `no_mapeado`). Mantener ese idioma.

### Dónde está la verdad

| Fuente | Contenido |
|---|---|
| `readme.md` «Estado actual» | Lo construido en `main`, arquitectura *as-built*, instalación desde cero, calidad y límites conocidos |
| `readme.md` §2.3 | Estructura del monorepo (`apps/` + `packages/`, npm workspaces; `rag-orchestrator` es Python, fuera de los workspaces) |
| `docs/architecture/data-model.md` | Modelo de datos (PostgreSQL + Milvus), fuente única; lo implementan `apps/clinical-api/prisma/` y las migraciones Alembic del schema `corpus` |
| `apps/*/openapi.yaml` + `contracts/` | Contratos OpenAPI de ambos backends (fuente única); `contracts/examples/` alimenta los mocks; readme §4 conserva un extracto generado |
| `docs/architecture/adr/README.md` | Índice de los ADR desde el 39, con su estado (los #1–38 están en readme §3.3 y §6.1); las DEC, en `docs/decisions/` |
| `docs/process/` | Definition of Done (`definition-of-done.md`), CI (`ci.md`) y excepciones de ADR-26 |
| `readme.md` §6 | Tickets OL-01 a OL-06 con criterios de aceptación |
| `readme.md` §3.3, §6.1 | ADRs ya decididos (#1–38) con sus alternativas descartadas |
| `docs/PRD.md` §0 | Registro de cambios v1.1 (D-01…D-16), v1.2 (R-01…R-31), v1.3 (B-01…B-15) y v1.4 (E-01…E-19: refinamiento del Pre-S1 y decisiones posteriores del usuario, la última E-19, del 2026-11-07): explica por qué cambiaron el encuadre y el alcance |
| `docs/PRD.md` §5 / §6 | FR-01 a FR-30; reglas de negocio RN-01 a RN-30 |
| `docs/PRD.md` §16 | TBD-01 a TBD-21: lo no decidido |
| `docs/PRD.md` §17 | Trazabilidad FR → HU → endpoint → entidad → componente → sprint |
| `docs/PRD.md` §18 | Criterios de aceptación del MVP: `CAP-01`…`CAP-11`, transversales `T-1`…`T-5`, `AC-P.1`; escenarios `AC-xx.y` y medibles `M-xx.y`; supuestos `SUP-x` |
| `docs/PRD.md` §2 / §14 | Objetivos `G-1`…`G-16` y métricas de valor `VM-1`…`VM-6`; roadmap y gates |
| `readme.md` §5 | `HU-01`…`HU-26` y slicing |
| `backlog/` | Product Backlog en Markdown (fuente; Linear es el espejo) y, en `backlog/sprints/`, refinamiento, plan, deuda y cierre de cada sprint |
| `docs/demo/` · `docs/ux/` | Guías de demo por sprint; flujo E2E, sistema de diseño y pantallas por sprint |
| `docs/AS-IS.md` · `TO-BE.md` · `OncoLens-C4.drawio` | Discovery (entrevistas), solución por fases, diagramas C4 |

Antes de implementar, buscar la RN y el ADR correspondientes. Casi toda decisión está tomada y justificada; no reabrirla sin motivo. Si `readme.md` y `PRD.md` discrepan, manda la entrada más reciente del registro de cambios del PRD (§0); si el código y un documento discrepan, comprobar el código y preguntar antes de «corregir» cualquiera de los dos.

**Encuadre (D-01):** el producto entrega un **análisis de evidencia** (`EvidenceAnalysis`: síntesis, aplicabilidad, `evidenceOptions`, `discardedOptions`, `analysisBasis`), **no recomendaciones**. `recommendations[]` y `POST /platform/rag/query` de la v1.0 están reemplazados por `POST /platform/evidence-analyses`. Desde el S6 (PRD E-18, ADR-51) la interfaz principal es el **asistente conversacional** sobre el paciente (`/platform/patients/{id}/conversations`, `/platform/conversations/{id}/turns`), que cumple las mismas reglas (citas, NLI, persistir antes de responder). No reintroducir el vocabulario de "recomendación".

## Arquitectura: la regla de ownership

```
browser ──HTTPS──> web (Next.js, BFF)              único puerto publicado
       cookie sesión ↓
                   clinical-api (Node/Express 5)   dueño de PostgreSQL + clinical-minio
       JWT servicio ↓ (ES256/RS256)
                   rag-orchestrator (Python/FastAPI)  dueño de Milvus + schema `corpus`
                             ↓ host.docker.internal
                   LLM nativo (Ollama, Metal) — fuera de Docker
```

**`rag-orchestrator` no accede a datos clínicos.** Es el límite de seguridad del sistema, aplicado en varias capas: rol `rag_corpus` limitado al schema `corpus`, `REVOKE ALL` sobre `auth`/`identity`/`clinical`/`audit`/`research`, red `corpus-db-net`, `pg_hba` restringido, sin credenciales ni ruta hacia `clinical-minio`, y tests de CI de *permission denied*. Endpoints internos: `/chat/turn`, `/rag/query`, `/rag/follow-up` y `/health`; `/documents/extract` y `/case/summary` están en el contrato pero son Post-MVP (si se construyen, los PDFs llegan **en el cuerpo del request** y se procesan en memoria sin persistirse).

Invariantes fáciles de violar al escribir código:

- **La sesión del doctor nunca llega a Backend 2.** Cookie opaca (no JWT) hasta `clinical-api`; JWT de servicio asimétrico de ahí en adelante. No son intercambiables.
- **La identidad nunca sale de `clinical-api`** hacia IA, histórico, *logs* ni auditoría (RN-10). Cifrada con AES-256-GCM en la aplicación, schema `identity`, índice ciego HMAC-SHA256 para búsqueda exacta. Las claves solo existen ahí.
- **Desidentificar siempre, no "cuando haga falta"** (RN-11): `pseudoPatientId` aleatorio **por consulta** (nunca en el prompt), fechas relativas, texto libre enmascarado — también en eventos, tratamientos previos, faltantes y análisis previos.
- **Datos reales → solo modelos locales, sin *fallback* a la nube** (RN-12), aplicado por código en ambos backends y verificado por test.
- **El navegador solo habla con `web`**; los otros dos no publican puerto al host. El análisis y el chat van por Route Handlers (`app/api/evidence-analyses/`, `app/api/conversations/`), no Server Actions.
- **Nunca se emiten tokens del LLM sin validar.** Backend 2 valida citas y soporte NLI sobre la respuesta completa; Backend 1 persiste el `AIAnalysisRecord` **antes** de responder (RN-06). En el chat, el estado de LangGraph es efímero (`InMemorySaver` + TTL) y Backend 1 guarda el registro y rehidrata (ADR-51). Si se agrega streaming, es de progreso, nunca de contenido (TBD-08).
- **Normalización terminológica:** Backend 2 **propone** códigos con confianza; Backend 1 es **dueño** de la normalización final, incluidos los datos manuales (ADR-33).
- **Los *logs* nunca registran** identidad, PHI, secretos ni contenido/URL de documentos. Pacientes por UUID, `traceId` vía `X-Trace-Id`.

### Capas

- Backend 1: `Controller → Service → Repository` por módulo de dominio (`src/modules/<dominio>/*.{controller,service,repository,schema}.ts`), Zod en el borde. Módulos actuales en `src/modules/`: `auth`, `users`, `patients`, `case-view`, `completeness`, `clinical-attributes`, `prior-treatments`, `corrections`, `manual-entry`, `reconciliation`, `documents`, `opt-outs`, `evidence-analysis` (un solo módulo: gateway, historial, Base del análisis, seguimiento y conversaciones) y `compartido`. Composición en `src/composition.ts`; CLI de usuarios en `src/cli/oncolens.ts`.
- Backend 2: Hexagonal — `api/` → `application/` (`rag_orchestrator_service.py`, el grafo LangGraph del chat en `application/chat/`, ingesta del corpus y de la población) → `domain/` (reglas puras: umbral, `relevance_score`, citas, soporte, orden por aplicabilidad, normalización, regla de proveedores) + `infrastructure/` con un **Adapter** por modelo (`llm/`, `embeddings/`, `reranker/`, `nli/`) y por almacén (`milvus/`, `corpus/`), más `fake/` para los modos falsos; Pydantic en el borde; capas comprobadas con `import-linter`. Catálogo del corpus con Alembic. Scripts de ingesta y medición en `app/scripts/`.
- `packages/api-contracts/`: Backend 1 consume el cliente TS generado del OpenAPI de Backend 2 — un cambio incompatible rompe el build.
- **Build:** `web` usa Next.js 16.x con **Turbopack** (por defecto en `dev` y `build`); sin `webpack()` personalizado en `next.config` (si hiciera falta, ADR). `clinical-api` compila con `tsc` y usa `tsx` en desarrollo; sin bundler. Tests con Vitest (Vite por dentro, `vitest.config.ts` compartido); los Server Components asíncronos se prueban con Playwright.
- `packages/clinical-catalogs/`: **datos, no código** — JSON versionado (datos críticos, criterios de aplicabilidad, sinónimos, subconjuntos CIE-10/LOINC/CUPS/ATC, plantillas de preguntas), montado de solo lectura en ambos backends (`CLINICAL_CATALOG_PATH`). Versión distinta entre backends → `409`. Todo ítem tiene campo de destino en el modelo (RN-29).

## Comandos

Instalación completa desde cero (idempotente; secretos, modelos, Compose, migraciones, seed sintético, corpus y verificación): ver `readme.md` «Instalación desde cero».

```bash
bash scripts/demo/levantar.sh          # stack completo con modelos reales; LLM en Ollama FUERA de Docker (macOS no expone Metal)
bash scripts/demo/apagar.sh            # --borrar-datos elimina también los volúmenes
bash scripts/setup-secrets.sh          # solo secretos y certificados (infra/docker/secrets/, ignorado por git)

# Calidad (raíz del monorepo)
npm run lint && npm run format:check && npm run quality
npm run contracts:check                 # OpenAPI válido, ejemplos y vocabulario; contracts:breaking = oasdiff contra main
npm run catalog:validate                # catálogos clínicos
npm run evaluate                        # suite OL-06 (eval:required dice si el PR la exige)
npm run test:e2e                        # Playwright contra Compose con LLM_PROVIDER=fake
npm run smoke:compose                   # humo del stack con un proyecto de Compose propio

# Por app
npm test -w apps/clinical-api           # test:integration necesita PostgreSQL de test (scripts/test-integration.sh)
npm test -w apps/web
cd apps/rag-orchestrator && pytest      # requirements.txt + requirements-dev.txt, instalados con --only-binary=:all:
```

Desarrollo fuera de Compose: `npm run dev -w apps/clinical-api`, `npm run dev -w apps/web` y `uvicorn app.main:app --reload` en `apps/rag-orchestrator` (detalle en `readme.md` §1.4). Versiones de Node y Python en `.nvmrc` y `.python-version`.

**Modelos (ADR-39, aceptado):** Ollama nativo con `LLM_MODEL=gemma4:26b-a4b-it-q4_K_M`; *embeddings* BGE-M3 (int8; *dense* y *sparse*), *reranker* bge-reranker-v2-m3 (int8) y NLI mDeBERTa-v3 XNLI (fp32), en ONNX Runtime CPU dentro de `rag-orchestrator`, con revisión y SHA-256 fijados en configuración; chunks de 1024 tokens. `transformers` está prohibido en el runtime (solo exportación manual a ONNX). Restricciones duras: stack ≤ ~30 GB sin swap con el LLM local ≤ 21 GB (MacBook Pro M5 de 32 GB, PRD E-12) y consulta completa con p95 ≤ 20 s (PRD E-19; techo condicionado de 25 s solo con mejora de calidad medida; la CI usa 20 s), licencia académica y buen español. Cambiar los *embeddings* o el tamaño o solapamiento del chunk obliga a reindexar.

### Tests

Vitest + Supertest en `clinical-api`; Pytest + TestClient con adapters falsos en `rag-orchestrator`; Playwright E2E contra Compose con datos sintéticos; en la UI, además, `frontend-dev` se revisa a sí mismo con el loop visual (skill `visual-check`: Playwright MCP + Chrome DevTools MCP, solo `localhost` y seed sintético), que aporta evidencia pero no sustituye a los E2E. Parte del contrato, no extras: no-fuga de PII (incluida PII sembrada en texto libre, eventos, atributos y memoria de análisis), cifrado e índice ciego, CSRF/`Origin`, `403` por opt-out en toda generación con IA, `422` en registros sobre paciente egresado, clases de datos, *permission denied* del rol `rag_corpus`, un análisis previo nunca cuenta como soporte (RN-24), y lista de términos prescriptivos prohibidos (RN-23).

### Política TDD

**TDD proporcional al riesgo.** El TDD estricto se paga donde un error es caro y el ciclo aporta diseño; en el resto basta un test de comportamiento o de humo.

| Tipo de código | Disciplina | Evidencia que exige el Gate 2 |
|---|---|---|
| Reglas RN de dominio, services con lógica, endpoints, desidentificación, cifrado, autorización | **TDD estricto, doble bucle** | Commit `test(L1D-nn)` con el test de aceptación del AC en rojo antes de su `feat(L1D-nn)` |
| Componentes, hooks y Route Handlers simples de `web` | **Test del AC primero** (Testing Library + MSW); sin rojo por cada componente | Commit `test(L1D-nn)` del AC en rojo antes del `feat`; `visual-check` |
| Prompts, umbrales, modelos, catálogo, corpus | **Sin TDD**: suite `evaluate` (OL-06); la orquestación, con adapters falsos y TDD | Reporte de `ai-eval-runner` |
| Migraciones, Compose, CI, configuración, scripts | **Test después**: humo, integración o fixture de PR | El test o el fixture en el mismo PR |
| DEC, ADR, *spikes* | Exento (el código de un *spike* no se mergea) | — |

**Reglas (donde aplica TDD):**
- **Rojo → Verde → Refactor en doble bucle.** Bucle externo: el **test de aceptación** del AC (integración o E2E, con `[US-xxx AC-n]`) en rojo, en su commit `test(L1D-nn)`. Bucle interno: tests unitarios **uno a la vez**, del caso más simple al siguiente, con el **mínimo código** que pone cada uno en verde; entran con el commit `feat(L1D-nn)` cuando el de aceptación pasa.
- **El rojo falla en la aserción**, no en un import: si el símbolo no existe, el commit `test` incluye solo su esqueleto (firma + `throw new Error('no implementado')` / `raise NotImplementedError`).
- **Refactoriza solo en verde**, con los tests en verde antes y después. Refactorizar tests (renombrar, extraer *builders*) es válido en un commit `refactor(L1D-nn): tests` que no cambia aserciones.
- **Nunca borres, desactives ni debilites un test para que la suite pase**: prohibidos en los commits `.skip`, `.only`, `xit`, `fit`, `it.todo`, `@pytest.mark.skip`, `skipif`, `xfail` y las aserciones relajadas. Un test solo se quita si su AC cambió en la spec del change, con el *trailer* `Test-Removal: <motivo>` en el **último párrafo** del mensaje, junto a `Co-Authored-By` (si no, `git interpret-trailers` no lo ve; lo comprueba la CI); lo revisa el Gate 2.
- **Un test inestable es un bug del sprint:** se arregla o se quita con `Test-Removal:`; nunca cuarentena ni reintentos silenciosos. Sin *retries* en unitarios e integración; Playwright con `retries: 1` solo en la CI y con *trace*.
- **Determinismo:** el reloj y los generadores de IDs o seudónimos se inyectan y los tests los congelan (`vi.useFakeTimers`, `freezegun`); nada de `Date.now()`, `Math.random()` ni `uuid()` directos en dominio o services.

| Nivel | `web` | `clinical-api` | `rag-orchestrator` |
|---|---|---|---|
| Unitario (lógica pura, sin E/S) | Vitest + Testing Library | Vitest, **solo para lógica pura** (completitud, reconciliación, cifrado, orden, desidentificación); si un service con lógica lo necesita, recibe su repository por parámetro de una *factory* (sin contenedor de DI) y el test le pasa un fake | Pytest; adapters falsos en los puertos |
| Integración (**nivel principal de los backends**) | Vitest + MSW sobre `/api/*` | Supertest + **PostgreSQL real de test** (US-038) + MSW hacia `rag-orchestrator` y MinIO | `TestClient` + PostgreSQL `corpus` real + `respx` hacia el HTTP saliente; Milvus y LLM fingidos en su puerto |
| E2E (recorridos del PRD §13) | Playwright contra Compose con seed sintético y **LLM fingido** (respuestas fijas desde `contracts/examples/`) | ← | ← |

Los handlers de MSW y `respx` se construyen desde `contracts/examples/` (US-213): un mock no puede divergir del contrato. El LLM real solo corre en la suite `evaluate` y en la demo.

**Nombres de tests:** describen comportamiento, no la función llamada. `describe('<Unidad>')` + `it('<resultado esperado> cuando <escenario>')`; el **test de aceptación** termina en `[US-xxx AC-n]` (en Pytest, `test_<unidad>_<escenario>_<resultado>` y `@pytest.mark.ac("US-xxx", n)` en el de aceptación). En español, como el dominio. ❌ `it('calcularUmbral works')` · ✅ `it('devuelve sin_evidencia con topRelevanceScore null cuando ningún chunk supera el umbral [US-061 AC-3]')`.

**Mocks solo en los bordes arquitectónicos:** HTTP saliente (MSW, `respx`), LLM, embeddings, reranker, NLI, OCR, Milvus, MinIO y la nube. **Nunca** módulos propios (`vi.mock('./…')`, `vi.mock('@/…')`) ni Prisma; lo rápido y determinista (dominio, services, validación Zod, mapeos) va real. La BD es real en integración (los tests de `rag_corpus`, cifrado e índice ciego lo exigen). Los fakes cumplen el contrato del adapter real (LSP: `null` ≠ `0.0`, mismos errores).

**Calidad de los tests sin sobredimensionar:** cobertura de las **líneas cambiadas** como alerta en `reports/quality/latest.json` (US-213, AC-11), sin umbral global ni bloqueo, **salvo en un refactor**: ahí la cobertura del módulo no puede bajar respecto de `main` y bloquea (DoD, `docs/process/definition-of-done.md`); la lee `design-principles-reviewer` buscando lógica sin test y aserciones débiles. *Mutation testing* (StrykerJS, US-185): Post-MVP.

**TDD Guard:** retirado en el cierre del Pre-S1 (2026-10-13); la evidencia de TDD es el orden de commits `test → feat` que comprueba el Gate 2 (`.claude/README.md`).

**Modo `LLM_PROVIDER=fake`:** respuestas fijas para Compose, CI y E2E (US-034 AC-6); el LLM real solo corre en `evaluate` y en la demo.

**La evaluación de calidad de IA (OL-06) es obligatoria en cada PR que cambie modelo, prompt, umbral, catálogo o corpus** (el job `eval-required` de la CI lo detecta con `scripts/ci/eval-trigger-paths.yaml`; las mejoras de recuperación siguen el protocolo anti-sobreajuste de ADR-45). Metas iniciales (a recalibrar, TBD-02): recall@10 ≥ 0,80 (≥ 0,70 es→en), MRR ≥ 0,60, fidelidad ≥ 0,90, precisión de citas ≥ 0,90, "sin evidencia" ≥ 0,90, PII ≥ 0,95, eventos ≥ 0,95, mapeo terminológico ≥ 0,95, salidas prescriptivas = 0.

## Reglas de dominio con consecuencias en el código

- **Toda opción y toda afirmación generada mostrada** tiene ≥1 cita a un chunk recuperado en esa consulta (o enlace a un dato del paciente) **y** pasa el NLI (RN-01). Afirmaciones sobre datos del paciente: verbalización determinista + NLI (ADR-34). Opción sin soporte → `discardedOptions`; afirmación suelta → se omite y cuenta en `omittedClaims`.
- **Análisis previos entran como memoria rotulada, nunca citables** ni como soporte NLI (RN-24). Citas solo del corpus, copiadas de él, nunca del texto generado (RN-04); metadatos de fuente desde el catálogo, ausente → "No disponible" (RN-25).
- **Umbral de relevancia** (`RELEVANCE_THRESHOLD`, estricto `>` sobre el puntaje normalizado del *reranker*). **Sin chunks sobre el umbral → un único segundo loop**: la expansión contextual determinista con términos del caso tomados del catálogo (ADR-52, `QUERY_CONTEXT_EXPANSION_ENABLED`, activa) o la reescritura con el LLM local (PRD E-14, US-238, `QUERY_REWRITE_ENABLED`, hoy desactivada); términos solo del catálogo, la pregunta original manda, sin nube. **Si tampoco supera el umbral → "sin evidencia" sin invocar al LLM de generación**, con `top_relevance_score = null` (RN-02); `null` ≠ `0.0`. El NLI verifica afirmaciones generadas contra los chunks citados: no filtra la recuperación.
- **La población del estudio se extrae en la ingesta** (ADR-47): una tarea corta por documento y criterio, lista acotada `{value, chunkId, scope}` verificada con NLI; en la consulta los estados se calculan con reglas puras **solo con los fragmentos que cita la opción** (DEC-11: inclusiva o mezclada → Parcial; No coincide solo con restricción explícita; conflicto → Desconocido con ambos valores). Una salida inválida del LLM nunca descarta un análisis validado ni se reporta como «LLM no disponible».
- **`relevance_score`** = puntaje del *reranker* normalizado a [0,1], versionado, **metadato secundario** (RN-03): no ordena opciones ni mide solidez clínica. `clinical_evidence_score` reservado (TBD-09).
- **Aplicabilidad sin puntaje clínico** (RN-28): estados por criterio (Coincide / Parcial / No coincide / Desconocido); orden determinista: menos excluyentes en No coincide → más Coincide → relevancia como desempate. La opción hereda su fuente más aplicable. La UI muestra el criterio de orden.
- **Lenguaje no prescriptivo** (RN-23): encabezado "Opciones descritas en la evidencia"; nada de "recomendado para este paciente", "debe recibir", etc. Toda salida muestra "Generado por IA; requiere validación clínica independiente por el oncólogo tratante" y "Uso académico/investigación" (RN-19).
- **Códigos terminológicos solo del catálogo versionado**; sin mapeo → `no_mapeado`, nunca inventado ni descartado (RN-27).
- **Solo chunks `is_current` se recuperan**; el histórico del corpus nunca se borra (RN-05).
- **Autorización:** en el MVP solo RBAC (*qué acciones*). `admin` gestiona cuentas, altas de pacientes y opt-out, pero **no lee datos clínicos ni análisis** (mínimo privilegio, PRD v1.4 §11, E-04). El segundo plano, `CareTeamMember` (*sobre qué pacientes*, FR-15), pasa a Post-MVP porque la autorización por paciente la gestiona un sistema externo (PRD B-03); el esquema ya lo incluye.
- **Consentimiento presunto con opt-out** (RN-15): los consentimientos viven en un sistema externo; con convenio registrado el paciente está incluido salvo marca de opt-out del administrador. Opt-out de `analisis_ia` → `403` en **toda** generación con IA (chat, análisis, seguimiento, re-ejecución, resumen del caso). Sin convenio no se presume.
- **Paciente egresado no admite ningún registro** hasta su reactivación (RN-17). Solo bloquean las reglas legales y de acceso; los avisos clínicos (faltantes, sin verificar, conflicto, desactualizado) **no bloquean** (RN-26).
- **Todo valor "a calibrar" vive en configuración** (RN-22): umbrales, TTL de sesión, *rate limits* (RN-30), retención, edad de mayoría (sin asumir país), `ENABLED_CANCER_TYPES`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`.
- **Modelo de diagnóstico genérico** (`staging_system`/`stage_value`, `performance_scale`/`performance_value`) para cubrir TNM y grupos de riesgo sin cambiar el esquema; en próstata, Gleason/grupo ISUP va en `Diagnosis.grade` (PRD B-08). Mama y próstata vía `ENABLED_CANCER_TYPES`; leucemia solo al cumplir el criterio de "listo" (RN-20).

## Datos y repositorio público

Repo **público**: nunca datos reales (ni anonimizados) ni secretos (RN-14); CI escanea secretos y PII. En `data/`, solo datos sintéticos, corpus público con licencia y definiciones de datasets; los reales anonimizados viven fuera del repo, en volumen cifrado.
**Ningún dato real entra a la aplicación** (RN-13): el MVP es solo sintético y el gate G-Piloto es Post-MVP (ver abajo); `REAL_*_ENABLED` queda en `false`. **Solo fuentes públicas de acceso abierto con licencia registrada y aceptada** (RN-21): dominio público, CC BY, CC BY-SA; CC BY-NC solo en el MVP académico; ND excluida. NCCN y ESMO excluidas mientras no se gestione su licencia (no bloquea el MVP) — ni siquiera en ejemplos: su nombre solo aparece como fuente **no incluida** (`sourcesNotIncluded`, `excluded_sources`), nunca su contenido (Pre-S1, 2026-10-09).

## Dinámica por sprint

1. **Refinamiento** (`/sprint-refine`): requisitos hasta cumplir la Definition of Ready, ADRs y DEC del sprint (3 propuestas con exploración solo si revertir es caro), entrevista al humano con las respuestas **registradas en la historia**, y ajuste del slicing solo con aprobación (Markdown primero, Linear después).
2. **Stack** (`/sprint-refine`): preparar la máquina; dependencias del repo dentro de su historia; mejoras solo vía ADR.
3. **UI/UX** (`/sprint-refine`): en el Pre-S1, flujo E2E del happy path y sistema de diseño en `docs/ux/`; en cada sprint, sus pantallas coherentes con ese sistema (3 variantes solo con riesgo de UX nuevo). `frontend-dev` y `visual-check` usan `docs/ux/` como referencia.
4. **Ejecución** (`/sprint-start` → `/sprint-run`): lo independiente en paralelo y lo dependiente en secuencia; ante una situación crítica el orquestador se pausa y la sesión principal entrevista al humano. Merges humanos, por oleada.
5. **Review y retro** (`/sprint-close`): demo, resumen de lo implementado y mejoras críticas del proceso agéntico, sin aplicarlas.

**Ritmo, presupuesto y meta de cierre de cada sprint (usuario, 2026-10-29, `backlog/sprints/S3-cierre.md` §9):**
- Cada sprint dura de 1 a 2 días y se ejecuta con la suscripción Max de 100 USD dedicada al proyecto. El compromiso se fija por capacidad y presupuesto de uso, no solo por puntos.
- Meta de cierre: ≥ 80 % de las historias comprometidas **cerradas**, según la definición de `docs/process/definition-of-done.md` («Historia cerrada»).
- Si no alcanza, se recorta según la prioridad del sprint fijada en su refinamiento.
- Si no hay datos reales o anonimizados, las demos se hacen solo con pacientes sintéticos.

**Verificación de CI antes de pedir un merge (usuario, 2026-10-24):** tras subir cambios a una rama con PR, espera a que la CI termine y no le pidas al humano el merge hasta tener 0 checks en fallo, 0 pendientes y 0 alertas abiertas. Si algo falla, lee el log, corrige o pregunta, y vuelve a verificar. Lo recuerda el *hook* `pr-checks-reminder` (PostToolUse en `git push` y `gh pr create`).

**Plugin Superpowers (uso selectivo, `[S3 resp. 4]`, 2026-10-23):** instalado a nivel de usuario. **El flujo del proyecto manda:** OpenSpec, `/sprint-*`, `implement-story`, `gate-review` y la política TDD de este fichero sustituyen a `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `using-git-worktrees`, `test-driven-development`, `requesting-code-review` y `finishing-a-development-branch`, que **no se usan** aunque el *hook* de inicio de sesión las sugiera. Solo se usan `superpowers:systematic-debugging` (fallos de CI o tests rojos inesperados), `superpowers:verification-before-completion` (antes de marcar una tarea `[x]` o declarar un PR listo: nada `[x]` sin evidencia ejecutada) y `superpowers:receiving-code-review` (al responder a hallazgos de Gate 2).

## Roadmap y ADR

El roadmap (PRD §14) y el alcance vigente están en el registro de cambios del PRD (E-15…E-19) y en `backlog/sprints/`: cada sprint tiene su refinamiento, su plan y su cierre. ADR y DEC, con su estado, en `docs/architecture/adr/README.md` y `docs/decisions/`; antes de proponer un ADR nuevo, comprobar que no exista uno pendiente con el mismo número o tema.

## Diseño Post-MVP (no construido)

Fuera del MVP por decisión del usuario (PRD E-17 y E-18). El diseño se conserva en el PRD y el readme; si una historia lo retoma, estas reglas siguen siendo invariantes:

- **OCR e ingesta de documentos clínicos:** dos ejes independientes por dato extraído: `extraction_confidence` (calculada con **señales deterministas, nunca la confianza autorreportada por el LLM**) y `review_status`. Todo entra al RAG **etiquetado**; los `rechazado`/`reemplazado` nunca (RN-07). **Un dato extraído nunca reemplaza en silencio a uno verificado** (RN-08): en diagnósticos decide la fecha (anterior → histórico; posterior o sin fecha confiable → `requiere_revision` + `conflicts_with_id`); duplicados entre documentos = un solo dato con varias fuentes (`ClinicalDataSource`). **`Document` es la cola de extracción** (`SKIP LOCKED`, `attempts`, `processing_started_at`); `checksum` detecta duplicados (409); sin broker; carga múltiple `POST …/documents/batch` (`207`). Detección de nombres en documentos con el OCR (ADR-40). Meta de OCR por campo crítico ≥ 0,95.
- **Datos reales y gate G-Piloto** (RN-13): `oncolens preflight real-data` verifica los prerrequisitos y `clinical-api` no arranca con `REAL_*_ENABLED=true` si falla alguno; los reales anonimizados viven fuera del repo, en volumen cifrado; tests de gate G-Piloto. Pendiente: si *mutation testing* (US-185) es condición del gate.
- **Agente acotado** (FR-30): búsqueda complementaria con límites de iteraciones, sub-consultas y *deadline* en configuración (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`); su resultado pasa por la misma validación.
- **Memoria de análisis previos** (US-189…192): sigue valiendo RN-24 (nunca citables ni soporte); cascada de desactualizado.
- **Equipo tratante** (`CareTeamMember`, FR-15), decisión registrada, ciclo de vida, job de retención y observabilidad (ADR-44).

El backlog se trabaja con la skill `decompose-prd` (F0 preparación → F1 `requirements-analyst` → F2 `architecture-advisor` → F3 `backlog-writer` → F4 `backlog-auditor` → F5 cierre → F6 publicación en Linear **solo con aprobación explícita**). Los subagentes leen este fichero del disco: si se edita, correr el workflow en una sesión nueva. Destino: proyecto `OncoLens-1` (`P-L1D-1`), equipo `L1D`, workspace `l1der-lab-mjbc`; tablero: https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues. **Todo** issue de OncoLens va a ese proyecto: no crear proyectos ni equipos nuevos. Cada sprint es un **milestone** del proyecto («Sprint 7», …), no un ciclo del equipo. El desarrollo por sprints (`/sprint-start`, `/sprint-run`, `/sprint-close`) lee y actualiza ese mismo proyecto; ver `.claude/README.md`.
