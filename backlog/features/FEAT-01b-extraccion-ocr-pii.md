# FEAT-01b — Extracción local: OCR, gate de PII, confianza determinista y propuesta de códigos

> Linear: [L1D-7](https://linear.app/l1der-lab-mjbc/issue/L1D-7)

**Talla:** XL (propone división) · **Sprint:** 3 · **Capacidad:** CAP-01 (AC-01.1 parte de extracción, AC-01.3) · CAP-02 (AC-02.7, extracción) · CAP-03 (AC-03.3, propuesta de Backend 2) · T-4 (SEG-04 en documentos, SEG-05) · **Recorrido principal:** sí
**Requisitos:** FR-06 (dueña, vía HU-04/HU-05; OL-05) · IA-08 · SEG-04 (gate de PII en documentos, dueña) · TBD-03 (umbrales de confianza OCR: se calibran en US-104) · RN-07 (regresión → US-065) · RN-12 (regresión → US-050) · RN-27 (parte de propuesta; dueña US-098)
**Evidencia:** [→ PRD §5 FR-06], [→ PRD §6 RN-07, RN-10, RN-12, RN-27], [→ PRD §11 #4, #5], [→ PRD §12 Extracción], [→ PRD §18.3.1 AC-01.1, AC-01.3, M-01.1–M-01.3], [→ PRD §18.3.2 AC-02.7], [→ PRD §18.3.3 AC-03.3], [→ readme §5 HU-04, HU-05], [→ readme §6 OL-05 (tareas 6, 10–12; tests)], [→ readme §4.2 `/documents/extract`, `DocumentExtractResponse`, `ExtractedField`], [→ readme §2.5 Gate de PII], [→ readme §3.3 #14, #15, #23, #32, #33], [→ backlog/02-adrs.md ADR-39, ADR-40, §4.1 TBD-03], [→ CLAUDE.md "señales deterministas, nunca la confianza autorreportada por el LLM"]
**Dependencias:** ↪ US-078 (cola), US-054 (JWT), US-041 (catálogo montado en ambos backends) · ⛔ ADR-39 (motor OCR y LLM de estructuración; los AC se verifican con adapters falsos) · ⛔ ADR-40 (motor de PII; US-083) · ⛔ DEC-09 · escenario más probable (origen del semáforo, US-082 AC-7) · ⛔ DEC-04 · *workaround* Q-07 (códigos distintos de CIE-10, US-086) · 🔗 Medido en: US-103 (M-01.1, M-01.2, M-01.3, PII en documentos), US-104 (calibración TBD-03), US-105 (M-02.1), US-106 (M-03.4, M-03.5)
**Valor:** el oncólogo deja de transcribir a mano biomarcadores, diagnósticos, tratamientos previos y eventos (P1, P3): el sistema los lee del PDF localmente, le dice con qué confianza lo hizo y dónde está cada valor, y nunca deja entrar datos de un documento con información personal inesperada.
**Stories:** US-082, US-083, US-084, US-085, US-086, US-087 (31 puntos, S3)

> **Propuesta de división (talla XL: atraviesa dos servicios y suma 31 puntos).** Publicar como dos Features hermanas sin cambiar IDs: **01b-B2 Extracción en `rag-orchestrator`** (US-082, US-084, US-085, US-086 y la parte de detección de US-083) y **01b-B1 Decisión y persistencia en `clinical-api`** (US-087 y la parte de decisión de US-083). Si DEC-03 lo exige, US-085 (eventos, tratamientos y atributos) es la que puede pasar al inicio del S3 sin romper el recorrido mínimo de biomarcadores.

## Fixtures

- Usa **FX-01a-a** (archivos) de FEAT-01a.
- **FX-01b-a · Adapters falsos de extracción** (`apps/rag-orchestrator/tests/fixtures/extraction/`; cuentan invocaciones):
  - `OcrAdapter` falso: devuelve texto con confianza por palabra (0,95 en `escaneado.pdf`; 0,40 en `ilegible.pdf`, que además no produce texto útil).
  - `LLMAdapter` falso de estructuración:
    - `EXT-MAMA` → diagnóstico mama (histología "carcinoma ductal infiltrante", grado "2", `TNM_8` "IIA"), examen del 2026-08-10, biomarcadores HER2 "3+ (IHQ)" (nombre original "c-erbB-2"), receptor de estrógeno "Positivo (80 %)", con `confidence = 0.99` autorreportada.
    - `EXT-PROSTATA` → tratamiento previo "leuprorelina" (línea 1, inicio 2025-11, en curso), evento `progresion` del 2026-07-20, atributo `estado_castracion` = "castrado", PSA "9.5" ng/mL del 2026-07-15.
    - `EXT-INVENTA` → agrega "Ki-67 35 %", que no aparece en el texto, con `confidence = 0.99`.
    - `EXT-SIN-FECHA` → evento `toxicidad` sin fecha en el texto.
    - `EXT-CODIGO-FALSO` → propone `loincCode = "99999-9"` para el HER2.
    - `EXT-TIPOS` → además de lo de `EXT-MAMA`, un evento `diagnostico`, un atributo `color_ojos` y la histología como atributo.
  - `PiiAdapter` falso: detecta "CC 1234567" como `numero_documento`; en `real_identificado` devuelve `identityFound` con el documento leído.
- **FX-01b-b · Catálogo terminológico de test** `test-s2-1.0.0` (en ambos backends): HER2 (código `LOINC-T-HER2`; sinónimos "c-erbB-2", "ERBB2", "HER-2/neu"), receptor de estrógeno (`LOINC-T-RE`), PSA (`LOINC-T-PSA`, unidad normalizada ng/mL), Ki-67 (`LOINC-T-KI67`); CIE-10 `C50.9` (mama) y `C61` (próstata); leuprorelina `ATC-T-LEUP`; atributos `estado_menopausico`, `estado_castracion`, `sitios_metastasicos`. Códigos de test ficticios salvo CIE-10, por DEC-04 (Q-07).

---

## US-082 — `/documents/extract` lee el PDF en memoria, aplica OCR solo donde hace falta y estructura los datos clínicos

> Linear: [L1D-63](https://linear.app/l1der-lab-mjbc/issue/L1D-63)

`FEAT-01b` · Sprint 3 · Estimación **8** · HU-04, HU-05 · FR-06 (dueña), IA-08 · AC-01.1 (ilegible) · ⛔ ADR-39 (adapters reales) · ⛔ DEC-09 · escenario más probable (AC-7) · ↪ US-054, US-041 · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [SEG-07] → US-054 · Ticket: OL-05

## Story
Como oncólogo, quiero que el sistema lea localmente el PDF que subo y devuelva sus
datos clínicos estructurados con la posición de cada valor, para que mi paciente quede
registrado sin transcripción y sin que el documento salga de la infraestructura.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `mama-examen.pdf` (capa de texto digital) y `EXT-MAMA`,
  cuando `clinical-api` llama a `POST /documents/extract` con JWT válido y
  `dataClassification = sintetico`, entonces responde `200` con un
  `DocumentExtractResponse` que trae `diagnosis`, `exam` y dos `biomarkers` cuyos campos
  son `ExtractedField` con `value` y `sourceSpan.page = 2`, más `catalogVersion =
  test-s2-1.0.0`; y el `OcrAdapter` registra cero invocaciones. `[OL-05]` `[FR-06]` `[readme §4.2]`
- **AC-2 (borde · página escaneada)** · Dado `escaneado.pdf`, cuando se extrae, entonces
  el `OcrAdapter` se invoca exactamente una vez, solo para la página 1. `[FR-06]` `[IA-08]`
- **AC-3 (borde · ilegible)** · Dado `ilegible.pdf`, cuando se extrae, entonces responde
  `422` y el `LLMAdapter` registra cero invocaciones. `[OL-05]` `[AC-01.1]`
- **AC-4 (borde · datos reales sin nube)** · Dado `dataClassification =
  real_identificado`, un proveedor de nube configurado como alternativa y el LLM local
  caído, cuando se extrae, entonces responde `503` con `LOCAL_LLM_UNAVAILABLE` y el
  adapter de nube registra cero llamadas. `[RN-12]` `[readme §4.2]`
- **AC-5 (invariante · nada se persiste)** · Dada la extracción del AC-1, cuando termina,
  entonces el directorio temporal del contenedor está vacío y los *logs* no contienen
  texto del documento ni su nombre. `[OL-05]` `[CLAUDE.md]`
- **AC-6 (borde · credencial)** · Dado un request sin JWT, o con la cookie
  `oncolens_session` en lugar del JWT, cuando llega, entonces responde `401` sin invocar
  ningún adapter. `[SEG-07]` `[OL-02]`
- **AC-7 (borde · origen del semáforo)** · Dado un biomarcador cuyo documento trae rango
  de referencia y marca de anormalidad, y otro sin rango, cuando se extraen, entonces el
  primero lleva `significanceSource = documento` y el segundo
  `significanceSource = inferido_ia`. `[FR-06]` `[HU-05]` `[DEC-09]`

## Contexto técnico
Hexagonal en `rag-orchestrator`: `api/DocumentExtractionRouter` →
`application/TextExtractionService` (capa de texto; OCR solo en páginas sin texto) →
`ClinicalStructuringService` (LLM local con salida JSON por esquema) → adapters en
`infrastructure/ocr/`, `llm/`, `pii/`. El PDF se procesa en memoria `[CLAUDE.md]`. La
regla de proveedores reutiliza la de US-050. `TextExtractionService` se diseña para
reutilizarse en la ingesta del corpus (US-117). El gate de PII es US-083; la confianza,
US-084; eventos, tratamientos y atributos, US-085; códigos, US-086. Tests: Pytest +
TestClient con FX-01a-a y FX-01b-a.

## Non-goals
Persistencia (US-087). Plantillas por laboratorio (excluidas, PRD §12). Registro asistido
(`mode = registro`, FEAT-01c).

## INVEST
**Small** ✓ 8 es el techo: un pipeline lineal en un servicio; si se complica, dividir en US-082a (texto y OCR) y US-082b (estructuración).
**Testable** ✓ siete tests con adapters falsos y contadores.
*(Estimable ⚠ el 8 asume ADR-39 cerrado en el S1 para OCR y LLM.)*

---

## US-083 — Un documento con datos personales inesperados queda en cuarentena sin persistir nada

> Linear: [L1D-64](https://linear.app/l1der-lab-mjbc/issue/L1D-64)

`FEAT-01b` · Sprint 3 · Estimación **5** · HU-04 (escenario 3) · FR-06 (gate de PII), SEG-04 (documentos, dueña), RN-10 · AC-01.1 (`cuarentena_pii`, `requiere_revision_identidad`) · ⛔ ADR-40 (motor de PII) · ↪ US-082, US-078, US-046 · 🔗 Regresión [RN-10] → US-046 · 🔗 Medido en: US-103 (sensibilidad de PII en documentos, G-8)

## Story
Como oncólogo, quiero que un documento con datos personales que no deberían estar ahí
quede retenido sin que ninguno de sus datos entre al caso, para que la identidad de un
paciente nunca termine donde no corresponde.

## AC (Given/When/Then)
- **AC-1 (happy path · cuarentena)** · Dados `doc-pii.pdf` y `dataClassification =
  sintetico`, cuando se extrae, entonces la respuesta trae `piiScan.clean = false`,
  `findingTypes = ["numero_documento"]` y ningún dato clínico; y `clinical-api` deja el
  documento en `cuarentena_pii` con `pii_finding_types = "numero_documento"` y sin
  ninguna fila clínica con ese `source_document_id`. `[HU-04]` `[FR-06]` `[readme §2.5]`
- **AC-2 (borde · limpio)** · Dado `mama-examen.pdf`, cuando se extrae, entonces
  `piiScan.clean = true` y el flujo sigue a la persistencia. `[FR-06]`
- **AC-3 (borde · anonimizado)** · Dado `doc-pii.pdf` con `dataClassification =
  real_anonimizado`, cuando se extrae, entonces el resultado es el mismo que en el AC-1.
  `[readme §2.5]`
- **AC-4 (borde · identidad propia)** · Dado `dataClassification = real_identificado` y
  un `identityFound` cuyo índice ciego coincide con el del paciente, cuando
  `clinical-api` lo compara, entonces el documento continúa y cualquier otra PII del
  texto libre llega enmascarada. `[readme §2.5]` `[FR-06]`
- **AC-5 (borde · identidad distinta)** · Dado un `identityFound` que no coincide,
  cuando se compara, entonces el documento queda en `requiere_revision_identidad` sin
  ninguna fila clínica. `[FR-06]` `[OL-05]`
- **AC-6 (invariante · la identidad no se guarda)** · Dados los casos AC-1 a AC-5,
  cuando se inspeccionan `document`, las tablas clínicas, `audit_log` y los *logs*,
  entonces no aparecen "1234567" ni el documento leído en `identityFound`; la comparación
  se hace en memoria con el HMAC del índice ciego y se descarta. `[RN-10]` `[readme §4.2]`
- **AC-7 (borde · detector caído)** · Dado el `PiiAdapter` lanzando un error, cuando se
  extrae, entonces `rag-orchestrator` responde `503`, el documento vuelve a `pendiente`
  para reintento y ningún dato se persiste sin haber pasado el gate. (asumido: falla
  cerrada, igual que US-049 AC-7)

## Contexto técnico
Detección en `rag-orchestrator` (`infrastructure/pii/`, motor según ADR-40) y decisión
en `clinical-api` (`documents` + `IdentityService` para el HMAC). Las clases
`real_anonimizado` y `real_identificado` se prueban solo a nivel de servicio, con
contenido sintético y la clase forzada en el request de test: ningún dato real entra a
la aplicación antes de G-piloto `[RN-13]`. Tests: Pytest (AC-1 a AC-3, AC-7) y Vitest +
Supertest con `rag-orchestrator` simulado (AC-1, AC-4 a AC-6).

## INVEST
**Small** ✓ una regla de decisión con tres ramas sobre una detección ya encapsulada.
**Testable** ✓ siete tests sobre la respuesta, el estado y las tablas.

---

## US-084 — La confianza de cada dato extraído se calcula con señales deterministas, nunca con la que declara el LLM

> Linear: [L1D-65](https://linear.app/l1der-lab-mjbc/issue/L1D-65)

`FEAT-01b` · Sprint 3 · Estimación **5** · HU-05 · FR-06 (confianza por campo), IA-08, RN-07 · AC-01.3 · ⛔ ADR-39 (motor OCR) · ↪ US-082 · 🔗 Regresión [RN-07] → US-065 · 🔗 Medido en: US-103 (M-01.3), US-104 (calibración TBD-03)

## Story
Como oncólogo, quiero que la confianza que veo en cada dato extraído dependa de cómo
se leyó y de si tiene sentido clínico, no de lo que el modelo dice de sí mismo, para
saber en qué datos puedo apoyarme sin revisarlos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el HER2 "3+ (IHQ)" de `EXT-MAMA`, anclado literalmente en
  el texto de la página 2, con valor válido en el dominio del catálogo, cuando se calcula
  la confianza, entonces `extractionScore ≥ OCR_CONFIDENCE_HIGH` y
  `extractionConfidence = alta`. `[FR-06]` `[IA-08]`
- **AC-2 (invariante · no autorreportada)** · Dado `EXT-INVENTA` (Ki-67 "35 %" sin
  anclaje en el texto y `confidence = 0.99` del LLM), cuando se calcula, entonces
  `extractionConfidence = baja`; y si un test cambia la confianza autorreportada a 0,1,
  `extractionScore` no cambia. `[CLAUDE.md]` `[FR-06]`
- **AC-3 (borde · fuera de dominio)** · Dado un HER2 extraído como "7+", cuando se
  calcula, entonces `extractionConfidence = baja`. `[FR-06]`
- **AC-4 (borde · calidad de lectura)** · Dado un valor de `escaneado.pdf` cuyas palabras
  tienen confianza de OCR inferior a `OCR_WORD_MIN_CONFIDENCE`, cuando se calcula,
  entonces `extractionConfidence` es `media` o `baja`, nunca `alta`. `[FR-06]` `[IA-08]`
- **AC-5 (borde · decisión de revisión)** · Dados un dato `alta` sin conflicto y con
  `significanceSource = documento`, otro `alta` con `significanceSource = inferido_ia`, y
  otro `media`, cuando `clinical-api` asigna `review_status`, entonces el primero queda
  `auto_aceptado` y los otros dos `requiere_revision`. `[OL-05]` `[HU-05]`
- **AC-6 (borde · umbrales en configuración)** · Dado el dato del AC-1, cuando un test
  sube `OCR_CONFIDENCE_HIGH` por encima de su `extractionScore`, entonces el mismo build
  lo clasifica `media`. `[RN-22]` `[TBD-03]`

## Contexto técnico
Regla pura en `rag-orchestrator/app/domain/extraction_confidence.py`: combina calidad de
lectura (capa de texto o confianza del OCR), anclaje literal en el texto, validación de
dominio contra el catálogo y consistencia entre campos; ignora cualquier confianza del
LLM `[CLAUDE.md]`. La asignación de `review_status` es de `clinical-api` (US-087) con la
regla de OL-05 tarea 6; los conflictos los añade US-099. Umbrales en configuración y
calibrados en US-104 `[RN-22]`. Tests: Pytest unitarios del dominio (AC-1 a AC-4, AC-6) y
Vitest de la regla de revisión (AC-5).

## INVEST
**Small** ✓ una función pura de puntaje y una regla de umbral.
**Testable** ✓ seis tests deterministas.

---

## US-085 — La extracción incluye eventos fechados, tratamientos previos y atributos clínicos con su procedencia

> Linear: [L1D-66](https://linear.app/l1der-lab-mjbc/issue/L1D-66)

`FEAT-01b` · Sprint 3 · Estimación **5** · HU-04, HU-15 · FR-06 (eventos, tratamientos, atributos), FR-21 (extracción) · AC-01.3, AC-02.7 (extracción), AC-02.2 (fecha incierta) · ⛔ ADR-39 · ↪ US-082 · 🔗 Consumida por: US-087, US-088, US-089 · 🔗 Medido en: US-105 (M-02.1)

## Story
Como oncólogo, quiero que de los documentos salgan también los eventos de la
enfermedad, las líneas de tratamiento previas y atributos como el estado de castración,
para reconstruir la historia de mi paciente sin leer cada informe.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `prostata-hc.pdf` y `EXT-PROSTATA`, cuando se extrae,
  entonces la respuesta trae en `events` un `progresion` con `eventDate = 2026-07-20` y
  `datePrecision = dia`; en `priorTreatments` "leuprorelina" con `lineNumber = 1`,
  `startedAt` 2025-11 y sin `endedAt`; y en `attributes` `estado_castracion` = "castrado";
  cada uno con `sourceSpan`. `[AC-01.3]` `[OL-05]` `[readme §4.2]`
- **AC-2 (borde · fecha incierta)** · Dado `EXT-SIN-FECHA`, cuando se extrae, entonces
  el evento `toxicidad` trae `datePrecision = incierta` y `eventDate.value` nulo.
  `[OL-05]` `[AC-02.2]`
- **AC-3 (borde · solo tipos sin tabla propia)** · Dado `EXT-TIPOS`, cuando se extrae,
  entonces `events` no contiene `diagnostico` (el diagnóstico va en `diagnosis`), y solo
  contiene tipos del conjunto `cirugia | procedimiento | respuesta | progresion |
  toxicidad | recaida | evolucion`. `[ADR-32]` `[FR-21]`
- **AC-4 (borde · atributo fuera del catálogo)** · Dado `EXT-TIPOS`, cuando se extrae,
  entonces `color_ojos` no aparece en `attributes`, porque solo se devuelven claves del
  catálogo del tipo de cáncer. `[AC-02.7]` `[RN-29]`
- **AC-5 (borde · histología y grado a su destino)** · Dado `EXT-TIPOS`, cuando se
  extrae, entonces la histología y el grado quedan en `diagnosis.histology` y
  `diagnosis.grade`, no en `attributes`. `[AC-02.7]` `[ADR-32]`

## Contexto técnico
Extensión de `ClinicalStructuringService` (US-082) con los esquemas de `events`,
`priorTreatments` y `attributes` de readme §4.2. Las claves de atributos y su destino se
leen del catálogo montado `[ADR-29]` `[RN-29]`. Cada campo pasa por la confianza de
US-084. Tests: Pytest con FX-01a-a, FX-01b-a y FX-01b-b.

## INVEST
**Small** ✓ tres secciones más del mismo esquema de salida.
**Testable** ✓ cinco tests con salidas del LLM falso conocidas.

---

## US-086 — Backend 2 propone códigos del catálogo con su confianza, o `no_mapeado`, y nunca inventa uno

> Linear: [L1D-67](https://linear.app/l1der-lab-mjbc/issue/L1D-67)

`FEAT-01b` · Sprint 3 · Estimación **3** · HU-04, HU-17 · FR-06 (propuesta de códigos), FR-22 (B2 propone) · AC-03.3 (parte de propuesta) · ⛔ DEC-04 · *workaround* Q-07 · ↪ US-082 · 🔗 Consumida por: US-098 (Backend 1 decide) · 🔗 Regresión [RN-27] → US-098 · 🔗 Medido en: US-106 (M-03.4, M-03.5)

## Story
Como oncólogo, quiero que cada término extraído llegue con el código estándar que le
corresponde según el catálogo, o marcado como no mapeado, para que dos informes que
nombran distinto el mismo dato se reconozcan y nada se codifique al azar.

## AC (Given/When/Then)
- **AC-1 (happy path · sinónimo)** · Dado `EXT-MAMA`, cuyo HER2 aparece como "c-erbB-2",
  cuando se propone la normalización, entonces el biomarcador trae `name = HER2`,
  `originalName = "c-erbB-2"`, `loincCode = LOINC-T-HER2` y `mappingStatus = mapeado`.
  `[AC-03.3]` `[FR-22]`
- **AC-2 (borde · término desconocido)** · Dado un biomarcador "marcador XYZ", cuando se
  propone, entonces trae `mappingStatus = no_mapeado`, `loincCode = null` y conserva
  `originalName`. `[RN-27]` `[AC-03.3]`
- **AC-3 (invariante · código inventado)** · Dado `EXT-CODIGO-FALSO`, cuando se
  propone, entonces el HER2 sale con `mappingStatus = no_mapeado` y sin `99999-9`, porque
  todo código propuesto se verifica contra el catálogo cargado. `[RN-27]` `[M-03.5]`
- **AC-4 (borde · estándar por tipo de dato)** · Dados `EXT-MAMA` y `EXT-PROSTATA`,
  cuando se propone, entonces el diagnóstico trae `C50.9` (CIE-10), el PSA
  `LOINC-T-PSA` (LOINC) y la leuprorelina `ATC-T-LEUP` (ATC). `[AC-03.3]` `[FR-22]`
- **AC-5 (borde · versión del catálogo)** · Dada cualquier extracción, cuando se
  responde, entonces `catalogVersion` es la del catálogo montado en `rag-orchestrator`.
  `[ADR-38]`

## Contexto técnico
Regla pura en `rag-orchestrator/app/domain/terminology.py` sobre el catálogo montado
(`CLINICAL_CATALOG_PATH`): primero término canónico y sinónimos ES/EN, luego la propuesta
del LLM solo si el código existe en el catálogo. Por Q-07, mientras DEC-04 no confirme
LOINC, CUPS y ATC, el catálogo real del repo trae solo CIE-10 y los demás quedan
`no_mapeado` (los tests usan códigos ficticios de FX-01b-b). La decisión final es de
Backend 1 (US-098) `[ADR-33]`. Tests: Pytest unitarios.

## INVEST
**Small** ✓ una función de búsqueda en el catálogo.
**Testable** ✓ cinco tests deterministas.

---

## US-087 — Lo extraído se persiste en una sola transacción, sin datos parciales y sin duplicar al reprocesar

> Linear: [L1D-68](https://linear.app/l1der-lab-mjbc/issue/L1D-68)

`FEAT-01b` · Sprint 3 · Estimación **5** · HU-04, HU-05 · FR-06 (persistencia), RN-07 · AC-01.1 (reproceso idempotente), AC-01.3 · ↪ US-078, US-082…US-086, US-098, US-099, US-100 · 🔗 Regresión [RN-06] → US-053 (ningún dato a medias) · 🔗 Consumida por: US-088, US-089, US-092 · Ticket: OL-05

## Story
Como oncólogo, quiero que un documento procesado aporte todos sus datos o ninguno, y
que reprocesarlo no los duplique, para que el caso de mi paciente nunca quede
incompleto ni repetido por un fallo técnico.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la extracción de `mama-examen.pdf` (US-082) para el
  paciente semilla (a), cuando `clinical-api` la persiste, entonces en una transacción
  crea un `Exam` con `entry_method = ocr` y `source_document_id`, dos `Biomarker` con
  `extraction_score`, `extraction_confidence`, `review_status`, `significance_source` y
  `source_span`, y el `Diagnosis` según US-100; luego el documento queda `completado`, y
  `GET /platform/patients/{id}` devuelve esos biomarcadores con
  `provenance.sourceDocumentId` igual al documento. `[OL-05]` `[AC-01.3]`
- **AC-2 (borde · fallo a mitad)** · Dado un fallo forzado al insertar el segundo
  biomarcador, cuando se persiste, entonces no existe ninguna fila con ese
  `source_document_id` y el documento vuelve a `pendiente` con el intento contado.
  `[OL-05]` `[FR-06]`
- **AC-3 (borde · reproceso)** · Dado un documento ya `completado`, cuando se reprocesa
  con la misma extracción, entonces el número de filas en `exam`, `biomarker`,
  `clinical_event`, `prior_treatment` y `clinical_attribute` no cambia. `[AC-01.1]` `[OL-05]`
- **AC-4 (borde · respuesta inválida)** · Dada una respuesta de `rag-orchestrator` que no
  valida contra el esquema Zod de `DocumentExtractResponse`, cuando se procesa, entonces
  el documento pasa a `error` sin ninguna fila clínica. (asumido)
- **AC-5 (borde · caso longitudinal)** · Dada la extracción de `prostata-hc.pdf`, cuando
  se persiste, entonces quedan un `PriorTreatment` y un `ClinicalEvent` (`progresion`) y
  un `ClinicalAttribute` (`estado_castracion`), los tres con `entry_method = ocr`,
  `extraction_confidence`, `review_status` y `source_span`. `[AC-01.3]` `[AC-02.7]` `[OL-05]`
- **AC-6 (borde · extracción fallida)** · Dado un documento que termina en `error`,
  cuando se abre la ficha, entonces no aparece ningún biomarcador nuevo derivado de él.
  `[HU-05]` `[OL-05]`

## Contexto técnico
`ExtractionPersistenceService` en el módulo `documents` de `clinical-api`, invocado por
el *worker* (US-078). Orden dentro de la transacción: normalización final (US-098) →
reconciliación de duplicados y conflictos (US-099) → regla de diagnóstico (US-100) →
inserciones → `ocr_status = completado`. La idempotencia se apoya en
`source_document_id`. Tests: Vitest + Supertest con PostgreSQL de test y
`rag-orchestrator` simulado.

## INVEST
**Small** ✓ un servicio transaccional que encadena reglas ya existentes.
**Testable** ✓ seis tests sobre filas y estados en BD.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-23 | readme §5.0 S2: "regla de proveedores solo locales" en el S2 | readme OL-02 (S1): test de la regla y `503` | La regla existe desde el S1 (US-050); aquí solo se aplica a `/documents/extract` como regresión |
| — | readme OL-05 tarea 12: el motor de PII lo fija el ADR de modelos locales | backlog/02-adrs.md H-02: ADR-40 separado | ADR-40 (02-adrs.md, cerrado en el S1) |
| — | readme OL-01 seed: códigos LOINC y ATC desde el catálogo | Q-07 / DEC-04: solo CIE-10 hasta confirmar términos de uso | Q-07: los tests usan códigos ficticios; el catálogo real solo CIE-10 hasta DEC-04 |
| Slicing v2 | PRD §14 S2 y readme §5.0 S2: extracción OCR y gate de PII en el S2 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): extracción en el S3 | En el S2 la cola (US-078) se prueba con el extractor simulado; la extracción real llega en el S3 |
