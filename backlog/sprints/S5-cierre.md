# S5 · Cierre (`/sprint-close S5`)

> 2026-11-04 · rama `sprint/S5-close` sobre `main` 4cedab28. Uso académico/investigación; solo datos sintéticos.
> Insumos: [`S5-plan.md`](S5-plan.md), `S5-status.md` (local, ignorado por git), [`S5-deuda.md`](S5-deuda.md), [`S5-trazabilidad.md`](S5-trazabilidad.md), `docs/process/definition-of-done.md` («Historia cerrada»).
> Lo que está aquí son hechos del registro salvo donde se marca **I** (inferencia). Las mejoras de proceso del §7 **no están aplicadas**.

## 1. Control: archivo y traslado

**Archivados hoy (16 changes, `openspec/changes/archive/2026-11-04-*`)**: `l1d-306`, `l1d-84`, `l1d-74`, `l1d-76`, `l1d-309`, `l1d-269`, `l1d-80`, `l1d-91`, `l1d-195`, `l1d-196`, `l1d-310`, `l1d-96`, `l1d-79`, `l1d-90`, `l1d-305`, `arr-11`. Orden aplicado: 74 → 76 → 96 y el resto. Criterio: PR mergeado, `openspec validate --strict` en verde y cada tarea abierta con ID destino. Ningún conflicto de deltas entre ellos.

**Movidos al S6 (`movido-S6`, sin archivar)**

| Change | Motivo |
|---|---|
| `l1d-113`, `l1d-268` | Corridas nocturnas D5-24 y D5-13 y tareas humanas (H-1, H-2, H-5) |
| `l1d-246` | Fidelidad D5-50 y revisión del oncólogo (H-2) |
| `l1d-299` | Revisión del dorado (D5-26) |
| `l1d-119` | Curaduría (D5-09) y barridos (D5-08) |
| `l1d-248` | G-Demo «no superado» por el script (aceptado por el PO con excepciones); AC sin verificar |

Sin change: L1D-92 (DEC-01) y L1D-125 (DEC-11), firmas del oncólogo. **Arrastre de sprints anteriores sin archivar** (hueco M5 de la auditoría): `l1d-116`, `l1d-126`, `l1d-166`, `l1d-173`, `l1d-197`, `l1d-205`, `l1d-285` y `us-231b`; varios tienen tareas sin ID destino.

**Ajustes de cierre en la rama:** tareas 5.2 y 5.3 de `l1d-76` marcadas hechas (cumplidas por L1D-96 y L1D-80); Purpose escrito en `case-timeline`, `terminology-reconciliation` y `manual-clinical-entry`; dos requisitos acortados (`data-model` seed, `patients-identity` contador) para pasar `validate --specs --strict`.

## 2. Verificación global sobre `main`

