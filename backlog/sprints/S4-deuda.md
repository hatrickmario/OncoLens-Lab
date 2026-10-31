# S4 · Deuda y decisiones del ajuste O2 (usuario, 2026-10-31)

> Fuente: hoja de ajustes del orquestador `sprint-S4` tras la oleada 1. Linear: comentario en cada historia destino (sin crear issues). **Dueños aprobados por el usuario el 2026-10-31** (ver «Decidido» al final). D4-09 conserva su estado.

| ID | Deuda / decisión | Origen | Dueño propuesto | Estado |
|---|---|---|---|---|
| D4-01 | Deuda D7 de L1D-193: las formas españolas «Se recomendaría», «Se aconseja» y «Considere iniciar» pasan el filtro de producción de la salida generada (RN-23). Incluye el nivel B de `fx-rn23` (campo `rationale`, regla `b-recommend` mostrado). | L1D-193 (D7) | **US-249** (historia nueva del S5, antes del G-Demo); no entra en el S4 | Aprobado (usuario, 2026-10-31): historia nueva **US-249** (FEAT-T3, S5, 3 pts, antes del G-Demo); el AC-2 de L1D-298 (juez acotado A+B bloqueante con el generador real) pasa a ella. Linear: **L1D-305** (hija de L1D-39, S5, 3 pts) |
| D4-02 | AC-7 de L1D-298: el límite de RSS se refiere al RSS en régimen estable (tras `gc`, proceso fresco, ≥ 3 repeticiones), medido en el MacBook de 32 GB con el stack completo. Los 4489 MiB (suma de tres RSS medidos por separado en ADR-39) no se usan como `mem_limit`. | L1D-298 (AC-7), ADR-39 | L1D-297 (levanta y verifica el stack; AC-7 de L1D-298 pasa aquí) | Aprobado (usuario, 2026-10-31): criterio de medición y dueño |
| D4-03 | Deuda 1.1 de L1D-293: `poblacion-reglas.json` en `packages/clinical-catalogs` con `catalogHash` y entrada en `manifest.json`; copia de `test-apl-1.2.0`; esquema y validador; versión 1.2.0 real en ambos backends. Sin ese archivo «mezclada» no aparece en producción. | L1D-293 (1.1) | **L1D-297**, que la absorbe con **+2 puntos (5 → 7)** | Decidido y aprobado (usuario, 2026-10-31) |
| D4-04 | Tarea 1.8b de L1D-298: cobertura de aplicabilidad (causa `escala_no_comparable`, pares con `priorAnalyses` RN-24 y datos `requiere_revision` RN-26). | L1D-298 (1.8b) | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-05 | Tarea 1.9 de L1D-298: menores G2.B2–B4 y A1–A4 de `us-117b`. El detalle no está en el repo, solo «ver su Gate 2». | L1D-298 (1.9), Gate 2 de `us-117b` | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-06 | Tarea 1.10 de L1D-298: validar la IP resuelta del descargador (rechazar IP privadas y loopback). | L1D-298 (1.10) | US-232 (S6), como deuda de seguridad | Aprobado (usuario, 2026-10-31) |
| D4-07 | Muestra etiquetada a mano del alcance elegibilidad/subgrupo/mención de la extracción de población: 11 de 19 valores del smoke de L1D-292 salen como `mencion`; la exactitud del alcance no está medida (riesgo para DEC-11). Ver también el test del criterio vacío `test_ingesta_criterio_sin_fragmentos_relevantes_queda_vacio_sin_llamar_al_llm` (`tests/integration/corpus_ingestion/test_poblacion_abanico.py`; Decidido (usuario, 2026-10-31)). | L1D-292 (smoke) | L1D-299 | Aprobado (usuario, 2026-10-31) |
| D4-08 | Tarea 3.3 de L1D-298: smoke de la semilla (`us-231b` 1.12), muestra de `l1d-117` 2.2 y partición de ADR-45. Necesitan PostgreSQL y Milvus reales. | L1D-298 (3.3), `us-231b`, `l1d-117`, ADR-45 | L1D-297 | Aprobado (usuario, 2026-10-31) |
| D4-09 | Módulo estadístico único (percentiles y medianas) en lugar de implementaciones repetidas por cada suite. | Revisión del S4 | **L1D-299** | Aprobado (usuario, 2026-10-31) |
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
| D4-19 | Deuda S5 de `rag-orchestrator` ANTES de L1D-144: retirar el camino heredado de soporte en `domain/support.py` (`_descartar_si_no_se_soporta`, `_con_detalles_soportados` y la rama `details` de `planificar_soporte`); migrar `GeneradorGuionado` y los tests heredados a afirmaciones (el test retirado en 41a8b3f7 reaparece como primer AC); `LimitesDeAfirmaciones` / *keyword-only*; flag `option_incumple`; partir `support.py`; re-export con `noqa` de `FORMULA_DE_ATRIBUCION`; `config_aplicabilidad` con `.get`; y las descripciones de `contracts/schemas/evidence.yaml` (esto último diferido a deuda de documentación de contrato). | L1D-295 (Gate 2) | `ai-services-dev` (rama `refactor/d4-19-soporte-sin-camino-heredado`) | **Aprobada, entregada en el PR #269, comportamiento mantenido y documentado** (usuario, 2026-10-31). 2 pts, cuenta dentro del sprint (S4 = 76). Tarea menor: añadir el comentario «pregunta resuelta por el usuario el 2026-10-31: se mantiene» al test unitario `test_soporte.py` cuando un PR de código lo toque |
| D4-20 | L1D-295: los criterios de inclusión con *must*/*should* (modal normativo) NO deben descartar la opción entera y el prompt `rag-query` debe avisar de los modales; `claims_max_per_option` se queda en 4; la métrica `cumple_formula_de_atribucion` se reorienta (hoy es tautológica porque el marco lo pone el código); la opción `option` también pasa por la lista de modales (Q5). | L1D-295 (Gate 2, Q4/Q5) | L1D-144 | Aprobado (usuario, 2026-10-31) |
| D4-21 | *Spike* de desbloqueo de la corrida real de L1D-245: `data/eval/adr39-mini` sin `corpus.yaml` ni `preguntas.yaml`, preinscripción ADR-45 P1 con `RETRIEVAL_REGRESSION_TOLERANCE`, pesos `EMBEDDING_SPARSE_*`. | L1D-245 (3.1-3.3 y 4.1) | Inicio del Sprint 5 | Aprobado (usuario, 2026-10-31) |
| D4-22 | Subpath puro `./verificador` en `packages/clinical-language` (sin `node:fs` ni extensiones `.js`) y retirada del `turbopack.resolveAlias` de `apps/web/next.config.ts`. Lección: cualquier import de `apps/web` hacia `packages/*` exige el `COPY` del Dockerfile de `web` (la CI de #267 falló por eso). | CI de #267 | Deuda `web`/`packages` S5 (L1D-296) | Sprint 5, FUERA del S4 (usuario, 2026-10-31). El alias exige un ADR: [ADR-49](../../docs/architecture/adr/ADR-49-alias-turbopack-temporal-clinical-language.md), propuesto, pendiente de firma |
| D4-23 | Alertas de code scanning abiertas, no del sprint: #1 `js/incomplete-url-substring-sanitization` (warning) en `apps/web/tests/build/url-interna.test.ts:35` («'http://clinical-api-centinela-l1d139.internal:3999' can be anywhere in the URL…») y #12 `js/sensitive-get-query` (warning) en `apps/clinical-api/src/modules/patients/patients.controller.ts:111` («Route handler for GET requests uses query parameter as sensitive data»). No se descarta ninguna alerta a mano. | Code scanning (sesión `sprint-S4`, 2026-10-31) | Deuda de seguridad S5 (`privacy-guardian` revisa si #12 es un falso positivo documentado) | Propuesto, pendiente de aprobación |
| D4-24 | Pin de versión de la lista RN-23 horneada en el build de `web` (un test que compare la versión del JSON con la del backend o la versión mínima exigida). | L1D-296 (decisión del usuario, 2026-10-31) | Deuda `web` S5 | Propuesto, pendiente de aprobación |

## Decidido (usuario, 2026-10-31)

1. D4-01 va a una historia nueva del S5, antes del G-Demo; no entra en el S4. 2. D4-02: criterio de RSS en régimen estable. 3. D4-03: L1D-297 absorbe `poblacion-reglas.json` con +2 puntos. 4. L1D-97 pasa de 3 a 5 puntos y se entrega en dos partes. 5. El sprint queda en 73 puntos; el orden de recorte del 2026-10-29 no cambia (US-003/US-005, US-238, US-133, US-112).

6. **Q2 (L1D-294) cerrada:** el plazo del respaldo es por llamada; con concurrencia 1 y 4 criterios pendientes puede sumar 40 s frente al p95 de 15 s. Decidido: `POPULATION_FALLBACK_DEADLINE_MS=10000` ms se deja como está **hasta US-233b** (calibración).

**Decisiones del 2026-10-31 (segunda tanda)**

7. **D4-18 aprobado** (1 pt, `clinical-platform-dev`), y D4-17 registrado (ver tabla).
8. **Dueños de deuda aprobados:** D4-02 y D4-08 -> L1D-297; D4-04, D4-05, D4-07 y D4-13 -> L1D-299; D4-06 -> US-232; D4-10 -> L1D-245 (cubierta por el PR #261); D4-11 y D4-14 -> una historia de deuda de `rag-orchestrator` del S5; D4-12 -> historia nueva del S5; D4-15 -> deuda de `web` del S5; D4-16 -> `/sprint-close`. D4-09 (módulo estadístico único) queda propuesto; D4-03 sigue decidido -> L1D-297.
9. **D4-01 -> US-249** (FEAT-T3, S5, 3 pts, antes del G-Demo): «La salida generada rechaza el lenguaje de recomendación en la voz propia del modelo y el nivel B atribuido, con casos de conformidad». Espejo en Linear creado: **US-249 = L1D-305**.
10. **Estimaciones:** L1D-97 = 5 pts (era 3) y L1D-297 = 7 pts (era 5); el total del S4 es 73 (ver `S4-plan.md` §6).
11. **L1D-298:** AC-2 (juez acotado con el generador real, A+B bloqueante) -> US-249 (D4-01); AC-7 (RSS en régimen estable, MacBook de 32 GB) -> L1D-297 (D4-02).
12. **L1D-131:** las tareas 1.1 y 2.9 (perfil E2E Compose con `RAG_ADAPTERS=fake`, seed A-M1/A-M2, catálogo `test-apl-1.2.0`, Playwright contra Compose, extensión de `aviso-ia.spec.ts`) se difieren a L1D-297 (tarea 2.10 de su `tasks.md`), sin cambiar sus puntos.

**Decisiones del 2026-10-31 (tercera tanda)**

13. **US-249 = L1D-305** (hija de L1D-39, Sprint 5, 3 pts): espejo de D4-01 creado en Linear.
14. **D4-19** aprobada (2 pts, `ai-services-dev`, en curso, antes de L1D-144). **D4-09** (módulo estadístico único) -> L1D-299, aprobada. **D4-20** -> L1D-144 y **D4-21** -> inicio del Sprint 5, aprobadas.
15. **D4-18 cuenta en el sprint:** el S4 pasa de 73 a **74** pts (ver `S4-plan.md` §7). D4-19 (2 pts) queda como decisión pendiente: ¿cuenta dentro del sprint (76)?
16. **RN-25 «No disponible» (L1D-131):** confirmado; el AC-9 asumido queda sustituido. Se usa el texto de conflicto de la spec («requieren contraste…»). «Población no comparable según los datos registrados» no se aplica, por AC-3.
17. **Aplazos:** L1D-131 1.1/2.9 -> L1D-297; L1D-245 3.1-3.3 y 4.1 -> deuda S5 de `rag-orchestrator` / *spike* D4-21.
18. **`.env.example`:** se cubre en el PR #265 de la sesión principal.

**Decisiones del 2026-10-31 (cuarta tanda)**

19. **D4-19:** se MANTIENE el comportamiento de `unsupportedClaims` (una opción retirada por su propio texto lista también la principal aunque el NLI no la haya juzgado; heredado de L1D-295). Queda documentado, **sin `Test-Removal` y sin cambiar tests**. Fila: «Aprobada, entregada en el PR #269, comportamiento mantenido y documentado». Cuenta dentro del sprint: S4 pasa de 74 a 76 (`S4-plan.md` §7).
20. **D4-22:** ADR corto antes de usar `turbopack.resolveAlias` (excepción al principio de no personalizar el bundler): [ADR-49](../../docs/architecture/adr/ADR-49-alias-turbopack-temporal-clinical-language.md), propuesto, pendiente de firma. La deuda (subpath puro `./verificador` y retirada del alias) pasa al Sprint 5; D4-22 queda fuera del S4.
21. **US-246 AC-2 enmendado:** «(texto no mostrado)» aparece solo cuando el filtro RN-23 del cliente rechaza una afirmación o el backend ya la envió retirada; con `lenguaje_no_permitido` solo se muestra la nota. Ver `FEAT-10a` y `docs/ux/S4/pantallas-s4.md`. Espejo en Linear (L1D-296): sesión principal.
22. **L1D-296:** se acepta la lista RN-23 horneada en el build y el filtro de cliente de nivel A; el pin de versión pasa a deuda (D4-24).
23. **Orden de despacho y recorte** (L1D-144 tras #269, luego L1D-300 y L1D-145; L1D-299 y L1D-297 solo bajo el 80 % de uso): ver `S4-plan.md` §8.
24. **Reportes de evaluación:** los de L1D-294, L1D-245 y L1D-295 ya están copiados a `reports/eval/` por la sesión principal (PR #268 para L1D-295); el de D4-19 lo copia la sesión principal tras el merge de #269.
25. **Numeración (2026-10-31, modo aceleración: el S4 se cierra hoy):** D4-23 = alertas de code scanning abiertas (deuda de seguridad S5); el pin de versión de la lista RN-23 pasa a D4-24. Regla de recorte y Gate 2 de una vuelta: `S4-plan.md` §8.
