# FEAT-10c — Hasta 3 opciones descritas en la evidencia, ordenadas por aplicabilidad

> Linear: [L1D-25](https://linear.app/l1der-lab-mjbc/issue/L1D-25)

**Talla:** L (2 historias de desarrollo + un ADR condicional) · **Sprint:** 5 (→ G-Demo, datos sintéticos) · `si-hay-capacidad` (US-015 · ADR-42) · **Capacidad:** CAP-10 (AC-10.1 completo, AC-10.2 tarjeta con varias opciones) · CAP-08 (AC-08.8: la opción usa su fuente más aplicable, consumido) · **Recorrido principal:** sí (hipótesis 3: encontrar las opciones descritas en la evidencia **más aplicables** a las condiciones del paciente)
**Requisitos:** FR-09 (S4: "hasta 3 desde el Sprint 4" y "orden de las opciones por aplicabilidad", vía HU-10) · RN-28 (dueña del **orden visible** de hasta 3 opciones; el comparador, la agregación por opción y la selección por aplicabilidad antes del recorte, ya activa en el S3 con una opción, son de US-125) · RN-03 (regresión: la relevancia solo desempata) · RN-22 (`EVIDENCE_MAX_OPTIONS` en configuración) · TBD-08 (ADR-42, condicional)
**Evidencia:** [→ PRD §5 FR-09 ("Máximo 1 opción en los Sprints 1–3 y hasta 3 desde el Sprint 4"; "Orden de las opciones por aplicabilidad (RN-28)")], [→ PRD §6 RN-03, RN-22, RN-26, RN-28], [→ PRD §18.3.10 AC-10.1, AC-10.2, M-10.1], [→ PRD §18.3.8 AC-08.8], [→ PRD §2.1 G-5], [→ PRD §16 TBD-08], [→ readme §5 HU-10 ("comparar hasta 3 opciones descritas en la evidencia, ordenadas por aplicabilidad")], [→ readme §4.1 `EvidenceOption`, `AnalysisBasis.maxOptions`], [→ readme §3.3 #27, #31], [→ readme §6.1 #8], [→ readme §5.0 S4 KR1], [→ backlog/02-adrs.md US-015 · ADR-42], [→ docs/AS-IS.md P6, JTBD 4]
**Dependencias:** ↪ US-055 (pipeline), US-061 (tarjeta), US-064 (soporte de cada opción), US-125 (comparador `applicability_order`, agregación por opción y orden antes del recorte a `maxOptions`, AC-5…AC-7), US-126 (tabla y resumen de aplicabilidad en la tarjeta y texto del criterio de orden, AC-7) · ⛔ DEC-11 (US-021) · escenario más probable (excluyentes y "Parcial", que alimentan los conteos) · ⛔ ADR-39 (LLM y NLI reales; los AC usan adapters falsos) · 🔗 Medido en: US-140 (M-10.1 y orden con verdad conocida), US-141 (G-5 / M-06.2 con hasta 3 opciones) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-26] → US-071
**Valor:** el oncólogo no busca "la" opción, compara (P6, JTBD 4). Hasta el S3 el análisis devuelve una sola opción: en el S1–S2, sin aplicabilidad, se elige por relevancia y el panel lo dice; desde el S3 esa opción única ya se elige con el comparador de aplicabilidad de US-125, con la relevancia solo como desempate. Con esta Feature ve hasta tres opciones que describe la evidencia, ordenadas por cuánto se parece la población estudiada a su paciente y no por eficacia ni por relevancia, con el criterio de orden siempre a la vista.
**Stories:** US-134, US-135, US-218, US-219 (16 puntos, S5) · US-015 · ADR-42 (3 puntos, `si-hay-capacidad`)

## Fixtures

- **FX-10c-a · Cuatro opciones con aplicabilidad conocida** (extiende FX-08b-a; en ambos backends, perfil de test `RAG_ADAPTERS=fake`):
  - Paciente **A-M1** de FX-08b-a; pregunta `Q-HER2` de FX-06a-a; `RELEVANCE_THRESHOLD = 0.30`; catálogo `test-apl-1.0.0` montado en ambos backends.
  - Chunks de test (todos `is_current = true`, mama): `ch-a1-1` (`doc-a1`), `ch-a4-1` (`doc-a4`), `ch-a5-1` (`doc-a5`) y `ch-a6-1` (`doc-a6`, ECA estructurado nuevo). Puntajes del *reranker* falso para `Q-HER2`: `ch-a4-1` 0,92 · `ch-a5-1` 0,85 · `ch-a1-1` 0,70 · `ch-a6-1` 0,60.
  - Adapter falso de aplicabilidad `APL-FIJA` (devuelve el resumen por fuente sin evaluar criterios):
    - `doc-a4` → `{ coincide: 2, parcial: 0, noCoincide: 1, desconocido: 2 }`, 1 excluyente (`estado_her2`) en No coincide, `populationNotComparable = true`.
    - `doc-a1` → `{ 3, 0, 0, 2 }`, 0 excluyentes en No coincide.
    - `doc-a5` → `{ 2, 1, 0, 2 }`, 0 excluyentes en No coincide.
    - `doc-a6` → `{ 3, 0, 0, 2 }`, 0 excluyentes en No coincide.
  - LLM falso `LLM-CUATRO` (en este orden de salida): **O-A** "Opción A (test)" cita `ch-a4-1` · **O-B** "Opción B (test)" cita `ch-a1-1` · **O-C** "Opción C (test)" cita `ch-a5-1` · **O-D** "Opción D (test)" cita `ch-a6-1` · **O-E** "Opción E (test)" cita `ch-a1-1` con la afirmación "duplica la supervivencia". NLI falso: `entailment` para O-A…O-D, `neutral` para O-E.
  - LLM falso `LLM-TRES`: O-A, O-B y O-C de `LLM-CUATRO`.
  - LLM falso `LLM-MULTIFUENTE`: **O-F** cita `ch-a4-1` y `ch-a1-1`.
- **Orden esperado con `LLM-CUATRO` y `EVIDENCE_MAX_OPTIONS = 3`:** O-B (0 excl., 3 coincide, 0,70) → O-D (0 excl., 3 coincide, 0,60) → O-C (0 excl., 2 coincide, 0,85). O-A (1 excluyente) queda fuera del tope; O-E va a `discardedOptions`.
- **Orden esperado con `LLM-TRES`:** O-B → O-C → O-A (la no comparable queda última, visible).

---

## US-134 — `/rag/query` devuelve hasta 3 opciones en orden determinista por aplicabilidad y `clinical-api` las persiste en ese orden

> Linear: [L1D-144](https://linear.app/l1der-lab-mjbc/issue/L1D-144)

`FEAT-10c` · Sprint 5 · Estimación **5** · HU-10 · FR-09 (S4: hasta 3 y orden), RN-28 (dueña del orden visible), RN-03, RN-22 · AC-10.1, AC-08.8 (consumo) · ↪ US-055, US-064, US-125 · ⛔ DEC-11 (US-021) · escenario más probable · ⛔ ADR-39 (solo para la medición real; los AC usan adapters falsos) · 🔗 Consume: US-125 (`applicability_order`) · 🔗 Medido en: US-140 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-15] → US-148 (activa desde S6)

## Story
Como oncólogo, quiero que el análisis me devuelva hasta tres opciones descritas en la
evidencia ordenadas por cuánto se parece la población estudiada a mi paciente, para
comparar primero las que más aplican sin que la relevancia de la búsqueda ni el orden en
que las redactó la IA decidan cuál veo arriba.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-10c-a con `LLM-CUATRO` y
  `EVIDENCE_MAX_OPTIONS = 3`, cuando `doc1@test.local` envía `Q-HER2` sobre A-M1 a
  `POST /platform/evidence-analyses`, entonces la respuesta es `200` con
  `evidenceOptions` = [O-B, O-D, O-C] en ese orden y
  `analysisBasis.maxOptions = 3`. `[AC-10.1]` `[RN-28]` `[HU-10]` `[FR-09]`
- **AC-2 (borde · la relevancia solo desempata)** · Dada la respuesta del AC-1, cuando
  se comparan las posiciones, entonces O-C (relevancia 0,85) queda detrás de O-D
  (0,60) porque tiene menos criterios en Coincide, y O-B precede a O-D solo por
  relevancia (mismos conteos). `[RN-28]` `[RN-03]` `[AC-10.1]`
- **AC-3 (borde · tope de opciones)** · Dado `LLM-CUATRO`, cuando se recorta a 3,
  entonces O-A no aparece en `evidenceOptions` ni en `discardedOptions`.
  `[FR-09]` (asumido: el excedente válido no es una descartada, igual que US-055 AC-8)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-3, campo `analysisBasis`): ¿las opciones con soporte que quedan fuera del tope de 3 se declaran en la Base del análisis (p. ej., "La evidencia describe 1 opción más, no mostrada") o se omiten sin mención?