- `openspec validate --specs --strict`: **28/28**; `--changes --strict`: **14/14**.
- **`opsx:verify` por change (16, dos lotes):** sin regresión ni incumplimiento. Avisos: D5-14 (fuga ADR-32 en el checklist de faltantes), D5-31 (traslado circular entre L1D-80 y L1D-195), `l1d-90` 3.1 sin fila de deuda propia, `arr-11` sin `docs/demo/guia-demo-S5.md` en `consumidos_por_codigo` de `cambios-paths.yaml`. El skill solo devolvió su procedimiento; se aplicó a mano, sin ejecutar suites.
- **Suites completas:** las cubre la CI de `main` (`CI`, `E2E` y `Push on main` en success sobre 4cedab28). No se repitieron en local.
- **`run-ai-eval`:** ver §4; D5-06 salió con código 4 (4 rechazos de nivel B aceptados), `opciones` con 0 tras #328.
- **`/security-review` (`privacy-guardian`, `e5d6546e..main`): PASS, 0 Críticos y 0 Altos.** 3 Medios: M-1 (el opt-out RN-15 debe entrar en S6 antes de retirar la guarda de entorno sintético), M-2 (sin límite de tasa por usuario, RN-30), M-3 (IDOR por diseño en el seguimiento hasta `CareTeamMember`, riesgo aceptado). 5 Bajos (entre ellos `Content-Type` sin exigir en el proxy de seguimiento, delimitadores de memoria en el prompt, `**/*.md` como documentación en la CI que cubre `.claude/**`). No se ejecutaron `npm audit` ni `pip-audit` (los cubre el job `dependencies`).
- **Code scanning (hallazgo del cierre):** hay **2 alertas abiertas nuevas en `main`**, #14 (`clinical-attributes.controller.ts:41`) y #15 (`manual-entry.controller.ts:103`), ambas `js/sensitive-get-query` (medium), creadas el 2026-11-04 tras mergear #315 y #318. Mismo patrón que la #12 (D4-23). La #1 es de antes del sprint. **Actualización post-cierre (2026-11-04):** las alertas #12, #14 y #15 se descartaron en GitHub como falso positivo (`patientId` es el parámetro de ruta, validado como UUID opaco con `z.uuid()`; RN-10): CodeQL las marca por el nombre del identificador. Con ello L1D-80 y L1D-91 cumplen «0 alertas» y vuelven a Done: **17/25 (0,68) y 62/90 (0,69)**; la meta ≥ 0,80 sigue sin alcanzarse. Queda abierta la #1 (anterior al sprint).

## 3. Trazabilidad

Detalle en [`S5-trazabilidad.md`](S5-trazabilidad.md) y `backlog/03-trazabilidad.md` (regenerado). Cobertura S4 → S5: FR 19 → 21 con spec, RN 26 → 28, AC 27 → 34, CAP 0 → 3; ningún ID pierde spec ni test.

- **Cierre por la DoD: 15 de 25 historias (0,60) y 54 de 90 puntos.** El status local contaba 17/25 y 62/90 porque no contaba las alertas #14 y #15; la auditoría devolvió L1D-80 y L1D-91 a *In Review* en Linear. Si se triagean las dos alertas, vuelve a 17/25 (0,68) y 62/90 (0,69). **Meta ≥ 0,80: no se alcanza en ningún escenario** (línea base del S3 ≈ 0,53).
- Linear: L1D-39 (FEAT-T3) pasó a Done; L1D-80 y L1D-91 de Done a *In Review*. L1D-248 (la actualiza el humano) figura en Done en Linear pese a no estar cerrada.
- **Huecos Bloqueantes (propuestas para S6, sin crear issues):** B1 triage de #14 y #15 (**resuelto 2026-11-04**); B2 historia «G-Demo real verificable» (D5-53, D5-55, D5-57, D5-54).
- **Mayores:** M1 tres informes de `evaluate` sin versionar en `reports/eval/` (L1D-305 3.6, L1D-90 3.1, L1D-80 H-1); M2 D5-14; M3 D5-31; M4 commit `40d65f16` sin trailer `Test-Removal`; M5 ocho changes de arrastre; M6 US-242 AC-9 y US-233b AC-9 sin historia.
- Corrección a la auditoría: «US-111 AC-6» **no es un hueco**; US-111 tiene AC-1 a AC-5 y el AC-6 citado es de US-110, con sus tests.

## 4. Review · Demo (S5 → G-Demo)

**Recorrido con datos sintéticos** (guía en `docs/demo/guia-demo-S5.md`; seed de 13 pacientes): login, listado, ficha con corrección con histórico, vista de caso (timeline, sin fecha confiable, tratamientos, atributos y datos críticos con acción por faltante), registro manual de biomarcador y diagnóstico, análisis con opciones citadas ordenadas por aplicabilidad (RN-28) y hasta 10 preguntas de seguimiento.

**Checklist G-Demo (corrida real con LLM local, `gemma4:26b-a4b-it-q4_K_M`, commit 67f376f1)**

