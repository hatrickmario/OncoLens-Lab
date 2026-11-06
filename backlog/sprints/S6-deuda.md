# S6 · Deuda

> Origen: conciliación de los 19 changes activos de sprints anteriores al inicio del S6 (`/sprint-start S6`, aprobada por el usuario el 2026-11-06). Siete changes siguen activos y entran al S6 para la corrida nocturna única `[S6 resp. 12]` ([`S6-refinamiento.md`](S6-refinamiento.md)): `l1d-113`, `l1d-116`, `l1d-119`, `l1d-126`, `l1d-205`, `l1d-246` y `l1d-299`. Los otros doce se archivan; sus tareas sin marcar quedan aquí como deuda.

## Deuda heredada al archivar (2026-11-06)

Una línea por tarea `- [ ]` del `tasks.md` de cada change archivado (el texto completo sigue en `openspec/changes/archive/2026-11-06-<change>/tasks.md`).

| ID | Change | Tarea | Resumen | Destino |
|---|---|---|---|---|
| D6-01 | `d5fb-02-listado-faltantes-criticos-reales` | 5.1 | Constancia de exención de `run-ai-eval` en el PR (sin cambio de modelo, prompt, umbral, catálogo ni corpus) | Post-MVP |
| D6-02 | `d5fb-02-listado-faltantes-criticos-reales` | 6.2 | Suites de `clinical-api` y `web`, `contracts:verify-provider`, linters y `pii-scan`; p95 del listado ≤ 1 s anotado en el PR | Post-MVP |
| D6-03 | `d5fb-03-corregir-dato-precarga-fecha-unidad` | 2.1 | Verificación en PR y CI (`npm test` de `web`, lint, `contracts:check`); verificado solo en local | Post-MVP |
| D6-04 | `d5fb-04-sin-tratamiento-previo-a-la-fecha` | 4.4 | E2E del recorrido (g): faltante → declarar → registrar tratamiento → declaración reemplazada; guía de la demo y `visual-check` | Post-MVP |
| D6-05 | `d5fb-04-sin-tratamiento-previo-a-la-fecha` | 6.1 | Validación estricta, suites completas, E2E, CI verde y Gates 1 y 2 | Post-MVP |
| D6-06 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | 2.4 | `staleness.patientData` con `changedData` tras corregir un tratamiento o atributo (trasladada a US-175, L1D-148) | Post-MVP |
| D6-07 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | 3.3 | `visual-check` completo de la corrección en la vista de caso (evidencia parcial) | Post-MVP |
| D6-08 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | 3.4 | E2E de corregir un tratamiento y un atributo con su histórico (escrito, sin ejecutar) | Post-MVP |
| D6-09 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | H.1 | Eliminar o rechazar un tratamiento o atributo cargado por error (fuera de alcance, decisión del usuario 2026-11-05) | Post-MVP |
| D6-10 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | H.2 | Crear la historia en Linear (solo con aprobación) y sustituir «sin L1D asignado» en la trazabilidad | Post-MVP |
| D6-11 | `d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso` | 4.1 | Cierre de la fase UI: validación estricta, suites y `contracts:verify-provider` (fase 1 backend y BFF hecha) | Post-MVP |
| D6-12 | `l1d-268-seguimiento-analisis` | 2.5b | Verificación `llm_provider` vs `data_classification` (RN-12) en el turno de seguimiento (trasladada a US-050) | Sustituida por el chat (FEAT-12) |
| D6-13 | `l1d-268-seguimiento-analisis` | 4.3 | Medición del seguimiento con modelos locales en la corrida nocturna (D5-13) | Sustituida por el chat (FEAT-12) |
| D6-14 | `l1d-268-seguimiento-analisis` | H-1 | Clave del límite de preguntas de seguimiento en `apps/clinical-api/.env.example` | Sustituida por el chat (FEAT-12) |
| D6-15 | `l1d-268-seguimiento-analisis` | H-2 | Fila de la excepción declarada `[S5 resp. 10]` en la tabla de ADR-26 | Sustituida por el chat (FEAT-12) |
| D6-16 | `l1d-268-seguimiento-analisis` | H-5 | Pendientes del Gate 2 de clinical-platform (D5-15 paridad de marcadores de identidad, D5-16 P3 del design, menor de contrato) | Sustituida por el chat (FEAT-12) |
| D6-17 | `l1d-285-higiene-tests-ci` | 5.1 | Menores del `design-principles-reviewer` de higiene de tests (trasladada a US-233 y US-232) | Post-MVP |
| D6-18 | `l1d-285-higiene-tests-ci` | 5.3 | `minLength` y `pattern` de `fullName` en el contrato de altas de pacientes (trasladada a US-222) | Post-MVP |
| D6-19 | `l1d-197-sesion-login-guard` | 4.2 | Suites y E2E de sesión con servicios reales en la CI y `npm audit` de `argon2` (destino L1D-277 / ARR-01) | Post-MVP |
| D6-20 | `l1d-166-ci-build-contracts-scan` | 5.2 | Confirmación en la CI del caso `ac2-cited-sources-build` (job `contracts` y `ci-selftest`) | Post-MVP |
| D6-21 | `l1d-173-tipos-cancer-habilitados` | 5.1 | Suites de los tres contextos con servicios reales y `contracts:verify-provider` en la CI (destino L1D-277 / ARR-01) | Post-MVP |
| D6-22 | `us-231b-adapter-nli-smoke-semilla` | 1.0 | Inspeccionar `MODEL_HOST_DIR` por `model.onnx.data` sin verificar y confirmar el origen del ONNX fp32 del NLI | S6 · corrida nocturna de L1D-119 (D5-08) |
| D6-23 | `us-231b-adapter-nli-smoke-semilla` | 1.11 | Mediciones `models` del NLI: mediana ≤ 1500 ms y RSS ≤ 4489 MiB (escritas, no ejecutadas) | S6 · corrida nocturna de L1D-119 (D5-08) |
| D6-24 | `us-231b-adapter-nli-smoke-semilla` | 1.12 | *Smoke* de carga del corpus semilla con pesos reales y consulta `Q-HER2` a `/rag/query` | S6 · corrida nocturna de L1D-119 (D5-08) |
| D6-25 | `us-231b-adapter-nli-smoke-semilla` | 2.1 | Constancia en el PR de que no cambia modelo ni corpus e informe de 1.11 (absorbida por US-233) | Post-MVP |
| D6-26 | `us-231b-adapter-nli-smoke-semilla` | 4.2 | Tests `-m models` en verde en la VM local (trasladada a US-233) | S6 · corrida nocturna de L1D-119 (D5-08) |
| D6-27 | `us-231b-adapter-nli-smoke-semilla` | 4.3 | `npm run quality` con `import-linter` (`application/` y `domain/` sin `onnxruntime` ni `tokenizers`) | Post-MVP |
| D6-28 | `l1d-248-g-demo-verificacion` | 3.1 | Corrida real de `evaluate` en la máquina de referencia con los modelos de ADR-39 | Post-MVP (G-Demo real, D5-28) |
| D6-29 | `l1d-248-g-demo-verificacion` | 3.2 | E2E en modo real y `scripts/verify-g-demo --modo real` → `docs/gates/G-Demo-<fecha>.md` | Post-MVP (G-Demo real, D5-28) |
| D6-30 | `l1d-248-g-demo-verificacion` | H-1 | Revisar y firmar `docs/gates/G-Demo-<fecha>.md` como PO | Post-MVP (G-Demo real, D5-28) |

`d5fb-01-seed-pacientes-por-revisar` no tenía tareas sin marcar.