- **AC-4 (borde · no comparable visible)** · Dado `LLM-TRES`, cuando se procesa,
  entonces `evidenceOptions` = [O-B, O-C, O-A] y O-A trae
  `populationNotComparable = true` y `warnings` con `poblacion_no_comparable`: queda
  última, pero no se oculta. `[RN-28]` `[RN-26]` `[AC-08.8]`
- **AC-5 (borde · sin soporte no cuenta)** · Dado `LLM-CUATRO`, cuando se valida,
  entonces O-E aparece en `discardedOptions` con
  `discardReason = afirmacion_sin_soporte` y no ocupa ninguna de las 3 posiciones.
  `[RN-01]` `[FR-10]` `[AC-10.4]`
- **AC-6 (invariante · determinismo)** · Dadas las 24 permutaciones del orden de salida
  de O-A…O-D en el LLM falso, cuando se procesa cada una, entonces `evidenceOptions` es
  siempre [O-B, O-D, O-C]. `[RN-28]` `[ADR-27]`
- **AC-7 (borde · opción con varias fuentes)** · Dado `LLM-MULTIFUENTE`, cuando se
  ordena, entonces O-F se compara con el resumen de `doc-a1` (su fuente más aplicable)
  y no con el de `doc-a4`. `[AC-08.8]` `[RN-28]` · 🔗 Consume: US-125
