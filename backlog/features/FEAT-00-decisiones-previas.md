# FEAT-00 — [Pre-S1] Decisiones previas al Sprint 1

> Linear: [L1D-5](https://linear.app/l1der-lab-mjbc/issue/L1D-5)

**Talla:** L · **Sprint:** Pre-S1 (ADR-36 cierra a más tardar en el S1) · **Capacidad:** — (habilita CAP-02, CAP-04, CAP-06, CAP-08, CAP-10 y T-5) · **Recorrido principal:** sí
**Requisitos:** contrato `EvidenceAnalysis` congelado (ADR-26; FR-09, FR-25 contrato, FR-27 esquema) · esquema con caso longitudinal y metadatos del corpus (ADR-24, ADR-10) · TBD-11 → DEC-02 · TBD-19 → DEC-03 · TBD-17 → DEC-04 (Q-07) · Q-04 → DEC-05 · TBD-04 → ADR-36
**Evidencia:** [→ PRD §14 Pre-S1], [→ readme §5.0 "Antes del Sprint 1"], [→ readme §3.3 #10, #24, #26, #30, #36], [→ readme §3.1], [→ readme §4.1, §4.2], [→ PRD §16 TBD-04, TBD-11, TBD-17, TBD-19], [→ PRD §2.2], [→ PRD §18.6 SUP-1, SUP-5], [→ backlog/01-requisitos.md §14 Q-04, Q-07; §15 P-01…P-03], [→ backlog/02-adrs.md §2, §3, §4.4]
**Dependencias:** — (primera Feature del backlog) · 🔗 Bloquea: FEAT-PL2 (DEC-05, US-033), FEAT-PL3 (DEC-04), FEAT-06a y FEAT-10a (US-033), FEAT-06c (US-033, ADR-36 para el S4), FEAT-T5a (DEC-02)
**Valor:** el Discovery muestra que el oncólogo reconstruye el caso a mano desde documentos (P1) y busca evidencia sin saber si aplica a su paciente (P5, P6). Antes de escribir código hay que fijar lo que es caro de cambiar después: la forma del análisis que verá el oncólogo (sin "recomendaciones", D-01), el esquema que guardará el caso longitudinal, dónde vive cada dato crítico de próstata, qué fuentes puede usar el corpus y cómo se va a medir si el producto le ahorra tiempo (VM-1…VM-6). Sin estas decisiones, el walking skeleton del S1 se construiría sobre arena y la hipótesis no sería medible.
**Stories:** US-007 · ADR-36, US-008 · DEC-02, US-009 · DEC-03, US-010 · DEC-04, US-011 · DEC-05, US-033 (12 puntos)

> **Ubicación:** ADR-39 (modelos locales) se decide "al inicio del S1" (PRD §14, readme §1.4) y su faseo lo fija el propio ADR (P-01); vive en FEAT-06a (S1), donde se aplica, para que esta Feature solo contenga historias Pre-S1.

---

## US-007 · ADR-36 — [Pre-S1] Fuentes y licencias del corpus científico

> Linear: [L1D-50](https://linear.app/l1der-lab-mjbc/issue/L1D-50)

`FEAT-00` · Pre-S1 (no bloqueante; cierre a más tardar en el S1) · Estimación **3** · — (técnica, PRD §17) · FR-19, RN-21 · M-08.3 · Dueño: Ingeniería + área legal · 🔗 Bloquea: FEAT-06c (ingesta del S3 y `CorpusRelease.excluded_sources`), FEAT-09, DEC-19 · No bloquea la semilla del S1 (US-059)

## Story
Como responsable técnico, quiero fijar la lista final de fuentes públicas abiertas del
corpus y la regla para los resúmenes de PubMed sin licencia explícita, para que la
ingesta del S3 cumpla RN-21 sin rehacer el catálogo del corpus ni reindexar
documentos que después resulten inadmisibles.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la lista candidata de FR-19 (NCI PDQ, ClinicalTrials.gov,
  subconjunto de acceso abierto de PubMed/PMC, guías de práctica clínica públicas,
  publicaciones de TCGA/GDC, cBioPortal y TCIA), cuando se cierre el ADR, entonces
  `docs/architecture/adr/ADR-36-fuentes-y-licencias.md` registra por fuente: licencia o
  licencias observadas, `license_class` resultante (dominio público, CC BY, CC BY-SA,
  CC BY-NC marcada), si publica metadatos de población estructurados, idiomas y
  decisión (incluida / excluida, con motivo). `[FR-19]` `[RN-21]` `[ADR-36]`
- **AC-2 (borde · PubMed sin licencia)** · Dado un resumen de PubMed sin licencia
  explícita de reutilización, cuando se decida su tratamiento, entonces el ADR elige una
  de las opciones de la tabla y deja la regla en forma verificable por la ingesta
  (rechazo, o metadatos sin texto), coherente con la exclusión de "libre lectura sin
  licencia" de #36. `[TBD-04]` `[ADR-36]`
- **AC-3 (borde · NCCN y ESMO)** · Dadas NCCN y ESMO, cuando se cierre el ADR, entonces
  quedan como "no incluidas" en `CorpusRelease.excluded_sources`, sin texto ni ejemplos
  en el repo, y el ADR registra si la gestión de su licencia se abre para el MVP o para
  una versión futura; ninguna de las dos opciones bloquea el MVP. `[D-09]` `[ADR-30]` `[PREG-1]`
- **AC-4 (cobertura)** · Dada la lista elegida, cuando se estime su cobertura, entonces
  el ADR muestra que alcanza ≥ 20 documentos por tipo de cáncer habilitado (mama,
  próstata) y una estimación de la proporción con metadatos de población estructurados
  frente a la meta propuesta de M-08.3 (≥ 90 %). Si no alcanza, lo declara como riesgo
  SUP-3 en lugar de relajar la regla de licencias. `[RN-20]` `[M-08.3]` `[SUP-3]`
- **AC-5 (borde · licencia mixta dentro de una fuente)** · Dada una fuente cuyos
  documentos tienen licencias distintas (p. ej., PMC), cuando se registre, entonces el
  ADR fija que la licencia se evalúa **por documento** (`license_class` por documento) y
  que el documento sin licencia registrada o con licencia no aceptada se rechaza en la
  ingesta. `[FR-19]`
- **AC-6 (configuración)** · Dado el ADR aprobado, cuando se cierre, entonces la lista de
  fuentes admitidas y la regla de PubMed viven en configuración o en el catálogo del
  corpus, no en el código de la ingesta. `[RN-22]` (asumido)
- **AC-7 (borde · área legal sin respuesta)** · Dado que el área legal no se pronuncia
  sobre PubMed antes del inicio del S3, cuando se registre el ADR, entonces rige la
  opción A (excluir el resumen; solo artículos PMC con licencia aceptada) como regla por
  defecto, anotada como provisional. (asumido)

## Contexto técnico
Las licencias aceptadas **ya están decididas** (#36: dominio público, CC BY, CC BY-SA;
CC BY-NC solo MVP académico y marcada; ND y "libre lectura" excluidas): no se reabren.
Este ADR fija la **lista** y el caso PubMed. Preferir fuentes con metadatos
estructurados (ClinicalTrials.gov) mitiga SUP-3. La verificación de licencia por
documento ocurre en la ingesta (US-059 en el S1, FEAT-06c en el S3), no aquí. Se
verifica por revisión del documento ADR (no hay test automatizado: es una decisión).

| Opción (PubMed sin licencia explícita) | A favor | En contra |
|---|---|---|
| A · Excluir el resumen; ingerir solo artículos PMC OA con licencia aceptada | Coherente con #36; riesgo legal nulo | Menor cobertura de literatura reciente |
| B · Solo metadatos bibliográficos y enlace, sin texto | Mantiene la referencia visible | Sin texto no hay chunk ni soporte NLI (RN-01) |
| C · Ingerir el texto del resumen | Más cobertura | Contradice #36; requiere aval legal explícito |

**Descartado por decisión previa (no se reabre):** bloquear el MVP hasta tener NCCN/ESMO (readme §6.1 #17, D-09).

## Non-goals
No implementar la ingesta (FEAT-06c). No negociar licencias de NCCN/ESMO. No definir el
esquema de metadatos (ya en readme §3.1, congelado en US-033).

## INVEST
**Small** ✓ un documento de decisión con una tabla por fuente; sin código.
**Testable** ✓ cada AC se comprueba sobre el documento ADR (campos presentes por fuente, regla de PubMed, `excluded_sources`, cobertura estimada).

---

## US-008 · DEC-02 — [Pre-S1] Protocolo y metas de las métricas de valor VM-1…VM-6

> Linear: [L1D-51](https://linear.app/l1der-lab-mjbc/issue/L1D-51)

`FEAT-00` · Pre-S1 · Estimación **1** · — (decisión) · FR-20 · TBD-11, G-15, R-15 · M-02.5 (gobierno del protocolo) · Dueño: usuario (PO) + oncólogos asesores · 🔗 Bloquea: US-075 (baseline manual VM-1/VM-2), FEAT-T5c (feedback VM-4/VM-5), FEAT-T5d (medición), DEC-14

## Story
Como product owner, junto con los oncólogos asesores, quiero fijar el protocolo y las
metas de VM-1 a VM-6 antes del Sprint 1, para que el baseline manual sea comparable y
las metas no se muevan después de ver los resultados.

> Escenario más probable (a refinar en sprint planning): el protocolo contempla **dos cohortes** —casos sintéticos estandarizados revisados por oncólogos (S1–S4, mecánica y baseline manual de VM-1/VM-2) y casos reales tras G-Piloto (valor, VM-1…VM-6)— y adopta las sugerencias de PRD §2.2: ≥ 6 casos sintéticos estandarizados (3 de mama y 3 de próstata), reducción de la mediana ≥ 50 % en VM-1 y VM-2, ≥ 85 % de concordancia en VM-3, ≥ 70 % de análisis con calificación ≥ 4 en VM-4, ≥ 80 % en VM-5 y ≥ 80 % / ≤ 20 % en VM-6 con escala Likert, porque es la propuesta escrita en el PRD; el orden de las condiciones se contrabalancea entre participantes; en la cohorte real la condición manual se mide sobre casos reales distintos de los usados con OncoLens (respuesta 6 del usuario, §15). Por P-03, el feedback por análisis (VM-4 1–5 y los dos checkboxes de VM-5) es la validación clínica de los catálogos: aplicabilidad ← VM-4 (≥ 70 % con calificación ≥ 4) y datos críticos ← VM-5 (≥ 80 % "correcto y útil"), con la muestra mínima que fija este protocolo (respuesta 5 del usuario, §15).

## AC (Given/When/Then)
- **AC-1** · Dado el protocolo acordado, cuando se registre en
  `docs/decisions/DEC-02-protocolo-vm.md`, entonces define por cada VM lo listado en la
  columna "Qué se debe definir" de PRD §2.2 (casos, criterio de "caso reconstruido",
  orden de condiciones, participantes, herramientas permitidas, muestra, escala, tasa
  mínima de respuesta), con dueño y fecha. `[PRD §2.2]` `[TBD-11]`
- **AC-2** · Dadas las metas fijadas, cuando se registren, entonces quedan marcadas como
  **congeladas antes del S1** y el documento declara que no se modifican tras ver
  resultados. `[R-15]`
- **AC-3** · Dado el protocolo, cuando se registre, entonces nombra a los oncólogos
  participantes del baseline y la fecha de las sesiones dentro del S1. (asumido)
- **AC-4 (dos cohortes)** · Dada la decisión del usuario de validar con casos sintéticos
  y con casos reales, cuando se registre el protocolo, entonces define por cada VM en qué
  cohorte se mide (sintética, real o ambas), cómo se reportan por separado y que las
  metas fijadas antes del S1 aplican a la cohorte real para G-Éxito. `[R-15]` `[PRD §14]` (asumido)
- **AC-5 (validación por feedback, P-03)** · Dado que el feedback por análisis reemplaza
  la firma formal de DEC-01 y DEC-11, cuando se registre el protocolo, entonces declara
  la regla de validación (aplicabilidad ← VM-4 ≥ 70 % con calificación ≥ 4; datos
  críticos ← VM-5 ≥ 80 % "correcto y útil") y fija el número mínimo de análisis
  calificados por debajo del cual el catálogo queda `muestra_insuficiente`.
  `[P-03]` `[§15 resp. 5]`
- **AC-6 (condición manual en la cohorte real)** · Dada la cohorte real, cuando se
  registre el protocolo, entonces define que la condición manual se mide sobre casos
  reales distintos de los usados con OncoLens y que el orden de las condiciones se
  contrabalancea entre participantes. `[§15 resp. 6]` `[R-15]`

## Contexto técnico
Historia de decisión: el registro es un documento con dueño y fecha. La mecánica (casos
estandarizados, cronometraje, cálculo de medianas) es de US-075 (S1) y de FEAT-T5d (S6);
el formulario de feedback es de FEAT-T5c (S4).

## INVEST
**Small** ✓ una o dos sesiones de acuerdo y un documento.
**Testable** ✓ los AC verifican la presencia de cada definición, la marca de congelación y el umbral en el documento.

---

## US-009 · DEC-03 — [Pre-S1] Estimación de capacidad de los Sprints 1–4 con el alcance v1.2

> Linear: [L1D-52](https://linear.app/l1der-lab-mjbc/issue/L1D-52)

`FEAT-00` · Pre-S1 · Estimación **1** · — (decisión) · TBD-19, SUP-1, R-25 · Dueño: Ingeniería · ↪ backlog estimado de F3 (insumo) · 🔗 Bloquea: planificación de S1–S4 y activación de los puntos de recorte

## Story
Como Ingeniería, quiero estimar los Sprints 1–4 sobre el backlog v1.2, para confirmar
si el alcance cabe en 6 sprints o activar el orden de recorte acordado antes de empezar.

> Escenario más probable (a refinar en sprint planning): el S1 de este backlog suma ~190 puntos (ver `README.md`), lo que con toda probabilidad excede un sprint; Ingeniería confirma el slicing "por hipótesis" y repliega al S2 lo que no está en el camino del walking skeleton (p. ej., parte de FEAT-T5a o de FEAT-T4a), y deja el orden de recorte de PRD §14 (CAP-07 a Post-MVP; luego conflictos de CAP-03) como contingencia preaprobada, porque es el mecanismo que el PRD ya define para SUP-1.

## AC (Given/When/Then)
- **AC-1** · Dado el backlog de F3, cuando se registre la estimación en
  `docs/decisions/DEC-03-capacidad.md`, entonces lista puntos por sprint, la capacidad
  supuesta y el veredicto (cabe / no cabe), con fecha y dueño. `[TBD-19]`
- **AC-2** · Dado un veredicto "no cabe", cuando se registre, entonces nombra qué punto
  de recorte se activa y en qué orden, sin recortes fuera de los acordados ni de la
  directriz de recorrido principal. `[PRD §14]`
- **AC-3** · Dadas historias en `?`, cuando se estimen, entonces se registran como rango
  y se re-estiman al cerrar su ADR o DEC. (asumido)
- **AC-4** · Dado el veredicto, cuando se registre, entonces declara qué historias del
  S1 se replegarían al S2 si la capacidad del S1 es menor que sus puntos, sin mover
  ninguna historia dueña de RN-01, RN-06, RN-10…RN-14 o RN-23 fuera del S1. `[RN-01]` `[RN-06]` (asumido)

## Contexto técnico
El insumo es este backlog (lotes 1–4 de F3). La DEC se cierra cuando el último lote
publique sus puntos; mientras tanto se trabaja con el escenario más probable.

## INVEST
**Small** ✓ una sesión de estimación sobre un backlog ya escrito.
**Testable** ✓ el documento contiene la tabla de puntos, el veredicto y, si aplica, el recorte nombrado.

---

## US-010 · DEC-04 — [Pre-S1] Términos de uso de LOINC, CUPS y ATC para versionar subconjuntos en el repo público

> Linear: [L1D-53](https://linear.app/l1der-lab-mjbc/issue/L1D-53)

`FEAT-00` · Pre-S1 (adelantada desde "antes del S2" por Q-07) · Estimación **1** · — (decisión) · TBD-17, SUP-5, Q-07 · Dueño: área legal + Ingeniería · 🔗 Bloquea: US-042 (códigos distintos de CIE-10 en el catálogo), US-039 (seed con esos códigos), FEAT-03a (S2), DEC-17 · Workaround: solo CIE-10 hasta cerrar (Q-07)

## Story
Como responsable técnico, junto con el área legal, quiero confirmar si los términos de
uso de LOINC, CUPS y ATC permiten versionar subconjuntos en un repositorio público, para
decidir desde el S1 si el catálogo vive en el repo o se monta como configuración local.

> Escenario más probable (a refinar en sprint planning): se cumple SUP-5 —los términos permiten versionar los subconjuntos con el aviso que exija cada estándar—, porque es el supuesto escrito en PRD §18.6; si un estándar no lo permite, solo ese subconjunto se monta como configuración local fuera del repo (Q-07).

## AC (Given/When/Then)
- **AC-1** · Dado cada estándar (LOINC, CUPS, ATC), cuando se registre la decisión en
  `docs/decisions/DEC-04-terminos-estandares.md`, entonces el documento cita la fuente de
  los términos consultados, la conclusión (permitido / permitido con aviso / no
  permitido) y el aviso requerido, con fecha y firma del área legal. `[TBD-17]`
- **AC-2** · Dado un estándar "no permitido", cuando se registre, entonces el documento
  indica que su subconjunto se distribuye fuera del repo como configuración local y que
  el escaneo de CI debe impedir versionarlo. `[SUP-5]` `[Q-07]` (asumido)
- **AC-3** · Dada la decisión, cuando se cierre, entonces CIE-10 queda confirmado como el
  código disponible desde el S1. `[Q-07]` (asumido)
- **AC-4** · Dada la conclusión por estándar, cuando se cierre, entonces el documento
  lista los valores que deben quedar en la lista de estándares permitidos que consume el
  validador del catálogo (US-042). `[Q-07]` (asumido)

## Contexto técnico
Mientras no cierre, el catálogo v1 y el seed del S1 usan **solo CIE-10** o códigos con
permiso confirmado; el resto de términos queda como término canónico con
`mapping_status = no_mapeado` (RN-27). El control que impide versionar un estándar no
permitido lo implementa US-042.

## INVEST
**Small** ✓ una consulta legal por estándar y un documento.
**Testable** ✓ el documento contiene conclusión, aviso y firma por estándar, y la lista para el validador.

---

## US-011 · DEC-05 — [Pre-S1] Destino de TNM y Gleason/ISUP en próstata

> Linear: [L1D-54](https://linear.app/l1der-lab-mjbc/issue/L1D-54)

`FEAT-00` · Pre-S1 · Estimación **1** · — (decisión) · RN-29, Q-04, C-11 · Dueño: oncólogo asesor (valida) + Ingeniería (prepara) · 🔗 Bloquea: US-033 (AC-5), US-038 (migración inicial), US-039 (seed de próstata), FEAT-04 US-001 (ítem ISUP), DEC-01 (Q5), DEC-11

## Story
Como oncólogo asesor, quiero validar dónde se registran el TNM y el Gleason/grupo ISUP
en próstata, para que la migración inicial tenga destino para ambos datos críticos sin
cambiar el modelo genérico de diagnóstico.

> Escenario más probable (a refinar en sprint planning): exactamente la decisión Q-04 del usuario —TNM en `staging_system`/`stage_value` para ambos tipos de cáncer y Gleason/ISUP en `Diagnosis.grade`, sin cambio de esquema—, porque así quedó resuelto C-11 en `01-requisitos.md` §14.

## AC (Given/When/Then)
- **AC-1** · Dada la propuesta Q-04, cuando el oncólogo la valide, entonces
  `docs/decisions/DEC-05-tnm-isup.md` registra el destino de cada ítem (TNM →
  `staging_system`/`stage_value`; Gleason/ISUP → `Diagnosis.grade`), con firma y fecha.
  `[Q-04]` `[RN-29]`
- **AC-2** · Dado que el readme §3.2 menciona "grupo ISUP" en `stage_value`, cuando se
  registre, entonces el documento lo señala como texto a corregir en el readme (C-11). (asumido)
- **AC-3** · Dado un rechazo del oncólogo, cuando se registre, entonces el documento lo
  escala a Ingeniería antes de la migración inicial (US-038), sin diferirlo al S3. `[Q-04]` (asumido)
- **AC-4** · Dada la decisión, cuando se cierre, entonces el documento indica el formato
  del valor en `grade` para próstata (p. ej., "Gleason 4+3 · ISUP 3") para que el seed y
  la extracción del S2 lo escriban igual. (asumido)

## Contexto técnico
Sin cambio de esquema (#21: modelo de diagnóstico genérico). La mecánica (migración,
seed, matriz ítem → campo) vive en US-033, US-038, US-039 y FEAT-04 US-001.

## INVEST
**Small** ✓ una validación puntual con el oncólogo.
**Testable** ✓ el documento contiene destino por ítem, formato y firma.

---

## US-033 — [Pre-S1] El contrato `EvidenceAnalysis` y el esquema de datos quedan congelados y verificables

> Linear: [L1D-55](https://linear.app/l1der-lab-mjbc/issue/L1D-55)

`FEAT-00` · Pre-S1 · Estimación **5** · — (técnica, PRD §17) · FR-09, FR-25 (contrato), FR-27 (esquema `AnalysisBasis`), NFR-13 · AC-05.3 (contrato), AC-T2.1 (esquema) · ⛔ DEC-05 · escenario más probable (AC-5) · ⛔ Bloqueada por: ADR-39 (solo AC-6) · 🔗 Consumida por: US-038, US-041, US-043 (AC-9), US-052, US-053, US-055, US-058, US-061, US-066, US-110, US-111 (AC-10)

## Story
Como equipo de desarrollo, quiero congelar antes del Sprint 1 el contrato
`EvidenceAnalysis` de ambos backends y el esquema de datos completo, para que el walking
skeleton se construya sobre la forma final y no haya cambios de contrato ni migraciones
de datos en los sprints siguientes.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `apps/clinical-api/openapi.yaml` y
  `apps/rag-orchestrator/openapi.yaml` transcritos de readme §4.1 y §4.2, cuando se
  ejecuta `npm run contracts:check`, entonces ambos validan sin errores contra OpenAPI
  3.1 y `EvidenceAnalysis` declara `status` (`con_evidencia | sin_evidencia |
  tipo_no_habilitado`), `synthesis`, `applicability`, `evidenceOptions`,
  `discardedOptions`, `analysisBasis`, `topRelevanceScore` (nullable) y `disclaimer`.
  `[readme §4.1]` `[ADR-26]`
- **AC-2 (borde · vocabulario v1.0)** · Dados los dos specs, cuando el mismo comando los
  recorre, entonces no existe la ruta `/platform/rag/query` ni ninguna propiedad
  `recommendations`, y el comando termina con código ≠ 0 si alguien las agrega.
  `[D-01]` `[ADR-26]`
- **AC-3 (borde · contrato del S1 con bloques vacíos)** · Dados los ejemplos
  `contracts/examples/con-evidencia-s1.json` (1 opción, `synthesis` con `agreements` y
  `discrepancies` vacíos, `applicability = []`), `sin-evidencia.json`
  (`evidenceOptions = []`, `topRelevanceScore = null`, `analysisBasis` presente) y
  `tipo-no-habilitado.json`, y el ejemplo del S4 de readme §4.1, cuando se validan contra
  el schema, entonces los cuatro pasan sin cambiar el contrato. `[ADR-26]` `[FR-25]` `[RN-02]` `[AC-05.3]`
- **AC-4 (borde · esquema `AnalysisBasis` final)** · Dado el schema `AnalysisBasis`,
  cuando se inspecciona, entonces contiene los campos de los incisos (a) a (i)
  (`patientDataUsed`, `missingCriticalData`, `continuedWithWarning`, `assumptions`,
  `sourcesConsulted`, `sourcesNotIncluded`, `corpusCutoffDate`, `limitations`,
  `priorAnalysesUsed`, `agentSteps`) y `omittedClaims`, aunque varios se llenen desde el
  S3 o el S4. `[FR-27]` `[AC-T2.1]`
- **AC-5 (DEC-05)** · Dado `docs/architecture/data-model.md` congelado a partir de readme
  §3.1, cuando se revisa la entidad `Diagnosis`, entonces declara `staging_system`,
  `stage_value`, `histology`, `histology_code` y `grade`, y documenta que en próstata el
  TNM va a `staging_system`/`stage_value` y el Gleason/ISUP a `grade`.
  `[Q-04]` `[ADR-21]` · ⛔ DEC-05 · escenario más probable
- **AC-6 (Milvus)** · Dado el esquema de la colección `corpus_chunks` en el mismo
  documento, cuando se congela, entonces declara `dense_vector` (dimensión tomada de
  `EMBEDDING_DIM`), `sparse_vector` y los campos denormalizados `source_type`,
  `language`, `cancer_type_tags`, `population`, `study_design`, `published_year` e
  `is_current`. `[readme §3.1]` `[ADR-10]` · ⛔ Bloqueada por: ADR-39 (valor de la
  dimensión y origen del vector sparse)
- **AC-7 (borde · evento derivado, C-06)** · Dado el spec de `clinical-api`, cuando se
  revisa `POST /platform/evidence-analyses`, entonces su descripción dice que el análisis
  aparece en el timeline como **evento derivado** y no menciona escribir un evento
  `analisis_ia`. `[AC-11.4]`
- **AC-8 (borde · esquemas compartidos)** · Dado `packages/api-contracts` generado desde
  ambos specs, cuando se comparan `EvidenceOption`, `DiscardedOption`, `Synthesis` y
  `SourceApplicability` de §4.1 y §4.2, entonces son estructuralmente idénticos (un solo
  origen referenciado, no copias divergentes). `[readme §4.2]` `[NFR-13]`
- **AC-9 (borde · tipo no habilitado en Backend 2)** · Dado
  `apps/rag-orchestrator/openapi.yaml`, cuando el script revisa `POST /rag/query`,
  entonces declara la respuesta `422` con `error = "TIPO_NO_HABILITADO"` y el enum de
  `RagQueryInternalResponse.status` sigue siendo `con_evidencia | sin_evidencia`.
  `[§15 resp. 3]` `[RN-20]` `[readme §4.2]`
- **AC-10 (borde · registro manual)** · Dado `apps/clinical-api/openapi.yaml`, cuando el
  script lo revisa, entonces declara `POST /platform/patients/{id}/biomarkers`
  (`201 Biomarker`; crea un `Exam` con `entry_method = manual`) y
  `POST /platform/patients/{id}/diagnoses` (`201 Diagnosis`; con diagnóstico vigente crea
  uno `manual_correction` y el anterior pasa a `reemplazado`), con los cuerpos de
  US-110. `[§15 resp. 4]` `[Q-03]` `[ADR-33]`

## Contexto técnico
Entregables: los dos OpenAPI (fuente de verdad del contrato), cuatro ejemplos JSON en
`contracts/examples/`, `docs/architecture/data-model.md` (DDL de readme §3.1 con DEC-05
aplicada y la colección de Milvus) y el script `contracts:check` (lint OpenAPI +
validación de ejemplos con un validador JSON Schema + búsqueda de vocabulario v1.0). Se
ejecuta en local en el Pre-S1; US-036 lo integra en la CI desde el S1. La implementación
Prisma y la migración son de US-038; la del catálogo `corpus` y Milvus, de US-058.

Todos los AC se verifican con el script (tests unitarios sobre los specs y ejemplos),
salvo AC-5 y AC-6, que se verifican por revisión del documento de modelo de datos.

## Non-goals
No implementar endpoints ni migraciones. No decidir modelos (ADR-39). No agregar campos
fuera de readme §4.1/§4.2, salvo lo que decidió el usuario el 2026-10-07 (`422` de
Backend 2 y registro manual: §15 resp. 3 y 4), que se incorpora al readme como vacío
resuelto; cualquier otro faltante (p. ej., página en `Provenance`, V-11) se anota como
vacío para su Feature, no se improvisa aquí.

## INVEST
**Small** ✓ transcripción de specs existentes, cuatro ejemplos y un script de verificación.
**Testable** ✓ AC-1 a AC-4 y AC-7 a AC-10 son aserciones automatizadas del script; AC-5 y AC-6, revisión del documento.
*(Diez AC: todos verifican el mismo entregable con el mismo script o la misma revisión; no es señal de dividir. La estimación de 5 se mantiene.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-06 | readme §4.1 `POST /platform/evidence-analyses`: "persiste `AIAnalysisRecord` y el evento `analisis_ia` antes de responder" | PRD AC-11.4 y readme OL-03: el análisis es un evento **derivado**, no se escribe `ClinicalEvent` | PRD (US-033 AC-7) |
| C-11 | readme §3.2 `Diagnosis`: `stage_value` cubre "grupo ISUP (próstata)" | PRD FR-23 / §18.3.4: TNM **y** Gleason/ISUP en próstata; RN-29 exige un destino por ítem | PRD, con la decisión Q-04 registrada en DEC-05 (US-011, US-033 AC-5) |
| C-16 | CLAUDE.md: ADR-36 "pendiente" | readme §3.3 #36 ✅ (licencias decididas; PubMed pendiente) | readme: el ADR-36 solo decide la lista de fuentes y PubMed (US-007) |
| C-21 | PRD TBD-17: verificar términos "antes del S2" | readme §5.0 S1 y OL-01: catálogo y seed con CIE-10, LOINC y ATC desde el S1 | PRD, con la decisión Q-07: DEC-04 se adelanta a Pre-S1 y el S1 usa solo CIE-10 hasta cerrarla (US-010) |
| S-01 | PRD §14 / readme §5.0: slicing por sprints original | Slicing "por hipótesis" adoptado por el usuario (01-requisitos §15) | Slicing adoptado; esta Feature no cambia de sprint (Pre-S1 en ambos). La ubicación de ADR-39 en FEAT-06a no contradice ninguna fuente (S1 en ambas) |
