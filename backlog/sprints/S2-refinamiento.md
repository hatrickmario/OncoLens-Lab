# S2 · Refinamiento: DoR, decisiones, stack y diseño

> `/sprint-refine S2` · 2026-10-20 · Milestone **Sprint 2** del proyecto OncoLens-1 · Fuente: `backlog/features/` y `backlog/sprints/S2-arrastre.md` (Linear es el espejo).
> **Demo del S2:** login → listado → ficha → análisis con Base del análisis; suite `evaluate` en la DoD de cada PR que cambia la IA; baseline técnico calibrado y umbral de regresión activo.
> Respuestas citables como `[S2 resp. n]`. **Estado: decidido (usuario, 2026-10-21).** El usuario aceptó todas las recomendaciones salvo el fixture de identidad (resp. 11); respuestas en §7, ya aplicadas al Markdown de las historias, a los changes y a Linear.

## 1. Alcance cruzado (Linear ↔ Markdown)

- **Historias del backlog:** 27 historias, **93 pts + US-073 (`?`)**, sin diferencias de alcance entre Linear y el Markdown.
- **Arrastre del S1** (`S2-arrastre.md`): **Done** ARR-04 (L1D-280), ARR-07 (L1D-283), ARR-08 (L1D-284) · **Done en Linear pero incompleta** ARR-02 (L1D-278): faltan el job de E2E en la CI y el AC-3 (`/login` sigue en CSS Modules, `apps/web/app/login/login.module.css`); la automatización GitHub → Linear la cerró al mergear #111 (trampa ya conocida). **Abiertas:** ARR-01 (5), ARR-03 (3), ARR-05 (3), ARR-06 (3).
- **Changes del S1 activos (14)**: pasan al S2 por `S1-cierre.md` §1; su conciliación y archivo es ARR-06. No bloquean `/sprint-start`.
- **Pendiente abierto:** ADR-39 fase B **aceptada** (usuario, 2026-10-20: Ollama, `gemma4:26b-a4b-it-q4_K_M`, OCR 0,917) → desbloquea el juez local de ADR-41 y re-estima US-073. Margen de memoria del stack con G: **0,71 GB** (riesgo ya aceptado); condiciona ADR-40.

## 2. Definition of Ready

**Fallos encontrados:**

