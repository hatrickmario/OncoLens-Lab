# S4 · Deuda y decisiones del ajuste O2 (usuario, 2026-10-31)

> Fuente: hoja de ajustes del orquestador `sprint-S4` tras la oleada 1. Linear: comentario en cada historia destino (sin crear issues). **Dueños aprobados por el usuario el 2026-10-31** (ver «Decidido» al final). D4-09 conserva su estado.

| ID | Deuda / decisión | Origen | Dueño propuesto | Estado |
|---|---|---|---|---|
| D4-01 | Deuda D7 de L1D-193: las formas españolas «Se recomendaría», «Se aconseja» y «Considere iniciar» pasan el filtro de producción de la salida generada (RN-23). Incluye el nivel B de `fx-rn23` (campo `rationale`, regla `b-recommend` mostrado). | L1D-193 (D7) | **US-249** (historia nueva del S5, antes del G-Demo); no entra en el S4 | Aprobado (usuario, 2026-10-31): historia nueva **US-249** (FEAT-T3, S5, 3 pts, antes del G-Demo); el AC-2 de L1D-298 (juez acotado A+B bloqueante con el generador real) pasa a ella. Linear: pendiente de creación |
| D4-02 | AC-7 de L1D-298: el límite de RSS se refiere al RSS en régimen estable (tras `gc`, proceso fresco, ≥ 3 repeticiones), medido en el MacBook de 32 GB con el stack completo. Los 4489 MiB (suma de tres RSS medidos por separado en ADR-39) no se usan como `mem_limit`. | L1D-298 (AC-7), ADR-39 | L1D-297 (levanta y verifica el stack; AC-7 de L1D-298 pasa aquí) | Aprobado (usuario, 2026-10-31): criterio de medición y dueño |
| D4-03 | Deuda 1.1 de L1D-293: `poblacion-reglas.json` en `packages/clinical-catalogs` con `catalogHash` y entrada en `manifest.json`; copia de `test-apl-1.2.0`; esquema y validador; versión 1.2.0 real en ambos backends. Sin ese archivo «mezclada» no aparece en producción. | L1D-293 (1.1) | **L1D-297**, que la absorbe con **+2 puntos (5 → 7)** | Decidido y aprobado (usuario, 2026-10-31) |
| D4-04 | Tarea 1.8b de L1D-298: cobertura de aplicabilidad (causa `escala_no_comparable`, pares con `priorAnalyses` RN-24 y datos `requiere_revision` RN-26). | L1D-298 (1.8b) | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-05 | Tarea 1.9 de L1D-298: menores G2.B2–B4 y A1–A4 de `us-117b`. El detalle no está en el repo, solo «ver su Gate 2». | L1D-298 (1.9), Gate 2 de `us-117b` | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-06 | Tarea 1.10 de L1D-298: validar la IP resuelta del descargador (rechazar IP privadas y loopback). | L1D-298 (1.10) | US-232 (S6), como deuda de seguridad | Aprobado (usuario, 2026-10-31) |
| D4-07 | Muestra etiquetada a mano del alcance elegibilidad/subgrupo/mención de la extracción de población: 11 de 19 valores del smoke de L1D-292 salen como `mencion`; la exactitud del alcance no está medida (riesgo para DEC-11). Ver también el test del criterio vacío `test_ingesta_criterio_sin_fragmentos_relevantes_queda_vacio_sin_llamar_al_llm` (`tests/integration/corpus_ingestion/test_poblacion_abanico.py`; Decidido (usuario, 2026-10-31)). | L1D-292 (smoke) | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-08 | Tarea 3.3 de L1D-298: smoke de la semilla (`us-231b` 1.12), muestra de `l1d-117` 2.2 y partición de ADR-45. Necesitan PostgreSQL y Milvus reales. | L1D-298 (3.3), `us-231b`, `l1d-117`, ADR-45 | L1D-297 | Aprobado (usuario, 2026-10-31) |
| D4-09 | Módulo estadístico único (percentiles y medianas) en lugar de implementaciones repetidas por cada suite. | Revisión del S4 | Por asignar en la aprobación | Propuesto, pendiente de aprobación (sin cambio) |
| D4-10 | Puertos de la suite de evaluación extensibles a *sparse* antes de L1D-245. | L1D-245 (híbrida frente a *dense*) | L1D-245 | Aprobado (usuario, 2026-10-31); cubierta por el PR #261 |
| D4-11 | Deuda menor de L1D-292: guard de «omitido» con Milvus caído y extractor presente sin test (exige forzar `a_encender`), contadores parciales al `_pendiente` y mixin único de ajustes de población (`Settings` y `CorpusIngestSettings`). Sin ID de historia. | L1D-292 | Historia de deuda de `rag-orchestrator` del S5 (una sola, sin ID aún; junto con D4-14) | Aprobado (usuario, 2026-10-31) |