- **AC-8 (borde · persistido en el mismo orden)** · Dado el análisis del AC-1, cuando
  se lee `evidence_options` del `AIAnalysisRecord`, entonces el arreglo tiene el mismo
  orden y contenido que la respuesta, y `clinical-api` no reordena nada.
  `[RN-06]` `[AC-T1.4]`

## Contexto técnico
El orden se calcula en `rag-orchestrator/app/domain/` reutilizando la función pura
`applicability_order` de US-125 sobre el `applicabilitySummary` de cada opción (su fuente
más aplicable) y después recorta a `maxOptions`; el orden del arreglo **es** el orden
(el contrato `EvidenceAnalysis` no cambia, ADR-26: no hay campo `rank`). `clinical-api`
envía `maxOptions` desde la variable `EVIDENCE_MAX_OPTIONS` (valor 3 desde el S4;
con valor 1 se aplica el mismo comparador antes del recorte, como en el S3, US-125 AC-5) `[RN-22]`;
la validación de arranque rechaza valores fuera de 1–3 (asumido, tope de FR-09). La
secuencia validación → orden → recorte es la de US-125 (AC-7): una descartada nunca
ocupa posición. Tests:
Pytest con adapters falsos de FX-10c-a (AC-2, AC-3, AC-5…AC-7) y Supertest de
`clinical-api` con `rag-orchestrator` en perfil de test (AC-1, AC-4, AC-8); misma
versión de `packages/clinical-catalogs` (`test-apl-1.0.0`) en ambos backends.

## Non-goals
Síntesis (FEAT-07) y búsqueda complementaria del agente (FEAT-08c), que el readme sitúa
en el S4 y el slicing adoptado difiere. Comparación entre análisis (`GET …/compare`,
FEAT-11a). Cualquier puntaje combinado o "nivel de evidencia" (RN-28, AC-07.5).

## INVEST
**Small** ✓ reutiliza el comparador, el orden y el recorte de US-125; solo cambia el tope y la persistencia del orden.
**Testable** ✓ ocho tests deterministas con un fixture de conteos fijos.

---

## US-135 — El panel muestra hasta 3 tarjetas en el orden recibido, con el criterio de orden visible y sin rótulos de jerarquía clínica

