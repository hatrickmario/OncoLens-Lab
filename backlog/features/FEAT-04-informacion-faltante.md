# FEAT-04 — Información faltante: checklist determinista de datos críticos

> Linear: [L1D-14](https://linear.app/l1der-lab-mjbc/issue/L1D-14)

**Talla:** L · **Sprint:** 4 · **Capacidad:** CAP-04 · T-1 (AC-T1.1 en el checklist, AC-T1.4 en faltantes) · T-2 (produce el inciso b) · **Recorrido principal:** sí (hipótesis 2: identificar los faltantes)
**Requisitos:** FR-23 (dueña, vía HU-18); FR-09 (contexto con faltantes), FR-27 inciso (b) (produce el dato); RN-29 (dueña), RN-26, RN-11, RN-07, RN-22
**Evidencia:** [→ PRD §5 FR-23], [→ PRD §18 AC-04.1…AC-04.5], [→ PRD §18 M-04.1, M-04.2, M-04.3], [→ PRD §6 RN-26], [→ PRD §6 RN-29], [→ PRD §6 RN-11], [→ PRD §16 TBD-12], [→ PRD §17 FR-23 → HU-18], [→ PRD §2 G-12], [→ PRD §18 AC-T1.1, AC-T1.4, AC-T4.3], [→ readme §5.6 HU-18], [→ readme §4.1 `CaseView.completeness`, `continueWithWarning`, `missingCriticalCount`, `Provenance`], [→ readme §4.2 `ClinicalContext.missingCriticalData`], [→ readme §3.1 `AIAnalysisRecord.missing_critical_data`], [→ readme §3.3 #29], [→ readme §3.3 #38], [→ readme §6 OL-01 (paciente e)], [→ readme §6 OL-03], [→ backlog/01-requisitos.md §14 Q-03, Q-04; §15 P-03], [→ backlog/02-adrs.md DEC-05, Resoluciones P-03], [→ backlog/04-auditoria.md (hallazgos del piloto)], [→ docs/AS-IS.md P4, JTBD 2], [→ CLAUDE.md]
**Dependencias:** ⛔ DEC-01 (catálogo `propuesta` revisado por el oncólogo, P-03; no bloquea las historias técnicas) · ⛔ DEC-05 (cerrada en el Pre-S1: Gleason/ISUP en `Diagnosis.grade`) · ↪ US-041, US-042 (catálogo v1 y validador mínimo, `si-hay-capacidad`) · ↪ US-052, US-053 (gateway, S1) · ↪ US-061 (panel, S1) · ↪ US-088, US-090 (vista de caso, S3) · ↪ US-079 (carga, S2) · ↪ US-094 (registro manual de atributos y tratamientos previos, `si-hay-capacidad`) · ↪ US-110, US-111 (registro manual de biomarcadores y diagnóstico, S4) · 🔗 Produce para: US-128 (inciso b), US-124 (Desconocido: falta en el paciente), US-116 (faltantes como "desconocido" en Backend 2), US-177 (re-ejecución) · 🔗 Medido en: US-131 (M-04.1, M-04.2) · 🔗 Regresión [FR-18] → US-102
**Valor:** hoy el oncólogo descubre el faltante *después* de analizar: caso incompleto → análisis → descubre el faltante → vuelve atrás → pide el examen → espera → reanaliza. Es "el loop más costoso" del Discovery (AS-IS, P4: "¿Qué me falta para poder analizar bien este caso?", JTBD 2). Con esta Feature, el oncólogo ve qué datos críticos faltan antes de preguntar, puede cargarlos o registrarlos desde el mismo checklist o continuar con un aviso, y el análisis declara lo que no sabía. El sistema nunca le impide continuar (PP-6).
**Stories:** DEC-01, US-001 … US-006 (23 puntos, S4)

> **Talla L, no XL:** son 6 historias técnicas más 1 de decisión, todas en `clinical-api` + `web` + `packages/clinical-catalogs`. `rag-orchestrator` solo valida la versión del catálogo: el uso de los faltantes en el prompt es de US-116 y en la aplicabilidad, de US-124.

## Fixtures

- **FX-04-a · Catálogos de test** `test-1.0.0` y `test-1.1.0` (definidos en el contexto técnico de US-002), en `packages/clinical-catalogs/test/fixtures/`.
- **FX-04-b · Pacientes F-M1, F-M2, F-M3 y F-P1** (definidos en el contexto técnico de US-002), en `apps/clinical-api/test/fixtures/completeness/`.
- **Carga en los E2E (Playwright contra Compose):** perfil de test de Compose que monta `test-1.0.0` en `clinical-api` **y** en `rag-orchestrator` (misma `CLINICAL_CATALOG_PATH` y `CLINICAL_CATALOG_VERSION`, para que el análisis no responda `409`) y siembra FX-04-b con `npm run seed:test -- FX-04-b`, que se niega a correr en el entorno `piloto`. La PII sintética de F-M2 se genera en tiempo de test y no se versiona, para no disparar el escaneo de PII de la CI (US-036).

---

## DEC-01 — Catálogo de datos críticos de mama y próstata revisado por el oncólogo

> Linear: [L1D-92](https://linear.app/l1der-lab-mjbc/issue/L1D-92)

`FEAT-04` · Sprint 4 (antes del cierre) · Estimación **1** · — (decisión) · TBD-12 · M-04.3 (gobierno; P-03) · RN-29 · Dueño: **oncólogo asesor** (prepara Ingeniería) · ⛔ DEC-05 (Q5, cerrada en el Pre-S1) · ↪ US-001 · 🔗 Bloquea: DEC-19 (US-031, criterio de "listo", S6)

## Story
Como oncólogo asesor, quiero revisar la versión del catálogo de datos críticos de mama
y de próstata (ítems, reglas condicionales y campo de destino de cada ítem), para que el
checklist marque como faltante solo lo que de verdad hace falta para analizar un caso.

> Escenario más probable (a refinar en sprint planning): por **P-03**, no hay sesión de firma formal. El oncólogo revisa la versión `propuesta` con las respuestas a Q1–Q9 que propone Ingeniería (Q1: cuentan `verificado`, `corregido` y los datos `manual`; Q4: `whenConditionUnknown = faltante` en los ítems condicionales de enfermedad avanzada; Q5: resuelta por DEC-05) y la publica como `propuesta_revisada`; su validez clínica se mide con el feedback agregado de VM-5 ("aviso de faltantes correcto / útil", FEAT-T5c, S5): validado con ≥ 80 % de análisis "correcto y útil" y la muestra mínima de DEC-02; por debajo, `muestra_insuficiente` (respuesta 5 del usuario, §15; umbral en configuración, US-139).

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paquete de revisión de la versión `propuesta` de
  US-001 (ítems por tipo de cáncer, reglas condicionales, matriz ítem → campo y
  respuestas a Q1–Q9), cuando el oncólogo asesor lo revisa, entonces la versión
  publicada en `packages/clinical-catalogs` lleva un bloque `validation` con
  `scope = ["datos_criticos", "matriz_item_campo"]`, `status = "propuesta_revisada"`,
  `reviewerRole = "oncologo_asesor"`, la fecha y un `catalogHash`, y `catalog:validate` la
  acepta. `[TBD-12]` `[P-03]` `[RN-29]` `[M-04.3]` (revisado, sin firma formal: P-03)
- **AC-2 (registro de la decisión)** · Dada la revisión, cuando se registra, entonces
  `docs/decisions/DEC-01-catalogo-datos-criticos.md` contiene la respuesta a cada
  pregunta Q1–Q9 (Q5 citando DEC-05), el revisor y la fecha, y declara que no hay firma
  formal y que la validación se mide con el feedback agregado de VM-5 (≥ 80 % "correcto
  y útil", con muestra mínima; US-139). `[P-03]` `[§15 resp. 5]` `[TBD-12]` (asumido en
  la ubicación del documento)
- **AC-3 (borde · pregunta sin responder)** · Dado un ítem cuya pregunta sigue abierta,
  cuando se registra la decisión, entonces el documento lo lista como pendiente con su
  dueño y la versión publicada lo mantiene con `estado = "pendiente"`. (asumido)
- **AC-4 (borde · ítem rechazado)** · Dado un ítem que el oncólogo rechaza, cuando se
  publica la versión revisada, entonces ese ítem no está en ella y el documento registra
  el motivo. (asumido)

## Contexto técnico
Ingeniería prepara el paquete de revisión desde la versión `propuesta` de US-001 (un JSON
por tipo de cáncer, más una tabla legible ítem → campo → condición). El bloque
`validation` y el `catalogHash` los verifica US-001 (AC-8): esta historia solo registra
la decisión. El registro no contiene datos de pacientes ni PII (repositorio público,
RN-14). La revisión de los **criterios de aplicabilidad** es de DEC-11 (US-021, FEAT-08b).

**Preguntas que debe responder el oncólogo** (cada respuesta queda en el catálogo, no en el código):
- **Q1.** ¿Qué estados de revisión cuentan como "Presente y verificado"? Propuesta: `verificado` y `corregido`. ¿Cuenta `auto_aceptado` (OCR de confianza alta sin revisión humana)? ¿Y un dato `manual` registrado por el propio oncólogo?
- **Q2.** Definición operativa de "enfermedad avanzada o recurrente" (mama, condiciona *tratamientos previos*) y de "enfermedad metastásica resistente a castración" (próstata, condiciona *HRR/BRCA*): ¿con qué datos del modelo se evalúan?
- **Q3.** "BRCA germinal (*condicional*, según el escenario)": ¿cuál es la condición?
- **Q4.** Para cada ítem condicional: si no se puede evaluar la condición porque falta el dato del que depende (p. ej., falta HER2 por IHQ, así que no se sabe si hace falta ISH), ¿el ítem queda **Faltante** o **No aplica**?
- **Q5.** ~~Destino de Gleason / grupo ISUP~~ — **resuelta por DEC-05 (US-011):** `Diagnosis.grade`; el TNM queda en `staging_system`/`stage_value`.
- **Q6.** "PSA (serie con fechas)": ¿cuántos valores fechados hacen falta para que cuente como Presente?
- **Q7.** ¿Algún ítem tiene una antigüedad máxima para contar como presente (p. ej., un ECOG de hace dos años)?
- **Q8.** ¿Cómo se registra una ausencia confirmada ("sin tratamientos previos", "BRCA no realizado") para que no aparezca como Faltante? El modelo actual no tiene esa marca (ver US-002).
- **Q9.** Confirmar el destino de "sitios de metástasis por imagen" en `ClinicalAttribute` (`sitios_metastasicos`) y de "estado de castración / testosterona" (`estado_castracion` o el biomarcador testosterona).

## Non-goals
No revisa los criterios de aplicabilidad (DEC-11, FEAT-08b), los mapeos terminológicos
(DEC-17, S5) ni las plantillas (DEC-10).

## INVEST
**Small** ✓ es una revisión y una publicación; el esfuerzo de Ingeniería es preparar el paquete y versionar.
**Testable** ✓ el bloque `validation` se comprueba con `catalog:validate` (US-001 AC-8) y el documento de la decisión contiene revisor, fecha y respuestas.
*(Independent ⚠ depende de la disponibilidad del oncólogo asesor, SUP-4. Si no revisa antes del cierre del S4, la demo sintética sigue con la versión `propuesta` y M-04.3 queda en rojo según la definición del PRD; ver Conflictos de fuentes.)*

---

## US-001 — El catálogo de datos críticos se publica versionado y solo si cada ítem tiene campo de destino

> Linear: [L1D-93](https://linear.app/l1der-lab-mjbc/issue/L1D-93)

`FEAT-04` · Sprint 4 · Estimación **5** · FR-23, RN-29 (dueña), RN-22 · AC-04.4, AC-04.5 · ⛔ DEC-05 (cerrada: AC-7) · ↪ US-041 · 🔗 Relacionada: US-042 (`si-hay-capacidad`; su regla la cubre el AC-4) · 🔗 Regresión [AC-T5.4] → US-074 · 🔗 Consumida por: US-121 (criterios de aplicabilidad), US-129 (reglas de supuestos)

## Story
Como oncólogo, quiero que las reglas del checklist vivan en un catálogo versionado
en el que cada dato crítico apunte a un campo real del modelo, para que el checklist
nunca pida un dato que el sistema no puede guardar y para poder cambiar las reglas
sin desplegar código.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el catálogo de fixture `test-1.0.0` (FX-04-a), en el que
  todos los ítems tienen `destination`, cuando se ejecuta `catalog:validate`, entonces
  termina con código 0 y el artefacto queda publicado con
  `catalogVersion = "test-1.0.0"`. `[AC-04.5]` `[RN-29]`
- **AC-2 (borde · dato crítico sin destino)** · Dada una copia de `test-1.0.0` en la que
  el ítem `ki67` no tiene `destination`, cuando se ejecuta `catalog:validate`, entonces
  termina con código ≠ 0, el mensaje nombra `ki67` y la versión no se publica.
  `[AC-04.5]` `[RN-29]`
- **AC-3 (borde · criterio de aplicabilidad sin destino)** · Dado un catálogo en el que
  un criterio de aplicabilidad (p. ej., `estado_menopausico`) no tiene `destination`,
  cuando se ejecuta `catalog:validate`, entonces termina con código ≠ 0 y nombra el
  criterio. `[AC-04.5]` `[RN-29]`
- **AC-4 (borde · destino inexistente en el modelo)** · Dado un ítem cuyo `destination`
  apunta a `Diagnosis.menopause` (campo que no existe) o a un
  `ClinicalAttribute.attribute_key` que no está declarado en el catálogo, cuando se
  ejecuta `catalog:validate`, entonces termina con código ≠ 0 y nombra el ítem.
  `[RN-29]` `[FR-23]`
- **AC-5 (borde · regla condicional mal formada)** · Dado un ítem condicional cuya
  condición referencia una clave que no existe en el catálogo, o que no declara
  `whenConditionUnknown`, cuando se ejecuta `catalog:validate`, entonces termina con
  código ≠ 0. `(asumido)`
- **AC-6 (borde · catálogo no cargable)** · Dado `CLINICAL_CATALOG_PATH` apuntando a un
  directorio inexistente o a una versión que no pasa la validación, cuando arranca
  `clinical-api`, entonces el proceso no queda listo (`/health` distinto de `200`) y el
  log registra el código de error sin el contenido del catálogo. `(asumido)`
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-6): ¿un catálogo inválido deja fuera de servicio todo `clinical-api` (login, ficha, vista de caso) o solo deshabilita el checklist y el análisis? Hasta decidirlo, se sigue el comportamiento de US-042 AC-5 (el servicio no queda listo).
- **AC-7 (contenido inicial)** · Dada la versión de catálogo del S3, cuando se listan
  sus ítems de datos críticos, entonces las claves son exactamente: mama = {`histologia`,
  `grado`, `tnm`, `re`, `rp`, `her2_ihq`, `her2_ish`, `ki67`, `estado_menopausico`,
  `ecog`, `tratamientos_previos`, `brca_germinal`}; próstata = {`psa_serie`,
  `gleason_isup`, `tnm`, `sitios_metastasicos`, `estado_castracion`,
  `tratamientos_previos`, `ecog`, `hrr_brca`}; con `gleason_isup` →
  `Diagnosis.grade` y `tnm` → `Diagnosis.stage_value`, y cada ítem con `destination` y
  `estado = "propuesta"` hasta DEC-01. `[FR-23]` `[TBD-12]` `[DEC-05]`
  > Pendiente de definir en refinamiento (dueño: Ingeniería + oncólogo · afecta: `destination` de `her2_ihq` y `her2_ish`): la convención del readme guarda el método en el valor (`name = "HER2"`, `value = "3+ (IHQ)"`) y ninguna fuente define cómo distinguir IHQ de ISH en `Biomarker`. Propuesta: `match` por LOINC distinto para cada método (cuando DEC-04 lo permita) o por `Exam.exam_type`. ¿Cuál se adopta?
- **AC-8 (borde · bloque de revisión e integridad)** · Dada una versión con
  `validation.status = "propuesta_revisada"` (DEC-01), cuando se modifica cualquier ítem
  sin crear una versión nueva, entonces `catalog:validate` termina con código ≠ 0 por
  `catalogHash` distinto; y un ítem con `estado` fuera de
  `propuesta | pendiente | revisado` también lo hace fallar. `[AC-04.4]` `[P-03]` (asumido)

## Contexto técnico
`packages/clinical-catalogs/<tipo>/datos-criticos.json`: datos, no código
`[ADR-29]` `[ADR-38]`, montado de solo lectura en ambos backends
(`CLINICAL_CATALOG_PATH`, `CLINICAL_CATALOG_VERSION`; si ambos se configuran, deben
coincidir o el arranque falla). Esta historia **amplía** la primera versión del S1
(US-041) con el esquema de datos críticos y construye el validador del catálogo: el
validador mínimo (US-042) pasó a `si-hay-capacidad` en el slicing v2, así que esta
historia incluye la regla de destinos inexistentes (AC-4, hallazgo M-12 del piloto).

Esquema mínimo de un ítem (el contenido lo revisa DEC-01):
```json
{ "key": "her2_ish", "cancerType": "mama", "label": { "es": "HER2 por ISH", "en": "HER2 ISH" },
  "destination": { "entity": "Biomarker", "match": { "name": "HER2 ISH" } },
  "condition": { "item": "her2_ihq", "valueIn": ["2+"] },
  "whenConditionUnknown": "no_aplica", "minValues": 1, "estado": "propuesta" }
```
- `destination.entity` ∈ {`Diagnosis`, `ClinicalAttribute`, `Biomarker`, `PriorTreatment`}; el campo se valida contra una **allowlist generada del esquema Prisma** (DMMF), no escrita a mano, para que un cambio de modelo rompa la validación `[RN-29]`.
- `estado` ∈ {`propuesta`, `pendiente`, `revisado`} (hallazgo B-08 del piloto).
- Las condiciones son **declarativas** (igualdad, pertenencia o prefijo sobre el valor de otro ítem o campo); el catálogo no lleva código ejecutable `[AC-04.4]` `[PRD §7]` `[RN-22]`.
- Nivel de catálogo: `verifiedReviewStatuses` (propuesta: `["verificado", "corregido"]`; lo decide DEC-01 Q1).
- El mismo validador recorre los criterios de aplicabilidad (contenido de US-121) y las reglas de supuestos (US-129), así esta historia verifica RN-29 de forma exhaustiva.
- `catalog:validate` corre en CI y al arrancar `clinical-api`. Todo PR que cambie el catálogo ejecuta además la suite de evaluación (AC-T5.4, US-074; faltantes en US-131).

## Non-goals
El `409 CATALOG_VERSION_MISMATCH` entre backends ya existe desde el S1 (US-041) y no se
reimplementa. El contenido de los criterios de aplicabilidad es de US-121. La revisión
clínica es de DEC-01.

## INVEST
**Small** ✓ un esquema JSON, un validador y el contenido inicial; sin endpoints nuevos.
**Testable** ✓ los AC-1 a AC-5 y AC-8 son tests del validador sobre fixtures de catálogo; el AC-6 es un test de arranque; el AC-7 compara conjuntos de claves.

---

## US-002 — El checklist calcula de forma determinista el estado de cada dato crítico

> Linear: [L1D-94](https://linear.app/l1der-lab-mjbc/issue/L1D-94)

`FEAT-04` · Sprint 4 · Estimación **5** · HU-18 · FR-23, RN-07, RN-22, RN-27 · AC-04.1, AC-04.4 · ↪ US-001 · 🔗 Medido en: US-131 (M-04.1, M-04.2)

## Story
Como oncólogo, quiero que el sistema clasifique cada dato crítico de mi paciente
como presente y verificado, presente sin verificar, faltante o no aplica, siempre
con la misma regla, para saber qué me falta sin revisar el caso a mano.

## AC (Given/When/Then)
- **AC-1 (happy path · caso completo)** · Dados el catálogo `test-1.0.0` y el paciente
  fixture **F-M1**, cuando `CompletenessService` calcula el checklist, entonces devuelve
  12 ítems: `histologia`, `grado`, `tnm`, `ecog`, `re`, `rp`, `her2_ihq`, `ki67` y
  `estado_menopausico` en `presente_verificado`, y `her2_ish`, `tratamientos_previos` y
  `brca_germinal` en `no_aplica`. `[AC-04.1]` `[FR-23]`
- **AC-2 (borde · estados mixtos)** · Dados `test-1.0.0` y **F-M2**, cuando se calcula el
  checklist, entonces el resultado es exactamente: `presente_verificado` =
  {`histologia`, `tnm`, `ecog`, `her2_ihq`, `tratamientos_previos`};
  `presente_sin_verificar` = {`re`}; `faltante` = {`grado`, `rp`, `her2_ish`, `ki67`,
  `estado_menopausico`, `brca_germinal`}; `no_aplica` = ∅. `[AC-04.1]` `[FR-23]`
- **AC-3 (borde · dato rechazado)** · Dado F-M2, cuyo único registro de receptor de
  progesterona está `rechazado`, cuando se calcula el checklist, entonces `rp` queda en
  `faltante`, no en `presente_*`. `[RN-07]` `[AC-02.6]` `(asumido)`
- **AC-4 (borde · condición no evaluable)** · Dados `test-1.0.0` y **F-M3** (sin TNM ni
  HER2), cuando se calcula el checklist, entonces `her2_ish` y `brca_germinal` quedan en
  `no_aplica` y `tratamientos_previos` en `faltante`, según el `whenConditionUnknown` de
  cada ítem, mientras que `tnm` y `her2_ihq` quedan en `faltante`. `(asumido)`
  > Pendiente de definir en refinamiento (dueño: DEC-01 · afecta: AC-4, M-04.1): el valor de `whenConditionUnknown` de cada ítem condicional real (DEC-01 Q4). El motor solo aplica lo que declara el catálogo.
- **AC-5 (borde · determinismo sin IA)** · Dados F-M2 y `test-1.0.0`, cuando el
  checklist se calcula dos veces seguidas, entonces ambos resultados son idénticos (misma
  serialización JSON y mismo `catalogVersion`), y el cliente de `rag-orchestrator`
  registra **cero** llamadas. `[AC-04.4]` `[FR-23]`
- **AC-6 (borde · regla cambiada sin desplegar)** · Dado F-M2, cuando la misma build de
  `clinical-api` arranca con `CLINICAL_CATALOG_PATH` apuntando a `test-1.1.0` (igual a
  1.0.0, sin el ítem `ki67`), entonces el resultado tiene 11 ítems, `ki67` no aparece,
  hay 5 faltantes y `catalogVersion = "test-1.1.0"`. `[AC-04.4]` `[PRD §7]` `[RN-22]`
- **AC-7 (borde · por tipo de cáncer)** · Dados `test-1.0.0` y **F-P1** (próstata),
  cuando se calcula el checklist, entonces devuelve solo `psa_serie` y `ecog`, ambos en
  `presente_verificado`, y ninguna clave del catálogo de mama. `[FR-23]`
- **AC-8 (borde · biomarcador `no_mapeado`)** · Dado F-M2 con un biomarcador
  `original_name = "Ki67 índice"` en `no_mapeado`, cuando se calcula el checklist,
  entonces `ki67` sigue en `faltante` (nunca se asigna un concepto a un término no
  mapeado). `[RN-27]` `(asumido)`
  > Pendiente de definir en refinamiento (dueño: Ingeniería + oncólogo · afecta: AC-8, M-04.2): un término `no_mapeado` que en realidad corresponde a un ítem crítico genera un falso faltante. ¿Se marca aparte como "posible dato sin mapear" con enlace a la revisión de mapeos (US-109), o basta con que US-131 lo cuente como falso positivo?

## Contexto técnico
Módulo `apps/clinical-api/src/modules/completeness/` (`completeness.service.ts` y
`.repository.ts`), con un motor puro en `completeness.rules.ts`, testeable sin BD
`[ADR-29]`. Corre en Backend 1 porque necesita datos del paciente; `rag-orchestrator` no
interviene `[ADR-29]` `[CLAUDE.md]`.

**Regla de cálculo** (determinista; entrada = datos del paciente + versión del catálogo):
1. Se toman los ítems del catálogo cuyo `cancerType` es el del `Diagnosis` activo (`is_active = true`) `[OL-03]`.
2. Si hay condición: se evalúa sobre los datos; si no se cumple → `no_aplica`; si no se puede evaluar → `whenConditionUnknown`.
3. Se buscan en el campo de destino registros que **no** estén `rechazado` ni `reemplazado` `[RN-07]`. Si hay menos de `minValues` → `faltante`.
4. Si el registro que cuenta (el más reciente por fecha de observación o examen; en empate, el creado más tarde) tiene un `review_status` incluido en `verifiedReviewStatuses` → `presente_verificado`; si no (incluido `requiere_revision`, que cubre "en conflicto") → `presente_sin_verificar`.
5. El orden de salida es el del catálogo. No hay LLM ni aleatoriedad.

> Pendiente de definir en refinamiento (dueño: oncólogo · afecta: regla 4, M-04.2): si un mismo ítem tiene un registro verificado antiguo y uno más reciente sin verificar, ¿cuenta el más reciente (regla 4) o basta con que exista uno verificado?

> Pendiente de definir en refinamiento (dueño: DEC-01 Q8 + Ingeniería · afecta: M-04.2 y posiblemente el esquema de datos): el modelo no tiene marca de "ausencia confirmada" (p. ej., "sin tratamientos previos"); hasta decidirlo, un paciente sin `PriorTreatment` con la condición cumplida queda en `faltante`, lo que puede bajar la especificidad.

**Fixtures sintéticos** (FX-04-a y FX-04-b; todos `data_origin = sintetico`, activos, con episodio abierto, convenio registrado y sin opt-out; los usan US-002 a US-006 y US-131):

*Catálogo `test-1.0.0`* (`verifiedReviewStatuses = ["verificado", "corregido"]`):

| Tipo | Clave | Destino | Condición · `whenConditionUnknown` |
|---|---|---|---|
| mama | `histologia` | `Diagnosis.histology` | — |
| mama | `grado` | `Diagnosis.grade` | — |
| mama | `tnm` | `Diagnosis.stage_value` (`staging_system = TNM_8`) | — |
| mama | `ecog` | `Diagnosis.performance_value` (`performance_scale = ECOG`) | — |
| mama | `re` | `Biomarker` "Receptor de estrógeno" | — |
| mama | `rp` | `Biomarker` "Receptor de progesterona" | — |
| mama | `her2_ihq` | `Biomarker` "HER2" | — |
| mama | `her2_ish` | `Biomarker` "HER2 ISH" | `her2_ihq` empieza por "2+" · `no_aplica` |
| mama | `ki67` | `Biomarker` "Ki-67" | — |
| mama | `estado_menopausico` | `ClinicalAttribute` `estado_menopausico` | — |
| mama | `tratamientos_previos` | `PriorTreatment` | `tnm` empieza por "IV" · `faltante` |
| mama | `brca_germinal` | `Biomarker` "BRCA germinal" | `tnm` empieza por "IV" · `no_aplica` |
| próstata | `psa_serie` | `Biomarker` "PSA", `minValues = 2` | — |
| próstata | `ecog` | `Diagnosis.performance_value` (`ECOG`) | — |

*Catálogo `test-1.1.0`*: idéntico a `test-1.0.0`, sin `ki67`.

*Pacientes*:
- **F-M1 (mama, completo):** `Diagnosis` activo, `verificado`, `entry_method = seed`: histología "carcinoma ductal infiltrante", grado "2", `TNM_8` "IIA", ECOG 1. Biomarcadores `verificado`: RE "Positivo", RP "Positivo", HER2 "3+ (IHQ)", Ki-67 "20%". `ClinicalAttribute` `estado_menopausico` = "posmenopausica", `verificado`. Sin `PriorTreatment`, sin HER2 ISH, sin BRCA.
- **F-M2 (mama, mixto):** `Diagnosis` activo, `verificado`: histología "carcinoma lobulillar infiltrante", grado **null**, `TNM_8` "IV", ECOG 2. Biomarcadores: RE "Positivo" (`ocr`, confianza `media`, `requiere_revision`); RP "Negativo" (`ocr`, **`rechazado`**); HER2 "2+ (IHQ)" (`manual_correction`, `corregido`). Sin Ki-67, sin HER2 ISH, sin BRCA, sin `ClinicalAttribute`. Un `PriorTreatment` (`primera_linea_metastasica`, "letrozol", `manual`, `verificado`). Una `ClinicalNote` con PII sintética generada en tiempo de test (nombre y número de documento) para los tests de no-fuga.
- **F-M3 (mama, condición no evaluable):** igual que F-M1, pero sin TNM (`staging_system` y `stage_value` nulos) y sin ningún biomarcador HER2.
- **F-P1 (próstata):** `Diagnosis` activo próstata, `verificado`, ECOG 0; tres PSA `verificado` con fechas distintas.

Los pacientes semilla de OL-01 no se usan para resultados exactos: OL-01 solo garantiza que (e) no tiene estado menopáusico ni Ki-67 `[OL-01]`.

## Non-goals
Exponer el checklist por API o mostrarlo (US-003, US-004). Medir sensibilidad y
especificidad (US-131). Decidir el contenido real del catálogo (DEC-01).

## INVEST
**Small** ✓ un motor puro más un repositorio de lectura; el 5 refleja la cantidad de bordes (condiciones, exclusiones y versión).
**Testable** ✓ los 8 AC son tests funcionales del servicio con BD de test y FX-04-a/FX-04-b; el AC-5 usa un cliente de `rag-orchestrator` falso con contador.

---

## US-003 — El checklist se expone por API en `/completeness`, en la vista de caso y en la ficha

> Linear: [L1D-95](https://linear.app/l1der-lab-mjbc/issue/L1D-95)

`FEAT-04` · Sprint 4 · Estimación **3** · HU-18 · FR-23, FR-01, FR-18 · AC-04.1, AC-T1.1 · ↪ US-002, US-088 · 🔗 Regresión [FR-18] → US-102 · 🔗 Medido en: US-105 (M-02.4, p95 de la vista de caso con el checklist) · 🔗 Regresión [RN-15] → US-148 (activa desde S6: `/completeness` y `/case` **no** responden `403` por opt-out, FR-16) · 🔗 Regresión [FR-15] → US-204 (Post-MVP)

## Story
Como oncólogo, quiero consultar el checklist de datos críticos de mi paciente,
cada uno con su origen, para saber de dónde sale lo que está presente y adónde
debo cargar lo que falta.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un doctor con sesión válida y el paciente F-M2 con el
  catálogo `test-1.0.0` cargado, cuando llama a `GET /platform/patients/{id}/completeness`,
  entonces recibe `200` con `items` igual al resultado del AC-2 de US-002 y
  `catalogVersion = "test-1.0.0"`. `[AC-04.1]` `[readme §4.1]`
- **AC-2 (vista de caso y ficha)** · Dado F-M2, cuando se llama a
  `GET /platform/patients/{id}/case` y a `GET /platform/patients/{id}`, entonces
  `CaseView.completeness` trae los mismos 12 ítems y estados que el AC-1 con el mismo
  `catalogVersion`, y `PatientSummary.missingCriticalCount = 6`. `[readme §4.1]` `[AC-04.1]`
- **AC-3 (origen de cada ítem)** · Dada la respuesta del AC-1, cuando se inspecciona cada
  ítem, entonces todo ítem `presente_*` trae `origin` (`documento`, `manual` o
  `correccion`) y `provenance` (`entryMethod`, `reviewStatus`, `sourceDocumentId` y
  `page` si viene de un documento) del registro que lo hizo presente; todo ítem
  `faltante` trae `destination` (`entity` y campo), `origin = regla` y
  `provenance = null`; y todo ítem `no_aplica` trae `origin = regla` y la condición del
  catálogo que no se cumplió. `[AC-T1.1]` `[FR-23]`
- **AC-4 (borde · sin sesión)** · Dada una petición sin cookie de sesión, cuando se llama
  a `/completeness`, entonces la respuesta es `401` y `CompletenessService` no se invoca.
  `[FR-01]`
- **AC-5 (borde · paciente inexistente)** · Dado un UUID que no corresponde a ningún
  paciente, cuando se llama a `/completeness`, entonces la respuesta es `404` con la forma
  `{ error, message }`. `[PRD §10]` `[FR-04]`
- **AC-6 (borde · tipo de cáncer no habilitado)** · Dado un paciente sintético con
  `Diagnosis` activo de un tipo que no está en `ENABLED_CANCER_TYPES`, cuando se llama a
  `/completeness`, entonces la respuesta es `200` con `items = []` y
  `cancerTypeEnabled = false`. `(asumido)`
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-6): ¿qué responde `/completeness` para un tipo no habilitado o para un paciente sin `Diagnosis` activo: `200` con lista vacía y bandera, o `422`? El contrato de `/completeness` no está en el OpenAPI de readme §4.1 (solo en la tabla de endpoints).
- **AC-7 (borde · lectura auditada)** · Dado el AC-1, cuando se completa la llamada,
  entonces existe una fila `completeness.read` en `audit_log` con el UUID del paciente y
  sin PHI. `[FR-18]` `(asumido: hallazgo M-18 del piloto)`

## Contexto técnico
`completeness.controller.ts` + `completeness.schema.ts` (Zod en el borde) en el módulo
`completeness`. `CaseTimelineService` (US-088) llama a `CompletenessService` para llenar
`CaseView.completeness`. La ficha obtiene `missingCriticalCount` (número de `faltante`)
del mismo servicio. Las tres salidas usan **una sola** implementación. La auditoría usa
el *middleware* de US-102.

Contrato propuesto de `/completeness` (se agrega al spec OpenAPI de 4.1 y se regenera
`packages/api-contracts`, según la DoD):
```yaml
CompletenessView:
  properties:
    catalogVersion: { type: string }
    cancerTypeEnabled: { type: boolean }
    items:
      type: array
      items:
        properties:
          item: { type: string, example: "her2_ihq" }
          label: { type: string }
          status: { type: string, enum: [presente_verificado, presente_sin_verificar, faltante, no_aplica] }
          origin: { type: string, enum: [documento, manual, correccion, regla] }
          provenance: { $ref: "#/components/schemas/Provenance", nullable: true }
          destination: { type: object, properties: { entity: { type: string }, field: { type: string } } }
          condition: { type: string, nullable: true, description: "regla del catálogo que dejó el ítem en no_aplica" }
```
`Provenance` se amplía con `page` (entero, opcional), tomada de `source_span.page` (ver
Conflictos de fuentes C2). `CaseView.completeness` adopta la misma forma de ítem. Los
logs registran solo el UUID del paciente y el `traceId` `[CLAUDE.md]`. Una consulta por
destino, sin N+1, para no empeorar el p95 de la vista de caso (M-02.4).

## INVEST
**Small** ✓ un endpoint de lectura y dos puntos de integración con un servicio ya hecho.
**Testable** ✓ 7 tests de integración con Supertest sobre FX-04-a/FX-04-b (AC-1 a AC-7).

---

## US-004 — En la vista de caso veo el checklist y desde un faltante puedo cargarlo o registrarlo

> Linear: [L1D-96](https://linear.app/l1der-lab-mjbc/issue/L1D-96)

`FEAT-04` · Sprint 4 · Estimación **3** · HU-18 · FR-23, NFR-12 · AC-04.1, AC-T1.1 · ↪ US-003, US-090, US-079, US-111, US-212 · 🔗 Relacionada: US-094 (registro manual de atributos y tratamientos, `si-hay-capacidad`), US-080 (visor, `si-hay-capacidad`) · 🔗 Consume: US-110 (registro manual de biomarcadores y diagnóstico, FEAT-03b) · 🔗 Regresión [RN-23] → US-068 (textos nuevos de UI) · 🔗 Regresión [RN-17] → US-198 (Post-MVP)

## Story
Como oncólogo, quiero ver en la vista de caso el estado de cada dato crítico y,
desde un dato faltante, ir directo a cargar el documento o registrarlo a mano,
para completar el caso sin buscar dónde se ingresa cada dato.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el oncólogo en la vista de caso de F-M2, cuando se carga
  la sección "Datos críticos", entonces se ven 12 filas, cada una con su etiqueta y uno
  de estos textos: "Presente y verificado", "Presente sin verificar", "Faltante" o "No
  aplica", con 6 filas "Faltante". `[AC-04.1]` `[FR-23]`
- **AC-2 (borde · faltante sin registro manual en el MVP)** · Dado el ítem
  `estado_menopausico` (destino `ClinicalAttribute`) en "Faltante", cuando se muestra la
  fila, entonces ofrece "Cargar documento", que abre la carga de US-079, y no ofrece
  "Registrar a mano". `[AC-04.1]` (asumido: *workaround* del slicing v2)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-2, AC-3): con US-094 en `si-hay-capacidad`, los ítems con destino `ClinicalAttribute` o `PriorTreatment` solo se completan cargando un documento, de modo que AC-04.1 ("cargarlo o registrarlo a mano") queda parcial para ellos; ¿se acepta para el MVP o se adelanta el registro manual de atributos (parte de US-094)?
- **AC-3 (registrar a mano cualquier faltante)** · Dados los ítems `ki67` (destino
  `Biomarker`) y `grado` (destino `Diagnosis`) en "Faltante", cuando el oncólogo elige
  "Registrar a mano", entonces se abre el formulario de US-111 prellenado con ese ítem
  (`?item=ki67`, `?item=grado`), y al guardar la fila deja de mostrar "Faltante"; todo
  ítem "Faltante" con destino `Biomarker` o `Diagnosis` ofrece "Cargar documento" y
  "Registrar a mano". `[AC-04.1]` `[Q-03]` `[§15 resp. 4]`
- **AC-4 (origen visible)** · Dado un ítem `presente_*` cuyo dato viene de un documento,
  cuando se muestra la fila, entonces indica el documento y la página de origen con un
  enlace que descarga el PDF por US-212; si el origen es manual o una corrección,
  muestra "Registro manual" o "Corrección" sin enlace. `[AC-T1.1]` `[FR-07]` (↪ US-212;
  el visor es de US-080, `si-hay-capacidad`)
- **AC-5 (borde · checklist no disponible)** · Dado que
  `GET /platform/patients/{id}/completeness` responde `5xx`, cuando se abre la vista de
  caso, entonces la sección muestra "No se pudo calcular el checklist" y el timeline, los
  tratamientos previos y las series se muestran igual. `(asumido)`
- **AC-6 (borde · accesibilidad)** · Dada la sección "Datos críticos", cuando se navega
  solo con teclado, entonces se llega a las acciones de cada fila, y cada estado se
  distingue por su texto, no solo por el color. `[NFR-12]`

## Contexto técnico
`apps/web`: un organismo `CriticalDataChecklist` en la vista de caso (US-090),
alimentado por `CaseView.completeness`. El navegador solo habla con `web`, mediante un
Route Handler hacia `clinical-api` `[CLAUDE.md]`. "Registrar a mano" abre el formulario
según `destination.entity`: `Biomarker` y `Diagnosis` → formularios de US-111;
`ClinicalAttribute` y `PriorTreatment` → solo "Cargar documento" mientras US-094 no exista
(`si-hay-capacidad`; si se construye, sus formularios se enlazan aquí). "Cargar documento" reutiliza
la carga de US-079. Los textos de estado son literales de UI en español. Tests: E2E con
Playwright contra Compose en perfil de test, con FX-04-b sembrado y `test-1.0.0` montado
en ambos backends (ver Fixtures).

## Non-goals
Revisar o verificar datos `presente_sin_verificar` desde el checklist (US-107, US-108).
Mostrar faltantes en la ficha más allá del contador (`PatientSummary.missingCriticalCount`,
readme §4.1).

## INVEST
**Small** ✓ un componente con 2 acciones que reutiliza formularios y carga ya existentes.
**Testable** ✓ los 6 AC son tests E2E con Playwright contra Compose con F-M2 (el AC-5, con `clinical-api` simulado).

---

## US-005 — Antes de analizar, el panel lista los faltantes y me deja cargar información o continuar con aviso

> Linear: [L1D-97](https://linear.app/l1der-lab-mjbc/issue/L1D-97)

`FEAT-04` · Sprint 4 · Estimación **3** · HU-18 · FR-23, RN-26, NFR-12 · AC-04.2 · ↪ US-003, US-061 · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-23] → US-068 · 🔗 Produce para: US-137 (VM-5: "aviso de faltantes correcto / útil", S5)

## Story
Como oncólogo, quiero que, antes de analizar la evidencia, el sistema me diga qué
datos críticos faltan y me deje cargarlos o continuar, para decidir yo si analizo
ya o completo antes el caso, sin que nada me bloquee.

## AC (Given/When/Then)
- **AC-1 (happy path · aviso)** · Dado el oncólogo en el panel de análisis de F-M2,
  cuando pulsa "Analizar evidencia", entonces, antes de enviar ninguna petición de
  análisis, se muestra un aviso que lista los 6 faltantes por su etiqueta, con los botones
  "Cargar información" y "Continuar con aviso". `[AC-04.2]` `[FR-23]`
- **AC-2 (continuar con aviso)** · Dado el aviso del AC-1, cuando el oncólogo elige
  "Continuar con aviso", entonces `web` envía exactamente un
  `POST /api/evidence-analyses` con `continueWithWarning = true`. `[AC-04.2]` `[readme §4.1]` `[RN-26]`
- **AC-3 (cargar información)** · Dado el aviso del AC-1, cuando el oncólogo elige
  "Cargar información", entonces se abre la sección "Datos críticos" de la vista de caso
  del mismo paciente y no se envía ninguna petición de análisis. `[AC-04.2]` `[FR-23]`
- **AC-4 (borde · sin faltantes)** · Dado F-M1 (sin faltantes), cuando el oncólogo pulsa
  "Analizar evidencia", entonces no aparece el aviso y se envía un
  `POST /api/evidence-analyses` con `continueWithWarning = false`. `[FR-23]`
- **AC-5 (borde · checklist caído)** · Dado que `GET /platform/patients/{id}/completeness`
  responde `5xx`, cuando el oncólogo pulsa "Analizar evidencia", entonces se muestra "No
  se pudieron verificar los datos críticos" con "Continuar con aviso" y "Cancelar"; al
  continuar, se envía el análisis con `continueWithWarning = true`. El servidor sigue
  calculando y enviando los faltantes (US-006). `[RN-26]` `[PP-5]` `(asumido: hallazgo M-07 del piloto)`
- **AC-6 (borde · accesibilidad)** · Dado el aviso del AC-1, cuando aparece, entonces
  recibe el foco, se anuncia en una región `aria-live` y sus dos botones son operables
  con teclado. `[NFR-12]`

## Contexto técnico
Panel de análisis de OL-04 (`apps/web`). La lista del aviso sale de `GET …/completeness`
(vía Route Handler) y es solo informativa: la lista que viaja al análisis la recalcula
`clinical-api` en el servidor (US-006). El aviso aparece **antes de cada análisis**
(FR-23), también si el oncólogo ya continuó en uno anterior. Solo lista los `faltante`,
no los `presente_sin_verificar`. Los `no_aplica` nunca aparecen. Textos sin formulaciones
prescriptivas (regresión de RN-23). Tests: Playwright contra Compose en perfil de test
(FX-04-b y `test-1.0.0` en ambos backends); el número de requests se verifica
interceptando `/api/evidence-analyses`.

## Non-goals
Plantillas de preguntas (CAP-05). Avisos `datos_faltantes` en las tarjetas (US-136, S4)
y `patientDataWarning` en la aplicabilidad (US-124). Calificar si el aviso fue correcto o
útil (VM-5, US-137, S4).

## INVEST
**Small** ✓ un diálogo y un flag en un request que ya existe.
**Testable** ✓ los 6 AC son tests E2E con Playwright.

---

## US-006 — Los faltantes viajan al análisis como "desconocido" y quedan persistidos con el análisis

> Linear: [L1D-98](https://linear.app/l1der-lab-mjbc/issue/L1D-98)

`FEAT-04` · Sprint 4 · Estimación **3** · HU-18 · FR-23, FR-09, FR-27 (b, produce), RN-11, RN-26 · AC-04.2, AC-04.3, AC-T1.4, AC-T4.3 · ↪ US-002, US-052, US-053 · 🔗 Produce: US-128 (inciso b), US-116 (Backend 2), US-124 (aplicabilidad), US-177 (re-ejecución recalcula los faltantes, S6 si hay capacidad) · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-15] → US-148 (activa desde S6) · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗 Regresión [FR-15] → US-204 (Post-MVP)

## Story
Como oncólogo, quiero que el análisis de evidencia reciba los datos críticos que
faltan como "desconocido" y que quede registrado si continué con aviso, para que el
análisis no suponga datos que no existen y para que se pueda revisar después con
qué información se hizo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado F-M2 con `test-1.0.0` y `rag-orchestrator` simulado,
  cuando el oncólogo envía `POST /platform/evidence-analyses` con
  `continueWithWarning = true`, entonces la petición interna capturada lleva
  `clinicalContext.missingCriticalData = ["grado", "rp", "her2_ish", "ki67",
  "estado_menopausico", "brca_germinal"]` (en el orden del catálogo) y
  `catalogVersion = "test-1.0.0"`. `[AC-04.3]` `[readme §4.2]` `[ADR-38]`
- **AC-2 (persistencia)** · Dado el análisis del AC-1, cuando se lee su
  `AIAnalysisRecord`, entonces `missing_critical_data` tiene las mismas 6 claves,
  `continued_with_warning = true` y `catalog_version = "test-1.0.0"`.
  `[AC-T1.4]` `[FR-27]` `[readme §3.1]`
- **AC-3 (borde · no bloquea)** · Dado F-M2, cuando se envía el análisis **sin**
  `continueWithWarning`, entonces la respuesta es `200`, el `AIAnalysisRecord` tiene
  `continued_with_warning = false` y `missing_critical_data` con las mismas 6 claves, y la
  petición interna lleva la misma `missingCriticalData`. `[RN-26]` `[AC-04.2]` `[FR-09]` `[readme §4.1]`
- **AC-4 (borde · cálculo en el servidor)** · Dado F-M2, si entre el
  `GET …/completeness` del panel y el `POST` se registra `estado_menopausico`, cuando se
  procesa el `POST`, entonces `missingCriticalData` tiene 5 claves y no incluye
  `estado_menopausico`. `[readme §2.1]` `[AC-04.4]`
- **AC-5 (borde · sin evidencia)** · Dado F-M2 y `rag-orchestrator` simulado que responde
  `status = "sin_evidencia"`, cuando se completa el análisis, entonces el
  `AIAnalysisRecord` persiste las 6 claves en `missing_critical_data`. `[FR-27]` `[RN-02]`
- **AC-6 (borde · desidentificación)** · Dado F-M2, que tiene PII sintética sembrada en
  una nota clínica, cuando se captura la petición interna, entonces cada elemento de
  `missingCriticalData` es una clave del catálogo `test-1.0.0` (`^[a-z0-9_]+$`), y ni el
  nombre ni el documento sembrados aparecen en ese campo ni en el resto del payload.
  `[RN-11]` `[AC-T4.3]`
- **AC-7 (borde · Backend 2 caído)** · Dado F-M2 y `rag-orchestrator` simulado que no
  responde dentro del *deadline*, cuando se envía el análisis, entonces la respuesta es
  `504` y no existe ningún `AIAnalysisRecord` nuevo para ese paciente (ni con
  `missing_critical_data`). `[OL-03]` `[RN-06]`
- **AC-8 (borde · checklist caído en el servidor)** · Dado `CompletenessService` lanzando
  un error durante el análisis, cuando se envía el `POST`, entonces la respuesta es `500`
  con `{ error, message }`, el cliente de `rag-orchestrator` registra cero llamadas y no
  se persiste ningún registro. `(asumido: hallazgo M-08 del piloto)`
  > Pendiente de definir en refinamiento (dueño: usuario + Ingeniería · afecta: AC-8): si el checklist falla en el servidor, ¿se responde con error (reproducibilidad, AC-T1.4) o se analiza sin faltantes declarando "checklist no disponible" en la Base (RN-26, no bloquear)? Hasta decidirlo, se implementa el error.

## Contexto técnico
Módulo único `evidence-analysis` de `clinical-api` `[OL-03]`: el servicio llama a
`CompletenessService` (US-002) con la versión de catálogo cargada al construir el
`ClinicalContext` (4.2). Los faltantes son **claves del catálogo**, nunca texto libre ni
etiquetas del paciente. Viajan siempre, con o sin `continueWithWarning`, porque el
contexto de FR-09 los incluye en todo análisis. `continueWithWarning` solo registra la
elección del oncólogo `[readme §4.1]`. La misma lista y el flag se entregan a
`AnalysisBasisBuilder`, que llena `analysisBasis.missingCriticalData` y
`continuedWithWarning` (inciso b, dueña US-128). Todo se persiste en la misma
transacción que el resto del `AIAnalysisRecord` y antes de responder `[RN-06]`. Si el
tipo de cáncer no está habilitado, el gateway responde `tipo_no_habilitado` sin llamar a
Backend 2 (US-043, comportamiento del S1). Tests: Vitest + Supertest con
`rag-orchestrator` simulado que captura el payload.

## Non-goals
El uso de los faltantes en el prompt y en la recuperación de Backend 2 es de US-116.
"Desconocido: falta en el paciente" en la aplicabilidad es de US-124. Supuestos anclados a
faltantes, inciso (c), son de US-129. El aviso `datos_faltantes` en las tarjetas es de
US-136. La marca "Evidencia o catálogo más reciente" que usa `catalog_version` es de
FR-12 (FEAT-11a).

## INVEST
**Small** ✓ un llamado a un servicio ya existente dentro del gateway y tres columnas que ya existen desde OL-01.
**Testable** ✓ 8 tests de integración con Vitest + Supertest y `rag-orchestrator` simulado que captura el payload.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C1 (nota) | PRD §5 FR-23 "**CA:** HU-18; AC-04.1 a AC-04.4" | PRD §18.3.4 define además **AC-04.5** (ítem sin destino → no se publica, R-02, RN-29) | No es un conflicto sino una omisión en la línea de CA (FR-23 sí incluye la regla en su comportamiento); US-001 cubre AC-04.5 |
| C2 | readme §4.1 `CaseView.completeness`: ítems solo con `{ item, status }`; `Provenance` sin página | PRD §18.4 AC-T1.1 (todo dato mostrado, **incluido el checklist**, indica su origen: documento y página, manual, corrección o **regla**) y FR-23 (acceso directo para cargar o registrar, lo que exige conocer el destino) | PRD: se amplía el ítem con `label`, `origin`, `provenance`, `destination` y `condition`, y `Provenance` con `page` (cambio compatible). US-003 |
| C3 | readme §5.1 HU-15 (S2): `CaseView` ya incluye `completeness` y `GET …/case` figura como "2 / 3" | PRD §5 FR-23 y §10: el checklist es del Sprint 3 | PRD: el campo existe en el contrato desde el S2 (vacío, US-088) y se llena en el S3 (US-003) |
| C5 / C-11 | readme §3.2 y CLAUDE.md: en próstata `staging_system`/`stage_value` cubren el grupo ISUP | PRD FR-23 / §18.3.4: TNM **y** Gleason/ISUP en próstata (RN-29 exige destino para ambos) | DEC-05 (US-011, Pre-S1): TNM en `staging_system`/`stage_value`, Gleason/ISUP en `Diagnosis.grade` (US-001 AC-7); el texto del readme §3.2 queda por corregir |
| P-03 | PRD §18.3.4 M-04.3 y §14 G-Piloto: catálogo de datos críticos **firmado** por el oncólogo antes del cierre del S3 | Decisión P-03: sin firma formal; catálogo `propuesta` revisado y validación medida con el feedback agregado de VM-5 | P-03 (DEC-01): M-04.3 se reporta como "revisado, sin firma formal"; se registra para enmendar el PRD |
| M-16 | PRD RN-20: un tipo de cáncer se habilita solo con el catálogo revisado | Mama y próstata habilitados desde el S1 con catálogo `propuesta` (US-043) | DEC-19 (US-031) · escenario más probable: RN-20 se aplica como prerrequisito de G-Piloto; la demo sintética S1–S4 funciona con la versión `propuesta` |
| P-02 | PRD FR-15: `403` sin pertenencia al equipo tratante (S5) en `/completeness` y en el análisis | Decisión P-02: autorización por paciente fuera del MVP | P-02: regresión hacia US-204 (Post-MVP) |
| — | readme §5.0 / PRD §14: egreso en el S4 (`422` por egresado) | Slicing adoptado: ciclo de vida Post-MVP | Regresión hacia US-198 (Post-MVP) |
| Slicing v2 | PRD §14 S3 y readme §5.0 S3: faltantes en el S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): faltantes en el S4, junto con el registro manual (US-110, US-111) | Se siguió el slicing v2 |

*(El antiguo C4 —ejemplo de readme §4.2 con `missingCriticalData` del paciente semilla— se retiró: el ejemplo encaja con el paciente semilla (e) de OL-01 y no es un conflicto; hallazgo B-02 del piloto.)*

## Dependencias externas

Historias de otras Features que FEAT-04 cita (todas creadas; los IDs provisionales quedaron reconciliados en el lote 4, ver la nota histórica de `README.md`):

| Historia | Feature / T dueña | Qué se espera de ella | La referencia |
|---|---|---|---|
| US-136 (lote 3) | FEAT-10b (S4) | Aviso `datos_faltantes` en las tarjetas de opción | US-005, US-006 |
| US-137 (lote 3) | FEAT-T5c (S4) | `AnalysisFeedback.missing_data_warning_correct` y `missing_data_warning_useful` (VM-5): la validación del catálogo según P-03 | US-005, DEC-01 |
| US-177 (lote 4) | FEAT-11a (S6 si hay capacidad) | La re-ejecución recalcula `missing_critical_data` con el estado actual del paciente | US-006 |
| US-148 (lote 3) | FEAT-T4c (S5) | `403` por opt-out en toda generación con IA, y `/completeness` y `/case` **sin** `403` (FR-16) | US-003, US-006 |
| US-198 (lote 4) | FEAT-T4b (Post-MVP) | `422` por paciente egresado en todo registro, incluidos el análisis y el registro manual | US-004, US-006 |
| US-204 (lote 4) | FEAT-T4e (Post-MVP) | `403` sin pertenencia al equipo tratante | US-003, US-006 |

**Reconciliación:** las equivalencias entre IDs provisionales y definitivos se registran solo en la nota histórica de `README.md`.

## Hallazgos de la auditoría del piloto (`backlog/04-auditoria.md`) atendidos en el lote 2

| Hallazgo | Tratamiento |
|---|---|
| M-01 | Q-03: registro manual en FEAT-03b (US-110, US-111); US-004 AC-3 ofrece "Registrar a mano" en todo faltante |
| M-02 | DEC-05 (Pre-S1) resuelve el destino de Gleason/ISUP; registrado como C5 |
| M-03 | US-003 AC-3: `page` en `Provenance` y `origin = regla` para `faltante` y `no_aplica`; C2 ampliado |
| M-04 | US-001 AC-8 verifica el bloque `validation`, el `catalogHash` y el enum de `estado`; DEC-01 solo registra la decisión |
| M-05 | P-03 elimina la firma formal; DEC-01 AC-2 exige un registro con revisor y fecha |
| M-06 | Sección Fixtures: perfil de test de Compose con FX-04-b y el mismo catálogo en ambos backends |
| M-07 | US-005 AC-5: aviso "No se pudieron verificar los datos críticos" con opción de continuar |
| M-08 | US-006 AC-8 con nota pendiente |
| M-09 | Notas pendientes de US-002 reescritas con `afecta`; AC-8 asumido para `no_mapeado` |
| M-10 | US-001 AC-7 enumera las claves por tipo de cáncer |
| M-11 | Nota pendiente en US-001 AC-7 sobre IHQ/ISH |
| M-12 | Resuelto en el lote 1: validador mínimo en el S1 (US-042) |
| M-13 | US-131 en el S3 |
| M-14 | `🔗 Produce` hacia US-177 en US-006 |
| M-15 | Nota pendiente en US-001 AC-6 |
| M-16 | Registrado en Conflictos de fuentes (DEC-19, escenario) |
| M-17 | `🔗 Medido en: US-105 (M-02.4)` en US-003 |
| M-18 | US-003 AC-7 (lectura auditada, asumido) con la auditoría de US-102 |
| B-02, B-03, B-04, B-05, B-06, B-08, B-09, B-10, B-11, B-13, B-14 | Aplicados en el texto (C4 retirado, clave de ejemplo, citas, dependencias, enum `estado`, literales de origen, accesibilidad del aviso, PII generada en test, regresión de RN-17, AC-2 de US-005 con un solo comportamiento) |