| L1D | US | Criterio que falla | Qué falta | Propuesta |
|---|---|---|---|---|
| L1D-263 | US-213 | Tamaño (12 AC > 8; estimación «propuesta: 8») | Partir por superficie | P-1: **US-213a** capas y umbrales (AC-1…AC-7, 5 pts) en S2 · **US-213b** higiene de tests, mocks, cobertura y ejemplos (AC-8…AC-12, 3 pts) a S3 |
| L1D-235 | US-072 | Tamaño (8 pts; regla «una de 8 se parte siempre») · label `needs-refinement` en Linear | Partir por superficie | P-1: **US-072a** runner `evaluate`, recuperación, «sin evidencia», citas, reporte y `baseline.json` (5) · **US-072b** fidelidad (NLI + juez local), PII y prescriptivas (3); ambas en S2 |
| L1D-236 | US-073 | Estimación `?` | Re-estimar (ADR-39 cerrada; ADR-41 cierra en el S2) | P-1: **3 pts** (reusa `retrieval_metrics.py` y el modo `sin_evidencia` de ADR-39; se solapa con ARR-03 AC-5) |
| L1D-58 · L1D-59 | US-078 · US-079 | Dependencias: consumen `/documents/extract` (US-082, S3), que **no está implementado** en `rag-orchestrator` (`app/api/` solo tiene `rag_query`); US-079 AC-1 y AC-3 exigen «Completado» y «La extracción falló» | Extracción o un *fake* acordado | P-1: **mover al S3** junto a US-082. US-076 (subida, validación, `409`) se queda en S2 |
| L1D-205 | US-013 · ADR-40 | Decisiones (candidatos y regla de elección); memoria | Encuadre | P-2 (§3.1) |
| L1D-232 | US-014 · ADR-41 | Decisiones | Encuadre | P-3 (§3.2) |
| L1D-72 | US-051 | Decisiones: 2 `Pendiente de definir` | (1) estados que cuentan en `pendingReviewCount`; (2) histología y Gleason/ISUP en la ficha | (2) **resuelto por el contrato:** `Diagnosis` ya trae `histology`, `histologyCode`, `grade` y `gradings[]` (`apps/clinical-api/openapi.yaml`) → se muestran (`docs/ux/S2/`). (1) P-4 |
| L1D-202 | US-048 | Decisiones: búsqueda por nombre (AC-3) | Semántica de coincidencia | P-4 |
| L1D-173 | US-043 | Decisiones: criterio de «listo» (DEC-19) | Aceptar el escenario más probable escrito | P-4: aplica como prerrequisito de G-Piloto, no de la demo sintética |
| L1D-233 · L1D-174 · L1D-73 | US-016 · DEC-06 · US-018 · DEC-08 · US-019 · DEC-09 | Dependencias: dueño = oncólogo asesor; por la **decisión 88** las sesiones reales con oncólogos pasan a antes de G-Demo | Agenda | P-1: **mover al S4** con ARR-05, en la misma sesión. Mientras tanto rigen sus escenarios más probables (US-072 rotula «no validada»; DEC-09 valida la regla de #12 tal cual, que necesita el S3; DEC-08 solo la consume US-091, `si-hay-capacidad`) |
| L1D-278 | ARR-02 | Estado (Done con alcance abierto) | Reabrir el resto | P-1: **ARR-02 resto** (job de E2E en la CI + AC-3, ~3 pts) vuelve a *In Progress* |
| L1D-281 | ARR-05 | Dependencias (agenda; decisión 88) | Milestone | P-1: **S4** |
| L1D-282 | ARR-06 | Decisiones: AC-4 (¿adelantar US-216 desde el S6?) | Decisión | P-5 |

**Estado tras aceptar las propuestas (todas ✓ salvo lo que depende de P-1…P-6):**

| L1D | US | Pts | AC | Sin refinar | AC verificables | Dependencias | Decisiones | Tamaño | Diseño |
|---|---|---|---|---|---|---|---|---|---|
| L1D-198 | US-044 | 3 | 5 | ✓ | ✓ integración + E2E | ✓ ↪ US-211 | ✓ | ✓ | ✓ `docs/ux/S2/` S2-00, S2-01 |
| L1D-199 | US-045 | 3 | 6 | ✓ | ✓ integración (CLI) | ✓ | ✓ | ✓ | n/a |
| L1D-200 | US-046 | 5 | 6 | ✓ | ✓ integración (cifrado, índice ciego) | ✓ | ✓ | ✓ | ✓ S2-04 |
| L1D-202 | US-048 | 5 | 7 | ✓ | ✓ | ✓ ↪ US-046 | P-4 | ✓ | ✓ S2-02 |
| L1D-72 | US-051 | 5 | 6 | ✓ | ✓ | ✓ ↪ US-046 | P-4 | ✓ | ✓ S2-04 |
| L1D-205 | US-013 · ADR-40 | 5 | 6 | ✓ | ✓ (sobre el ADR y la medición) | ✓ | P-2 | ✓ | n/a |
| L1D-56 | US-076 | 5 | 8 | ✓ | ✓ integración (magic bytes, 20 MB, `409`) | ✓ | ✓ | ✓ (8 AC, límite) | n/a (sin UI en S2) |
| L1D-167 | US-037 | 3 | 6 | ✓ | ✓ test de arranque | ✓ | ✓ | ✓ | n/a |
| L1D-170 | US-040 | 5 | 6 | ✓ | ✓ *permission denied* en CI | ✓ (ARR-01 lleva la CI) | ✓ | ✓ | n/a |
| L1D-171 | US-041 | 5 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-173 | US-043 | 3 | 5 | ✓ | ✓ | ✓ ↪ US-041 | P-4 | ✓ | ✓ S2-02, S2-04 |
| L1D-186 | US-066 | 5 | 6 | ✓ | ✓ integración + Pytest | ✓ | ✓ | ✓ | n/a |
| L1D-187 | US-067 | 3 | 5 | ✓ | ✓ Testing Library + MSW + E2E | ✓ ↪ US-066 | ✓ | ✓ | ✓ S2-09 |
| L1D-263 | US-213a | 5 | 7 | ✓ | ✓ fixtures de PR | ✓ | ✓ (umbrales decididos) | ✓ tras P-1 | n/a |
| L1D-264 | US-214 | 3 | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-273 | US-223 | 2 | 3 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-267 | US-217 | 2 | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-232 | US-014 · ADR-41 | 3 | 5 | ✓ | ✓ (sobre el ADR) | ✓ ADR-39 aceptada | P-3 | ✓ | n/a |
| L1D-235 | US-072a / US-072b | 5 + 3 | 4 + 3 | ✓ | ✓ reporte `ai-eval-runner` | ✓ ↪ ADR-41 | ✓ | ✓ tras P-1 | n/a |
| L1D-236 | US-073 | 3 | 4 | ✓ | ✓ | ✓ ↪ US-072a | ✓ | ✓ tras P-1 | n/a |
| L1D-237 | US-074 | 3 | 6 | ✓ | ✓ fixture de PR | ✓ ↪ US-072a | ✓ | ✓ | n/a |
| L1D-234 | US-017 · DEC-07 | 1 | 4 | ✓ | ✓ | ✓ ↪ US-073 (cierre del sprint) | ✓ | ✓ | n/a |
| L1D-277 | ARR-01 | 5 | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-278 | ARR-02 resto | ~3 | 2 (CI + AC-3) | ✓ | ✓ visual-check + job | ✓ | ✓ | ✓ | ✓ S2-01 |
| L1D-279 | ARR-03 | 3 | 5 | ✓ | ✓ reporte | ✓ ↪ US-072a/b | ✓ | ✓ | n/a |
| L1D-282 | ARR-06 | 3 | 6 | ✓ | ✓ | ✓ ↪ ARR-01, ARR-02 | P-5 | ✓ | n/a |

## 3. Decisiones y ADRs del sprint

### 3.1 ADR-40 · Detección de PII (caro de revertir: privacidad) — P-2

Hechos: la opción A ya rige en `clinical-api` (`deidentification/pii-detector.opcion-a.ts`: coincidencia exacta con la identidad conocida + formatos de `config/pii-formats.json`, `[S1 resp. 3]`); `rag-orchestrator` no tiene adapter `pii/`; no hay dataset de PII sembrada; la ingesta de documentos (consumidor del gate de Backend 2) llega en el S3. **Margen de memoria con G: 0,71 GB.** Investigación verificada en la fuente (2026-10-20):

| Candidato | Pesos / memoria | Licencia | Español | Veredicto |
|---|---|---|---|---|
| **1 · A en ambos backends** (patrones configurables + identidad exacta; en B2 la verificación `identityFound`) | 0 | propia | por reglas | **Recomendada como base** |
| **2 · 1 + NER spaCy `es_core_news_md` 3.8.0 en `pii/` de B2** (vía Presidio 2.2.364 o directo) | wheel 42 MB (RSS sin publicar, cabe en el margen) | código MIT; **pesos GPL-3.0** (AnCora); se descargan, no se versionan | NER PER/LOC/ORG; F1 0,89 en noticias, sin dato de PII clínica | **Candidata a medir** |
| 3 · GLiNER `urchade/gliner_multi_pii-v1` | 1,16 GB PyTorch; sin ONNX multilingüe | Apache-2.0 | sin evidencia publicada | **Descartada:** no cabe en 0,71 GB |

Descartadas también: servicio de PII aparte (memoria y operación), NER con el LLM local (no determinista, consume el semáforo de inferencia) y enmascarar en Backend 2 el texto de la pregunta (viola RN-10/RN-11).
**Propuesta:** el ADR mide **1 frente a 2** sobre un dataset de PII sembrada (sintético, nuevo en `data/eval/pii-mini/`) y elige **la más simple que cumpla G-8 (≥ 0,95)** en identificadores directos con falsos positivos clínicos medidos; el punto de enmascaramiento de la pregunta y las notas queda en `clinical-api` antes del request (AC-2); formatos en configuración (AC-4). Si gana 2, la licencia GPL-3.0 de los pesos se registra como riesgo aceptado del MVP académico (sin redistribución). El adapter `pii/` se implementa en el S3 (FEAT-01b).
**Por qué no las otras:** 3 rompe el presupuesto de memoria de ADR-39; decidir 2 sin medir añade una dependencia GPL y memoria quizá innecesarias si 1 ya cumple con documentos sintéticos.

### 3.2 ADR-41 · Framework de evaluación (caro de revertir: toda la DoD de IA) — P-3

| Opción | A favor | En contra |
|---|---|---|
| **A · Propio con Pytest** (+ NLI mDeBERTa + juez local G por Ollama `/v1`, `temperature=0` y `seed` en configuración) | Ya existe la base (`app/evaluation/retrieval_metrics.py`: recall@10, MRR con IC 95 % *bootstrap*; NLI; partición congelada de ADR-45); sin red ni telemetría; las métricas propias (citas, «sin evidencia», prescriptivas = 0, PII) hay que escribirlas igual | Más código propio |
| B · ragas 0.4.3 fijado, solo para fidelidad | Definición de métricas conocida | Telemetría activa por defecto (`RAGAS_DO_NOT_TRACK=true`), juez OpenAI por defecto (riesgo RN-12 por olvido de configuración), langchain como dependencia, sin release desde 2026-01 |
| C · DeepEval 4.3.1 | Integración con Pytest | Telemetría PostHog/OTel por defecto, juez OpenAI por defecto, *churn* semanal |

**Propuesta: A.** El NLI es el juez principal de fidelidad (determinista); el juez LLM local (el mismo G) es secundario y su sesgo de autoevaluación se declara en el ADR. Un test de CI sin salida a red protege RN-12. **Por qué no B ni C:** ambas mandan telemetría y apuntan a la nube por defecto, y no cubren las métricas propias de OncoLens.

### 3.3 Decisiones baratas (una recomendación)

| Tema | Recomendación | Descartadas |
|---|---|---|
| US-051 · `pendingReviewCount` | Cuenta solo `requiere_revision`; `auto_aceptado` se muestra como «sin verificar» por dato (aviso aparte, RN-26) | Contar también `auto_aceptado`: infla el contador con datos que no esperan acción |
| US-048 · búsqueda por nombre | **Exacta sobre el nombre completo normalizado** (sin tildes, minúsculas, espacios colapsados) por índice ciego HMAC | Coincidencia parcial: exige guardar n-gramas o descifrar en lote, contra RN-10 y el índice ciego |
| US-043 · criterio de «listo» (DEC-19) | Se acepta el escenario escrito: prerrequisito de G-Piloto, no de la demo sintética | — |
| ARR-06 AC-4 · US-216 (cabeceras de `web`, D-9) | Se queda en el **S6**, antes de G-Piloto (S2 ya está sobre capacidad; sin datos reales no hay exposición) | Adelantarla al S2: +3 pts sin valor para la demo |

## 4. Ajuste del slicing (P-1, requiere aprobación)

| Cambio | Puntos en S2 |
|---|---|
| Base: 27 historias (93) + US-073 = 3 | 96 |
| US-213 re-estimada a 8 y partida (213a S2 = 5, 213b S3 = 3) | ±0 |
| US-072 partida 5 + 3 (ambas S2) | ±0 |
| US-078 y US-079 → S3 (con US-082) | −8 |
| DEC-06, DEC-08, DEC-09 → S4 (sesión de oncólogos con ARR-05) | −3 |
| Arrastre abierto: ARR-01 5 + ARR-03 3 + ARR-06 3 + ARR-02 resto ~3 (ARR-05 → S4) | +14 |
| **Total pendiente del S2** | **≈ 99** (+24 ya Done del arrastre) |

Impacto: S3 85 → **96** (+US-078, US-079, US-213b). S4 79 → 82. **Nada sale del camino crítico de G-Piloto (S6).** La demo del S2 no pierde nada (no incluía la carga de documentos). Si se quiere bajar más, el candidato siguiente es US-223 (2, deuda del Pre-S1) o US-217 (2) al S3.

## 5. Stack técnico

- **En la máquina (hecho en ARR-04):** Docker Desktop con VM ≥ 10 GB, Ollama 0.34.4 con G descargado, pesos ONNX en `~/adr39-modelos/`, Chromium de Playwright. **Nada nuevo que instalar.**
- **En el repo (como tareas de su historia):** servicio Milvus + PostgreSQL de test en la CI (ARR-01); job de E2E con Docker en el *runner* (ARR-02 resto); `es_core_news_md` solo si ADR-40 elige la opción 2 (dentro de US-013, en `requirements-eval.txt` para la medición); Tailwind v4 + shadcn/ui en `/login` (ARR-02 AC-3).
- **Sin mejoras de stack** que pidan ADR.

## 6. Diseño

- [`docs/ux/S2/pantallas-s2.md`](../../docs/ux/S2/pantallas-s2.md): S2-00 cabecera autenticada con «Cerrar sesión» y barra del paciente, S2-01 login (bloqueo genérico, expiración), S2-02 listado y búsqueda, S2-04 ficha mínima, S2-09 Base del análisis. **Un solo diseño por pantalla:** todas extienden patrones del Pre-S1/S1 (sin riesgo de UX nuevo que pida 3 variantes).
- Contrato: todos los datos existen en `apps/clinical-api/openapi.yaml` (`PatientSummary`, `PatientListItem`, `Diagnosis`, `AnalysisBasis`: `patientDataUsed`, `missingCriticalData`, `assumptions`, `sourcesConsulted`, `sourcesNotIncluded`, `corpusCutoffDate`, `limitations`, `omittedClaims`). Sin cambios de contrato.
- Literal unificado del tipo no habilitado: «Tipo de cáncer fuera del alcance del piloto: sin análisis con IA» (contiene el literal de US-043 AC-3 y el de `flujo-e2e.md`).
- Revisión de `clinical-language-auditor` (modo Diseño): ver §8.

## 7. Preguntas para el usuario

Respuestas del usuario (2026-10-21). En cada historia van como `Decidido (usuario, 2026-10-21)`.

| Resp. | Pregunta | Decisión |
|---|---|---|
| 1 | P-1 · Ajuste del slicing | Aprobado tal cual §4: US-078 y US-079 → S3; US-213 = 8, partida en 213a (5, S2) y 213b (3, S3); US-072 partida 5 + 3 (S2); US-073 = 3; DEC-06, DEC-08, DEC-09 y ARR-05 → S4; el resto de ARR-02 vuelve a *In Progress* |
| 2 | P-2 · ADR-40 | Encuadre §3.1: medir candidato 1 frente a 2 sobre `pii-mini` sintético y elegir el más simple que cumpla G-8 ≥ 0,95; GLiNER descartado; adapter `pii/` en el S3 |
| 3 | P-3 · ADR-41 | Opción A: propio con Pytest; NLI juez principal, G juez secundario con su sesgo declarado; ragas y DeepEval descartados |
| 4 | P-4a · Búsqueda por nombre (US-048 AC-3) | Exacta sobre el nombre completo normalizado (`full_name_hmac`); un apellido suelto no encuentra; AC-3 corregido |
| 5 | P-4b · `pendingReviewCount` (US-051) | Solo `requiere_revision`; `auto_aceptado` como «sin verificar» aparte |
| 6 | P-4c · DEC-19 y literal del tipo no habilitado (US-043) | El criterio de «listo» es prerrequisito de G-Piloto, no de la demo sintética; literal unificado de §6 |
| 7 | P-5 · US-216 | Se queda en el S6, antes de G-Piloto |
| 8 | P-6 · Plan (paso 6 de `/sprint-start`) | Aprobado: oleadas O1–O6, 3 historias en paralelo, merges por oleada |
| 9 | G-1 · ERR de `oasdiff` en US-076 | Excepciones E-4 y E-5 en ADR-26, con su test |
| 10 | G-2 · `corpusCutoffDate` sin consultar el corpus | Clave `CORPUS_CUTOFF_DATE`, actualizada por el script de carga del corpus |
| 11 | G-3 · Documento de FX-T4a-a | **Excepción del usuario:** numérico, sin prefijo `SINT-`. FX-T4a-a = `1234567`; el número distinto del AC-2 de US-046 = `123456`; el parcial del AC-2 de US-048 = `12345`. Aplicado en `backlog/` y en los changes del S2; los tests del S1 los cambia `l1d-200` (tarea 2.10) |
| 12 | G-4 · Versión con excepción E-n | Sube la versión **menor** (precedente E-1, E-3); se corrige el texto de ADR-26 en `l1d-56` |
| 13 | ¿Separar mama y próstata en dos bases o instancias de Milvus? | **No** (ver nota 13) |
| 14 | ¿Ampliar el corpus de mama y próstata en el S2, al doble o más? | **No en el S2.** Se mantiene en el **S4**, con una meta 4 veces mayor que hoy (ver nota 14) |

**Nota 13 · Corpus por tipo de cáncer.**
- **Ya está separado lógicamente desde el S1, con una sola colección.** `corpus_chunks` guarda el tipo de cáncer de cada fragmento (`cancer_type_tags`). Toda consulta filtra por el tipo del paciente y por `is_current` (`app/domain/retrieval_filter.py`, `expresion_vigente_del_tipo`). Una pregunta de mama nunca recupera fragmentos de próstata.
- **Es lo que ya decidió el ADR #5** (readme §3.3). Allí se descartaron la colección por fuente y las particiones por prematuras.
- **Dos instancias no caben en memoria.** Cada Milvus *standalone* trae su etcd y su MinIO, y cuesta 1–2 GB. Al stack de ADR-39 solo le quedan 0,71 GB.
- **Dos colecciones tampoco ayudan.** Duplican el índice cargado y los documentos que valen para ambos tipos. A esta escala (decenas de documentos, miles de fragmentos), la búsqueda filtrada tarda milisegundos y la latencia la marca el LLM.
- **La calidad depende de otras cosas:** la recuperación híbrida y el *reranker* (FEAT-06b, T5e) y el tamaño del corpus.
- **Cuándo revisarlo:** con el corpus del S4 medido. Si un tipo rinde peor, la primera opción es una *partition key* escalar, que no consume memoria extra, y siempre mediante un ADR.

**Nota 14 · Tamaño del corpus.**
- **Hoy:** 10 documentos, 5 de mama y 5 de próstata, de NCI y PMC (`data/raw/seed/`).
- **Plan del S4:**
  - US-117: ingesta reanudable, *dense* + *sparse*, versionada y con licencia verificada.
  - US-118: metadatos.
  - US-120: **≥ 20 documentos por tipo, de ≥ 3 fuentes abiertas**. Son ≥ 40 documentos, 4 veces lo actual, lo que supera el «doble o más».
- **Por qué no en el S2:**
  - Sin la ingesta de US-117, crecer exige cargar a mano con el script semilla, sin reanudación ni versionado.
  - El S2 construye la suite `evaluate` y calibra el baseline (US-072, US-073). Medir antes de ampliar permite mostrar el efecto del crecimiento en el S4.
  - Ampliar ahora movería el baseline justo cuando se calibra.
- **Alternativa no aplicada:** adelantar +10 documentos con el cargador semilla. Costaría ~3 pts, dejaría el S2 en ~102 y obligaría a recalibrar en el S4.

## 8. Revisión del diseño

`clinical-language-auditor` (modo Diseño, 2026-10-20): **PASS en lenguaje** (RN-19, RN-23, RN-25, RN-26, RN-01/RN-24, RN-03, RN-28). Hallazgos de contrato corregidos en el diseño:
- **Mayor:** el listado mostraba «Diagnóstico», que `PatientListItem` no trae → columna retirada (sin cambio de contrato); se muestra `missingCriticalCount` como texto informativo.
- **Menores:** sin `GET /api/auth/session` nuevo (sesión leída en el BFF) y pie de expiración sin cifra; barra del paciente con identidad completa (como la ficha); origen y revisión desde `provenance.*` con los cuatro `entryMethod`.
- **Preguntas resueltas en el diseño (barato):** supuestos y limitaciones se rotulan por `origin`; `<title>` «Pacientes · OncoLens» en el listado.
`design:accessibility-review`: no ejecutada aparte (las pantallas extienden componentes ya revisados en el S1); la evidencia WCAG la aporta `visual-check` en el Gate 2.