## Deuda del Gate 2 de la oleada 3 (propuesta, pendiente de aprobación del usuario)

| ID | Deuda / decisión | Origen | Dueño propuesto | Estado |
|---|---|---|---|---|
| D4-17 | Test inestable en CI de main (306bf340): `panel-estados-s3.test.tsx` US-062 AC-5; bug del sprint; causa raíz: el test mezclaba reloj real y simulado (`shouldAdvanceTime: true`) y avanzaba los 30 s sin garantizar que el efecto que arma el plazo ya hubiera corrido ni re-consultaba el botón; no se reprodujo en local (0 fallos en 300 ejecuciones bajo carga de CPU), así que es una causa por análisis, no confirmada empíricamente, y el componente de producción es correcto; arreglo: reloj simulado solo en `setTimeout`/`clearTimeout`, avance explícito dentro de `act` y botón re-consultado tras el avance (commit `refactor(L1D-112): tests`, rama `fix/d4-17-test-reintentar-determinista`) | CI de main (306bf340, merge de #256) | Bug del sprint S4 (frontend-dev), arreglo en esta rama; propuesto, pendiente de aprobación del usuario como historia/tarea | Propuesto, pendiente de aprobación |

## Deudas de L1D-95 que ya están en L1D-97

Las deudas de L1D-95 (`/completeness`) que L1D-97 ya recoge no llevan ID propio: se entregan con L1D-97, reestimada de 3 a 5 puntos y aprobada en dos partes (primero las 4 deudas de `clinical-api` con `clinical-platform-dev`; luego el BFF y la UI). Ver `S4-plan.md` §6.

## Deuda del Gate 2 de la oleada 3 y bugs del sprint (dueños aprobados, usuario, 2026-10-31)

| ID | Deuda | Origen | Destino | Dueño |
|---|---|---|---|---|
| D4-12 | Respaldo de población con lista de valores y DEC-11 (hoy un valor por criterio, `MAX_VALORES_DEL_RESPALDO=1`). | L1D-294 | Historia nueva del S5 (sin ID aún) | Aprobado (usuario, 2026-10-31) |
| D4-13 | `evaluate` no mide la población del respaldo ni `finish_reason`, más la cobertura 0/1 del respaldo (el modelo etiqueta «applies to HER2-negative» como `mencion`). Va junto con D4-07. | L1D-294 | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-14 | Mixin único de ajustes de población en `Settings`/`CorpusIngestSettings`; versión del prompt desde el adapter; limpieza única del marcador `[chunkId]` compartida con la ingesta; `parametros_de_recuperacion` con default de fakes; `parametros_del_respaldo` en `fabrica_local`. | L1D-294 | Deuda S5 de `rag-orchestrator` (la misma historia que D4-11) | Aprobado (usuario, 2026-10-31) |
| D4-15 | Menores del Gate 2 de L1D-97: `FichaPage` sin validar UUID (clinical-api responde 404); lectura inicial y releer del checklist sin descarte de respuestas antiguas; regla «hay resumen de aviso» en tres sitios; E2E con espera dependiente del seed; `reintentar()` no relee el checklist; `hashchange` vs `pushState` en `FocoPorAncla`; textos `faltantes.nota` y `faltantes.noVerificables` (explicar «Desconocido» y que el análisis sigue disponible); `SeccionDeFicha` con el literal `ficha-identificacion` fuera del catálogo. | L1D-97 | Deuda S5 de `web` | Aprobado (usuario, 2026-10-31) |
| D4-16 | El spec principal `openspec/specs/evidence-analysis-gateway/spec.md` (línea ~343) cita la ruta antigua `modules/patients/estados-de-revision.ts` (ahora `modules/compartido/`). | L1D-97 / L1D-95 | `/sprint-close` (se corrige al archivar) | Aprobado (usuario, 2026-10-31) |
| D4-17 | Bug de la CI ya registrado en el PR #259 (ver su descripción). | PR #259 | `clinical-platform-dev` | Aprobado / en curso |
| D4-18 | Bug del sprint: `stack-smoke` intermitente por una carrera de limpieza entre fases del smoke; causa confirmada en la run 41169466065. Arreglo: nombre de proyecto Compose único por ejecución y fase en `scripts/smoke/compose-smoke.sh` (1 pt). | CI (`stack-smoke`) | `clinical-platform-dev` (PR aparte en curso) | Aprobado / en curso (usuario, 2026-10-31) |

## Decidido (usuario, 2026-10-31)

1. D4-01 va a una historia nueva del S5, antes del G-Demo; no entra en el S4. 2. D4-02: criterio de RSS en régimen estable. 3. D4-03: L1D-297 absorbe `poblacion-reglas.json` con +2 puntos. 4. L1D-97 pasa de 3 a 5 puntos y se entrega en dos partes. 5. El sprint queda en 73 puntos; el orden de recorte del 2026-10-29 no cambia (US-003/US-005, US-238, US-133, US-112).

6. **Q2 (L1D-294) cerrada:** el plazo del respaldo es por llamada; con concurrencia 1 y 4 criterios pendientes puede sumar 40 s frente al p95 de 15 s. Decidido: `POPULATION_FALLBACK_DEADLINE_MS=10000` ms se deja como está **hasta US-233b** (calibración).

**Decisiones del 2026-10-31 (segunda tanda)**

7. **D4-18 aprobado** (1 pt, `clinical-platform-dev`), y D4-17 registrado (ver tabla).
8. **Dueños de deuda aprobados:** D4-02 y D4-08 -> L1D-297; D4-04, D4-05, D4-07 y D4-13 -> L1D-299; D4-06 -> US-232; D4-10 -> L1D-245 (cubierta por el PR #261); D4-11 y D4-14 -> una historia de deuda de `rag-orchestrator` del S5; D4-12 -> historia nueva del S5; D4-15 -> deuda de `web` del S5; D4-16 -> `/sprint-close`. D4-09 (módulo estadístico único) queda propuesto; D4-03 sigue decidido -> L1D-297.
9. **D4-01 -> US-249** (FEAT-T3, S5, 3 pts, antes del G-Demo): «La salida generada rechaza el lenguaje de recomendación en la voz propia del modelo y el nivel B atribuido, con casos de conformidad». Cambio de backlog que requiere aprobación humana al fusionar este PR y el espejo en Linear (L1D-nn pendiente).
10. **Estimaciones:** L1D-97 = 5 pts (era 3) y L1D-297 = 7 pts (era 5); el total del S4 es 73 (ver `S4-plan.md` §6).
11. **L1D-298:** AC-2 (juez acotado con el generador real, A+B bloqueante) -> US-249 (D4-01); AC-7 (RSS en régimen estable, MacBook de 32 GB) -> L1D-297 (D4-02).
12. **L1D-131:** las tareas 1.1 y 2.9 (perfil E2E Compose con `RAG_ADAPTERS=fake`, seed A-M1/A-M2, catálogo `test-apl-1.2.0`, Playwright contra Compose, extensión de `aviso-ia.spec.ts`) se difieren a L1D-297 (tarea 2.10 de su `tasks.md`), sin cambiar sus puntos.
