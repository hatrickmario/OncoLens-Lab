# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado

**Aún no hay código.** Solo `readme.md` (especificación), `docs/`, `.claude/` (agentes y skill para el backlog) y `backlog/` (Markdown); todo `apps/`, `packages/`, `infra/`, `scripts/`, `specs/`, `data/` y `docs/architecture/adr/` está por crear. Repositorio público: https://github.com/hatrickmario/OncoLens-Lab (rama `main`, cambios vía PR). `prompts.md` vive solo en el repo (registro de prompts del Máster AI4Devs).

**Backlog:** completo y publicado en Linear (2026-10-07) en el proyecto **OncoLens-1** ([tablero](https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues)): 45 Features (`L1D-5`…`L1D-49`) y 218 historias (`L1D-50`…`L1D-267`; US-213…US-217 = L1D-263…L1D-267, añadidas el 2026-10-08/09) en `backlog/features/FEAT-*.md`, con `01-requisitos.md`, `02-adrs.md`, `03-trazabilidad.md` y `04-auditoria.md`; índice, puntos por sprint y recortes en `backlog/features/README.md`. Cada Feature e historia lleva su `> Linear: L1D-NN`. Los IDs publicados (`US-xxx`, `ADR-<n>`, `DEC-<nn>`) son **inmutables**; el Markdown es la fuente y Linear el espejo. `backlog/_piloto-v1/` es la primera corrida, archivada: no leerla ni ampliarla. Documentación, dominio y valores de enums en **español** (`sintetico`, `requiere_revision`, `cuarentena_pii`, `analisis_ia`, `seed`, `no_mapeado`). Mantener ese idioma.

### Dónde está la verdad