| Criterio | Resultado |
|---|---|
| E2E real, pasos 1 a 8 | ok |
| E2E real, pregunta de seguimiento 1 con citas | **falla** (0 fragmentos sobre el umbral: «sin evidencia», RN-02); el paso 10 no corre |
| M-10.1 / M-10.2 | en meta (20/20 tras #328 / 0 prescriptivas mostradas) |
| recall@10 / es→en / MRR / citas / «sin evidencia» | 1,0 / 1,0 / 0,711 / 1,0 / 1,0, todas en meta |
| Fidelidad | **0,862 (`opciones`) y 0,875 (`all`), bajo la meta 0,90** |
| Solo sintético | 13 sintéticos, 0 reales; el registro dice «no» por el defecto D5-53 |
| p95 | `consulta` en `evaluate` 11,43 s (meta 15 s); análisis E2E completo 36,5 s con **una** muestra; sin baseline |

**Veredicto del script: «G-Demo no superado»** (`docs/gates/no-superados/G-Demo-real-no-superado-2026-11-04.md`). **El PO firmó H-4 aceptando el hito con excepciones** (`docs/gates/aceptaciones-del-po/G-Demo-S5-aceptacion-del-po-2026-11-04.md`); no es un registro «superado» y no habilita datos reales.

**Mediciones nocturnas (D5-06, D5-28):** el generador local abortaba con `principal_duplicada` (causa raíz: el modelo etiqueta como principal cada afirmación con fuente distinta; no era la regresión de L1D-113; #326 separa `main_claim` de `other_claims`). Tras #326 y #328: RN-23 con A/B mostrados 0/0 y 4 rechazos legítimos de nivel B aceptados (D5-48); `opciones` con M-10.1 20/20, fidelidad 0,862 y `esperadas_presentes` 13/30. D5-26 (poblacion local) y D5-08 (calibración) no se pudieron correr: falta código y stack.

## 5. Retrospectiva: lo implementado

- **Puntos:** 54/90 cerrados por la DoD (62/90 con las alertas triageadas); 15 de 25 historias (17 con triage). ~70 pts con PR mergeado.
- **PR mergeados del sprint:** #290 a #334 salvo dependabot; incluyen 16 historias de código, #326 (generador) y #328 (métrica M-10.1), #317 (vigilante de PR) y los PR docs de cada oleada.
- **Deuda registrada:** D5-01 a D5-60 en `S5-deuda.md`; decididas D5-50 a D5-59.
- **Decisiones del humano durante el sprint:** `?item=` solo en la ficha; letras (g)–(m) de L1D-310; E2E de próstata reducido (D5-43); `no_mapeado` en (j) y (l); tolerancia RN-23 (D5-48); aceptación del G-Demo con excepciones.

## 6. Retrospectiva: proceso agéntico

| # | Situación y causa (R = registro, I = inferencia) | Efecto |
|---|---|---|
| 1 | **R.** Trailer `Test-Removal` fuera del último párrafo en `35c57aeb` (L1D-306). Corregirlo exigía reescribir historia y el *force-push* está denegado | L1D-306 se rehizo en una rama v2 limpia (#293) |
| 2 | **R.** `higiene-proceso` rojo ≥ 8 veces: tareas abiertas sin `DIFERIDA -> ID` (L1D-310, L1D-91, entre otras) | Una ronda de CI y un commit por vez |
| 3 | **R.** E2E de #315: selector ambiguo (el seed ya traía «Posmenopáusica») | Corregido en `f34848e3` |
| 4 | **R.** Flakes de CI: teardown de PostgreSQL en `tests/support/pg.py` (`permission denied to terminate process`) y `persistencia-fallos` (504 frente a 200) | Relanzados; D5-52 |
| 5 | **R.** `principal_duplicada` abortaba toda la suite local; las corridas anteriores solo usaban 6 preguntas de otra config | #326 y #328 |
| 6 | **R.** El defecto de `banderas.mjs` (D5-53) solo se vio en la corrida real: sus tests usan fixtures | Ningún G-Demo real puede superarse |
| 7 | **R.** Las alertas #14 y #15 aparecen en `main` después del merge; el chequeo por `refs/pull/N/merge` daba 0 | El «0 alertas» se declaró en falso en #315 y #318 |
| 8 | **R.** El orquestador contó 17/25 y 62/90; la auditoría 15/25 y 54/90 | Cifra corregida en este cierre |
| 9 | **R.** Una autorización del humano relayada por un agente no fue aceptada por el implementador de L1D-119 | Curaduría sin hacer (D5-09) |
| 10 | **R.** La tabla «Métricas del S5» de `S5-status.md` quedó vacía | Sin vueltas de gate por historia exactas. **I:** del texto salen ~50 menciones de «vuelta 1» y ~17 de «vuelta 2», en su mayoría de `design-principles-reviewer` |
| 11 | **R.** `design-principles-reviewer` devolvió Mayores/P1 repetidos: destino de registro triplicado (L1D-96), traductores de 422 duplicados (L1D-91/L1D-80), regla «sin fecha confiable» triplicada (D5-22) | Refactor en vuelta 1 o deuda D5-22, D5-40, D5-44 |
| 12 | **R.** Memoria del equipo: `rag-orchestrator` 10,35 GiB más LLM 17 GB provocó swap (14 GB) | D5-59 |

**TDD:** una excepción de trailer (`40d65f16`, M4) y las reescrituras de tests de forma del esquema en #326 con `Test-Removal` correctamente ubicado. `verificar-commits-tdd` avisó de dos commits `feat` previos al test en L1D-90.

## 7. Mejoras propuestas (SIN aplicar; requieren tu aprobación)

1. **Alertas en `main` tras cada merge.** Que el vigilante, después del merge, lea `code-scanning/alerts?ref=refs/heads/main` y avise de las nuevas. Cambio en `.claude/hooks/vigilar-pr.sh` (modo `--main <sha>`) y en `sprint-orchestrator.md`: «0 alertas» se mide sobre `main` tras el merge. Además, triagear `js/sensitive-get-query` (#12, #14, #15: el mismo patrón sobre el UUID de ruta) con una exclusión justificada en `codeql-config` o descartándolas con motivo.
2. **Compuertas que leen configuración se prueban contra la configuración real** (lo que falló en D5-53). Regla nueva para `openspec/config.yaml` (`rules.tasks`): «un script de gate que lea `docker compose config`, variables de entorno o ficheros del repo lleva al menos un test que ejecute el comando real».
3. **Cambio de esquema o prompt corre la suite local completa**, no solo `local.yaml`. Regla en `eval-required`: si el diff toca `generation.py`, `prompts/` o el esquema del runtime, el reporte debe incluir `rn23-local.yaml --suite all` y `s5.yaml --suite opciones`.
4. **Validar el trailer `Test-Removal` al hacer el commit**, no en la CI: ampliar `.claude/hooks/pre-commit-gate.sh` para rechazar un `Test-Removal` fuera del último párrafo (evita repetir el caso de L1D-306).
5. **Higiene de tareas antes del PR.** Que `implement-story` ejecute `higiene-proceso` en local antes de abrir el PR (8 rondas de CI rojas por lo mismo).
6. **Cifra de cierre calculada, no declarada.** Un script que cuente historias cerradas desde Linear, `openspec` y code scanning, y que el orquestador cite en lugar de su recuento manual.
7. **Rellenar la tabla de métricas del status** al cerrar cada historia (vueltas por guardián, P1/P2/P3), porque este cierre no puede dar cifras exactas.
8. **Sacar `.claude/**` de `documentacion`** en `scripts/ci/cambios-paths.yaml` (hallazgo B-4 de seguridad), y añadir `docs/demo/guia-demo-S*.md` a `consumidos_por_codigo`.

## 8. Pendientes de decisión del humano

- Aprobar o rechazar cada mejora del §7 (por número).
- ~~Triage de las alertas #14 y #15~~ **hecho (2026-11-04)**: descartadas como falso positivo junto con la #12; L1D-80 y L1D-91 recuperadas (17/25).
- Estado de L1D-248 en Linear (figura en Done).
- Hito de Linear: las 6 historias movidas siguen en «Sprint 5».
- Firmas DEC-01 (L1D-92) y DEC-11 (L1D-125); revisión del dorado (L1D-299) y de los 4 casos de `opciones` (L1D-246); curaduría de L1D-119; H-1, H-2 y H-5 de L1D-268.
- Informes de `evaluate` a `reports/eval/` (M1).
- ¿Un PR aparte para archivar los 8 changes de arrastre (M5)? Varios tienen tareas sin ID destino.

## 9. Prioridades del S6 añadidas por el usuario (2026-11-05, tras la Demo 5)

Insumo para `/sprint-refine S6`; no cambia el slicing por sí solo (cualquier ajuste de puntos requiere su aprobación).

1. **Ampliar el corpus del RAG (L1D-119, US-120) es prioridad del S6 y no se recorta.** Encaja en el primer lugar del orden de E-15 (RAG de conocimiento → búsqueda por datos del paciente → OCR → usuarios). Punto de partida medido en la Demo 5 (Milvus, `is_current`): **10 documentos y 310 chunks**; mama 5 documentos (161 chunks) y próstata 5 (149), de 2 fuentes (NCI y PMC Open Access), 8 de 10 en inglés. Meta de US-120: ≥ 20 documentos por tipo de ≥ 3 fuentes distintas, solo las de ADR-36 y con licencia aceptada por documento (RN-21).
   - Entra con sus deudas: **D5-09** (curaduría y descarga de ~40 documentos, con red) y **D5-08** (corrida nocturna: ingesta real, `reindex-sparse`, población en abanico, barridos de umbrales y baseline por tipo e idioma).
   - Riesgo a decidir en el refinamiento: cada documento nuevo pasa por la extracción de población (ADR-47) con el LLM local, y los umbrales se calibraron con 10 documentos; `evaluate` (OL-06) es obligatoria en el PR.
   - Solo hay 2 documentos en español (ambos «para pacientes»): conviene que la curaduría incluya fuentes en español.
2. **Feedback de la Demo 5** (changes `d5fb-01` … `d5fb-05`, sin L1D asignado): ver `openspec/changes/d5fb-*`. Crear sus historias en Linear solo con aprobación del usuario.
3. **Primer ítem del RAG en el S6, junto con la ampliación del corpus: recall de la recuperación antes del reranker (hallazgo de la Demo 5, 2026-11-05; aprobado por el usuario).** Afecta a **todas** las preguntas, no solo a la que lo reveló, y la consistencia entre idiomas (ES/EN) depende de él. **Decisión del usuario:** al inicio del S6 se evalúan las 4 recomendaciones y se hacen las 4 si es posible, o las que mayor impacto generen; el orden y el alcance se fijan en `/sprint-refine S6` con las mediciones de la tabla.
   - **Caso que lo reveló:** paciente 1 (`0fd028e2-f8b0-56c7-a748-2a4e473d879d`), pregunta «targeted therapy for HER2-positive metastatic breast cancer in patients who previously received trastuzumab, pertuzumab and trastuzumab emtansine»: EN dio «0 opciones descritas» (1 opción generada, T-DM1 adyuvante, descartada por NLI como `afirmacion_sin_soporte`) y ES dio 3 opciones. Registros `req_a73a4eda` (EN) y `req_bd991673` (ES) en `clinical.ai_analysis_record`.
   - **Medición (reproducción offline con los adaptadores reales; sin LLM ni escrituras; con y sin el resumen del contexto clínico el resultado es idéntico, así que el contexto no influye):** el reranker, al puntuar los 30 candidatos, pone en primer y segundo lugar `nci-mama-hp-en[93]` y `[92]` (margetuximab: pacientes con trastuzumab, pertuzumab y T-DM1 previos) con 0,996/0,993 (EN) y 0,985/0,980 (ES). Esos chunks quedan en el puesto 13–15 por similitud densa y **nunca se puntúan** porque solo los 12 mejores por similitud densa (`RERANKER_MAX_PAIRS = 12`, ADR-39) llegan al reranker. En EN, 7 de los 10 mejores según el reranker quedan fuera del corte; en ES, 5 de 10. Entre los puestos 6 y 15 la similitud densa varía solo entre 0,67 y 0,71: el corte es casi azar.
   - **Ruido en los cupos:** 5 de los 12 cupos en EN (3 en ES) son listas de referencias bibliográficas (p. ej. `nci-mama-hp-en[104]`, `[105]`, `[69]`, `[70]`, `[103]`); `[104]` puntúa 0,924 y se entrega al generador como evidencia.
   - **Por qué ES «funciona» y EN no:** `nci-mama-pac-es[6]` (lista de opciones del texto para pacientes) queda en el puesto 3 denso con la pregunta en ES y en el 23 con la de EN; el 83 % de los 12 chunks coincide entre idiomas y ese cambio en el margen decide el resultado.
   - **Las 4 recomendaciones a evaluar al inicio del S6** (cada una pasa por `evaluate`, OL-06, porque cambia corpus, umbral o recuperación):

     | # | Recomendación | Efecto esperado | Costo / riesgo |
     |---|---|---|---|
     | R1 | **Excluir las listas de referencias en la ingesta** (reingesta del corpus) | Libera de 3 a 5 cupos de los 12. Simulado: con solo esto `[93]` sube al puesto 8 (EN) y 12 (ES, al borde) | Reingesta; sin costo de latencia |
     | R2 | **Subir `RERANKER_MAX_PAIRS` a 16** | Margen adicional para `[93]` en ES | ADR-39 midió +1,3 s: p95 estimado de 14,6 a 15,9 s, fuera del NFR de 15 s. Solo si se recalibra el NFR (DEC-03) |
     | R3 | **Evaluar la recuperación híbrida** (`RETRIEVAL_MODE=hibrida`) para mejorar el preorden | Mejor selección de los 12 sin más pares | Ya existe y se midió frente a la densa en el S4 (US-245); falta medirla sobre este caso y el corpus ampliado |
     | R4 | **Registrar en el log los ids de chunk cortados y su orden** (nunca el texto; RN-10) en `rag_query_corte` | Hace observable este fallo | Mínimo |

   - **Alternativas descartadas (no reabrir sin motivo):** puntuar los 30 candidatos (~0,35 s por par, ~6 s más por consulta, p95 > 20 s); bajar `RELEVANCE_THRESHOLD` (el umbral no es el problema, `[93]` ni se puntúa); traducir las preguntas al español (esconde el fallo y favorece textos para pacientes); fijar a mano el chunk (no escala).
   - **Límite de lo medido:** no se ejecutó el LLM. Que con `[93]` incluido el generador produzca opciones correctas y el NLI las acepte se confirma en `evaluate`.
   - **Métrica nueva sugerida para OL-06:** «recall previo al reranker» (qué parte de los 10 mejores según el reranker sobre los 30 entra en el corte de 12), medida por tipo de cáncer e idioma.
   - **Otros dos hallazgos del mismo caso, para el refinamiento del S6 (sin decidir):** (a) un análisis con estado `con_evidencia` y 0 opciones muestra «Análisis listo: 0 opciones descritas» sin explicar que hubo una opción descartada y por qué; (b) nada impide proponer un fármaco que la paciente ya recibió (el modelo sugirió T-DM1 a quien ya lo recibió). Ambos cambian prompt o reglas y exigen `evaluate`.
