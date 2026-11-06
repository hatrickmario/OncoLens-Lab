# Tasks — d5fb-04-sin-tratamiento-previo-a-la-fecha

> Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario).
> Matriz TDD (CLAUDE.md): reglas, services y endpoints → TDD estricto, doble bucle, commit `test(…)` en rojo que falla
> en la aserción (esqueletos con `throw new Error('no implementado')`) antes del `feat(…)`; UI → test del AC primero;
> catálogo/contrato/E2E → test después. Sin mocks de módulos propios ni de Prisma; sin `.skip`/`.only`.

## 1. contratos

- [x] 1.1 (sync-contracts, contract-first) Editar `apps/clinical-api/openapi.yaml`: `CompletenessItem.resolvedBy` opcional, `422` en `createManualClinicalAttribute`, minor de `info.version`; ejemplos `completeness-…-sin-tratamiento.json` y `error-declaracion-incoherente.json` en `contracts/examples/` (índice). Regenerar `packages/api-contracts`. `contracts:check` y `contracts:breaking` (0 incompatibles). Commit `contract(…)`.

> Fase 1 (secciones 1–3) hecha con evidencia ejecutada: `contracts:check` 0 hallazgos, `contracts:breaking` 0 incompatibles, `contracts:generate:check` al día, `contracts:verify-provider` (clinical-api: 769 respuestas verificadas; 141 archivos y 741 tests de integración en verde con PostgreSQL real), `npm test -w apps/clinical-api` (unitaria: 123 archivos, 1170 tests), `catalog:validate`, `catalog:version-guard` y `vitest run scripts/catalog` (182 tests), `tsc --noEmit`, ESLint `--max-warnings 0`, Prettier, `lint:lenguaje`, `pii-scan`. Versiones: `info.version` 1.22.0 (`clinical-api`), catálogo 1.5.0.
> Desviaciones de implementación respecto del design: (a) el `422` de incoherencia es `CUERPO_INVALIDO` con `field = attributeKey` del schema real `ErrorRegistroClinicoInvalido` (no `ErrorRegistroManualInvalido`) y no añade un valor nuevo al enum de la respuesta (un valor nuevo sale ERR en `contracts:breaking`); (b) `ClinicalAttributeManualCreate` no tiene `datePrecision`: la precisión es `dia` si hay `observedAt` (el formulario envía solo `attributeKey`, `value` y `observedAt`); (c) re-declarar crea una fila nueva (regla vigente de atributos: «un segundo registro de la misma clave es una fila nueva»), y al registrar un tratamiento se reemplazan TODAS las declaraciones vigentes; (d) `resolvedBy` solo aparece en los ítems cuyo catálogo declara `satisfiedBy`.

## 2. catálogo (datos)

- [x] 2.1 (test después) `atributos.json`: clave `sin_tratamiento_previo` (mama, próstata; valor `si`); `datos-criticos.json`: `satisfiedBy` en `tratamientos_previos` (mama y próstata si lo tiene); esquema JSON opcional; validador con la comprobación de referencia; fixture de referencia colgante; subir la versión del catálogo en ambos backends y fixtures `test-*`. Test del validador.

## 3. clinical-platform

- [x] 3.1 (TDD estricto) Aceptación en rojo, Supertest + PostgreSQL real: «tratamientos_previos pasa a presente_verificado con resolvedBy declaracion_de_ausencia y sin fila PriorTreatment [AC-04.1]»; «sin declaración sigue faltante»; «declaración reemplazada no cuenta [RN-07]». Unitarios, uno a la vez, de la regla pura `cumplePorDeclaracion()` en `completeness.rules.ts`; `ports.ts` y `completeness.module.ts` leen `satisfiedBy` del catálogo. Commits `test(…)` → `feat(…)`.
- [x] 3.2 (TDD estricto) Coherencia D4, Supertest + PostgreSQL real: registrar tratamiento con declaración vigente → `201` y declaración `reemplazado` en la misma transacción (con prueba de reversión si falla); declarar con tratamientos vigentes → `422` con `field`; egresado → `422`; `admin` → `403`; carrera de dos peticiones sin doble verdad. Implementar en `prior-treatments.service` y `clinical-attributes.service` sin dependencia circular (regla compartida con nombre en `compartido/`). Commits `test(…)` → `feat(…)`.
- [x] 3.3 (test después) Ningún log ni auditoría registra valores clínicos de la declaración; `GET …/case` y `clinical-attributes` la devuelven; el Route Handler BFF de `clinical-attributes` la deja pasar (sin handler nuevo).

