# FEAT-04 — Información faltante: checklist determinista de datos críticos

**Talla:** L · **Sprint:** 3 · **Capacidad:** CAP-04 · T-1 (AC-T1.1 en el checklist, AC-T1.4 en faltantes) · T-2 (produce el inciso b)
**Requisitos:** FR-23 (dueña, vía HU-18); FR-09 (contexto con faltantes), FR-27 inciso (b) (produce el dato); RN-29 (dueña), RN-26, RN-11, RN-07, RN-22
**Evidencia:** [→ PRD §5 FR-23], [→ PRD §18 AC-04.1…AC-04.5], [→ PRD §18 M-04.1, M-04.2, M-04.3], [→ PRD §6 RN-26], [→ PRD §6 RN-29], [→ PRD §6 RN-11], [→ PRD §16 TBD-12], [→ PRD §17 FR-23 → HU-18], [→ PRD §2 G-12], [→ PRD §18 AC-T1.1, AC-T1.4, AC-T4.3], [→ readme §5.6 HU-18], [→ readme §4.1 `CaseView.completeness`, `continueWithWarning`, `missingCriticalCount`], [→ readme §4.2 `ClinicalContext.missingCriticalData`], [→ readme §3.1 `AIAnalysisRecord.missing_critical_data`], [→ readme §3.3 #29], [→ readme §3.3 #38], [→ readme §6 OL-01 (paciente e)], [→ readme §6 OL-03], [→ docs/AS-IS.md P4, JTBD 2], [→ CLAUDE.md]
**Dependencias:** ⛔ TBD-12 → DEC-01 (solo para el catálogo firmado, M-04.3) · ↪ US-CAT-01 (primera versión de `packages/clinical-catalogs`, S1) · ↪ US-OL03-01 (gateway, S1) · ↪ US-OL04-01 (panel, S1) · ↪ US-HU15-01 (vista de caso, S2) · 🔗 Produce para: US-T2-01 (inciso b), US-CAP08-01 (Desconocido: falta en el paciente), US-CAP06-01 (faltantes como "desconocido" en Backend 2) · 🔗 Medido en: US-T5-01 (M-04.1, M-04.2)
**Valor:** hoy el oncólogo descubre el faltante *después* de analizar: caso incompleto → análisis → descubre el faltante → vuelve atrás → pide el examen → espera → reanaliza. Es "el loop más costoso" del Discovery (AS-IS, P4: "¿Qué me falta para poder analizar bien este caso?", JTBD 2). Con esta Feature, el oncólogo ve qué datos críticos faltan antes de preguntar, puede cargarlos desde el mismo checklist o continuar con un aviso, y el análisis declara lo que no sabía. El sistema nunca le impide continuar (PP-6).
**Stories:** DEC-01, US-001 … US-006 (24 puntos)

> **Talla L, no XL:** son 6 historias técnicas más 1 de decisión, todas en `clinical-api` + `web` + `packages/clinical-catalogs`. `rag-orchestrator` no cambia: el campo `ClinicalContext.missingCriticalData` ya existe en el contrato del S1, y su uso en el prompt es de CAP-06 (US-CAP06-01).

---

## DEC-01 — Catálogo de datos críticos de mama y próstata validado y firmado por el oncólogo

`FEAT-04` · Sprint 3 (antes del cierre) · Estimación **2** · Dueño: **oncólogo asesor** (prepara Ingeniería) · TBD-12 · M-04.3 · RN-20, RN-29 · ↪ US-001

## Story
Como oncólogo asesor, quiero revisar y firmar la versión del catálogo de datos
críticos de mama y de próstata (ítems, reglas condicionales y campo de destino de
cada ítem), para que el checklist marque como faltante solo lo que de verdad hace
falta para analizar un caso.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paquete de revisión de la versión `propuesta`
  de US-001 (ítems por tipo de cáncer, reglas condicionales, matriz ítem → campo
  y las respuestas a las preguntas Q1–Q9 de abajo), cuando el oncólogo asesor lo
  aprueba, entonces la versión publicada en `packages/clinical-catalogs` lleva un
  bloque `validation` con `status = "firmado"`, `role = "oncologo_asesor"`, la
  fecha y un `catalogHash` igual al hash de su contenido, y `catalog:validate` la
  acepta. `[M-04.3]` `[TBD-12]` `[RN-20]`
- **AC-2 (matriz ítem → campo firmada)** · Dada la versión firmada del AC-1,
  cuando se ejecuta `catalog:validate`, entonces todo ítem de mama y de próstata
  tiene `destination` y `validation.scope` incluye `"datos_criticos"` y
  `"matriz_item_campo"`, como exige G-Piloto. `[PRD §14]` `[RN-29]` `[TBD-12]`
- **AC-3 (borde · pregunta sin responder)** · Dado un ítem que conserva
  `estado = "pendiente"`, cuando se intenta publicar la versión con
  `validation.status = "firmado"`, entonces `catalog:validate` termina con código
  ≠ 0 y nombra la clave del ítem pendiente. `(asumido)`
- **AC-4 (borde · cambio posterior a la firma)** · Dada una versión firmada,
  cuando se modifica cualquier ítem o regla sin crear una versión nueva, entonces
  `catalog:validate` termina con código ≠ 0 por `catalogHash` distinto.
  `[AC-04.4]` `(asumido)`

## Contexto técnico
Ingeniería prepara el paquete de revisión desde la versión `propuesta` de US-001
(un JSON por tipo de cáncer, más una tabla legible ítem → campo → condición). La
firma vive en el propio artefacto (bloque `validation`), sin datos de pacientes y
sin PII (repositorio público, RN-14). El hash cubre todo el contenido de los datos
críticos de esa versión. Un ítem que el oncólogo rechace simplemente no entra en
la versión firmada. La firma de los **criterios de aplicabilidad** (TBD-13, antes
del S4) no forma parte de esta decisión: es de CAP-08.

**Preguntas que debe responder el oncólogo** (cada respuesta queda en el catálogo, no en el código):
- **Q1.** ¿Qué estados de revisión cuentan como "Presente y verificado"? Propuesta: `verificado` y `corregido`. ¿Cuenta `auto_aceptado` (OCR de confianza alta sin revisión humana)? ¿Y un dato `manual` registrado por el propio oncólogo?
- **Q2.** Definición operativa de "enfermedad avanzada o recurrente" (mama, condiciona *tratamientos previos*) y de "enfermedad metastásica resistente a castración" (próstata, condiciona *HRR/BRCA*): ¿con qué datos del modelo se evalúan?
- **Q3.** "BRCA germinal (*condicional*, según el escenario)": ¿cuál es la condición?
- **Q4.** Para cada ítem condicional: si no se puede evaluar la condición porque falta el dato del que depende (p. ej., falta HER2 por IHQ, así que no se sabe si hace falta ISH), ¿el ítem queda **Faltante** o **No aplica**?
- **Q5.** Destino de Gleason / grupo ISUP: `Diagnosis` tiene un solo `staging_system`/`stage_value`, que en próstata ocupa el TNM. ¿Va a `Diagnosis.grade`? (con Ingeniería)
- **Q6.** "PSA (serie con fechas)": ¿cuántos valores fechados hacen falta para que cuente como Presente?
- **Q7.** ¿Algún ítem tiene una antigüedad máxima para contar como presente (p. ej., un ECOG de hace dos años)?
- **Q8.** ¿Cómo se registra una ausencia confirmada ("sin tratamientos previos", "BRCA no realizado") para que no aparezca como Faltante? El modelo actual no tiene esa marca (ver US-002).
- **Q9.** Confirmar el destino de "sitios de metástasis por imagen" en `ClinicalAttribute` (`sitios_metastasicos`) y de "estado de castración / testosterona" (`estado_castracion` o el biomarcador testosterona).

## Non-goals
No firma los criterios de aplicabilidad (TBD-13, CAP-08, S4), los mapeos
terminológicos (CAP-03) ni las plantillas (CAP-05). Todos se firman antes de
G-Piloto (PRD §14), pero en sus propias Features.

## INVEST
**Small** ✓ es una sesión de revisión y una publicación; el esfuerzo de Ingeniería es preparar el paquete y versionar.
**Testable** ✓ los 4 AC se comprueban con `catalog:validate` en CI sobre la versión publicada.
*(Independent ⚠ depende de la disponibilidad del oncólogo asesor, SUP-4. Si no firma antes del cierre del S3, M-04.3 queda en rojo y G-Piloto no se puede cumplir. La demo sintética sigue funcionando con la versión `propuesta`.)*

---

## US-001 — El catálogo de datos críticos se publica versionado y solo si cada ítem tiene campo de destino

`FEAT-04` · Sprint 3 · Estimación **5** · FR-23, RN-29, RN-22 · AC-04.4, AC-04.5 · ↪ US-CAT-01 · 🔗 AC-T5.4 → US-T5-02 · Dueña de **RN-29**

## Story
Como oncólogo, quiero que las reglas del checklist vivan en un catálogo versionado
en el que cada dato crítico apunte a un campo real del modelo, para que el checklist
nunca pida un dato que el sistema no puede guardar y para poder cambiar las reglas
sin desplegar código.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el catálogo de fixture `test-1.0.0` (ver US-002),
  en el que todos los ítems tienen `destination`, cuando se ejecuta
  `catalog:validate`, entonces termina con código 0 y el artefacto queda publicado
  con `catalogVersion = "test-1.0.0"`. `[AC-04.5]` `[RN-29]`
- **AC-2 (borde · dato crítico sin destino)** · Dada una copia de `test-1.0.0` en
  la que el ítem `ki67` no tiene `destination`, cuando se ejecuta
  `catalog:validate`, entonces termina con código ≠ 0, el mensaje nombra `ki67` y la
  versión no se publica. `[AC-04.5]` `[RN-29]`
- **AC-3 (borde · criterio de aplicabilidad sin destino)** · Dado un catálogo en el
  que un criterio de aplicabilidad (p. ej., `estado_menopausico`) no tiene
  `destination`, cuando se ejecuta `catalog:validate`, entonces termina con
  código ≠ 0 y nombra el criterio. `[AC-04.5]` `[RN-29]`
- **AC-4 (borde · destino inexistente en el modelo)** · Dado un ítem cuyo
  `destination` apunta a `Diagnosis.menopause` (campo que no existe) o a un
  `ClinicalAttribute.attribute_key` que no está declarado en el catálogo, cuando se
  ejecuta `catalog:validate`, entonces termina con código ≠ 0 y nombra el ítem.
  `[RN-29]` `[FR-23]`
- **AC-5 (borde · regla condicional mal formada)** · Dado un ítem condicional
  cuya condición referencia una clave que no existe en el catálogo, o que no declara
  `whenConditionUnknown`, cuando se ejecuta `catalog:validate`, entonces termina con
  código ≠ 0. `(asumido)`
- **AC-6 (borde · catálogo no cargable)** · Dado `CLINICAL_CATALOG_PATH` apuntando
  a un directorio inexistente o a una versión que no pasa la validación, cuando
  arranca `clinical-api`, entonces el proceso no queda listo (`/health` distinto de
  `200`) y el log registra el código de error sin el contenido del catálogo.
  `(asumido)`
- **AC-7 (contenido inicial)** · Dada la versión de catálogo del S3, cuando se
  listan sus ítems de datos críticos, entonces las claves de mama y de próstata son
  exactamente las de la lista inicial de FR-23 / PRD §18.3.4, cada una con
  `destination` y `estado = "propuesta"` hasta DEC-01. `[FR-23]` `[TBD-12]`
  > Pendiente de definir en refinamiento (dueño: TBD-12 → DEC-01 · bloquea: AC-7 solo para el ítem `isup`): ¿Gleason / grupo ISUP va a `Diagnosis.grade`, dado que `staging_system`/`stage_value` ya guardan el TNM? (DEC-01 Q5)

## Contexto técnico
`packages/clinical-catalogs/<tipo>/datos-criticos.json`: datos, no código
`[ADR-29]` `[ADR-38]`, montado de solo lectura en ambos backends
(`CLINICAL_CATALOG_PATH`, `CLINICAL_CATALOG_VERSION`). Esta historia **amplía** la
primera versión del S1 (US-CAT-01) con el esquema de datos críticos y el validador.

Esquema mínimo de un ítem (propuesto aquí; el contenido lo firma DEC-01):
```json
{ "key": "her2_ish", "cancerType": "mama", "label": { "es": "HER2 por ISH", "en": "HER2 ISH" },
  "destination": { "entity": "Biomarker", "match": { "name": "HER2 ISH" } },
  "condition": { "item": "her2_ihq", "valueIn": ["2+"] },
  "whenConditionUnknown": "no_aplica", "minValues": 1, "estado": "propuesta" }
```
- `destination.entity` ∈ {`Diagnosis`, `ClinicalAttribute`, `Biomarker`, `PriorTreatment`}; el campo se valida contra una **allowlist generada del esquema Prisma** (DMMF), no escrita a mano, para que un cambio de modelo rompa la validación `[RN-29]`. `ClinicalAttribute` se identifica por `attribute_key` y `Biomarker`, por término canónico (`name`) o LOINC del mismo catálogo.
- Las condiciones son **declarativas** (igualdad, pertenencia o prefijo sobre el valor de otro ítem o campo); el catálogo no lleva código ejecutable. Así se cumple que cambiar las reglas no requiere desplegar código `[AC-04.4]` `[PRD §7]` `[RN-22]`.
- Nivel de catálogo: `verifiedReviewStatuses` (propuesta: `["verificado", "corregido"]`; lo decide DEC-01 Q1).
- El mismo validador recorre los criterios de aplicabilidad (cuyo contenido es de CAP-08), así esta historia verifica RN-29 de forma exhaustiva.
- `catalog:validate` corre en CI y al arrancar `clinical-api`. Todo PR que cambie el catálogo ejecuta además la suite de evaluación (AC-T5.4, US-T5-02).

## Non-goals
El `409 CATALOG_VERSION_MISMATCH` entre backends ya existe desde el S1 (US-CAT-01,
OL-02) y no se reimplementa. El contenido de los criterios de aplicabilidad es de
CAP-08 (TBD-13). La firma es de DEC-01.

## INVEST
**Small** ✓ un esquema JSON, un validador y el contenido inicial; sin endpoints nuevos.
**Testable** ✓ los AC-1 a AC-5 son tests del validador sobre fixtures de catálogo; el AC-6 es un test de arranque; el AC-7 compara conjuntos de claves.

---

## US-002 — El checklist calcula de forma determinista el estado de cada dato crítico

`FEAT-04` · Sprint 3 · Estimación **5** · FR-23, RN-07, RN-22 · AC-04.1, AC-04.4 · ↪ US-001 · 🔗 Medido en: US-T5-01 (M-04.1, M-04.2)

## Story
Como oncólogo, quiero que el sistema clasifique cada dato crítico de mi paciente
como presente y verificado, presente sin verificar, faltante o no aplica, siempre
con la misma regla, para saber qué me falta sin revisar el caso a mano.

## AC (Given/When/Then)
- **AC-1 (happy path · caso completo)** · Dados el catálogo `test-1.0.0` y el
  paciente fixture **F-M1**, cuando `CompletenessService` calcula el checklist,
  entonces devuelve 12 ítems: `histologia`, `grado`, `tnm`, `ecog`, `re`, `rp`,
  `her2_ihq`, `ki67` y `estado_menopausico` en `presente_verificado`, y `her2_ish`,
  `tratamientos_previos` y `brca_germinal` en `no_aplica`. `[AC-04.1]` `[FR-23]`
- **AC-2 (borde · estados mixtos)** · Dados `test-1.0.0` y **F-M2**, cuando se
  calcula el checklist, entonces el resultado es exactamente: `presente_verificado`
  = {`histologia`, `tnm`, `ecog`, `her2_ihq`, `tratamientos_previos`};
  `presente_sin_verificar` = {`re`}; `faltante` = {`grado`, `rp`, `her2_ish`, `ki67`,
  `estado_menopausico`, `brca_germinal`}; `no_aplica` = ∅. `[AC-04.1]` `[FR-23]`
- **AC-3 (borde · dato rechazado)** · Dado F-M2, cuyo único registro de receptor de
  progesterona está `rechazado`, cuando se calcula el checklist, entonces `rp` queda
  en `faltante`, no en `presente_*`. `[RN-07]` `[AC-02.6]` `(asumido)`
- **AC-4 (borde · condición no evaluable)** · Dados `test-1.0.0` y **F-M3** (sin
  TNM ni HER2), cuando se calcula el checklist, entonces `her2_ish` y
  `brca_germinal` quedan en `no_aplica` y `tratamientos_previos` en `faltante`,
  según el `whenConditionUnknown` de cada ítem, mientras que `tnm` y `her2_ihq`
  quedan en `faltante`. `(asumido)`
  > Pendiente de definir en refinamiento (dueño: TBD-12 → DEC-01 · bloquea: nada): el valor de `whenConditionUnknown` de cada ítem condicional real (DEC-01 Q4). El motor solo aplica lo que declara el catálogo.
- **AC-5 (borde · determinismo sin IA)** · Dados F-M2 y `test-1.0.0`, cuando el
  checklist se calcula dos veces seguidas, entonces ambos resultados son idénticos
  (misma serialización JSON y mismo `catalogVersion`), y el cliente de
  `rag-orchestrator` registra **cero** llamadas. `[AC-04.4]` `[FR-23]`
- **AC-6 (borde · regla cambiada sin desplegar)** · Dado F-M2, cuando la misma
  build de `clinical-api` arranca con `CLINICAL_CATALOG_PATH` apuntando a
  `test-1.1.0` (igual a 1.0.0, sin el ítem `ki67`), entonces el resultado tiene 11
  ítems, `ki67` no aparece, hay 5 faltantes y `catalogVersion = "test-1.1.0"`.
  `[AC-04.4]` `[PRD §7]` `[RN-22]`
- **AC-7 (borde · por tipo de cáncer)** · Dados `test-1.0.0` y **F-P1** (próstata),
  cuando se calcula el checklist, entonces devuelve solo `psa_serie` y `ecog`, ambos
  en `presente_verificado`, y ninguna clave del catálogo de mama. `[FR-23]`

## Contexto técnico
Módulo `apps/clinical-api/src/modules/completeness/` (`completeness.service.ts` y
`.repository.ts`), con un motor puro en `completeness.rules.ts`, testeable sin
BD `[ADR-29]`. Corre en Backend 1 porque necesita datos del paciente;
`rag-orchestrator` no interviene `[ADR-29]` `[CLAUDE.md]`.

**Regla de cálculo** (determinista; entrada = datos del paciente + versión del catálogo):
1. Se toman los ítems del catálogo cuyo `cancerType` es el del `Diagnosis` activo (`is_active = true`) `[OL-03]`.
2. Si hay condición: se evalúa sobre los datos; si no se cumple → `no_aplica`; si no se puede evaluar → `whenConditionUnknown`.
3. Se buscan en el campo de destino registros que **no** estén `rechazado` ni `reemplazado` `[RN-07]`. Si hay menos de `minValues` → `faltante`.
4. Si el registro que cuenta (el más reciente por fecha de observación o examen; en empate, el creado más tarde) tiene un `review_status` incluido en `verifiedReviewStatuses` → `presente_verificado`; si no (incluido `requiere_revision`, que cubre "en conflicto") → `presente_sin_verificar`.
5. El orden de salida es el del catálogo. No hay LLM ni aleatoriedad.

> Pendiente de definir en refinamiento (dueño: oncólogo · bloquea: nada): si un mismo ítem tiene un registro verificado antiguo y uno más reciente sin verificar, ¿cuenta el más reciente (regla 4) o basta con que exista uno verificado?

> Pendiente de definir en refinamiento (dueño: oncólogo + Ingeniería, DEC-01 Q8 · bloquea: nada): el modelo no tiene marca de "ausencia confirmada" (p. ej., "sin tratamientos previos"); hasta decidirlo, un paciente sin `PriorTreatment` con la condición cumplida queda en `faltante`.

> Pendiente de definir en refinamiento (dueño: Ingeniería · bloquea: nada): un biomarcador `no_mapeado` no coincide con ningún ítem (nunca se le asigna un concepto inventado, RN-27), así que el ítem queda `faltante` aunque el documento lo traiga con otro nombre. ¿Se marca aparte como "posible dato sin mapear"?

**Fixtures sintéticos** (`apps/clinical-api/test/fixtures/completeness/`; todos `data_origin = sintetico`, activos, con episodio abierto, convenio registrado y sin opt-out; los usan US-002 a US-006 y se ofrecen a US-T5-01):

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
- **F-M2 (mama, mixto):** `Diagnosis` activo, `verificado`: histología "carcinoma lobulillar infiltrante", grado **null**, `TNM_8` "IV", ECOG 2. Biomarcadores: RE "Positivo" (`ocr`, confianza `media`, `requiere_revision`); RP "Negativo" (`ocr`, **`rechazado`**); HER2 "2+ (IHQ)" (`manual_correction`, `corregido`). Sin Ki-67, sin HER2 ISH, sin BRCA, sin `ClinicalAttribute`. Un `PriorTreatment` (`primera_linea_metastasica`, "letrozol", `manual`, `verificado`). Una `ClinicalNote` con PII sintética sembrada ("Paciente Ana Pérez, CC 1234567") para los tests de no-fuga.
- **F-M3 (mama, condición no evaluable):** igual que F-M1, pero sin TNM (`staging_system` y `stage_value` nulos) y sin ningún biomarcador HER2.
- **F-P1 (próstata):** `Diagnosis` activo próstata, `verificado`, ECOG 0; tres PSA `verificado` con fechas distintas.

Los pacientes semilla de OL-01 no se usan para resultados exactos: OL-01 solo garantiza que (e) no tiene estado menopáusico ni Ki-67 `[OL-01]`.

## Non-goals
Exponer el checklist por API o mostrarlo (US-003, US-004). Medir sensibilidad y
especificidad (US-T5-01). Decidir el contenido real del catálogo (DEC-01).

## INVEST
**Small** ✓ un motor puro más un repositorio de lectura; el 5 refleja la cantidad de bordes (condiciones, exclusiones y versión).
**Testable** ✓ los 7 AC son tests funcionales del servicio con BD de test y los fixtures declarados; el AC-5 usa un cliente de `rag-orchestrator` falso con contador.

---

## US-003 — El checklist se expone por API en `/completeness`, en la vista de caso y en la ficha

`FEAT-04` · Sprint 3 · Estimación **3** · FR-23, FR-01 · AC-04.1, AC-T1.1 · ↪ US-002, US-HU15-01 · 🔗 Regresión [FR-15] → US-FR15-01 (activa desde S5) · 🔗 Regresión [RN-15] → US-RN15-01 (activa desde S5: `/completeness` y `/case` **no** responden `403` por opt-out, FR-16)

## Story
Como oncólogo, quiero consultar el checklist de datos críticos de mi paciente,
cada uno con su origen, para saber de dónde sale lo que está presente y adónde
debo cargar lo que falta.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un doctor con sesión válida y el paciente F-M2 con
  el catálogo `test-1.0.0` cargado, cuando llama a
  `GET /platform/patients/{id}/completeness`, entonces recibe `200` con `items`
  igual al resultado del AC-2 de US-002 y `catalogVersion = "test-1.0.0"`.
  `[AC-04.1]` `[readme §4.1]`
- **AC-2 (vista de caso y ficha)** · Dado F-M2, cuando se llama a
  `GET /platform/patients/{id}/case` y a `GET /platform/patients/{id}`, entonces
  `CaseView.completeness` trae los mismos 12 ítems y estados que el AC-1 con el
  mismo `catalogVersion`, y `PatientSummary.missingCriticalCount = 6`.
  `[readme §4.1]` `[AC-04.1]`
- **AC-3 (origen de cada ítem)** · Dada la respuesta del AC-1, cuando se inspecciona
  cada ítem, entonces todo ítem `presente_*` trae `provenance` (`entryMethod`,
  `reviewStatus`, `sourceDocumentId` y página si viene de un documento) del registro
  que lo hizo presente, y todo ítem `faltante` trae `destination` (`entity` y campo)
  y `provenance = null`. `[AC-T1.1]` `[FR-23]`
- **AC-4 (borde · sin sesión)** · Dada una petición sin cookie de sesión, cuando se
  llama a `/completeness`, entonces la respuesta es `401` y `CompletenessService`
  no se invoca. `[FR-01]`
- **AC-5 (borde · paciente inexistente)** · Dado un UUID que no corresponde a ningún
  paciente, cuando se llama a `/completeness`, entonces la respuesta es `404` con
  la forma `{ error, message }`. `[PRD §10]` `(asumido)`
- **AC-6 (borde · tipo de cáncer no habilitado)** · Dado un paciente sintético con
  `Diagnosis` activo de un tipo que no está en `ENABLED_CANCER_TYPES`, cuando se
  llama a `/completeness`, entonces la respuesta es `200` con `items = []` y
  `cancerTypeEnabled = false`. `(asumido)`
  > Pendiente de definir en refinamiento (dueño: Ingeniería · bloquea: AC-6): ¿qué responde `/completeness` para un tipo no habilitado o para un paciente sin `Diagnosis` activo: `200` con lista vacía y bandera, o `422`? El contrato de `/completeness` no está en el OpenAPI de readme §4.1 (solo en la tabla de endpoints).

## Contexto técnico
`completeness.controller.ts` + `completeness.schema.ts` (Zod en el borde) en el
módulo `completeness`. `CaseTimelineService` (de US-HU15-01) llama a
`CompletenessService` para llenar `CaseView.completeness`. La ficha obtiene
`missingCriticalCount` (número de `faltante`) del mismo servicio. Las tres salidas
usan **una sola** implementación.

Contrato propuesto de `/completeness` (se agrega al spec OpenAPI de 4.1 y se
regenera `packages/api-contracts`, según la DoD):
```yaml
CompletenessView:
  properties:
    catalogVersion: { type: string }
    cancerTypeEnabled: { type: boolean }
    items:
      type: array
      items:
        properties:
          item: { type: string, example: "her2" }
          label: { type: string }
          status: { type: string, enum: [presente_verificado, presente_sin_verificar, faltante, no_aplica] }
          provenance: { $ref: "#/components/schemas/Provenance", nullable: true }
          destination: { type: object, properties: { entity: { type: string }, field: { type: string } } }
```
`CaseView.completeness` adopta la misma forma de ítem (ampliación compatible; ver
Conflictos de fuentes C2). La lectura es de solo consulta: no se audita como
generación con IA. Los logs registran solo el UUID del paciente y el `traceId`
`[CLAUDE.md]`. El p95 de la vista de caso (M-02.4, ≤ 2 s) es de CAP-02; esta
historia no debe empeorarlo: una consulta por destino, sin N+1.

## INVEST
**Small** ✓ un endpoint de lectura y dos puntos de integración con un servicio ya hecho.
**Testable** ✓ 6 tests de integración con Supertest sobre fixtures (AC-1 a AC-6).

---

## US-004 — En la vista de caso veo el checklist y desde un faltante puedo cargarlo o registrarlo

`FEAT-04` · Sprint 3 · Estimación **3** · FR-23 · AC-04.1, AC-T1.1 · ↪ US-003, US-HU15-01, US-HU04-01, US-MAN-01 · 🔗 Regresión [RN-23] → US-OL04-01 (textos nuevos de UI)

## Story
Como oncólogo, quiero ver en la vista de caso el estado de cada dato crítico y,
desde un dato faltante, ir directo a cargar el documento o registrarlo a mano,
para completar el caso sin buscar dónde se ingresa cada dato.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el oncólogo en la vista de caso de F-M2, cuando se
  carga la sección "Datos críticos", entonces se ven 12 filas, cada una con su
  etiqueta y uno de estos textos: "Presente y verificado", "Presente sin verificar",
  "Faltante" o "No aplica", con 6 filas "Faltante". `[AC-04.1]` `[FR-23]`
- **AC-2 (registrar a mano un atributo)** · Dado el ítem `estado_menopausico` en
  "Faltante", cuando el oncólogo elige "Registrar a mano" y guarda un valor, entonces
  se envía `POST /platform/patients/{id}/clinical-attributes` con
  `attribute_key = "estado_menopausico"` y, al recargar la sección, la fila deja de
  mostrar "Faltante". `[AC-04.1]` `[readme §4.1]`
- **AC-3 (cargar documento)** · Dado cualquier ítem en "Faltante", cuando el oncólogo
  elige "Cargar documento", entonces se abre la carga de documentos del mismo
  paciente, y la acción "Registrar a mano" solo aparece en los ítems cuyo destino
  tiene endpoint de registro manual (`ClinicalAttribute`, `PriorTreatment`).
  `[AC-04.1]` `(asumido)`
  > Pendiente de definir en refinamiento (dueño: usuario · bloquea: AC-3): readme §4.1 no tiene endpoint para registrar a mano biomarcadores (RE, RP, HER2, Ki-67, PSA) ni campos de `Diagnosis` (histología, grado, TNM, ECOG). ¿Se crea en el S3 (US-MAN-01) o, para esos ítems, el acceso directo es solo "Cargar documento"?
- **AC-4 (origen visible)** · Dado un ítem `presente_*` cuyo dato viene de un
  documento, cuando el oncólogo abre su origen, entonces se abre el visor del
  documento de origen en la página indicada; si el origen es manual o una
  corrección, la fila lo indica con ese texto. `[AC-T1.1]`
- **AC-5 (borde · checklist no disponible)** · Dado que
  `GET /platform/patients/{id}/completeness` responde `5xx`, cuando se abre la
  vista de caso, entonces la sección muestra "No se pudo calcular el checklist" y el
  timeline, los tratamientos previos y las series se muestran igual. `[RN-26]`
  `(asumido)`
- **AC-6 (borde · accesibilidad)** · Dada la sección "Datos críticos", cuando se
  navega solo con teclado, entonces se llega a las acciones de cada fila, y cada
  estado se distingue por su texto, no solo por el color. `[PRD §7]` `(asumido)`

## Contexto técnico
`apps/web`: un organismo `CriticalDataChecklist` en la vista de caso, alimentado
por `CaseView.completeness`. El navegador solo habla con `web`, mediante un Route
Handler hacia `clinical-api` `[CLAUDE.md]`. "Registrar a mano" reutiliza los
formularios del S2 (`clinical-attributes`, `prior-treatments`) prellenando la
clave. "Cargar documento" reutiliza la carga de US-HU04-01. Los textos de estado
son literales de UI en español. Lista de términos prescriptivos sobre los textos
nuevos: es regresión de RN-23.

## Non-goals
Revisar o verificar datos `presente_sin_verificar` desde el checklist (HU-09,
revisión). Mostrar faltantes en la ficha más allá del contador (FR-04).

## INVEST
**Small** ✓ un componente con 2 acciones que reutiliza formularios y carga ya existentes.
**Testable** ✓ los 6 AC son tests E2E con Playwright contra Compose con F-M2 (el AC-5, con `clinical-api` simulado).

---

## US-005 — Antes de analizar, el panel lista los faltantes y me deja cargar información o continuar con aviso

`FEAT-04` · Sprint 3 · Estimación **3** · FR-23, RN-26 · AC-04.2 · ↪ US-003, US-OL04-01 · 🔗 Regresión [RN-26] → US-T3-01 · 🔗 Regresión [RN-23] → US-OL04-01

## Story
Como oncólogo, quiero que, antes de analizar la evidencia, el sistema me diga qué
datos críticos faltan y me deje cargarlos o continuar, para decidir yo si analizo
ya o completo antes el caso, sin que nada me bloquee.

## AC (Given/When/Then)
- **AC-1 (happy path · aviso)** · Dado el oncólogo en el panel de análisis de
  F-M2, cuando pulsa "Analizar evidencia", entonces, antes de enviar ninguna
  petición de análisis, se muestra un aviso que lista los 6 faltantes por su
  etiqueta, con los botones "Cargar información" y "Continuar con aviso".
  `[AC-04.2]` `[FR-23]`
- **AC-2 (continuar con aviso)** · Dado el aviso del AC-1, cuando el oncólogo elige
  "Continuar con aviso", entonces `web` envía exactamente un
  `POST /api/evidence-analyses` con `continueWithWarning = true` y el panel muestra el
  resultado. `[AC-04.2]` `[readme §4.1]` `[RN-26]`
- **AC-3 (cargar información)** · Dado el aviso del AC-1, cuando el oncólogo elige
  "Cargar información", entonces se abre la sección "Datos críticos" de la vista de
  caso del mismo paciente y no se envía ninguna petición de análisis.
  `[AC-04.2]` `[FR-23]`
- **AC-4 (borde · sin faltantes)** · Dado F-M1 (sin faltantes), cuando el oncólogo
  pulsa "Analizar evidencia", entonces no aparece el aviso y se envía un
  `POST /api/evidence-analyses` con `continueWithWarning = false`. `[FR-23]`
- **AC-5 (borde · checklist caído)** · Dado que
  `GET /platform/patients/{id}/completeness` responde `5xx`, cuando el oncólogo pulsa
  "Analizar evidencia", entonces no aparece el aviso, el botón sigue habilitado y se
  envía el análisis con `continueWithWarning = false`. El servidor sigue calculando
  y enviando los faltantes (US-006). `[RN-26]` `(asumido)`

## Contexto técnico
Panel de análisis de OL-04 (`apps/web`). La lista del aviso sale de
`GET …/completeness` (vía Route Handler), es solo informativa: la lista que viaja
al análisis la recalcula `clinical-api` en el servidor (US-006). El aviso aparece
**antes de cada análisis** (FR-23), también si el oncólogo ya continuó en uno
anterior. Solo lista los `faltante`, no los `presente_sin_verificar`. Los
`no_aplica` nunca aparecen. Textos del aviso sin formulaciones prescriptivas
(regresión de RN-23).

## Non-goals
Plantillas de preguntas (CAP-05). Avisos `datos_faltantes` en las tarjetas de
opción y `patientDataWarning` en la aplicabilidad (US-FR11-01, US-CAP08-01).
Calificar si el aviso fue correcto o útil (VM-5, US-HU25-01, S4).

## INVEST
**Small** ✓ un diálogo y un flag en un request que ya existe.
**Testable** ✓ los 5 AC son tests E2E con Playwright; el número de requests se verifica interceptando `/api/evidence-analyses`.

---

## US-006 — Los faltantes viajan al análisis como "desconocido" y quedan persistidos con el análisis

`FEAT-04` · Sprint 3 · Estimación **3** · FR-23, FR-09, FR-27 (b, produce), RN-11, RN-26 · AC-04.2, AC-04.3, AC-T1.4, AC-T4.3 · ↪ US-002, US-OL03-01 · 🔗 Produce: US-T2-01 (inciso b), US-CAP06-01, US-CAP08-01 · 🔗 Regresión [RN-11] → US-OL03-01 · 🔗 Regresión [RN-06] → US-OL03-01 · 🔗 Regresión [RN-17] → US-RN17-01 (activa desde S4) · 🔗 Regresión [RN-15] → US-RN15-01 (activa desde S5) · 🔗 Regresión [FR-15] → US-FR15-01 (activa desde S5)

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
  `continued_with_warning = false` y `missing_critical_data` con las mismas 6 claves,
  y la petición interna lleva la misma `missingCriticalData`. `[RN-26]` `[AC-04.2]`
  `[FR-09]` `[readme §4.1]`
- **AC-4 (borde · cálculo en el servidor)** · Dado F-M2, si entre el
  `GET …/completeness` del panel y el `POST` se registra `estado_menopausico`, cuando
  se procesa el `POST`, entonces `missingCriticalData` tiene 5 claves y no incluye
  `estado_menopausico`. `[readme §2.1]` `[AC-04.4]`
- **AC-5 (borde · sin evidencia)** · Dado F-M2 y `rag-orchestrator` simulado que
  responde `status = "sin_evidencia"`, cuando se completa el análisis, entonces el
  `AIAnalysisRecord` persiste las 6 claves en `missing_critical_data` y
  `top_relevance_score = null`. `[FR-27]` `[AC-T2.1]`
- **AC-6 (borde · desidentificación)** · Dado F-M2, que tiene PII sintética sembrada
  en una nota clínica, cuando se captura la petición interna, entonces cada
  elemento de `missingCriticalData` es una clave del catálogo `test-1.0.0`
  (`^[a-z0-9_]+$`), y ni el nombre ni el documento sembrados aparecen en ese campo
  ni en el resto del payload. `[RN-11]` `[AC-T4.3]`
- **AC-7 (borde · Backend 2 caído)** · Dado F-M2 y `rag-orchestrator` simulado que
  no responde dentro del *deadline*, cuando se envía el análisis, entonces la
  respuesta es `504` y no existe ningún `AIAnalysisRecord` nuevo para ese paciente
  (ni con `missing_critical_data`). `[OL-03]` `[RN-06]`

## Contexto técnico
Módulo único `evidence-analysis` de `clinical-api` `[OL-03]`: el servicio llama a
`CompletenessService` (US-002) con la versión de catálogo cargada al construir el
`ClinicalContext` (4.2). Los faltantes son **claves del catálogo**, nunca texto
libre ni etiquetas del paciente. Viajan siempre, con o sin `continueWithWarning`,
porque el contexto de FR-09 los incluye en todo análisis. `continueWithWarning`
solo registra la elección del oncólogo `[readme §4.1]`. La misma lista y el flag se
entregan a `AnalysisBasisBuilder`, que llena `analysisBasis.missingCriticalData` y
`continuedWithWarning` (inciso b, dueña US-T2-01). Todo se persiste en la misma
transacción que el resto del `AIAnalysisRecord` y antes de responder `[RN-06]`.
Si el tipo de cáncer no está habilitado, el gateway responde `tipo_no_habilitado`
sin llamar a Backend 2 `[OL-03]` (comportamiento del S1, no cambia).

## Non-goals
El uso de los faltantes en el prompt y en la recuperación de Backend 2 ("se tratan
como desconocido", consulta enriquecida, PRD §12) es de US-CAP06-01. "Desconocido:
falta en el paciente" en la aplicabilidad es de US-CAP08-01 (S4). Supuestos
anclados a faltantes, inciso (c), son de US-T2-xx. El aviso `datos_faltantes` en las
tarjetas es de US-FR11-01. La marca "Evidencia o catálogo más reciente" que usa
`catalog_version` es de FR-12 (S4).

## INVEST
**Small** ✓ un llamado a un servicio ya existente dentro del gateway y tres columnas que ya existen desde OL-01.
**Testable** ✓ 7 tests de integración con Vitest + Supertest y `rag-orchestrator` simulado que captura el payload.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C1 | PRD §5 FR-23 "**CA:** HU-18; AC-04.1 a AC-04.4" | PRD §18.3.4 define además **AC-04.5** (ítem sin destino → no se publica, R-02, RN-29) | PRD §18.3.4 (más específico; coherente con RN-29). US-001 cubre AC-04.5. |
| C2 | readme §4.1 `CaseView.completeness`: ítems solo con `{ item, status }` | PRD §18.4 AC-T1.1 (todo dato mostrado, **incluido el checklist**, indica su origen) y FR-23 (acceso directo para cargar o registrar, lo que exige conocer el destino) | PRD: se amplía el ítem con `label`, `provenance` y `destination` (cambio compatible). US-003. |
| C3 | readme §5.1 HU-15 (S2): `CaseView` ya incluye `completeness` y `GET …/case` figura como "2 / 3" | PRD §5 FR-23 y §10: el checklist es del Sprint 3 | PRD: el campo existe en el contrato desde el S2 (vacío) y se llena en el S3 (US-003). |
| C4 | readme §4.2, ejemplo interno: paciente HER2 3+ estadio IIA (perfil del semilla a) con `missingCriticalData: ["estado_menopausico", "ki67"]` | readme §6 OL-01: el semilla (a) **sí** tiene estado menopáusico | OL-01 (dato de seed normativo; el ejemplo es ilustrativo, readme §4.1 nota). Ningún AC usa los ejemplos ni da por hecho el resultado exacto de los semillas; se usan los fixtures propios de US-002. |

## Dependencias externas pendientes

Historias que FEAT-04 cita y que pertenecen a otras Features (IDs provisionales; no se escriben aquí):

| ID provisional | Feature / T dueña probable | Qué se espera de ella | La referencia |
|---|---|---|---|
| US-CAT-01 | Plataforma · catálogos (S1) | Primera versión de `packages/clinical-catalogs`, montaje de solo lectura, `CLINICAL_CATALOG_VERSION`, `409 CATALOG_VERSION_MISMATCH` (ADR-38) y su mapeo en el gateway | US-001 |
| US-OL03-01 | CAP-06/CAP-10 · gateway (S1, OL-03) | `POST /platform/evidence-analyses`; dueña de RN-06 y RN-11 | US-006 |
| US-OL04-01 | CAP-06/CAP-10 · panel (S1, OL-04) | Panel de análisis y Route Handler; dueña de RN-23 para textos de UI | US-004, US-005 |
| US-HU15-01 | CAP-02 · vista de caso (S2) | `GET …/case` con `CaseView` y la página de vista de caso | US-003, US-004 |
| US-HU04-01 | CAP-01 · carga de documentos (S2) | Carga unitaria o múltiple desde la vista de caso | US-004 |
| US-MAN-01 | CAP-02 o FR-04 (por decidir) | Registro manual de biomarcadores y de `Diagnosis.histology`, `grade`, estadio y ECOG: **no existe endpoint en readme §4.1** | US-004 |
| US-T2-01 | T-2 · Base del análisis (S3, HU-20) | Inciso (b): mostrar `missingCriticalData` y `continuedWithWarning` en `analysisBasis` y en la UI, también con "sin evidencia" | US-006 |
| US-T3-01 | T-3 · control humano | Dueña de RN-26 / AC-T3.3: ningún aviso clínico bloquea (faltantes, sin verificar, conflicto, población no comparable, desactualizado) | US-005, US-006 |
| US-T5-01 | T-5 · evaluación | Dataset de faltantes sembrados y métricas M-04.1 (sensibilidad ≥ 0,95) y M-04.2 (especificidad ≥ 0,90), metas *propuestas* en configuración | US-002 |
| US-T5-02 | T-5 · evaluación | La suite se ejecuta en todo PR que cambie el catálogo (AC-T5.4) | US-001 |
| US-CAP06-01 | CAP-06 · recuperación (S3) | Backend 2 trata `missingCriticalData` como "desconocido" en el prompt y enriquece la consulta con los faltantes (PRD §12) | US-006 |
| US-CAP08-01 | CAP-08 · aplicabilidad (S4) | "Desconocido: falta en el paciente" desde `missingCriticalData`, con enlace al checklist (AC-04.3, AC-08.2) | US-006 |
| US-FR11-01 | CAP-10 · avisos (S3, HU-05) | Aviso `datos_faltantes` en las tarjetas de opción (FR-11, faltantes en el S3) | US-005, US-006 |
| US-HU25-01 | T-5 · feedback (S4) | `AnalysisFeedback.missing_data_warning_correct` y `missing_data_warning_useful` (VM-5) | US-005 |
| US-RN17-01 | CAP-11 / T-4 · ciclo de vida (S4) | `422` por paciente egresado en todos los endpoints de registro, incluido el análisis | US-006 |
| US-RN15-01 | T-4 · opt-out (S5) | `403` por opt-out de `analisis_ia` en toda generación con IA; y verificar que `/completeness` y `/case` **no** devuelven `403` (FR-16) | US-003, US-006 |
| US-FR15-01 | T-4 · equipo tratante (S5) | `403` sin pertenencia al equipo tratante en todos los endpoints de paciente, incluidos `/completeness` y el análisis | US-003, US-006 |

**Riesgo de dependencia:** si US-CAT-01 (S1) publica catálogos sin validador, RN-29 queda sin control hasta el S3. Se propone que US-CAT-01 adopte el validador de US-001 desde el S1 o que acepte explícitamente ese hueco.