| Fuente | Contenido |
|---|---|
| `readme.md` §2.3 | Árbol objetivo (monorepo `apps/` + `packages/`, npm workspaces) |
| `readme.md` §3.1 | DDL de PostgreSQL + schema de Milvus; la migración inicial lo implementa **entero** (OL-01) |
| `readme.md` §4.1 / §4.2 | Contratos OpenAPI de ambos backends |
| `readme.md` §6 | Tickets OL-01 a OL-06 con criterios de aceptación |
| `readme.md` §3.3, §6.1 | ADRs ya decididos (#1–38) con sus alternativas descartadas |
| `docs/PRD.md` §0 | Registro de cambios v1.1 (D-01…D-16), v1.2 (R-01…R-31) y v1.3 (B-01…B-15, alineación con el backlog): explica por qué cambió el encuadre y el alcance |
| `docs/PRD.md` §5 / §6 | FR-01 a FR-30; reglas de negocio RN-01 a RN-30 |
| `docs/PRD.md` §16 | TBD-01 a TBD-21: lo no decidido |
| `docs/PRD.md` §17 | Trazabilidad FR → HU → endpoint → entidad → componente → sprint |
| `docs/PRD.md` §18 | Criterios de aceptación del MVP: `CAP-01`…`CAP-11`, transversales `T-1`…`T-5`, `AC-P.1`; escenarios `AC-xx.y` y medibles `M-xx.y`; supuestos `SUP-x` |
| `docs/PRD.md` §2 / §14 | Objetivos `G-1`…`G-16` y métricas de valor `VM-1`…`VM-6`; roadmap Pre-S1 + S1–S6 y gates G-Demo / G-Piloto / G-Éxito |
| `readme.md` §5 | `HU-01`…`HU-26` y slicing |
| `backlog/` | Product Backlog en Markdown (fuente); Linear es el espejo |
| `docs/AS-IS.md` · `TO-BE.md` · `OncoLens-C4.drawio` | Discovery (entrevistas), solución por fases, diagramas C4 |

Antes de implementar, buscar la RN y el ADR correspondientes. Casi toda decisión está tomada y justificada; no reabrirla sin motivo. Si `readme.md` y `PRD.md` discrepan, el PRD v1.3 es el más reciente.

**Encuadre (D-01):** el producto entrega un **análisis de evidencia** (`EvidenceAnalysis`: síntesis, aplicabilidad, `evidenceOptions`, `discardedOptions`, `analysisBasis`), **no recomendaciones**. `recommendations[]` y `POST /platform/rag/query` de la v1.0 están reemplazados por `POST /platform/evidence-analyses`. No reintroducir el vocabulario de "recomendación".

## Arquitectura: la regla de ownership

```
browser ──HTTPS──> web (Next.js, BFF)              único puerto publicado
       cookie sesión ↓
                   clinical-api (Node/Express 5)   dueño de PostgreSQL + clinical-minio
       JWT servicio ↓ (ES256/RS256)
                   rag-orchestrator (Python/FastAPI)  dueño de Milvus + schema `corpus`
                             ↓ host.docker.internal
                   LLM nativo (Ollama/vLLM, Metal) — fuera de Docker
```

**`rag-orchestrator` no accede a datos clínicos.** Es el límite de seguridad del sistema, aplicado en varias capas: rol `rag_corpus` limitado al schema `corpus`, `REVOKE ALL` sobre `auth`/`identity`/`clinical`/`audit`/`research`, red `corpus-db-net`, `pg_hba` restringido, sin credenciales ni ruta hacia `clinical-minio`, y tests de CI de *permission denied*. Recibe los PDFs **en el cuerpo del request** y los procesa en memoria sin persistirlos. Endpoints internos: `/rag/query`, `/documents/extract`, `/case/summary`.

Invariantes fáciles de violar al escribir código:

- **La sesión del doctor nunca llega a Backend 2.** Cookie opaca (no JWT) hasta `clinical-api`; JWT de servicio asimétrico de ahí en adelante. No son intercambiables.
- **La identidad nunca sale de `clinical-api`** hacia IA, histórico, *logs* ni auditoría (RN-10). Cifrada con AES-256-GCM en la aplicación, schema `identity`, índice ciego HMAC-SHA256 para búsqueda exacta. Las claves solo existen ahí.
- **Desidentificar siempre, no "cuando haga falta"** (RN-11): `pseudoPatientId` aleatorio **por consulta** (nunca en el prompt), fechas relativas, texto libre enmascarado — también en eventos, tratamientos previos, faltantes y análisis previos.
- **Datos reales → solo modelos locales, sin *fallback* a la nube** (RN-12), aplicado por código en ambos backends y verificado por test.
- **El navegador solo habla con `web`**; los otros dos no publican puerto al host. El análisis va por Route Handler (`app/api/evidence-analyses/route.ts`), no Server Action.
- **Nunca se emiten tokens del LLM sin validar.** Backend 2 valida citas y soporte NLI sobre la respuesta completa; Backend 1 persiste el `AIAnalysisRecord` **antes** de responder (RN-06). Si se agrega streaming, es de progreso, nunca de contenido (TBD-08).
- **Normalización terminológica:** Backend 2 **propone** códigos con confianza; Backend 1 es **dueño** de la normalización final, incluidos los datos manuales (ADR-33).
- **Los *logs* nunca registran** identidad, PHI, secretos ni contenido/URL de documentos. Pacientes por UUID, `traceId` vía `X-Trace-Id`.

### Capas

- Backend 1: `Controller → Service → Repository` por módulo de dominio (`src/modules/<dominio>/*.{controller,service,repository,schema}.ts`), Zod en el borde. `evidence-analysis` es **un solo módulo** (gateway, historial, analysis-basis, analysis-memory, stale-detector). `workers/` aloja la cola de extracción y el job de mayoría de edad.
- Backend 2: Hexagonal — `api/` → `application/` (incluye el agente acotado dentro de `RAGOrchestratorService`) → `domain/` (reglas puras: umbral, `relevance_score`, citas, soporte, orden por aplicabilidad, confianza OCR, normalización, regla de proveedores) + `infrastructure/` con un **Adapter** por modelo (`llm/`, `embeddings/`, `reranker/`, `nli/`, `ocr/`, `pii/`), Pydantic en el borde. Catálogo del corpus con Alembic.
- `packages/api-contracts/`: Backend 1 consume el cliente TS generado del OpenAPI de Backend 2 — un cambio incompatible rompe el build.
- **Build:** `web` usa Next.js 16.x con **Turbopack** (por defecto en `dev` y `build`); sin `webpack()` personalizado en `next.config` (si hiciera falta, ADR). `clinical-api` compila con `tsc` y usa `tsx` en desarrollo; sin bundler. Tests con Vitest (Vite por dentro, `vitest.config.ts` compartido); los Server Components asíncronos se prueban con Playwright.
- `packages/clinical-catalogs/`: **datos, no código** — JSON versionado (datos críticos, criterios de aplicabilidad, sinónimos, subconjuntos CIE-10/LOINC/CUPS/ATC, plantillas de preguntas), montado de solo lectura en ambos backends (`CLINICAL_CATALOG_PATH`). Versión distinta entre backends → `409`. Todo ítem tiene campo de destino en el modelo (RN-29).

## Comandos (ninguno existe todavía; forma objetivo, `readme.md` §1.4)

```bash
scripts/                                                  # genera secretos y certificados, nunca versionados:
                                                          # claves ES256, cifrado/HMAC, roles PostgreSQL + pg_hba, TLS, 2 MinIO
ollama serve                                              # LLM FUERA de Docker: en macOS Docker no expone Metal
docker compose -f infra/docker/docker-compose.yml up -d
cd apps/clinical-api && npm install && npx prisma migrate dev && npm run dev
npx prisma db seed                                        # solo sintético; se niega a correr en entorno "piloto"
cd apps/rag-orchestrator && pip install -r requirements.txt && uvicorn app.main:app --reload
python -m app.scripts.load_seed_corpus
cd apps/web && npm install && npm run dev
oncolens preflight real-data                              # gate G-piloto, antes de habilitar datos reales
```

Runtime y modelos **sin decidir** (TBD-01): los fija el ADR de modelos locales al inicio del Sprint 1. Restricciones duras: stack ≤ 24 GB, `/platform/evidence-analyses` p95 ≤ 15 s (se recalibra en el S5), extracción p95 ≤ 60 s, JSON válido ≥ 99%, licencia académica, buen español. Decidir primero los *embeddings*: cambiarlos obliga a reindexar.

### Tests

Vitest + Supertest en `clinical-api` (StrykerJS, *mutation* sobre auth/authz/cifrado, llega con US-185: S6, si hay capacidad); Pytest + TestClient con adapters falsos en `rag-orchestrator`; Playwright E2E contra Compose con datos sintéticos; en la UI, además, `frontend-dev` se revisa a sí mismo con el loop visual (skill `visual-check`: Playwright MCP + Chrome DevTools MCP, solo `localhost` y seed sintético), que aporta evidencia pero no sustituye a los E2E. Parte del contrato, no extras: no-fuga de PII (incluida PII sembrada en texto libre, eventos, atributos y memoria de análisis), cifrado e índice ciego, CSRF/`Origin`, gate G-piloto, `403` por opt-out en toda generación con IA, `422` en registros sobre paciente egresado, clases de datos, *permission denied* del rol `rag_corpus`, un análisis previo nunca cuenta como soporte (RN-24), y lista de términos prescriptivos prohibidos (RN-23).

### Política TDD

- **Siempre Rojo → Verde → Refactor**, un test a la vez.
- **Primero el test en rojo más simple** del AC (el caso degenerado o el camino feliz mínimo) y se triangula con el siguiente; nunca varios tests en rojo a la vez.
- **Nunca borres, desactives ni debilites un test en rojo para que la suite pase** (`.skip`, `.only`, `xit`, `it.todo`, `@pytest.mark.skip`, `xfail`, aserciones relajadas). Un test solo cambia si su AC cambió en la spec del change; quitar uno exige el *trailer* `Test-Removal: <motivo>` en el commit y lo revisa el Gate 2.
- **Implementa el mínimo código** que pone el test en verde. **Refactoriza solo en verde**, con los tests en verde antes y después.
- Evidencia: commit `test(L1D-<nn>)` en rojo antes de su `feat(L1D-<nn>)`, y la salida en rojo y en verde en el reporte del implementador (lo verifica `gate-review`).

| Nivel | Qué prueba | `web` | `clinical-api` | `rag-orchestrator` |
|---|---|---|---|---|
| Unitario | Dominio, services y lógica de presentación, sin E/S | Vitest + Testing Library | Vitest; repositorios y adapters fingidos en su puerto | Pytest; adapters falsos en los puertos |
| Integración | La API o el componente con sus dependencias reales hasta el borde | Vitest + MSW sobre `/api/*` | Supertest + PostgreSQL real de test (US-038) + MSW hacia `rag-orchestrator` y MinIO | `TestClient` + `respx` hacia el LLM y servicios HTTP; Milvus y `corpus` reales o fakes del puerto |
| E2E | Los recorridos del PRD §13 | Playwright contra Compose con seed sintético | ← | ← |

Los handlers de MSW y `respx` se construyen desde `contracts/examples/` (US-213): un mock no puede divergir del contrato.

**Nombres de tests:** describen comportamiento, no la función llamada. `describe('<Unidad>')` + `it('<resultado esperado> cuando <escenario> [US-xxx AC-n]')`; en Pytest, `test_<unidad>_<escenario>_<resultado>` con `@pytest.mark.ac("US-xxx", n)`. En español, como el dominio. ❌ `it('calcularUmbral works')` · ✅ `it('devuelve sin_evidencia con topRelevanceScore null cuando ningún chunk supera el umbral [US-061 AC-3]')`.

**Mocks solo en los bordes arquitectónicos:** HTTP saliente (MSW, `respx`), LLM, embeddings, reranker, NLI, OCR, MinIO y la nube. **Nunca** módulos propios (`vi.mock('./…')`, `vi.mock('@/…')`) ni Prisma; lo rápido y determinista (dominio, services, validación Zod, mapeos) va real. La BD solo se finge en unitarios a través del puerto del repository; en integración es real (los tests de `rag_corpus`, cifrado e índice ciego lo exigen). Los fakes cumplen el contrato del adapter real (LSP: `null` ≠ `0.0`, mismos errores).

**Mutation testing:** StrykerJS sobre auth, autorización y cifrado con US-185 (S6, si hay capacidad); hasta entonces, los tests de esas áreas los revisa `design-principles-reviewer` buscando aserciones débiles.

**Piloto TDD Guard (S1):** solo en `clinical-platform-dev` (hooks en su frontmatter); se evalúa en la retro del S1 (`.claude/README.md`).

**La evaluación de calidad de IA (OL-06) es obligatoria en cada PR que cambie modelo, prompt, umbral, catálogo o corpus.** Metas iniciales (a recalibrar, TBD-02): recall@10 ≥ 0,80 (≥ 0,70 es→en), MRR ≥ 0,60, fidelidad ≥ 0,90, precisión de citas ≥ 0,90, "sin evidencia" ≥ 0,90, OCR crítico ≥ 0,95, PII ≥ 0,95, eventos ≥ 0,95, mapeo terminológico ≥ 0,95, salidas prescriptivas = 0.

## Reglas de dominio con consecuencias en el código

- **Dos ejes independientes** por dato extraído: `extraction_confidence` (calculada con **señales deterministas, nunca la confianza autorreportada por el LLM**) y `review_status`. Todo entra al RAG **etiquetado**; los `rechazado`/`reemplazado` nunca (RN-07).
- **Un dato extraído nunca reemplaza en silencio a uno verificado** (RN-08). En diagnósticos decide la fecha: anterior → histórico; posterior o sin fecha confiable → `requiere_revision` + `conflicts_with_id`. Duplicados entre documentos = un solo dato con varias fuentes (`ClinicalDataSource`).
- **Toda opción y toda afirmación generada mostrada** tiene ≥1 cita a un chunk recuperado en esa consulta (o enlace a un dato del paciente) **y** pasa el NLI (RN-01). Afirmaciones sobre datos del paciente: verbalización determinista + NLI (ADR-34). Opción sin soporte → `discardedOptions`; afirmación suelta → se omite y cuenta en `omittedClaims`.
- **Análisis previos entran como memoria rotulada, nunca citables** ni como soporte NLI (RN-24). Citas solo del corpus, copiadas de él, nunca del texto generado (RN-04); metadatos de fuente desde el catálogo, ausente → "No disponible" (RN-25).
- **Sin chunks sobre el umbral → "sin evidencia" sin invocar al LLM ni al agente**, con `top_relevance_score = null` (RN-02); `null` ≠ `0.0`.
- **`relevance_score`** = puntaje del *reranker* normalizado a [0,1], versionado, **metadato secundario** (RN-03): no ordena opciones ni mide solidez clínica. `clinical_evidence_score` reservado (TBD-09).
- **Aplicabilidad sin puntaje clínico** (RN-28): estados por criterio (Coincide / Parcial / No coincide / Desconocido); orden determinista: menos excluyentes en No coincide → más Coincide → relevancia como desempate. La opción hereda su fuente más aplicable. La UI muestra el criterio de orden.
- **Lenguaje no prescriptivo** (RN-23): encabezado "Opciones descritas en la evidencia"; nada de "recomendado para este paciente", "debe recibir", etc. Toda salida muestra "Análisis generado por IA — requiere validación clínica del oncólogo tratante" y "Uso académico/investigación" (RN-19).
- **Códigos terminológicos solo del catálogo versionado**; sin mapeo → `no_mapeado`, nunca inventado ni descartado (RN-27).
- **Solo chunks `is_current` se recuperan**; el histórico del corpus nunca se borra (RN-05).
- **`Document` es la cola de extracción** (`SKIP LOCKED`, `attempts`, `processing_started_at`); `checksum` detecta duplicados (409). No hay broker. Carga múltiple: `POST …/documents/batch` (`207`).
- **Autorización:** en el MVP solo RBAC (*qué acciones*); `admin` ve todo. El segundo plano, `CareTeamMember` (*sobre qué pacientes*, FR-15), pasa a Post-MVP porque la autorización por paciente la gestiona un sistema externo (PRD B-03); el esquema ya lo incluye.
- **Consentimiento presunto con opt-out** (RN-15): los consentimientos viven en un sistema externo; con convenio registrado el paciente está incluido salvo marca de opt-out del administrador. Opt-out de `analisis_ia` → `403` en **toda** generación con IA (análisis, resumen del caso, re-ejecución, búsqueda complementaria). Sin convenio no se presume.
- **Paciente egresado no admite ningún registro** hasta su reactivación (RN-17). Solo bloquean las reglas legales y de acceso; los avisos clínicos (faltantes, sin verificar, conflicto, desactualizado) **no bloquean** (RN-26).
- **Agente acotado** (FR-30): una búsqueda complementaria con límites de iteraciones, sub-consultas y *deadline* en configuración (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`).
- **Todo valor "a calibrar" vive en configuración** (RN-22): umbrales, TTL de sesión, *rate limits* (RN-30), retención, edad de mayoría (sin asumir país), `ENABLED_CANCER_TYPES`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`.
- **Modelo de diagnóstico genérico** (`staging_system`/`stage_value`, `performance_scale`/`performance_value`) para cubrir TNM y grupos de riesgo sin cambiar el esquema; en próstata, Gleason/grupo ISUP va en `Diagnosis.grade` (PRD B-08). Mama y próstata vía `ENABLED_CANCER_TYPES`; leucemia solo al cumplir el criterio de "listo" (RN-20).

## Datos y repositorio público

Repo **público**: nunca datos reales (ni anonimizados) ni secretos (RN-14); CI escanea secretos y PII. En `data/`, solo datos sintéticos, corpus público con licencia y definiciones de datasets; los reales anonimizados viven fuera del repo, en volumen cifrado.
**Ningún dato real entra a la aplicación antes del gate G-piloto (S6)** (RN-13): `clinical-api` no arranca con `REAL_*_ENABLED=true` si falla un prerrequisito. **Solo fuentes públicas de acceso abierto con licencia registrada y aceptada** (RN-21): dominio público, CC BY, CC BY-SA; CC BY-NC solo en el MVP académico; ND excluida. NCCN y ESMO excluidas mientras no se gestione su licencia (no bloquea el MVP) — ni siquiera en ejemplos.

## Roadmap

*Slicing* v2 (`docs/PRD.md` §14, v1.3): el MVP valida la hipótesis **caso reconstruido → faltantes → opciones más aplicables**, con una demo de punta a punta por sprint; S1–S5 solo con datos sintéticos. Pre-S1: decisiones (contrato `EvidenceAnalysis` y esquema congelados, protocolo de métricas de valor DEC-02, capacidad DEC-03, términos de LOINC/CUPS/ATC DEC-04, fuentes ADR-36) · 1. *Walking skeleton*: sesión mínima, análisis *dense* con una opción citada sobre el paciente semilla, suite `evaluate` en la DoD, baseline manual VM-1/VM-2 · 2. Acceso, identidad cifrada, ficha, catálogos, Base del análisis, baseline técnico · 3. Ingesta OCR, gate de PII, vista de caso y normalización · 4. Revisión, registro manual, faltantes, ingesta del corpus · 5. Aplicabilidad, hasta 3 opciones, feedback → **G-Demo** · 6. Opt-out por CLI, auditoría, proveedores locales, `preflight`, VPN/HTTPS, *backups* → **G-Piloto** → piloto mixto → **G-Éxito**. "Si hay capacidad": resumen del caso, síntesis, vigencia, plantillas, historial, híbrida, `/metrics`. Post-MVP: equipo tratante, ciclo de vida, decisión, memoria, agente, job de retención.

ADRs pendientes en `docs/architecture/adr/` (historias en el backlog): modelos locales (ADR-39), PII (ADR-40), evaluación RAG (ADR-41), fuentes y licencias (ADR-36), streaming de progreso (ADR-42), catálogo del corpus en base separada (ADR-43), scoring de evidencia clínica (ADR-7, futuro).

El backlog se trabaja con la skill `decompose-prd` (F0 preparación → F1 `requirements-analyst` → F2 `architecture-advisor` → F3 `backlog-writer` → F4 `backlog-auditor` → F5 cierre → F6 publicación en Linear **solo con aprobación explícita**). Los subagentes leen este fichero del disco: si se edita, correr el workflow en una sesión nueva. Destino: proyecto `OncoLens-1` (`P-L1D-1`), equipo `L1D`, workspace `l1der-lab-mjbc`; tablero: https://linear.app/l1der-lab-mjbc/project/oncolens-1-f85aa863d14c/issues. **Todo** issue de OncoLens va a ese proyecto: no crear proyectos ni equipos nuevos. El desarrollo por sprints (`/sprint-start`, `/sprint-run`, `/sprint-close`) lee y actualiza ese mismo proyecto; ver `.claude/README.md`.