## 4. frontend

- [ ] 4.1 (test del AC primero) Tests en rojo, Testing Library + MSW desde `contracts/examples/`: casilla marcada envía solo `POST /api/patients/{id}/clinical-attributes` sin errores de los campos ocultos; desmarcar restaura la validación; fecha futura bloqueada; sin casilla con tratamientos; aviso de reemplazo; fila deja de ser «Faltante» sin recargar. Esqueletos con `throw new Error('no implementado')`. Commit `test(…)` → `feat(…)`.
- [ ] 4.2 (test del AC primero) Tests en rojo de `PriorTreatmentsTable` («Sin tratamiento previo a la fecha» vs «Sin datos») y de la columna «Datos críticos» con `resolvedBy = declaracion_de_ausencia`; textos en `messages/es.json` y `lint:lenguaje` (RN-23).
- [ ] 4.3 Implementar `DialogoTratamientoPrevio` (estado de modo, campos condicionales, esquema Zod de dos ramas en el borde del formulario sin tocar el del tratamiento), tabla y columna. Accesibilidad y teclado.
- [ ] 4.4 (test después: E2E) Recorrido del paciente (g): faltante → declarar → «Presente» → registrar un tratamiento → declaración reemplazada. Actualizar la guía `docs/demo/guia-demo-S5.md` (la nota «no se siembra un “ninguno”» sigue válida). `visual-check` a 375 y 1280 px.

## 5. ai-services

- [x] 5.1 (TDD, dominio puro) Pytest: la verbalización del hecho con declaración, sin declaración y con tratamientos; contexto sin identidad ni fechas absolutas; la aplicabilidad `linea_tratamiento` no cambia. Si la frase entra en un prompt, correr `run-ai-eval` (OL-06).
  - Evidencia: `apps/rag-orchestrator/tests/unit/test_declaracion_sin_tratamiento_previo.py` (10 tests; 5 en rojo en `c3c0869e`, 10 en verde en `670f3881`); la frase «Sin tratamiento previo a la fecha (declarado hace N meses)» sale de `declaracion_sin_tratamiento_previo` en `app/prompts/rag_query.py` y entra SOLO en el bloque de datos del paciente del prompt de generación (no en el resumen de la recuperación: `resumen_del_contexto_clinico` no cambia). Sin declaración o con tratamientos se omite; `linea_tratamiento` sigue sin valor (Desconocido). Pytest de rag: 2559 unit + 622 integración (sin `servicios_reales`) + 1079 evaluation/catálogo en verde; `ruff format/check` limpios; `mypy` y `lint-imports` no se pudieron correr (no instalado / sin config localizable).
  - **Pendiente (humano / corrida nocturna): `run-ai-eval` (OL-06)**, obligatoria porque la frase entra en el prompt `rag-query` (la plantilla y `VERSION_DEL_PROMPT` no cambian; cambia el bloque de datos). NO se corrió con el LLM real (memoria de la VM). Comando: `/run-ai-eval` sobre la rama `feat/d5fb-04-sin-tratamiento-previo` (familias de opciones y aplicabilidad) contra el baseline de `main`. Y no se corrió `scripts/ci/integracion-rag-orchestrator.sh` (Milvus + PostgreSQL, ~10 min) por la memoria justa: el diff no toca PostgreSQL ni Milvus; lo cubre la CI `integration-rag`.

## 6. cierre

- [ ] 6.1 `openspec validate d5fb-04-sin-tratamiento-previo-a-la-fecha --strict`; Vitest, Pytest, `tsc`, ESLint, Prettier, `lint:lenguaje`, `contracts:check`/`breaking`, E2E, y CI verde (0 checks en fallo) antes de pedir merge. Gate 1 (privacy-guardian, contract-keeper, clinical-language-auditor) y Gate 2.