> Linear: [L1D-145](https://linear.app/l1der-lab-mjbc/issue/L1D-145)

`FEAT-10c` · Sprint 5 · Estimación **3** · HU-10 · FR-09 (UI S4), RN-28 (texto del criterio), RN-03, RN-23, NFR-12 · AC-10.1 (UI), AC-10.2 (varias tarjetas) · ↪ US-134, US-061, US-126 · 🔗 Consume: US-136 (avisos de conflicto y faltantes), US-101 (avisos sin verificar) · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069

## Story
Como oncólogo, quiero ver lado a lado hasta tres opciones con su aplicabilidad, sus citas
y sus avisos, en el orden en que el sistema las clasificó y con el criterio explicado,
para compararlas sin confundir el primer lugar con "la mejor opción".

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la respuesta del AC-1 de US-134 en Playwright contra
  Compose (perfil de test, FX-10c-a), cuando se renderiza el panel, entonces bajo
  "Opciones descritas en la evidencia" hay 3 tarjetas en el orden O-B, O-D, O-C, cada
  una con su resumen de aplicabilidad ("3 coinciden · 2 desconocidos"), sus citas y la
  "Relevancia de la evidencia" como metadato secundario. `[AC-10.1]` `[AC-10.2]` `[HU-10]`
- **AC-2 (borde · criterio visible)** · Dado el panel del AC-1, cuando se inspecciona,
  entonces encima de las tarjetas se lee "Ordenadas por coincidencia con la población
  estudiada, no por eficacia" una sola vez. `[RN-28]` `[AC-10.1]`
- **AC-3 (borde · sin jerarquía clínica)** · Dado el panel del AC-1, cuando se pasa la
  lista de términos prohibidos de US-068 sobre el DOM, entonces no hay coincidencias y
  ninguna tarjeta lleva rótulos como "Mejor opción", "Primera elección" ni medallas o
  números de ranking distintos de la posición en la lista. `[RN-23]` `[AC-10.3]`
  (asumido en los rótulos no listados por RN-23)
- **AC-4 (borde · la UI no reordena)** · Dada una respuesta simulada en la que la
  segunda opción tiene mayor `relevanceScore` que la primera, cuando se renderiza,
  entonces el orden visible es el del arreglo recibido. `[RN-28]` `[RN-03]`
- **AC-5 (borde · no comparable)** · Dada la respuesta de `LLM-TRES`, cuando se
  renderiza, entonces la tercera tarjeta (O-A) lleva la etiqueta "Población no
  comparable" y se muestra completa. `[AC-08.6]` `[RN-26]`
- **AC-6 (borde · accesibilidad)** · Dado el panel del AC-1, cuando se navega con
  teclado, entonces cada tarjeta es un elemento de una lista ordenada (`<ol>`) con
  encabezado propio y el lector de pantalla anuncia "Opción 1 de 3". `[NFR-12]` (asumido)

## Contexto técnico
`EvidenceOptionCard` (US-061) ya itera `evidenceOptions[]`; esta historia agrega la
plantilla de lista (`EvidenceOptionsList`) con `<ol>` y el texto del criterio, que en el
S3 se mostraba sobre una sola tarjeta (US-126 AC-7; en el S1–S2, el texto neutro de
US-061 AC-3). Sin lógica de orden en `web`.
Tests: Playwright contra Compose en perfil de test con FX-10c-a (AC-1, AC-2, AC-3, AC-5,
AC-6) y test de componente con Vitest + Testing Library (AC-4).

## INVEST
**Small** ✓ una plantilla de lista sobre tarjetas existentes.
**Testable** ✓ seis tests E2E y de componente.

---

## US-015 · ADR-42 — Streaming de eventos de progreso del análisis

> Linear: [L1D-146](https://linear.app/l1der-lab-mjbc/issue/L1D-146)

`FEAT-10c` · Sprint si-hay-capacidad · Estimación **3** · — (ADR) · TBD-08, G-5 · RN-06, RN-30 · Dueño: Ingeniería · ⛔ Bloqueada por: ADR-39 (US-012, modelos fijados), US-141 (p95 con hasta 3 opciones y aplicabilidad; integrado en US-142 AC-7, `si-hay-capacidad`) · 🔗 Bloquea (solo si la decisión es "streaming de progreso"): UX de espera de US-135 · **Recorrido principal:** no · **Workaround en el MVP:** el análisis responde JSON completo (estado actual, readme §6.1 #8) y la UI muestra un indicador de espera indeterminado con texto de etapa fijo

## Story
Como responsable técnico, quiero decidir con el p95 medido si el análisis emite eventos
de progreso, para que la espera sea tolerable sin mostrar nunca contenido del LLM que aún
no pasó la validación de citas y soporte.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados el p95 de `/platform/evidence-analyses` registrado en el
  S1 y el medido en el S4 por US-141 con hasta 3 opciones y aplicabilidad (protocolo de
  ADR-39), cuando se decida, entonces
  `docs/architecture/adr/ADR-42-streaming-progreso.md` registra la cifra, el umbral de
  decisión (configurable) y la opción elegida. `[TBD-08]` `[G-5]`
- **AC-2 (invariante)** · Dada cualquier opción con eventos, cuando se especifique,
  entonces los eventos solo nombran etapas (p. ej., recuperando evidencia, generando,
  validando), nunca contienen tokens, afirmaciones ni PII, y la respuesta final se
  entrega solo después de que Backend 1 persiste el `AIAnalysisRecord`.
  `[RN-06]` `[readme §2.1]` `[CLAUDE.md]`
- **AC-3 (borde · ruta y seguridad)** · Dada la opción SSE, cuando se diseñe, entonces
  sigue pasando por el Route Handler `app/api/evidence-analyses/route.ts` (no Server
  Action), mantiene la verificación de `Origin`, el *rate limit* de RN-30 y el
  *deadline* propagado, y no publica puertos de los backends. `[CLAUDE.md]` `[RN-30]`
- **AC-4 (borde · sin necesidad)** · Dado un p95 dentro de la meta, cuando se decida,
  entonces el ADR puede elegir "JSON completo" (estado actual) y fija el criterio que
  reabre la decisión. `[readme §6.1 #8]`
- **AC-5 (borde · p95 fuera de meta sin capacidad)** · Dado un p95 del S4 por encima de
  la meta y sin capacidad para implementar SSE en el S4, cuando se registre, entonces se
  mantiene el workaround (JSON completo + indicador de espera) y el ADR nombra la
  historia de implementación como pendiente para el S6. `[G-5]` `[TBD-08]` (asumido)

## Contexto técnico
Historia de ADR: el entregable es el documento con dueño y fecha. Opciones: A · JSON
completo (estado actual; simple, ya cumple las invariantes; espera sin feedback si el
p95 crece) · B · SSE con eventos de progreso por etapa (B2 → B1 → `web`; feedback sin
exponer contenido; conexión abierta por análisis, cancelación y *deadline*).
**Descartado por decisión previa (no se reabre):** streaming de tokens y *polling*
(readme §6.1 #8).

## Non-goals
No implementar SSE. No emitir contenido parcial. No cambiar el contrato
`EvidenceAnalysis` (ADR-26).

## INVEST
**Small** ✓ una decisión con dos opciones y una cifra medida.
**Testable** ✓ los AC verifican el contenido del documento del ADR.

---

---

## US-218 — El oncólogo hace hasta 10 preguntas de seguimiento sobre un análisis y cada respuesta llega citada, validada y anclada a ese análisis

> Linear: [L1D-268](https://linear.app/l1der-lab-mjbc/issue/L1D-268)

`FEAT-10c` · Sprint 5 · Estimación **5** · — (técnica, PRD §17; cambio frente a PRD §3/§17 "conversación de varios turnos: Post-MVP", `[Pre-S1 resp. 14]`) · FR-31, FR-09, RN-01, RN-04, RN-06, RN-11, RN-23, RN-24, RN-15 · ↪ US-033 (AC-13, contrato congelado), US-055, US-063, US-064, US-053, US-134 · 🔗 Consumida por: US-219

## Story
Como oncólogo, quiero hacer preguntas de seguimiento puntuales sobre los hallazgos de un
análisis ya validado, sin salir de su contexto, para aclarar una opción o un criterio sin
repetir el análisis completo.

> **Decidido (usuario, 2026-10-11):** entra al MVP comprometido en el S5. Cambia el PRD, que dejaba Post-MVP la "conversación de varios turnos" (§3, §17).
> - **Límite:** 10 preguntas por análisis, en configuración (`ANALYSIS_FOLLOWUP_MAX = 10`, RN-22).
> - **Contexto fijo:** el paciente desidentificado, los datos usados por el análisis, la pregunta y sus hallazgos, y la evidencia del mismo corpus. Se rechaza todo lo ajeno a ese contexto.
> - **Persistencia en Backend 1** (`clinical.analysis_follow_up`, ligada al `AIAnalysisRecord`), por la regla de ownership: `rag-orchestrator` no persiste datos clínicos.
>
> `[Pre-S1 resp. 14]`

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis `con_evidencia` del paciente semilla (b), cuando el
  oncólogo hace `POST /platform/evidence-analyses/{id}/follow-ups` con una pregunta sobre
  la opción 2, entonces `clinical-api` envía a `rag-orchestrator` el contexto anclado y
  desidentificado, recibe la respuesta completa, **persiste el turno antes de responder**
  y devuelve `201 FollowUpTurn` con `answer` (afirmaciones con ≥ 1 cita a un chunk
  recuperado en esa consulta y soporte NLI), `citedSources` (marcando las nuevas respecto
  del análisis) y `turnNumber = 1`. `[RN-01]` `[RN-06]` `[RN-04]`
- **AC-2 (borde · memoria no citable)** · Dado el análisis de origen, cuando
  `rag-orchestrator` arma el prompt del seguimiento, entonces los hallazgos del análisis
  viajan como **memoria rotulada** y ninguna afirmación del seguimiento se sostiene solo
  en ellos; si ocurre, se omite y cuenta en `omittedClaims`. `[RN-24]`
- **AC-3 (borde · sin evidencia)** · Dada una pregunta de seguimiento sin chunks sobre el
  umbral, cuando se procesa, entonces el turno es `sin_evidencia`, no se invoca al LLM y
  la UI ofrece ampliar la antigüedad o abrir un análisis nuevo. `[RN-02]`
- **AC-4 (borde · límite)** · Dado un análisis con 10 turnos, cuando llega el 11.º,
  entonces responde `409` con `error = "LIMITE_SEGUIMIENTO"` y el mensaje sugiere un
  análisis nuevo; el límite se lee de `ANALYSIS_FOLLOWUP_MAX`. `[RN-22]`
- **AC-5 (borde · fuera de contexto)** · Dada una pregunta sobre otro paciente u otro tema
  (clasificador determinista más una regla del prompt), cuando se procesa, entonces el
  turno queda `fuera_de_contexto`, sin respuesta generada, con la sugerencia de abrir un
  análisis nuevo. `[Pre-S1 resp. 14]`
- **AC-6 (borde · opt-out y PII)** · Dado un paciente con opt-out de `analisis_ia`,
  entonces responde `403`; y dada una pregunta y una evolución (`outcomesSince`) con PII
  sembrada, entonces el texto que sale hacia la IA está enmascarado, la pregunta se guarda
  y se devuelve enmascarada, y los logs no la contienen. `[RN-15]` `[RN-11]` `[Pre-S1 resp. 23]`
- **AC-8 (borde · seudónimo por turno y Backend 2 sin estado)** · Dados dos turnos del
  mismo análisis, cuando se envían a `rag-orchestrator`, entonces cada uno lleva un
  `pseudoPatientId` y un `traceId` distintos, ninguno se persiste en
  `analysis_follow_up`, y un Pytest demuestra que Backend 2 no escribe turnos ni memoria
  (disco, caché, Milvus ni logs). `[RN-11]` `[Pre-S1 resp. 23]` `[Pre-S1 resp. 29]`
- **AC-7 (borde · lenguaje)** · Dada una respuesta con un término de la lista prohibida,
  entonces esa afirmación se omite (`omittedClaims`) y nunca se muestra. `[RN-23]` `[§15 resp. 2]`

## Contexto técnico
Endpoints `POST/GET /platform/evidence-analyses/{id}/follow-ups` (contrato congelado en US-033
AC-13). Backend 2 expone el endpoint interno propio `POST /rag/follow-up` (sin estado; memoria
del análisis rotulada y no citable; clasifica `fuera_de_contexto`) que reutiliza el pipeline de
recuperación y validación; Backend 1 calcula la marca de fuente nueva (`[Pre-S1 resp. 19]`). Tabla `clinical.analysis_follow_up` (US-038). Tests: Supertest y PostgreSQL real
(AC-1, AC-4, AC-6), Pytest con adapters falsos (AC-2, AC-3, AC-5, AC-7). Afecta a la suite
`evaluate` (prompt nuevo): reporte de `ai-eval-runner` en el PR.

## Non-goals
Respuestas en streaming de contenido (TBD-08). Seguimiento sobre análisis `sin_evidencia`.

## INVEST
**Small** ✓ un endpoint y un bloque de contexto sobre el pipeline existente.
**Testable** ✓ siete AC automatizados.

---

## US-219 — El panel muestra la conversación de seguimiento bajo el análisis, con su contexto fijo y el contador de preguntas

> Linear: [L1D-269](https://linear.app/l1der-lab-mjbc/issue/L1D-269)

`FEAT-10c` · Sprint 5 · Estimación **3** · — (técnica, PRD §17) · FR-31, RN-01, RN-19, RN-23, RN-26 · ↪ US-218, US-135 · Diseño: `docs/ux/flujo-e2e.md` pantalla 09 · `[Pre-S1 resp. 14]`

## Story
Como oncólogo, quiero ver y escribir las preguntas de seguimiento debajo del análisis, con
su contexto y sus citas, para discutir los hallazgos sin perder la trazabilidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis `con_evidencia`, cuando el oncólogo abre la
  pantalla 09, entonces ve "Preguntas de seguimiento sobre este análisis" antes del
  feedback, el recuadro "Contexto fijo de esta conversación" y el contador "n de 10
  preguntas usadas". `[Pre-S1 resp. 14]`
- **AC-2** · Dado un turno respondido, cuando se muestra, entonces cada afirmación tiene
  sus citas con "ver fragmento", la fuente nueva lleva "nueva en el seguimiento" y el
  aviso RN-19 acompaña la respuesta. `[RN-01]` `[RN-19]`
- **AC-3 (borde · espera)** · Mientras se procesa, la UI muestra solo el progreso y la
  respuesta aparece completa cuando está validada. `[TBD-08]`
- **AC-4 (borde · límite, sin evidencia, fuera de contexto)** · Dados los estados
  `409 LIMITE_SEGUIMIENTO`, `sin_evidencia` y `fuera_de_contexto`, cuando ocurren,
  entonces la UI muestra su texto y la acción "Nuevo análisis" sin errores técnicos.
- **AC-5 (accesibilidad)** · El historial de turnos se anuncia con `aria-live="polite"` y
  el campo de pregunta tiene `<label>` visible; pasa `visual-check` a 375 y 1280 px.

## Contexto técnico
Organismo `FollowUpThread` sobre shadcn/ui (`docs/ux/sistema-de-diseno.md`). Route Handler
de `web` hacia US-218. Testing Library + MSW con `contracts/examples/` y `visual-check`.

## INVEST
**Small** ✓ un organismo y su Route Handler.
**Testable** ✓ cinco AC.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | readme §5.0 S4 y PRD §14 S4: HU-10 junto con síntesis (HU-21), aplicabilidad (HU-22), agente (HU-26), historial y ciclo de vida | Slicing adoptado (`01-requisitos.md` §15): S4 = opciones ordenadas por aplicabilidad, avisos, datasets y feedback; aplicabilidad adelantada al S3; síntesis, historial y agente a S6/Post-MVP | Slicing: FEAT-10c en el S4 consume la aplicabilidad del S3 (FEAT-08b) |
| — | backlog/01-requisitos.md §3 RN-28: dueña FEAT-10c (orden) con regresión en FEAT-08b | FEAT-08b (lote 2) fijó US-125 como dueña del comparador y de la agregación | Ambas: US-125 dueña del comparador y la agregación; US-134 dueña del orden visible de hasta 3 opciones |
| — | `backlog/02-adrs.md` US-015 · ADR-42: Feature FEAT-10a | Mapa de lotes: ADR-42 en el S4 | ADR-42 se ubica en FEAT-10c (S4), la Feature cuya espera mide; FEAT-10a es del S1 |
| Slicing v2 | PRD §14 S4 y readme §5.0 S4: hasta 3 opciones y G-Demo al cierre del S4 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): hasta 3 opciones y G-Demo al cierre del S5; ADR-42 `si-hay-capacidad` (indicador de espera) | Se siguió el slicing v2 |
| C-Pre4 | PRD §3 y §17: "conversación de varios turnos dentro de un análisis" es Post-MVP | Usuario, 2026-10-11: preguntas de seguimiento (hasta 10) en el MVP, S5 | Usuario (`[Pre-S1 resp. 14]`): US-218 y US-219. Enmendado en PRD v1.4 |
