# FEAT-T5e — Mejora de la recuperación frente a las metas de OL-06 (BORRADOR)

> Linear: pendiente (borrador del 2026-10-16; **no publicado** en Linear ni en ningún sistema externo; el humano decide si se aprueba, se ajusta o se descarta). Los IDs de este archivo (`FEAT-T5e`, `US-226`…`US-230`) son provisionales hasta esa aprobación y **no reutilizan** ningún ID publicado (el último publicado es US-225 / L1D-275).

> **Decidido (usuario, 2026-11-06):** pasa a **Post-MVP**, con las recomendaciones **R1** (excluir las listas de referencias en la ingesta), **R2** (subir `RERANKER_MAX_PAIRS` a 16) y **R3** (evaluar la recuperación híbrida sobre el caso de la Demo 5) de [`S5-cierre.md`](../sprints/S5-cierre.md) §9, que se apoyarían en este protocolo. Del bloque de recuperación del S6 solo entran la corrida nocturna de L1D-119 y **R4** (US-270, FEAT-06a) `[S6 resp. 4]`. El borrador sigue sin publicar; sus IDs no cambian.

> **Decidido (usuario, 2026-11-11):** tras la Demo 6, entran a este borrador las prioridades 1–3 del análisis de mejoras del RAG: **US-276** (diagnóstico por etapa de las preguntas parafraseadas que pierden la evidencia), **US-277** (vocabulario del catálogo para procedimientos y segundo loop de reescritura medido) y **US-278** (el *reranker* puntúa el chunk entero, no solo sus primeros 512 tokens). Contexto: la misma pregunta, «complicaciones de la prostatectomía radical» frente a «complicaciones de la cirugía de prostata radical», devolvió evidencia en un caso y no en el otro. Ya aplicados en `main`, fuera de estas historias: `RERANKER_MAX_PAIRS = 20` y `QUERY_CONTEXT_EXPANSION_ENABLED = true` (US-275, L1D-333) y `CORPUS_CHUNK_OVERLAP = 51` (PR #407, enmienda de ADR-39). Las prioridades 4–8 del mismo análisis (Contextual Retrieval, multivector, BM25 nativo de Milvus, calibración del NLI y PageIndex) no tienen historia: la contextual determinista ya es el brazo A5 de US-230. Siguen sin publicarse en Linear hasta su aprobación.

**Talla:** L · **Sprint:** Post-MVP *(usuario, 2026-11-06, `[S6 resp. 4]`; antes propuesta 2, junto a US-072/US-073; US-229 podía cerrar en S3 según la agenda del oncólogo, SUP-4)* · **Capacidad:** T-5 (AC-T5.3, AC-T5.4) · **Recorrido principal:** sí (la hipótesis 3, "opciones más aplicables", depende de recuperar la evidencia correcta)
**Requisitos:** FR-20 (OL-06) · FR-09 · IA-02 · G-3 y M-06.1 (recall@10 y MRR contra metas iniciales) · TBD-02 (DEC-07) · RN-02, RN-12, RN-13, RN-14, RN-21, RN-22, RN-27
**Evidencia:** [→ docs/architecture/adr/ADR-45-mejora-recuperacion-ol06.md], [→ docs/architecture/adr/ADR-39-modelos-locales.md (rama `feat/l1d-102-adr39-embeddings-reranker-nli`)], [→ PRD §2.1 G-3], [→ PRD §18.3.6 M-06.1], [→ PRD §16 TBD-02], [→ readme §6 OL-06]
**Dependencias:** ↪ US-072 (*runner* y reporte), US-073 (baseline y umbral), US-012 (ADR-39 fase A: dataset `adr39-mini`) · 🔗 Informa a: US-017 · DEC-07 (metas), US-112 y US-113 (híbrida y expansión: se re-estiman con el resultado), US-133 (recuperación híbrida sin retroceso), ADR-41 · ⛔ Tiempo del oncólogo asesor (SUP-4) para US-227, US-228 y US-229
**Valor:** hoy la recuperación mide recall@10 0,71 y MRR 0,36 con un conjunto que no distingue una mejora de 0,10 del ruido. Esta Feature da un protocolo que impide el sobreajuste, un conjunto nuevo e independiente y ablaciones preinscritas, para que cualquier mejora (híbrida, expansión, contexto del chunk) se adopte solo con evidencia, y para recalibrar las metas con base estadística.
**Workaround en el MVP:** las metas de recuperación se informan como provisionales y no bloquean la CI (enmienda propuesta a US-017, no aplicada); se sigue con recuperación densa + *reranker* (US-055).
**Stories:** US-226 (5), US-227 (3), US-228 (5), US-229 (5), US-230 (5) = **23 puntos** · altas del 2026-11-11: US-276 (2), US-277 (3), US-278 (5) = **10 puntos** · total **33 puntos** (borrador; no se suma al total del backlog hasta aprobarse)

> **Cambios que este borrador propone a historias publicadas (no aplicados):**
> - **US-017 · DEC-07:** añadir un AC con las metas de recuperación evaluadas sobre el límite inferior del IC de 95 % y la regla de "provisional hasta US-229" (ADR-45, "Metas de OL-06").
> - **US-113:** el AC que usa el LLM local para traducir la pregunta contradice la letra de RN-02 (sin invocar al LLM antes de saber si hay evidencia). El humano decide entre enmendar RN-02 o cambiar el método (sinónimos del catálogo o modelo de traducción dedicado).
> - **US-112 / US-113:** hoy `si-hay-capacidad`; el resultado de US-230 decide si se promueven, se mantienen o se descartan.

## Fixtures

- **FX-T5e-a · Partición congelada:** `data/eval/ol06-particion-v1/particion.yaml` (ya en el repositorio): desarrollo 39, validación 20, prueba 16 preguntas del golden `adr39-mini`, con la huella SHA-256 del golden de origen.
- **FX-T5e-b · Golden con cobertura mínima para pruebas del *runner*:** 8 preguntas sintéticas con documentos falsos, un control pareado, una sin respuesta y una con evidencia alternativa válida, para probar bootstrap por grupo, control de acceso a la prueba y detección de fuga con adapters falsos.

---

## US-226 — La suite `evaluate` compara variantes de recuperación con la partición congelada, IC pareado por grupo y control de acceso a la prueba

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(`[S6 resp. 4]`; antes propuesto 2)* · Estimación **5** · — (técnica; OL-06) · FR-20, IA-10 · AC-T5.3, AC-T5.4 · M-06.1 · ↪ US-072, FX-T5e-a · ⛔ ADR-45 aceptado (protocolo P1–P12) · 🔗 Mide a: FEAT-06a, FEAT-06b · **Recorrido principal:** sí

## Story
Como responsable técnico, quiero comparar variantes de recuperación contra una referencia con intervalos de confianza pareados y una partición que no se puede tocar a escondidas, para no adoptar mejoras que son ruido ni ajustar sobre la prueba.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados dos configuraciones (referencia y variante) y `ol06-particion-v1`, cuando se ejecuta `evaluate --suite recuperacion --brazos A0,A2 --conjunto desarrollo`, entonces el reporte trae acierto@10 y MRR de cada brazo, la **diferencia con su IC de 95 % por *bootstrap* pareado** (≥ 10 000 réplicas, semilla fija, remuestreo por grupo pregunta + control), el n efectivo y la huella de la configuración. `[OL-06]` `[ADR-45 P5]`
- **AC-2 (borde · prueba una sola vez)** · Dado el conjunto `prueba`, cuando se ejecuta sin `--prueba-final` o sin una huella de configuración registrada antes, entonces termina con código ≠ 0 sin evaluar nada; con ambas, evalúa y **registra** el acceso (fecha, huella); un segundo intento sobre la misma huella se rechaza. `[ADR-45 P3]`
- **AC-3 (borde · fuga)** · Dado un *pipeline* de consulta que recibe un campo del golden distinto de `pregunta` y los metadatos de la solicitud (`documentos`, `evidencia`, `respuesta_esperada`), cuando se ejecuta `evaluate`, entonces falla con un error que nombra el campo. `[ADR-45 P7, P8]`
- **AC-4 (borde · partición íntegra)** · Dado un `golden.yaml` cuya huella SHA-256 difiere de `golden_sha256` de `particion.yaml`, cuando se ejecuta `evaluate`, entonces termina con código ≠ 0 pidiendo `ol06-particion-v2`. `[ADR-45 P2]`
- **AC-5 (borde · todos los intentos)** · Dadas varias ejecuciones de brazos en un mismo experimento, cuando se genera el reporte, entonces lista **todos** los brazos y configuraciones ejecutados, también los descartados, y aplica la corrección de Holm a los finalistas declarados. `[ADR-45 P9]`
- **AC-6 (invariante · datos y secretos)** · Dado el reporte, cuando se inspecciona, entonces contiene solo agregados, ids y configuración, sin texto de preguntas ni de chunks; y el dataset tiene `clase: sintetico`. `[RN-13]` `[RN-14]`
- **AC-7 (borde · decisión)** · Dados los IC calculados, cuando la diferencia es ≥ +0,05 pero el IC incluye 0, entonces el reporte marca "dentro del ruido: no adoptar" y a igualdad recomienda la opción más simple. `[ADR-45 P6]`

## Contexto técnico
Extiende `rag-orchestrator/app/evaluation/` (de la rama de ADR-39: `retrieval_metrics.py`, `dataset_loader.py`) con un *bootstrap* pareado por grupo y el control de acceso. El nombre de la métrica es **acierto@10 sobre el conjunto final de chunks tras el *reranker***; "recall@10" se conserva como alias de la meta. Tests: Pytest con adapters falsos y FX-T5e-b; el modelo real solo en la suite `evaluate`. Sin LLM en unitarios ni en integración.

## Non-goals
Decidir qué variante gana (US-230); ampliar el dataset (US-228, US-229); recalibrar las metas (US-017).

## INVEST
**Small** ✓ 5. **Testable** ✓ siete tests sobre FX-T5e-b.

---

## US-227 — Un diagnóstico sin modelo y una auditoría ciega del oncólogo dicen cuántos fallos son del golden y cuántos del recuperador

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(`[S6 resp. 4]`; antes propuesto 2)* · Estimación **3** · — (técnica y clínica) · FR-20 · AC-T5.3 · ↪ US-012, FX-T5e-a · 🔗 Produce para: US-230 y US-017 · **Recorrido principal:** sí · Dueño clínico: oncólogo asesor (SUP-4)

## Story
Como responsable técnico, quiero saber qué parte de los fallos de recuperación se debe a la etiqueta del golden y no al recuperador, para no ajustar el sistema a un error de medición.

## AC (Given/When/Then)
- **AC-1 (happy path · citas partidas)** · Dado el corpus de `adr39-mini` troceado con las variantes de ADR-39 (256, 512 y 1024 tokens, sin solapamiento) y las 94 citas del golden, cuando se ejecuta el diagnóstico (sin modelos de recuperación), entonces el informe da, por tamaño, cuántas citas **no caben enteras en ningún chunk** y cuántas preguntas quedan sin acierto posible por esa causa. `[ADR-45 H8.3]`
- **AC-2 (happy path · techo del *pool*)** · Dado el brazo de referencia sobre el conjunto de desarrollo, cuando se mide, entonces el informe da el acierto@10 antes del *reranker*, el acierto@24 (techo del *pool* de candidatos) y el acierto@10 después, con su IC pareado. `[ADR-45 H6]`
- **AC-3 (borde · auditoría ciega)** · Dada una muestra de los fallos del brazo de referencia en desarrollo y validación y una de cada diez aciertos como control, cuando el oncólogo asesor la clasifica **sin saber qué brazo la produjo** (fallo real / evidencia alternativa válida en el top-10 / etiqueta incorrecta), entonces el informe da los porcentajes de cada clase y su IC. `[ADR-45 P10]`
- **AC-4 (invariante · sin correcciones por caso)** · Dado el informe de la auditoría, cuando propone cambios al golden, entonces estos van en `golden v0.2` y, solo si cambian ids, en `ol06-particion-v2`; ninguna corrección se aplica a una pregunta concreta como respuesta al resultado de un brazo. `[ADR-45 P7e]`
- **AC-5 (borde · sin datos reales)** · Dado el informe, cuando se publica, entonces contiene solo agregados e ids, y el golden sigue siendo sintético. `[RN-14]`

## Contexto técnico
Guion de un solo uso en `app/evaluation/` que reutiliza `contiene_cita` de ADR-39. La auditoría es una hoja en `data/eval/` con ids, sin texto de fuentes (las fuentes no se versionan). Lo hace el oncólogo con las cifras ocultas.

## Non-goals
Corregir el golden; cambiar el sistema.

## INVEST
**Small** ✓ 3. **Testable** ✓ el guion se prueba con FX-T5e-b; la auditoría se comprueba por su informe.

---

> **Decidido (usuario, 2026-10-20, ADR-45):** el tiempo del oncólogo se escalona; esta historia (lote A reducido) y US-227 van primero.

## US-228 — El lote A del dataset nuevo (≥ 60 preguntas con respuesta y ≥ 10 sin respuesta, independientes del actual) queda revisado por el oncólogo

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(`[S6 resp. 4]`; antes propuesto 2)* · Estimación **5** · — (datos; OL-06) · FR-20 · AC-T5.3 · ↪ US-072, ADR-36 (fuentes) · 🔗 Alimenta: US-230 como desarrollo ampliado · **Recorrido principal:** sí · Dueño clínico: oncólogo asesor (SUP-4)

## Story
Como responsable técnico, quiero un lote nuevo de preguntas independientes, con documentos que no están en el corpus actual y revisado por el oncólogo, para tener potencia estadística y comprobar que lo aprendido en desarrollo generaliza.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/eval/ol06-lote-a/`, cuando se valida con el cargador, entonces contiene ≥ 60 preguntas con respuesta (mama y próstata, entre 40 y 60 % de cada tipo de cáncer) y ≥ 10 sin respuesta, cada una con `revision_oncologo`, citas literales verificadas contra su documento y `clase: sintetico`. `[OL-06]` `[RN-14]`
- **AC-2 (borde · independencia)** · Dadas las preguntas nuevas, cuando se compara con `adr39-mini`, entonces ninguna repite una pregunta o cita existente y ≥ 40 % usa documentos que no están en el manifiesto actual. `[ADR-45 P11]`
- **AC-3 (borde · cercanía a producción)** · Dado el lote, cuando se clasifica, entonces ≥ 30 % de las consultas incluyen un contexto de caso sintético desidentificado (sin identidad ni fechas absolutas) además de la pregunta. `[ADR-45 H8.4]` `[RN-11]`
- **AC-4 (invariante · licencias)** · Dado el manifiesto del lote, cuando se revisa, entonces cada fuente tiene licencia registrada y aceptada (RN-21) y NCCN y ESMO figuran solo como no incluidas, nunca con contenido. `[RN-21]`
- **AC-5 (borde · autoría separada)** · Dado el registro del lote, cuando se consulta, entonces consta quién lo redactó y que no es quien ejecuta las ablaciones. `[ADR-45 P11]`
- **AC-6 (borde · partición)** · Dado el lote, cuando se incorpora, entonces se asigna a desarrollo o validación con la misma regla determinista de `ol06-particion-v1` (hash, grupos, estratos) y nunca a prueba. `[ADR-45 P2]`

## Contexto técnico
Mismo esquema que `golden.yaml` de ADR-39. Las fuentes se descargan por script con SHA-256 y no se versionan los textos completos. Estimación 5 sujeta a la agenda del oncólogo (SUP-4); si no hay agenda, dividir por tipo de cáncer.

## Non-goals
Preguntas de otros tipos de cáncer; datos de pacientes reales.

## INVEST
**Small** ✓ 5 (límite). **Testable** ✓ el cargador valida cantidades, campos, independencia y licencias.

---

> **Decidido (usuario, 2026-10-20, ADR-45):** US-229 solo se ejecuta si el lote A (US-228) y la auditoría (US-227) muestran que vale la pena seguir; el lote B lo redactan personas distintas de quienes experimentan con las ablaciones. Alternativa de último recurso: ~80 respondibles + 35 sin respuesta (detecta solo ≥ +0,15).

## US-229 — El lote B (≥ 100 preguntas con respuesta y ≥ 35 sin respuesta) queda sellado como la prueba ciega nueva


> Linear: pendiente

`FEAT-T5e` · Post-MVP *(`[S6 resp. 4]`; antes propuesto 2 o 3)* · Estimación **5** · — (datos; OL-06) · FR-20 · AC-T5.3 · ↪ US-228, US-226 · 🔗 Alimenta: US-230 (prueba) y US-017 · DEC-07 · **Recorrido principal:** sí · Dueño clínico: oncólogo asesor (SUP-4)

## Story
Como responsable técnico, quiero un conjunto de prueba que nadie que ajuste el sistema haya visto, con suficientes preguntas para afirmar una mejora o una meta con un intervalo útil, para cerrar la decisión de ADR-45 sin sobreajuste.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/eval/ol06-lote-b/`, cuando se valida, entonces contiene ≥ 100 preguntas con respuesta (semiancho del IC esperado ≈ 0,08 con recall ≈ 0,75) y ≥ 35 sin respuesta (para que 35/35 dé un límite inferior de Wilson ≥ 0,90), con las mismas exigencias de revisión, citas, licencia y `clase: sintetico` que US-228. `[OL-06]` `[ADR-45 H1]`
- **AC-2 (borde · independencia y documentos nuevos)** · Dado el lote B, cuando se compara con `adr39-mini` y el lote A, entonces ninguna pregunta ni cita se repite y ≥ 40 % de las preguntas usa documentos ausentes de ambos. `[ADR-45 P11]`
- **AC-3 (invariante · ciego)** · Dado el lote B, cuando se almacena, entonces vive en una ruta cuyo *runner* solo lo abre con `--prueba-final` y la huella registrada, y su contenido no aparece en prompts, fixtures de desarrollo ni en el historial de reportes de ablaciones. `[ADR-45 P3]` `[US-226 AC-2]`
- **AC-4 (borde · cercanía a producción)** · Dado el lote B, cuando se clasifica, entonces ≥ 30 % incluye contexto de caso sintético desidentificado. `[ADR-45 H8.4]` `[RN-11]`
- **AC-5 (borde · sin datos reales)** · Dado el lote, cuando se publica en el repositorio público, entonces solo contiene preguntas sintéticas y citas breves de fuentes con licencia registrada, sin texto completo de las fuentes. `[RN-13]` `[RN-14]` `[RN-21]`

## Contexto técnico
Si el humano reduce el alcance (punto 4 de ADR-45), el lote B baja a ~80 con respuesta y ~35 sin respuesta y el sistema solo detectará mejoras ≥ +0,15; el AC-1 se ajusta en consecuencia, sin cambiar la regla de que la prueba se toca una vez.

## Non-goals
Usar el lote B para elegir hiperparámetros.

## INVEST
**Small** ✓ 5 (límite). **Testable** ✓ el cargador valida cantidades y exclusiones; el control de acceso lo prueba US-226.

---

## US-230 — Las ablaciones preinscritas de recuperación se ejecutan en desarrollo, se confirman en validación y se deciden una sola vez sobre la prueba nueva

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(`[S6 resp. 4]`; antes propuesto 3, tras US-228 y US-229)* · Estimación **5** · — (técnica; OL-06) · FR-20, FR-09, IA-02 · AC-T5.3, AC-T5.4 · M-06.1 · ↪ US-226, US-227, US-228, US-229, US-055, US-058, US-117 (*sparse* poblado) · ⛔ ADR-45 aceptado · 🔗 Produce para: US-112, US-113, US-133, US-017 · DEC-07 · **Recorrido principal:** sí

## Story
Como responsable técnico, quiero probar de forma preinscrita las mejoras candidatas de recuperación y adoptar solo las que superan el ruido en datos que nadie ajustó, para subir el acierto sin sobreajustar.

## AC (Given/When/Then)
- **AC-1 (happy path · preinscripción)** · Dado el documento de preinscripción (hipótesis, brazos A0…A5, hiperparámetros tomados de la fuente, métrica primaria, regla de decisión) commiteado antes de ejecutar, cuando se corre la suite sobre desarrollo, entonces ejecuta solo esos brazos y no admite brazos ni hiperparámetros añadidos después sin un nuevo documento fechado. `[ADR-45 P1, P4]`
- **AC-2 (happy path · cribado)** · Dados los resultados en desarrollo (incluido el desarrollo ampliado del lote A), cuando se aplica la regla, entonces pasan a validación como máximo 2 brazos con Δ ≥ +0,05 y sin regresión mayor de 0,05 en idioma o tipo con n ≥ 10. `[ADR-45]`
- **AC-3 (borde · validación)** · Dados los finalistas, cuando se evalúan en validación, entonces cada uno se evalúa una sola vez sin cambios de configuración y el reporte lo indica. `[ADR-45 P3]`
- **AC-4 (borde · prueba)** · Dados los finalistas congelados (huella de configuración), cuando se evalúan una vez sobre el lote B con `--prueba-final`, entonces se adopta una variante solo si Δ ≥ +0,05 y el límite inferior de su IC (95 % con un finalista, 97,5 % con dos) es > 0; en otro caso el reporte declara "dentro del ruido: no se adopta" y se conserva la referencia. `[ADR-45 P6]`
- **AC-5 (invariante · RN-02 y RN-12)** · Dado cualquier brazo con expansión de la consulta, cuando se ejecuta, entonces no invoca al LLM antes de decidir si hay chunks sobre el umbral y solo usa modelos locales; un brazo que lo requiera se marca "no adoptable" y se reporta solo como cota diagnóstica si el humano lo autorizó. `[RN-02]` `[RN-12]`
- **AC-6 (borde · no regresión)** · Dada una variante candidata, cuando se evalúa, entonces no empeora la exactitud de "sin evidencia", el p95 por etapa dentro del presupuesto vigente ni `top_relevance_score = null` en "sin evidencia". `[RN-02]` `[ADR-39]`
- **AC-7 (borde · configuración)** · Dada una variante adoptada, cuando se activa, entonces sus parámetros (`RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT`, `QUERY_EXPANSION`, `CHUNK_CONTEXT_PREFIX`) viven en configuración con el comportamiento actual por defecto. `[RN-22]`
- **AC-8 (borde · informe final)** · Dado el cierre, cuando se redacta, entonces el informe lista todos los brazos probados, sus cifras en desarrollo, validación y prueba con IC, lo que se adoptó y lo que no, y propone las historias de implementación (re-estimación de US-112 y US-113). `[ADR-45 P9]`

## Contexto técnico
Brazos en ADR-45: A0 referencia, A1 *pool* de 48, A2 RRF (k = 60), A2b suma ponderada 1 : 0,3, A3 sinónimos del catálogo (glosario congelado, ajeno al golden), A4 traducción con modelo dedicado (componente nuevo: solo medir), A5 prefijo determinista de contexto. El brazo A3 requiere `packages/clinical-catalogs` o un glosario provisional versionado fuera del golden. Si el p95 del *reranker* no cabe, A1 se reporta "no viable". Ejecuta `ai-eval-runner` en el Gate 2.

## Non-goals
Implementar el cambio adoptado en producción (historia propia tras el resultado); cambiar los modelos decididos; *fine-tuning*.

## INVEST
**Small** ✓ 5 (límite; si A3/A4 no están listos se difieren sin bloquear A0–A2). **Testable** ✓ preinscripción, reglas y bloqueos verificables en el informe y en el *runner*.

---

## US-276 — Un diagnóstico por etapa dice dónde pierde la evidencia una pregunta parafraseada

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(alta del 2026-11-11, prioridad 1 del análisis de mejoras tras la Demo 6)* · Estimación **2** · — (técnica; OL-06) · FR-09, FR-20 · AC-T5.3 · ↪ US-270 (evento `rag_query_corte`), US-055 · 🔗 Produce para: US-277, US-278, US-230 · **Recorrido principal:** sí

## Story
Como responsable técnico, quiero saber en qué etapa del *pipeline* se pierde la evidencia cuando una pregunta cambia una o dos palabras, para corregir la etapa que falla y no bajar a ciegas un umbral que protege a otra.

## AC (Given/When/Then)
- **AC-1 (happy path · pares de paráfrasis)** · Dado un conjunto sintético de ≥ 10 pares de preguntas con el mismo significado y distinta redacción (sinónimo coloquial frente a término técnico, sin tildes, orden cambiado, español frente a inglés), con el par de la Demo 6 «complicaciones de la prostatectomía radical» / «complicaciones de la cirugía de prostata radical», cuando se ejecutan contra el corpus de la Demo 6 con modelos locales, entonces el informe da, por pregunta: posición del primer chunk esperado en los `RETRIEVAL_TOP_K` candidatos densos, si entró en los `RERANKER_MAX_PAIRS` pares, su `relevance_score`, si superó `RELEVANCE_THRESHOLD`, cuántas opciones generó el LLM y cuántas afirmaciones aprobó o descartó el NLI. `[FR-09]` `[OL-06]`
- **AC-2 (happy path · etapa responsable)** · Dado cada par en el que una redacción tiene evidencia y la otra no, cuando se compara, entonces el informe asigna la pérdida a **una** etapa (recuperación densa, corte de pares, umbral de relevancia o NLI) con la regla escrita en el informe, y da el recuento por etapa. `[RN-02]` `[RN-01]`
- **AC-3 (borde · NLI)** · Dadas las afirmaciones descartadas por el NLI en el conjunto, cuando se agregan, entonces el informe da el histograma de `p_entailment` y cuántas quedaron entre 0,5 y `NLI_ENTAILMENT_THRESHOLD`, sin proponer cambiar el umbral (lo decide una calibración con etiquetas humanas). `[RN-01]` `[RN-22]`
- **AC-4 (invariante · datos)** · Dado el informe en `reports/eval/`, cuando se inspecciona, entonces contiene ids, puestos y puntajes, sin texto de chunks; las preguntas son sintéticas (`clase: sintetico`). `[RN-13]` `[RN-14]`

## Contexto técnico
Reutiliza los eventos de log ya existentes (`rag_query_recuperacion`, `rag_query_corte`, `rag_query_citas`) y el *runner* de `app/evaluation/`; sin cambio de código de producción. Los pares van a `data/eval/` (dataset nuevo pequeño o ampliación de `s5-corpus-ampliado/preguntas-contextuales.yaml`). Lo ejecuta `ai-eval-runner`. Hipótesis a confirmar o descartar: la pérdida está en el umbral de relevancia por el recorte del *reranker* a 512 tokens (US-278) y por la falta de sinónimos de procedimientos (US-277), no en el NLI.

## Non-goals
Cambiar umbrales, modelos o catálogo (US-277, US-278); medir recall@10 global (US-230).

## INVEST
**Small** ✓ 2. **Testable** ✓ el informe trae la tabla por pregunta y el recuento por etapa.

---

## US-277 — Las preguntas con un nombre coloquial de un procedimiento recuperan la misma evidencia que con el término técnico

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(alta del 2026-11-11, prioridad 2 del análisis de mejoras tras la Demo 6)* · Estimación **3** · — (técnica y clínica) · FR-09, IA-02 · M-06.1 · ↪ US-276, US-238 (segundo loop de reescritura, L1D-300), US-273 (L1D-331, composición de términos en próstata) · ⛔ Validación del oncólogo asesor de los sinónimos (SUP-4) · 🔗 Cierra: D4-30 (activación de `QUERY_REWRITE_ENABLED`) · **Recorrido principal:** sí

## Story
Como oncólogo, quiero que una pregunta escrita con el nombre coloquial de un procedimiento («cirugía radical de próstata») encuentre la misma evidencia que con el término técnico («prostatectomía radical» / *radical prostatectomy*), para no perder información por cómo redacto la pregunta.

## AC (Given/When/Then)
- **AC-1 (happy path · catálogo)** · Dado `packages/clinical-catalogs/<tipo>/sinonimos.json` (hoy 3 entradas en próstata, ningún procedimiento), cuando se amplía, entonces incluye los procedimientos y tratamientos que aparecen en el corpus de mama y próstata (como mínimo prostatectomía radical, radioterapia externa, braquiterapia, vigilancia activa, mastectomía y cirugía conservadora), con sus variantes en español e inglés, validados por el oncólogo y con versión nueva del catálogo. `[RN-27]` `[RN-22]`
- **AC-2 (happy path · paráfrasis)** · Dados los pares de US-276 cuya pérdida se atribuyó a la recuperación o al umbral, cuando se repiten con el catálogo ampliado y el segundo loop de reescritura activo (`QUERY_REWRITE_ENABLED = true`), entonces la redacción coloquial obtiene evidencia en al menos el 80 % de los pares en que la técnica la obtiene. `[FR-09]`
- **AC-3 (borde · RN-02)** · Dado un primer loop con chunks sobre el umbral, cuando se responde, entonces no se invoca la reescritura; y si tras el segundo loop sigue sin haber chunks sobre el umbral, la respuesta es «sin evidencia» con `topRelevanceScore = null` sin invocar al LLM de generación. `[RN-02]`
- **AC-4 (borde · términos solo del catálogo)** · Dado un término propuesto por el LLM de reescritura que no está en el catálogo, cuando se filtra, entonces se descarta; la pregunta original sigue siendo la que puntúa el *reranker*. `[RN-27]` `[RN-03]`
- **AC-5 (borde · no regresión)** · Dada la suite `evaluate` con modelos locales, cuando se compara con `main`, entonces no empeoran fuera del ruido recall@10, MRR, la exactitud de «sin evidencia» ni las preguntas adversarias, y el p95 de consulta completa queda dentro del tope vigente (20 s). `[ADR-45 P6]` `[ADR-39]`
- **AC-6 (borde · brazo de pares)** · Dada la medición del S6 (D6-44: de 12 a 20 pares +3,1 pts de recall y de 12 a 30 +6,3 pts con 0 falsos «sin evidencia»; de 20 a 30, ≈ +3,2 pts por ≈ +1 s de p95 de recuperación), cuando se ejecuta la misma suite, entonces el informe da también el brazo con 30 pares; el valor por defecto solo cambia con decisión del usuario sobre ese informe. `[RN-22]`

## Contexto técnico
El segundo loop (US-238) ya filtra los términos con el catálogo (`domain/reescritura.py`, `filtrar_terminos_del_catalogo`); lo que falta es vocabulario y la medición que lo active (D4-30). Cambio de catálogo y de configuración: dispara `eval-required` y la evaluación con LLM real es obligatoria (CLAUDE.md, OL-06). Coordinar con US-273, que toca `lenguaje/marcos-de-pregunta.json` para el loop contextual de ADR-52.

## Non-goals
Traducción con modelo dedicado (brazo A4 de US-230); BM25 o multivector; cambiar `RELEVANCE_THRESHOLD`.

## INVEST
**Small** ✓ 3. **Testable** ✓ catálogo validado por esquema, AC-2 y AC-5 en el informe de `evaluate`.

---

## US-278 — El *reranker* puntúa el chunk entero y no solo sus primeros 512 tokens

> Linear: pendiente

`FEAT-T5e` · Post-MVP *(alta del 2026-11-11, prioridad 3 del análisis de mejoras tras la Demo 6)* · Estimación **5** · — (técnica; OL-06) · FR-09, FR-20 · M-06.1 · ↪ US-276, US-231a (adapter real del *reranker*), ADR-39 · ⛔ ninguna dura · 🔗 Informa a: US-230 (brazo nuevo), ADR-39 (enmienda si se adopta) · **Recorrido principal:** sí

## Story
Como responsable técnico, quiero que el *reranker* vea todo el texto de cada chunk de 1024 tokens, para que la evidencia que está en su segunda mitad no se pierda bajo el umbral de relevancia.

## AC (Given/When/Then)
- **AC-1 (happy path · ventanas)** · Dado un chunk más largo que `RERANKER_MAX_LENGTH` (hoy 1024 frente a 512), cuando se reranquea con `RERANKER_CHUNK_WINDOWS = maximo`, entonces se puntúa por ventanas solapadas que cubren el chunk entero y su `relevance_score` es el máximo de sus ventanas, con la misma normalización a [0, 1]. `[RN-03]`
- **AC-2 (borde · comportamiento actual por defecto)** · Dado `RERANKER_CHUNK_WINDOWS = primera` (valor por defecto hasta la decisión), cuando se reranquea, entonces el resultado es idéntico byte a byte al de `main`. `[RN-22]`
- **AC-3 (borde · determinismo y empates)** · Dadas dos ventanas con el mismo puntaje, cuando se agrega, entonces el resultado no depende del orden de ejecución; el orden final sigue siendo `relevance_score` descendente y `chunkId` ascendente. `[RN-28]`
- **AC-4 (happy path · medición)** · Dada la suite `evaluate` con modelos locales y los pares de US-276, cuando se comparan `primera` y `maximo` (y, como brazo alternativo, chunks de 512 tokens con el solapamiento vigente), entonces el informe da recall@10, MRR, falsos «sin evidencia», paráfrasis recuperadas y p95 de la etapa del *reranker* y de la consulta completa. `[OL-06]` `[ADR-45 P6]`
- **AC-5 (borde · presupuesto)** · Dado que las ventanas duplican aproximadamente los pares que puntúa el *reranker*, cuando el p95 de consulta completa supera el tope vigente (20 s) o la RAM del stack supera `STACK_MEMORY_LIMIT_GB`, entonces el informe marca el brazo como «no viable» y el valor por defecto no cambia. `[ADR-39]`
- **AC-6 (invariante · RN-02)** · Dada cualquier variante, cuando ningún chunk supera el umbral, entonces la respuesta sigue siendo «sin evidencia» con `topRelevanceScore = null` y sin invocar al LLM. `[RN-02]`

## Contexto técnico
Adapter `infrastructure/reranker/bge_reranker.py`; la agregación (máximo por ventanas) es una regla pura en `domain/` con su test unitario, y el adapter falso cumple el mismo contrato (LSP). ADR-39 ya registra el riesgo: con chunks de 1024 y `RERANKER_MAX_LENGTH` = 512 el *reranker* (recall@10 0,652) queda por debajo del denso (0,710), y 768 o 1280 no se pudieron medir (ADR-45 H5). Alternativa más barata a medir en el mismo informe: subir `RERANKER_MAX_LENGTH` a 1024 si la latencia lo permite. Cambio de umbral de facto: dispara `eval-required` y la evaluación con LLM real.

## Non-goals
Cambiar el modelo del *reranker*; cambiar `RELEVANCE_THRESHOLD` (si la distribución de puntajes cambia, su recalibración es una decisión aparte con el barrido de US-073).

## INVEST
**Small** ✓ 5. **Testable** ✓ regla pura con tests unitarios, AC-2 byte a byte, AC-4 y AC-5 en el informe.
