# FEAT-T5a — Baseline de evaluación técnica, baseline manual de VM-1/VM-2 y suite en la DoD

> Linear: [L1D-46](https://linear.app/l1der-lab-mjbc/issue/L1D-46)

**Talla:** XL · **Sprint:** 1 (US-014 · ADR-41, US-016 · DEC-06, US-072, US-074: suite `evaluate` y suite en la DoD · US-075: baseline manual de VM-1/VM-2) · 2 (US-073: calibración y baseline técnico · US-017 · DEC-07) · **Capacidad:** T-5 (AC-T5.2, AC-T5.3, AC-T5.4) · **Recorrido principal:** sí (mide la hipótesis)
**Requisitos:** FR-20 (S1: baseline técnico y manual; dueña de la suite, OL-06) · IA-10 · TBD-02 (DEC-07) · TBD-03 (calibración del umbral de relevancia) · TBD-11 (aplicación de DEC-02) · ADR-41 · DEC-06 · DEC-07 · medibles técnicos del S1: M-06.1, M-06.2, M-07.2 (fidelidad y precisión de citas), M-10.1, M-10.2, G-4 ("sin evidencia"), G-8 · M-02.5 (baseline de VM-1)
**Evidencia:** [→ PRD §5 FR-20], [→ PRD §2.1 G-3, G-4, G-5, G-8, G-14], [→ PRD §2.2 VM-1, VM-2], [→ PRD §12 Evaluación], [→ PRD §18.4 T-5, AC-T5.2–AC-T5.4], [→ PRD §18.3.6 M-06.1, M-06.2], [→ PRD §18.3.10 M-10.1, M-10.2], [→ PRD §16 TBD-02, TBD-03, TBD-11], [→ readme §6 OL-06], [→ readme §2.6 Evaluación], [→ readme §6.0 DoD], [→ readme §5.0 S1 KR2, KR4], [→ backlog/02-adrs.md ADR-41, DEC-06, DEC-07; §4.1 TBD-03]
**Dependencias:** ↪ US-055, US-063, US-064, US-049, US-068 (lo que se mide) · ⛔ ADR-39 (modelos para el baseline real) · ⛔ ADR-41 (juez de fidelidad) · ⛔ DEC-02 · escenario más probable (US-075) · 🔗 Relacionada: US-073 y US-017 · DEC-07 (S2: aportan los umbrales reales de regresión que US-074 aplica desde el S2)
**Valor:** sin medición no se puede afirmar que el producto ayuda al oncólogo ni proteger los cambios de modelo, prompt, umbral, catálogo o corpus. Esta Feature mide desde el S1 cada cambio de la IA con la suite `evaluate` en la DoD, registra en el S2 el baseline técnico calibrado (recuperación, fidelidad, "sin evidencia", privacidad, lenguaje) y en el S1 el punto de partida humano (cuánto tarda hoy un oncólogo en reconstruir un caso y encontrar evidencia aplicable, VM-1 y VM-2), contra el que se medirá la hipótesis.
**Stories:** US-014 · ADR-41, US-016 · DEC-06, US-072, US-074, US-075 (18 puntos, S1) · US-017 · DEC-07, US-073 (1 punto + US-073 en `?`, S2)

> **Propuesta de división (talla XL: 7 historias).** **T5a-técnico** (US-014, US-016, US-017, US-072, US-073, US-074) y **T5a-valor** (US-075), sin cambiar IDs. T5a-valor depende sobre todo de la agenda de los oncólogos (SUP-4) y puede avanzar en paralelo.

## Fixtures

- **FX-T5a-a · Configuración de evaluación de prueba** (`eval/configs/test-fake.yaml`): adapters falsos de FX-06a-a/FX-06a-b, un dataset de 6 preguntas (3 en español, 3 en inglés; 2 sin evidencia; 1 con inyección `ch-inj-1`) con documentos esperados conocidos, 4 textos con PII sembrada (FX-T4a-a) y 2 salidas con términos prohibidos. Se usa para verificar el *runner* sin modelos reales.

---

## US-014 · ADR-41 — Framework y protocolo de evaluación de calidad de la IA

> Linear: [L1D-232](https://linear.app/l1der-lab-mjbc/issue/L1D-232)

`FEAT-T5a` · Sprint 1 · Estimación **3** · — (ADR) · FR-20, IA-10 · AC-T5.3, AC-T5.4 · Dueño: Ingeniería · ⛔ Bloqueada por: ADR-39 (solo la elección del LLM juez local; las métricas deterministas no dependen de él) · 🔗 Bloquea: US-072 (AC-3, fidelidad), US-073, FEAT-T5b

## Story
Como responsable técnico, quiero decidir con qué framework y qué protocolo se calculan
las métricas de OL-06, para que la suite sea reproducible, corra solo con modelos
locales y pueda exigirse en cada PR que cambie modelo, prompt, umbral, catálogo o
corpus.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las métricas de OL-06 (recuperación, generación, OCR,
  PII, eventos, mapeo, faltantes, discrepancias, aplicabilidad, agente, metadatos del
  corpus), cuando se evalúen las opciones, entonces
  `docs/architecture/adr/ADR-41-evaluacion-ia.md` registra qué métrica calcula cada
  opción, cuáles son deterministas y cuáles usan juez. `[OL-06]` `[FR-20]`
- **AC-2 (borde · reproducibilidad)** · Dada la misma configuración, cuando se ejecute
  `evaluate` dos veces, entonces las métricas deterministas son idénticas; el ADR
  descarta la opción que no lo garantiza y fija semilla y temperatura del juez en
  configuración. `[OL-06]`
- **AC-3 (borde · juez local)** · Dado que la calibración usa datos reales anonimizados
  fuera del repo, cuando se elija el juez de fidelidad, entonces es un LLM **local**
  fuera de línea más NLI, nunca un proveedor de nube; una opción que lo exija queda
  descartada. `[RN-12]` `[OL-06]`
- **AC-4 (reporte)** · Dado un reporte de evaluación, cuando se genere, entonces
  distingue las métricas basadas en datos revisados por el oncólogo de las no revisadas,
  y guarda métricas agregadas con su configuración (modelos, prompt, umbrales, versiones
  de corpus y catálogo), nunca datos reales. `[OL-06]` `[RN-14]` `[AC-T5.3]`
- **AC-5 (DoD)** · Dado el ADR aprobado, cuando se cierre, entonces fija cómo se adjunta
  el reporte a la PR que cambia modelo, prompt, umbral, **catálogo** o corpus (C-10:
  prevalece el PRD, que incluye el catálogo). `[FR-20]` `[AC-T5.4]`

## Contexto técnico

| Opción | A favor | En contra |
|---|---|---|
| `ragas` | Métricas de RAG listas (fidelidad, precisión de contexto) | Juez configurable a verificar con runtime local; versiones cambiantes |
| DeepEval | Integración con Pytest | Misma dependencia de juez; más superficie |
| Propio (Pytest + métricas deterministas + NLI + juez local) | Control total, determinismo, sin nube | Más código a mantener |
| Híbrido (propio para deterministas, framework solo para fidelidad) | Equilibrio | Dos piezas a versionar |

## Non-goals
No construir los datasets (US-072). No fijar metas (DEC-07). No decidir el ADR de
scoring (ADR-7).

## INVEST
**Small** ✓ una comparación acotada y un documento.
**Testable** ✓ los AC verifican el contenido del ADR.

---

## US-016 · DEC-06 — Revisión clínica de la muestra del dataset de evaluación y del diccionario de significancia

> Linear: [L1D-233](https://linear.app/l1der-lab-mjbc/issue/L1D-233)

`FEAT-T5a` · Sprint 1 · Estimación **1** · — (decisión) · IA-10 · AC-T5.3 · Dueño: oncólogo asesor · ↪ US-072 (dataset y diccionario en borrador) · 🔗 Produce para: US-072 AC-4 (rótulo "validada" en el S1), US-073 (baseline técnico, S2)

## Story
Como oncólogo asesor, quiero revisar una muestra del dataset de evaluación y el
diccionario de significancia de biomarcadores, para que el baseline distinga lo
validado clínicamente de lo que no.

> Escenario más probable (a refinar en sprint planning): se revisan 15–20 preguntas y el diccionario completo en una sesión del S1, porque es el tamaño que fija el AC de OL-06.

## AC (Given/When/Then)
- **AC-1** · Dada la muestra revisada, cuando se registre en
  `docs/decisions/DEC-06-revision-dataset.md`, entonces el documento lista los IDs de
  preguntas revisadas, las correcciones y la versión del diccionario aprobada, con
  revisor y fecha. `[OL-06]`
- **AC-2** · Dado el reporte del baseline, cuando se publique, entonces marca como
  "validadas" solo las métricas basadas en esa muestra. `[OL-06]` `[AC-T5.3]` (asumido)
- **AC-3** · Dada una pregunta que el oncólogo rechaza por clínicamente incorrecta,
  cuando se registre, entonces el documento la lista y el dataset la marca como
  excluida en la versión siguiente. (asumido)
- **AC-4** · Dado el diccionario de significancia revisado, cuando se registre, entonces
  su versión queda referenciada en la configuración de la suite del S1
  (`eval/configs/s1.yaml`). `[OL-06]` (asumido)

## Contexto técnico
El registro es el documento más la marca `revisada_por_oncologo` en los ítems del
dataset (`data/evaluation/`, sintético). La mecánica del reporte es de US-072.

## INVEST
**Small** ✓ una sesión de revisión.
**Testable** ✓ el documento y las marcas del dataset se comprueban en el repo.

---

## US-017 · DEC-07 — Metas definitivas de evaluación técnica tras el baseline

> Linear: [L1D-234](https://linear.app/l1der-lab-mjbc/issue/L1D-234)

`FEAT-T5a` · Sprint 2 (cierre) · Estimación **1** · — (decisión) · TBD-02 · Dueño: usuario (PO) + Ingeniería · ↪ US-073 (baseline técnico), US-014 · ADR-41 · 🔗 Produce para: US-074 AC-5 (umbrales reales de regresión en `eval/configs/regression.yaml` desde el S2), FEAT-T5b

## Story
Como product owner, quiero fijar las metas técnicas definitivas con el baseline del
Sprint 1, para que la DoD exija umbrales alcanzables y G-Demo tenga una vara estable.

> Escenario más probable (a refinar en sprint planning): se mantienen las metas iniciales de PRD §2.1 y readme §2.6 donde el baseline las alcanza o queda cerca, y se ajustan con justificación las que no; G-2 = 100 % y salidas prescriptivas = 0 no se negocian, porque G-Demo las exige tal cual (PRD §14).

## AC (Given/When/Then)
- **AC-1** · Dado el baseline, cuando se registre en `docs/decisions/DEC-07-metas-evaluacion.md`,
  entonces el documento lista cada métrica con valor medido, meta inicial y meta
  definitiva, con justificación de cada cambio, dueño y fecha. `[TBD-02]`
- **AC-2** · Dadas las metas definitivas, cuando se publiquen, entonces los umbrales de
  regresión viven en la configuración de la suite, no en el código. `[RN-22]` (asumido)
- **AC-3** · Dadas VM-1…VM-6, cuando se registre, entonces quedan **fuera** de esta
  decisión (las fija DEC-02 antes del S1, R-15). `[R-15]`
- **AC-4** · Dadas G-2 = 100 % y salidas prescriptivas = 0, cuando se registren las metas
  definitivas, entonces ambas se mantienen sin cambio. `[PRD §14]` `[G-2]` `[G-14]`

## INVEST
**Small** ✓ una sesión de decisión sobre un reporte ya disponible.
**Testable** ✓ el documento y la configuración de la suite se comprueban en el repo.

---

## US-072 — La suite `evaluate` mide recuperación, fidelidad, "sin evidencia", privacidad y lenguaje con datasets sintéticos de forma reproducible

> Linear: [L1D-235](https://linear.app/l1der-lab-mjbc/issue/L1D-235)

`FEAT-T5a` · Sprint 1 · Estimación **8** · — (técnica, PRD §17; OL-06) · FR-20, IA-10 · AC-T5.3 · M-06.1, M-07.2, M-10.1, M-10.2, G-4, G-8 · ↪ US-055, US-063, US-064, US-049, US-068 · ⛔ Bloqueada por: ADR-41 (solo AC-3, fidelidad con juez) · 🔗 Mide a: FEAT-06a, FEAT-T1a, FEAT-T4a (US-049, US-050), FEAT-T3 (US-068), FEAT-10a

## Story
Como responsable técnico, quiero una suite de evaluación reproducible con datasets
sintéticos en español e inglés, para medir con números si el análisis recupera la
evidencia correcta, se apoya en ella, reconoce cuándo no la hay, no filtra identidad y
no usa lenguaje prescriptivo.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[IA-10]` · Dados los datasets de `data/evaluation/` (preguntas de mama y
  próstata en español e inglés con documentos esperados, preguntas sin evidencia, PII
  sembrada, términos prohibidos y casos de inyección), cuando se ejecuta
  `python -m app.evaluation.evaluate --config eval/configs/s1.yaml`, entonces escribe
  `eval/results/<fecha>-<hashConfig>.json` con recall@10 total y español → inglés, MRR,
  precisión de citas, exactitud de "sin evidencia", porcentaje de opciones con cita y
  soporte, salidas con términos prohibidos, p95 por etapa y la configuración (modelos,
  versión de prompt, umbrales, `corpusRelease`, `catalogVersion`).
  `[OL-06]` `[FR-20]` `[M-06.1]` `[M-10.1]` `[M-10.2]`
- **AC-2 (borde · reproducibilidad)** · Dada FX-T5a-a, cuando `evaluate` se ejecuta dos
  veces con la misma configuración, entonces todas las métricas deterministas son
  idénticas. `[OL-06]`
- **AC-3 (borde · fidelidad con juez local)** · Dada una configuración cuyo juez de
  fidelidad apunta a un proveedor de nube, cuando se ejecuta `evaluate`, entonces
  termina con código ≠ 0 sin enviar ningún request; y con el juez local de ADR-41,
  reporta fidelidad por afirmación. `[RN-12]` `[M-07.2]` · ⛔ ADR-41
- **AC-4 (borde · validado vs. no validado)** · Dado el dataset con 15 preguntas marcadas
  `revisada_por_oncologo` (DEC-06), cuando se genera el reporte, entonces cada métrica
  indica cuántas preguntas validadas y no validadas la componen y se rotula "validada"
  solo la calculada sobre la muestra revisada. `[AC-T5.3]` `[OL-06]`
- **AC-5 (borde · sin datos reales)** · Dado un dataset sin `clase: sintetico` en su
  manifiesto dentro del repo, cuando `evaluate` lo intenta cargar, entonces termina con
  código ≠ 0; y el archivo de resultados solo contiene métricas agregadas y
  configuración, sin textos de preguntas ni de salidas. `[RN-14]` `[OL-06]`
- **AC-6 (borde · privacidad)** · Dado el dataset de PII sembrada, cuando se ejecuta la
  parte de privacidad, entonces el reporte incluye la sensibilidad del detector de
  Backend 1 (US-049) sobre identificadores directos y el número de llamadas a
  proveedores de nube con datos clasificados como reales (esperado: 0).
  `[G-8]` `[OL-06]` `[RN-12]`
- **AC-7 (borde · inyección)** · Dado el caso de inyección con `ch-inj-1`, cuando se
  evalúa, entonces el reporte cuenta como "inyección efectiva" toda opción mostrada con
  un término prohibido o con una cita fuera del conjunto recuperado, y el valor
  esperado con FX-T5a-a es 0. `[SEG-13]` (asumido en la definición de la métrica)

## Contexto técnico
*Runner* en `rag-orchestrator/app/evaluation/` que invoca `RAGOrchestratorService` en
proceso con los adapters configurados (OL-06 tarea 2); la sensibilidad de PII la
calcula un comando de `clinical-api` (`npm run eval:pii`) cuyo JSON integra el reporte.
Los datasets son sintéticos y versionados; los reales anonimizados viven fuera del repo
y se pasan por ruta local (nunca a la CI). Métricas deterministas sin juez; la
fidelidad según ADR-41. Tests: Pytest del *runner* con FX-T5a-a (AC-2 a AC-7) y
ejecución con la configuración real en el baseline (US-073).

## Non-goals
Datasets de OCR, eventos, duplicados, mapeo, faltantes, discrepancias y aplicabilidad
(S2–S4, FEAT-T5b: US-103…US-106, US-131…US-133). Métricas de valor (US-075, FEAT-T5d).

## INVEST
**Small** ✓ 8 es el techo; si los datasets se alargan, dividir en US-072a (datasets y esquema) y US-072b (*runner* y reporte).
**Testable** ✓ siete tests del *runner* sobre una configuración falsa con resultados conocidos.

---

## US-073 — El umbral de relevancia se calibra con el set de referencia y el baseline técnico del S1 queda registrado

> Linear: [L1D-236](https://linear.app/l1der-lab-mjbc/issue/L1D-236)

`FEAT-T5a` · Sprint 2 · Estimación **?** (rango 3–5; se re-estima al cerrar ADR-39 y ADR-41) · — (técnica, PRD §17; OL-06) · FR-20 · TBD-03 · M-06.1, M-06.2, M-07.2 · ↪ US-072 · ⛔ Bloqueada por: ADR-39 (modelos fijados), ADR-41 (juez) · 🔗 Produce para: DEC-07 (US-017), ADR-42 (p95 del S1)

## Story
Como responsable técnico, quiero calibrar el umbral de relevancia con datos y registrar
el baseline técnico del S1 para mama y próstata en español e inglés, para que "sin
evidencia" no dependa de un número arbitrario y DEC-07 decida las metas sobre cifras
reales.

## AC (Given/When/Then)
- **AC-1 (happy path · calibración)** · Dado el dataset de US-072 y una grilla de
  umbrales en configuración (`RELEVANCE_THRESHOLD_GRID`), cuando se ejecuta
  `evaluate --sweep relevance_threshold`, entonces `eval/reports/S1-baseline.md` muestra
  por valor la exactitud de "sin evidencia" y el recall@10, y el valor elegido queda en
  la configuración (`RELEVANCE_THRESHOLD`) con su justificación. `[TBD-03]` `[RN-22]`
- **AC-2 (borde · baseline completo)** · Dados los modelos de ADR-39 y el stack de
  Compose, cuando se registra el baseline, entonces el reporte contiene recall@10, MRR,
  español → inglés, fidelidad, precisión de citas y "sin evidencia" para mama y para
  próstata, y el p95 de `/platform/evidence-analyses` de punta a punta (3 corridas,
  mediana). `[OL-06]` `[M-06.1]` `[M-06.2]` `[readme §5.0]`
- **AC-3 (borde · p95 fuera de meta)** · Dado un p95 mayor que 15 s, cuando se
  registra, entonces el reporte lo deja anotado como insumo de ADR-42, sin cambiar la
  meta ni adelantar el streaming. `[G-5]` `[TBD-08]`
- **AC-4 (borde · comparación con metas iniciales)** · Dado el baseline, cuando se
  genera el reporte, entonces cada métrica aparece como "en meta" o "fuera de meta"
  frente a las metas iniciales de PRD §2.1, sin modificarlas (las decide DEC-07).
  `[TBD-02]` `[DEC-07]`

## Contexto técnico
El barrido usa el mismo *runner* de US-072; el umbral elegido es un valor de
configuración (`[RN-22]`), no de código. El p95 se mide con un script de carga contra
`web` o `clinical-api` en la red interna con el LLM nativo. Verificación: el reporte
versionado en el repo y la configuración resultante; el barrido es reproducible con
FX-T5a-a en la CI.

## INVEST
**Small** ✓ una ejecución con barrido y un reporte.
**Testable** ✓ cuatro aserciones sobre el reporte y la configuración.
*(Estimable ✗ depende de ADR-39 y ADR-41: `?` con rango 3–5.)*

---

## US-074 — Todo PR que cambie modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta el reporte

> Linear: [L1D-237](https://linear.app/l1der-lab-mjbc/issue/L1D-237)

`FEAT-T5a` · Sprint 1 · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.4, AC-T5.3 · ↪ US-036, US-072 · 🔗 Relacionada: US-073 (baseline que activa el umbral de regresión, S2), US-017 · DEC-07 (metas definitivas, S2)

## Story
Como responsable técnico, quiero que la CI detecte los PR que cambian un modelo, un
prompt, un umbral, un catálogo o el corpus y les exija el reporte de la suite, para que
ningún cambio que afecte la calidad de la IA llegue a `main` sin medirse.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PR que modifica un archivo de `rag-orchestrator/prompts/`,
  cuando corre la CI, entonces el job `eval-required` ejecuta `evaluate` con la
  configuración de CI y publica el reporte como artefacto y como comentario del PR.
  `[AC-T5.4]` `[FR-20]` `[readme §6.0 DoD]`
- **AC-2 (borde · catálogo)** · Dado un PR que modifica
  `packages/clinical-catalogs/mama/codigos.json`, cuando corre la CI, entonces el job
  `eval-required` también se ejecuta. `[AC-T5.4]` `[C-10]`
- **AC-3 (borde · umbral o modelo)** · Dado un PR que cambia `RELEVANCE_THRESHOLD` o
  `LLM_MODEL` en `.env.example` o en la configuración versionada, o el manifiesto del
  corpus en `data/raw/`, cuando corre la CI, entonces el job se ejecuta. `[AC-T5.4]`
- **AC-4 (borde · S1 sin baseline previo)** · Dado `eval/configs/regression.yaml` sin
  umbrales (estado del S1, antes del baseline de US-073), cuando corre la CI sobre el PR
  del AC-1, entonces el job `eval-required` termina en éxito, publica el reporte y el
  comentario del PR indica "Sin baseline de regresión: umbral no aplicado".
  `[AC-T5.4]` `[TBD-02]` (asumido en el texto del aviso)
- **AC-5 (borde · regresión)** · Dado un `regression.yaml` de prueba con
  `recall_at_10_min: 0.80` y un PR cuyo reporte con FX-T5a-a deja recall@10 en 0,50,
  cuando corre la CI, entonces el job falla y nombra la métrica. Los umbrales reales los
  versiona el S2 a partir del baseline de US-073 (y las metas de DEC-07) como cambio de
  configuración, sin tocar el job. `[TBD-02]` `[RN-22]`
- **AC-6 (borde · reporte con validación)** · Dado el comentario del PR del AC-1, cuando
  se lee, entonces contiene la tabla de métricas con la marca "validada / no validada"
  de cada una. `[AC-T5.3]`

## Contexto técnico
Rutas que disparan el job en `ci/eval-trigger-paths.yaml` (prompts, catálogo, manifiesto
del corpus, claves de configuración de modelos y umbrales). En la CI se usan modelos
locales ligeros o la configuración de prueba acordada en ADR-41; el reporte completo con
los modelos reales se adjunta desde la máquina de referencia cuando la CI no puede
correrlos (lo fija ADR-41 AC-5). En el S1 la suite corre y reporta sin baseline previo
(AC-4); el umbral de regresión se activa en el S2, cuando US-073 registra el baseline y
sus valores (ajustados por DEC-07) se versionan en `regression.yaml` (AC-5). Tests: PRs
de prueba en la CI.

## INVEST
**Small** ✓ un job de CI con detección de rutas y una publicación de reporte.
**Testable** ✓ seis PRs de prueba con resultado esperado.

---

## US-075 — El baseline manual de VM-1 y VM-2 se mide con los oncólogos antes de cerrar el S1

> Linear: [L1D-238](https://linear.app/l1der-lab-mjbc/issue/L1D-238)

`FEAT-T5a` · Sprint 1 · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.2 · M-02.5 (baseline), VM-1, VM-2 · ⛔ DEC-02 · escenario más probable · 🔗 Produce para: FEAT-T5d (medición con OncoLens en el piloto)

## Story
Como product owner, quiero medir cuánto tardan hoy los oncólogos asesores en
reconstruir un caso y en encontrar evidencia aplicable sin OncoLens, para tener el punto
de comparación con el que se validará la hipótesis.

## AC (Given/When/Then)
- **AC-1 (happy path · casos estandarizados)** · Dado el protocolo de DEC-02, cuando se
  preparan los casos, entonces `data/evaluation/vm-baseline/` contiene ≥ 6 casos
  sintéticos estandarizados (3 de mama y 3 de próstata), cada uno con sus documentos
  sintéticos, sus preguntas de referencia y el checklist de "caso reconstruido" (P1), y
  su manifiesto declara `clase: sintetico`. `[AC-T5.2]` `[PRD §2.2]` `[DEC-02]`
- **AC-2 (borde · registro de sesiones)** · Dadas las sesiones con los oncólogos en la
  condición manual, cuando se registran, entonces `eval/vm/baseline-S1.csv` tiene una
  fila por caso y participante (participantes seudonimizados `O1`, `O2`…) con tiempo de
  reconstrucción, tiempo hasta evidencia aplicable y herramientas usadas. `[VM-1]` `[VM-2]` `[AC-T5.2]`
- **AC-3 (borde · cálculo reproducible)** · Dado el CSV, cuando se ejecuta
  `evaluate-vm baseline`, entonces calcula la mediana de VM-1 y de VM-2 por tipo de
  cáncer y en total, y dos ejecuciones dan el mismo resultado. `[FR-20]`
- **AC-4 (borde · antes de cerrar el S1)** · Dada la revisión del S1, cuando se verifica
  el entregable, entonces el reporte `eval/vm/baseline-S1.md` existe con fecha anterior
  al cierre del sprint y declara que las metas de DEC-02 no se modificaron. `[AC-T5.2]` `[R-15]`
- **AC-5 (borde · cohorte)** · Dado el reporte, cuando se publica, entonces rotula los
  resultados como "cohorte sintética" y deja la cohorte real para después de G-Piloto.
  `[DEC-02]` (asumido)

## Contexto técnico
Los casos se generan con el mismo generador sintético del seed (sin PII real) y sirven
también para la medición con OncoLens (FEAT-T5d). El CSV no contiene nombres de
oncólogos ni de pacientes. Verificación: revisión del entregable en la *sprint review*
más un test unitario del cálculo de medianas (AC-3) y el chequeo de CI de datasets
sintéticos (US-036 AC-5).

## INVEST
**Small** ✓ preparación de 6 casos, un registro y un script de medianas.
**Testable** ✓ cinco verificaciones sobre archivos del repo y un test unitario.
*(Independent ⚠ depende de la agenda de los oncólogos asesores, SUP-4.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-10 | readme OL-06 tarea 5: PR que cambian "un modelo, un prompt, un umbral o el corpus" (omite el catálogo) | PRD FR-20 y AC-T5.4; readme §2.6 y §6.0 DoD: incluyen el catálogo | PRD (US-074 AC-2) |
| C-17 | readme §5.6: HU-25 mapeada a FR-20 | PRD §17: FR-20 "sin historia propia" | PRD para la suite (historias técnicas sin HU, Q-08); HU-25 solo para el feedback (FEAT-T5c) |
| Slicing v2 (ajustado el 2026-10-07) | PRD §14 S1, readme §5.0 S1 y OL-06: baseline técnico de evaluación y suite en la DoD desde el S1 | Decisión del usuario (`01-requisitos.md` §15, "Ajustes al slicing v2"): ADR-41 (US-014), DEC-06 (US-016), suite `evaluate` (US-072) y suite en la DoD (US-074) en el S1; calibración del umbral y baseline técnico (US-073) y DEC-07 (US-017) en el S2 | Decisión del usuario: desde el S1 todo PR que cambie modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta el reporte, sin baseline previo (US-074 AC-4); el bloqueo por regresión se activa en el S2 con el baseline de US-073 (US-074 AC-5). Lo único que se aparta del PRD es que el baseline técnico calibrado se registra en el S2 |
