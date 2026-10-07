# Historias de ADR y de decisión · PRD v1.2

> **Fase F2 (`architecture-advisor`) · corrida completa · 2026-10-05.**
> Fuentes leídas del disco, por prioridad ante conflicto: `docs/PRD.md` v1.2 > `readme.md` > `CLAUDE.md`. Inventario de entrada: `backlog/01-requisitos.md` §7.5, §8, §9, §10, §11 y **§14 (decisiones Q-01…Q-08, vinculantes, no se reabren)**. `backlog/_piloto-v1/` no se leyó.
> Encuadre D-01: análisis de evidencia, nunca recomendación. Ninguna opción de este documento reintroduce recomendaciones, puntaje clínico para ordenar opciones (RN-28) ni streaming de contenido sin validar.
> **Convenciones.** Numeración ADR única, la del readme §3.3: se reutilizan los números pendientes o parciales (ADR-7, ADR-36) y las nuevas empiezan en **ADR-39**, en orden de creación. Historias de decisión `DEC-<nn>` desde DEC-02 (DEC-01 ya existe en FEAT-04). Cada historia lleva un `US-0NN` **provisional** (US-007…US-032, a continuación de los IDs del piloto US-001…US-006); F3 puede renumerar mientras nada esté publicado en Linear. Las historias que este documento bloquea aún no existen: se nombran por **Feature + descripción** (Features de `01-requisitos.md` §9).
> **Directiva del usuario (2026-10-05), vinculante para este documento:** el MVP valida una hipótesis — que la IA ayuda al oncólogo a **(1) reconstruir el caso**, **(2) identificar los datos faltantes** y **(3) encontrar las opciones descritas en la evidencia más aplicables a las condiciones del paciente** (ordenadas por aplicabilidad, RN-28). Cada historia lleva `Recorrido principal: sí | no`; si es "no", un `Workaround para el MVP` concreto, y la decisión se difiere (sprint tardío o Post-MVP), **salvo que bloquee una invariante de seguridad** (RN-10, RN-11, RN-12, RN-13, RN-14, ownership de `rag-orchestrator`), que no se negocia. **Respuesta del usuario (2026-10-05):** la hipótesis se valida con una **combinación** de casos sintéticos revisados por oncólogos (S1–S4: validan la **mecánica**) y pruebas mixtas con casos reales (desde G-Piloto: validan el **valor**, VM-1…VM-6). Por eso el gate G-Piloto (RN-13) y sus prerrequisitos —`preflight real-data`, VPN + HTTPS, backups cifrados, regla de proveedores solo locales (RN-12), `403` por opt-out de `analisis_ia` (RN-15), autorización por paciente, revisión de seguridad— están en el **recorrido principal**, y las decisiones legales que condicionan los datos reales (TBD-21, TBD-07, TBD-16, TBD-17) son necesarias antes de G-Piloto; su UI de gestión admite workaround (CLI/seed) siempre que no debilite el control. El slicing del readme §5.0 es una sugerencia que se va a re-proponer: los sprints de este documento son el **más temprano necesario** para no bloquear el recorrido, no un compromiso de slicing.
> **Regla de bloqueo:** toda historia bloqueada por un ADR o una DEC se estima **`?`** hasta que ese ADR o DEC cierre. Las historias que trabajan contra interfaces (*Adapter*, contrato, catálogo en estado `propuesta`) con implementaciones falsas **no** quedan bloqueadas; solo las que dependen del valor decidido.

---

## 1. Resumen

### 1.1 Conteos

| Tipo | Cantidad | Puntos | Detalle |
|---|---|---|---|
| **ADR** (historia de ADR) | **8** | 24 en el MVP (ADR-43 condicional) + 3 Post-MVP + `?` | MVP: ADR-36, ADR-39, ADR-40, ADR-41, ADR-42, ADR-43 (condicional) · Post-MVP: ADR-44 · Futuro: ADR-7 |
| **DEC** (historia de decisión) | **18 nuevas** (DEC-02…DEC-19) + DEC-01 existente | 18 (1 c/u) | 4 Pre-S1 · 4 S1 · 1 S3 · 2 S4 (DEC-13 con su Feature) · 7 S5 antes de G-Piloto |
| **CAL** (calibración en configuración, RN-22) | **5 TBD** (TBD-03, 14, 15, 18, 20) + la parte CAL de TBD-02 y TBD-07 | — (dentro de la historia de la Feature) | Ver §4.1; TBD-03 es **crítica** (recorrido) |
| **EXC** (exclusión justificada) | **2 TBD** (TBD-05, TBD-09) | — | Ver §4.2 |
| **Recorrido principal = sí** | **23** (ADR-36, 39, 40, 41, 43 condicional · DEC-01, 02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 14, 15, 16, 17, 18, 19 · CAL TBD-03) | — | Incluye el gate G-Piloto (casos reales). Más la historia técnica de FEAT-00 que congela contrato `EvidenceAnalysis` y esquema (§4.4) |
| **Críticas** | **8 + 1 técnica** | — | ADR-39, ADR-40 (invariante), DEC-01, DEC-02, DEC-05, DEC-11, CAL TBD-03 (relevancia/OCR) · historia FEAT-00 de contrato y esquema (F3) |
| **Fuera del recorrido (con workaround)** | **4** + ADR-7 | — | ADR-42 (→ S4), ADR-44 (→ Post-MVP), DEC-10 (→ S5 como criterio del gate), DEC-13 (→ con FEAT-T4b). Ver §4.6 |

### 1.2 Tabla resumen de historias

| US (prov.) | ID | Tema | Origen | Tipo | Dueño | Sprint | Est. | Recorrido | Bloquea (Feature) | Criticidad |
|---|---|---|---|---|---|---|---|---|---|---|
| US-007 | ADR-36 | [Pre-S1] Fuentes y licencias del corpus | TBD-04 · readme §3.3 #30, #36 (parciales) | ADR | Ingeniería + área legal | Pre-S1 (cierre ≤ S1) | 3 | sí (3) | FEAT-06c (ingesta, `CorpusRelease`), FEAT-09 | Alta |
| US-008 | DEC-02 | [Pre-S1] Protocolo y metas de VM-1…VM-6 (dos cohortes: sintética y real) | TBD-11 · G-15 · R-15 | DEC producto | Usuario (PO) + oncólogos asesores | Pre-S1 | 1 | sí (mide 1, 2, 3) | FEAT-T5a, FEAT-T5c, FEAT-T5d, DEC-14 | **Crítica** |
| US-009 | DEC-03 | [Pre-S1] Estimación de capacidad S1–S4 | TBD-19 · SUP-1 | DEC capacidad | Ingeniería | Pre-S1 | 1 | sí (dimensiona) | Planificación; puntos de recorte | Alta |
| US-010 | DEC-04 | [Pre-S1] Términos de uso de LOINC, CUPS y ATC | TBD-17 · SUP-5 · Q-07 | DEC legal | Área legal + Ingeniería | Pre-S1 (Q-07) | 1 | sí (gate; workaround Q-07) | FEAT-PL3, FEAT-PL2, FEAT-03a | Media |
| US-011 | DEC-05 | [Pre-S1] Destino de TNM y Gleason/ISUP en próstata | Q-04 · C-11 · RN-29 | DEC clínica | Oncólogo asesor (+ Ingeniería) | Pre-S1 | 1 | sí (1, 2, 3) | FEAT-PL2, FEAT-04 US-001, DEC-11 | **Crítica** |
| US-012 | ADR-39 | Modelos locales y runtime | TBD-01 · readme §1.4 🚧 | ADR | Ingeniería | S1 (inicio; fase A en Pre-S1 si se acepta P-01) | 8 | sí (1, 2, 3) | FEAT-06a, FEAT-06c, FEAT-T5a, FEAT-PL1, FEAT-01b, ADR-41 | **Crítica** |
| US-013 | ADR-40 | Detección y enmascaramiento de PII | readme §2.5, OL-03, OL-05 · G-8 · RN-11 | ADR | Ingeniería | S1 | 5 | sí (invariante RN-10/11) | FEAT-06a, FEAT-T4a, FEAT-01b, FEAT-11c | **Crítica** (no se negocia) |
| US-014 | ADR-41 | Framework y protocolo de evaluación de IA | V-07 · readme OL-06 | ADR | Ingeniería | S1 | 3 | sí (mide) | FEAT-T5a, FEAT-T5b | Alta |
| US-015 | ADR-42 | Streaming de eventos de progreso | TBD-08 · readme §6.1 #8 🚧 | ADR | Ingeniería | **S4** (diferida; S1 solo registra el p95) | 3 | no | FEAT-10c, FEAT-07, FEAT-08b/08c (G-5) | Baja |
| US-016 | DEC-06 | Revisión clínica del dataset de evaluación | readme OL-06 AC | DEC clínica | Oncólogo asesor | S1 | 1 | sí (mide) | FEAT-T5a | Alta |
| US-017 | DEC-07 | Metas definitivas de evaluación técnica | TBD-02 | DEC producto | Usuario (PO) + Ingeniería | S1 (cierre) | 1 | sí | FEAT-T5a/T5b | Alta |
| US-018 | DEC-08 | Umbrales de tendencia por biomarcador | TBD-13 (tendencias) | DEC clínica | Oncólogo asesor | S1 (antes de la vista de caso) | 1 | sí (1) | FEAT-02b | Alta |
| US-019 | DEC-09 | Semáforo y vigencia de diagnósticos | TBD-06 · readme #12 ⚠️ | DEC clínica | Oncólogo asesor | S1 (antes de la extracción) | 1 | sí (1) | FEAT-01b, FEAT-03a, FEAT-03b | Alta |
| — | DEC-01 (existe) | Catálogo de datos críticos | TBD-12 · M-04.3 | DEC clínica | Oncólogo asesor | S3 (ver P-03) | 2 → **1** | sí (2) | FEAT-04 | **Crítica** |
| US-021 | DEC-11 | Criterios de aplicabilidad, excluyentes y "Parcial" | TBD-13 (aplicabilidad) | DEC clínica | Oncólogo asesor | S3 (antes de aplicabilidad; ver P-03) | 1 | sí (3) | FEAT-08b, FEAT-10c, FEAT-08c, FEAT-T5b | **Crítica** |
| US-024 | DEC-14 | Revisión de la muestra de aplicabilidad (VM-3) | M-08.1 · VM-3 | DEC clínica | Oncólogo asesor | S4 (o al cerrar aplicabilidad) | 1 | sí (mide 3) | G-Demo, FEAT-T5d | Alta |
| US-023 | DEC-13 | Motivos de egreso | TBD-06 (motivos) | DEC clínica | Oncólogo asesor | Con FEAT-T4b (hoy S4); Post-MVP si se difiere | 1 | no | FEAT-T4b | Baja |
| US-020 | DEC-10 | Plantillas de preguntas validadas | M-05.1 · FR-28 | DEC clínica | Oncólogo asesor | S5 (criterio del gate; el PO lo retira si FEAT-05 se difiere) | 1 | no | FEAT-05, G-Piloto | Baja |
| US-022 | DEC-12 | Canal de opt-out | TBD-21 | DEC entidad médica | Entidad médica + admin | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4b, FEAT-T4c, FEAT-T4d | Alta (gate) |
| US-025 | DEC-15 | Validación legal del job de retención | TBD-16 · PREG-2 | DEC legal | Área legal | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4d | Alta (gate) |
| US-026 | DEC-16 | Alcance de "generación con IA" bajo opt-out | V-15 · RN-15 | DEC producto/legal | Usuario (PO) + área legal | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4c | Alta (gate) |
| US-029 | DEC-17 | Mapeos terminológicos firmados | G-Piloto · RN-27 | DEC clínica | Oncólogo asesor | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4d | Alta (gate) |
| US-030 | DEC-18 | Edad de mayoría | TBD-07 | DEC legal | Área legal + entidad médica | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4d | Alta (gate) |
| US-031 | DEC-19 | Criterio de "listo" por tipo | RN-20 · #22 · V-16 | DEC clínica/producto | Oncólogo + usuario (PO) | S5 (antes de G-Piloto) | 1 | sí (gate) | FEAT-T4d, FEAT-PL3 | Alta (gate) |
| US-027 | ADR-43 | Corpus en base de datos separada | TBD-10 · #17 | ADR | Ingeniería | S5 (condicional a la revisión de seguridad) | 2 | sí, condicional (gate) | FEAT-T4d | Media |
| US-028 | ADR-44 | Prometheus, Grafana y OpenTelemetry | V-08 · readme §2.7 🚧 | ADR | Ingeniería | Post-MVP | 3 | no | FEAT-PL5 | Baja |
| US-032 | ADR-7 | Scoring de solidez clínica | TBD-09 · #7 🚧 · CAP-17 | ADR (futuro) | Ingeniería + oncólogo | Futuro | `?` | no | — | Baja |

Los `US-0NN` provisionales se asignaron en la primera versión de este documento por orden de sprint; tras aplicar la directiva, F3 puede renumerar (nada está publicado).

### 1.3 Tabla TBD → historia

| TBD | Tema | Resultado | Historia o configuración | Sprint |
|---|---|---|---|---|
| TBD-01 | Modelos y runtime | **ADR** · **crítica** | ADR-39 | S1 (inicio) |
| TBD-02 | Metas definitivas de evaluación | **DEC** + CAL | DEC-07 (metas) · umbrales de regresión en configuración de la suite (FEAT-T5a) | S1 (cierre) |
| TBD-03 | Umbrales de OCR y de relevancia | **CAL · crítica** (recorrido) | Historia de calibración de relevancia en FEAT-06a/FEAT-T5a (S1); de confianza OCR en FEAT-01b (S2) | S1 · S2 |
| TBD-04 | Fuentes y licencias | **ADR** | ADR-36 | Pre-S1 (cierre ≤ S1) |
| TBD-05 | Subtipos de leucemia | **EXC** | Post-piloto (PRD §14), RN-20 | — |
| TBD-06 | Motivos de egreso y reglas clínicas | **DEC** ×2 | DEC-09 (semáforo, vigencia de diagnósticos) · DEC-13 (motivos de egreso, diferida) | S1 · con FEAT-T4b |
| TBD-07 | Edad de mayoría | **DEC** + CAL | DEC-18 · valor en configuración del job (FEAT-T4d) | S5 (antes de G-Piloto) |
| TBD-08 | Streaming de progreso | **ADR** | ADR-42 (diferida) | S4 |
| TBD-09 | Scoring de solidez clínica | **EXC** del MVP + ADR futuro | ADR-7 (Futuro, CAP-17) | — |
| TBD-10 | Catálogo del corpus en base separada | **ADR** | ADR-43 (condicional a la revisión de seguridad) | S5 |
| TBD-11 | Protocolo de VM | **DEC** · **crítica** | DEC-02 | Pre-S1 |
| TBD-12 | Catálogo de datos críticos | **DEC** (existe) · **crítica** | DEC-01 | S3 |
| TBD-13 | Aplicabilidad y tendencias | **DEC** ×2 | DEC-08 (tendencias) · DEC-11 (aplicabilidad, **crítica**) | S1 · S3 |
| TBD-14 | N de memoria | **CAL** | `ANALYSIS_MEMORY_MAX` en FEAT-11c | S4 |
| TBD-15 | N años de antigüedad | **CAL** | `EVIDENCE_STALE_YEARS` en FEAT-09 (con confirmación del oncólogo en el AC) | S3 |
| TBD-16 | Validación legal del job de retención | **DEC** | DEC-15 | S5 (antes de G-Piloto) |
| TBD-17 | Términos de uso de estándares | **DEC** | DEC-04 (adelantada a Pre-S1 por Q-07) | Pre-S1 |
| TBD-18 | Límites del agente | **CAL** | `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`, *deadline* en FEAT-08c | S4 |
| TBD-19 | Estimación de capacidad | **DEC** | DEC-03 | Pre-S1 |
| TBD-20 | Muestra humana de metadatos del corpus | **CAL** | Porcentaje de muestra por lote en configuración de la ingesta (FEAT-06c) | S3 |
| TBD-21 | Canal de opt-out | **DEC** | DEC-12 | S5 (antes de G-Piloto) |

**21/21 TBD resueltos en historia o exclusión.** Verificado con `grep -oE 'TBD-[0-9]+' docs/PRD.md | sort -u` → TBD-01…TBD-21.

### 1.4 Tabla 🚧 / pendiente / parcial → ADR

| Origen | Estado en la fuente | Historia |
|---|---|---|
| readme §3.3 #7 Scoring de evidencia clínica | 🚧 pendiente de ADR | **ADR-7** (Futuro) |
| readme §6.1 #4 `relevanceScore` | ✅ + 🚧 ADR de scoring | **ADR-7** (misma decisión) |
| readme §3.3 #30 Fuentes del corpus | ✅ parcial ("el ADR de fuentes se hace en el S1") | **ADR-36** (misma decisión que TBD-04; un solo documento) |
| readme §3.3 #36 Licencias del corpus | ✅ parcial (PubMed sin licencia pendiente) | **ADR-36** |
| readme §1.4 y §6.1 última fila — Modelos locales | 🚧 ADR al inicio del S1 | **ADR-39** |
| readme §2.1 y §6.1 #8 Streaming | ✅ + 🚧 ADR de streaming de progreso tras medir KR2 | **ADR-42** |
| readme §2.7 Prometheus + Grafana + OpenTelemetry | 🚧 ADR futuro | **ADR-44** |
| readme OL-06 tarea 3 — ADR de evaluación (framework, p. ej. `ragas`) | pendiente, sin ID (V-07) | **ADR-41** |
| readme §3.3 #12 y §6.1 #10 Diagnóstico extraído vs vigente | ✅ ⚠️ "reglas a validar con el oncólogo" | **No es ADR:** la decisión técnica está tomada; lo pendiente es clínico → **DEC-09** |
| readme §3.3 #17 (base separada como endurecimiento opcional) | ✅ con opción abierta (TBD-10) | **ADR-43** |
| readme §2.5 / OL-05 tarea 12 — motor del detector de PII | sin ID; OL-05 lo remite al ADR de modelos | **ADR-40** (separado de ADR-39, ver §4.3 H-02) |

---

## 2. Historias de ADR

Orden por sprint. Todas producen un documento en `docs/architecture/adr/` con contexto, opciones (elegida y descartadas), criterios y consecuencias. **Ninguna implementa**: si hace falta un *spike* para medir, es parte de sus AC.

Restricciones duras comunes a las ADR de IA (readme §1.4, PRD §7, §12): memoria total del stack ≤ 24 GB (≥ 8 GB libres para macOS); `/platform/evidence-analyses` p95 ≤ 15 s (se recalibra en el S4, G-5); extracción p95 ≤ 60 s por documento; JSON válido ≥ 99 %; licencia compatible con uso académico; buen desempeño en español; uso real de la GPU (Metal) fuera de Docker; datos reales solo con modelos locales, sin *fallback* a la nube (RN-12). Todo valor que se fije vive en configuración (RN-22).

---

### US-007 · ADR-36 — [Pre-S1] Fuentes y licencias del corpus científico

**Tipo:** ADR · **Feature:** FEAT-00 · **Sprint:** Pre-S1 (no bloqueante; cierre a más tardar en el S1) · **Estimación:** 3
**Origen:** TBD-04 · readme §3.3 #30 y #36 (parciales) · PREG-1 · **Dueño:** Ingeniería + área legal
**Recorrido principal:** sí — sin corpus con licencia no hay opciones descritas en la evidencia que ordenar (hipótesis 3)
**Evidencia:** [→ PRD §16 TBD-04], [→ PRD §5 FR-19], [→ PRD §6 RN-21], [→ readme §3.3 #30, #36], [→ PRD §0.1 D-09], [→ PRD §18.6 SUP-3, PREG-1], [→ PRD §14 Pre-S1]
**⛔ Bloquea:** FEAT-06c · ingesta reanudable del S3 y `CorpusRelease` con `excluded_sources` (KR3: ≥ 20 documentos por tipo) · FEAT-09 · etiqueta de fuente y vigencia por tipo de fuente · DEC-19 (criterio "corpus con licencia"). **No bloquea** la semilla del S1 (FEAT-06c S1), que se limita a documentos con licencia aceptada verificada uno a uno (asumido).
**⛔ Bloqueada por:** — (las licencias aceptadas ya están decididas en #36; solo falta la lista y PubMed).

#### Story
Como responsable técnico, quiero fijar la lista final de fuentes públicas abiertas del corpus y la regla para los resúmenes de PubMed sin licencia explícita, para que la ingesta del S3 cumpla RN-21 sin rehacer el catálogo del corpus ni reindexar documentos que después resulten inadmisibles.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la lista candidata de FR-19 (NCI PDQ, ClinicalTrials.gov, subconjunto de acceso abierto de PubMed/PMC, guías de práctica clínica públicas, publicaciones de TCGA/GDC, cBioPortal y TCIA), cuando se cierre el ADR, entonces `docs/architecture/adr/ADR-36-fuentes-y-licencias.md` registra por fuente: licencia o licencias observadas, `license_class` resultante (dominio público, CC BY, CC BY-SA, CC BY-NC marcada), si publica metadatos de población estructurados, idiomas y decisión (incluida / excluida, con motivo). `[FR-19]` `[RN-21]` `[readme §3.3 #36]`
- **AC-2 (borde · PubMed sin licencia)** · Dado un resumen de PubMed sin licencia explícita de reutilización, cuando se decida su tratamiento, entonces el ADR elige una de las opciones de la tabla y deja la regla en forma verificable por la ingesta (rechazo, o metadatos sin texto), coherente con la exclusión de "libre lectura sin licencia" de #36. `[TBD-04]` `[readme §3.3 #36]`
- **AC-3 (borde · NCCN y ESMO)** · Dadas NCCN y ESMO, cuando se cierre el ADR, entonces quedan como "no incluidas" en `CorpusRelease.excluded_sources`, sin texto ni ejemplos en el repo, y el ADR registra si la gestión de su licencia se abre para el MVP o para una versión futura; ninguna de las dos opciones bloquea el MVP. `[D-09]` `[readme §3.3 #30]` `[PREG-1]`
- **AC-4 (cobertura)** · Dada la lista elegida, cuando se estime su cobertura, entonces el ADR muestra que alcanza ≥ 20 documentos por tipo de cáncer habilitado (mama, próstata) y una estimación de la proporción con metadatos de población estructurados frente a la meta propuesta de M-08.3 (≥ 90 %). Si no alcanza, lo declara como riesgo SUP-3 en lugar de relajar la regla de licencias. `[RN-20]` `[M-08.3]` `[SUP-3]`
- **AC-5 (borde · licencia mixta dentro de una fuente)** · Dada una fuente cuyos documentos tienen licencias distintas (p. ej., PMC), cuando se registre, entonces el ADR fija que la licencia se evalúa **por documento** (`license_class` por documento) y que el documento sin licencia registrada o con licencia no aceptada se rechaza en la ingesta. `[FR-19 bordes]`
- **AC-6** · Dado el ADR aprobado, cuando se cierre, entonces la lista de fuentes admitidas y la regla de PubMed viven en configuración o en el catálogo del corpus, no en el código de la ingesta. `[RN-22]` (asumido)

#### Contexto técnico
Las licencias aceptadas **ya están decididas** (#36: dominio público, CC BY, CC BY-SA; CC BY-NC solo MVP académico y marcada; ND y "libre lectura" excluidas): no se reabren. Este ADR fija la **lista** y el caso PubMed. Preferir fuentes con metadatos estructurados (ClinicalTrials.gov) mitiga SUP-3 y el riesgo "metadatos de población insuficientes" (PRD §15). La verificación de licencia por documento ocurre en la ingesta (FEAT-06c), no aquí. La revisión del área legal se limita al caso PubMed y a la conveniencia de gestionar NCCN/ESMO.

#### Opciones (caso PubMed sin licencia explícita)
| Opción | A favor | En contra |
|---|---|---|
| A · Excluir el resumen; ingerir solo artículos del subconjunto de acceso abierto de PMC con licencia aceptada | Coherente con #36 ("libre lectura sin licencia" excluida); riesgo legal nulo | Menor cobertura de literatura reciente |
| B · Ingerir solo metadatos bibliográficos y enlace, sin texto del resumen | Mantiene la referencia visible | Sin texto no hay *chunk* recuperable ni soporte NLI (RN-01): aporta poco al análisis |
| C · Ingerir el texto del resumen | Más cobertura | Contradice la exclusión de "libre lectura sin licencia" de #36; requiere aval legal explícito |

**Descartado por decisión previa (no se reabre):** bloquear el MVP hasta tener NCCN/ESMO (readme §6.1 #17, D-09).

#### Non-goals
No implementar la ingesta (FEAT-06c). No negociar licencias de NCCN/ESMO. No definir el esquema de metadatos (ya en readme §3.1).

#### Preguntas abiertas
- ¿El área legal acepta la opción A como regla por defecto si no puede pronunciarse antes del S3? → área legal (no bloquea el S1).

---

### US-012 · ADR-39 — Evaluación y selección de modelos locales y runtime

**Tipo:** ADR · **Feature:** FEAT-00 (decisión) · aplicada en FEAT-06a · **Sprint:** 1 (inicio) · **Estimación:** 8
**Origen:** TBD-01 · readme §1.4 y §6.1 última fila (🚧) · SUP-2 · **Dueño:** Ingeniería
**Recorrido principal:** sí — **crítica**: recuperación, verificación y extracción del recorrido dependen de los modelos; los *embeddings* fuerzan reindexado
**Evidencia:** [→ PRD §16 TBD-01], [→ readme §1.4 "Decisiones de infraestructura de IA"], [→ PRD §7 NFR (hardware, latencia)], [→ PRD §12 Modelos, Idioma, Extracción], [→ readme §6 OL-02 bloqueos, OL-05 bloqueo], [→ PRD §18.6 SUP-2], [→ CLAUDE.md "Comandos"]
**⛔ Bloquea (se estiman `?` hasta que cierre):** FEAT-06a · implementación de los adapters reales `llm/`, `embeddings/`, `reranker/`, `nli/` y del semáforo de inferencia con el runtime elegido · FEAT-06c · carga del corpus semilla e indexación en Milvus (dimensión del vector dense y campo sparse) · FEAT-PL1 · configuración del runtime nativo (`LLM_BASE_URL`, `LLM_MODEL`) y límites de memoria de Compose · FEAT-T5a · baseline técnico (se mide con los modelos fijados) · FEAT-01b (S2) · adapter real de OCR y estructuración · ADR-41 (LLM juez local) · ADR-42 (p95 medido). **No bloquea:** las historias que trabajan contra las interfaces de los adapters con implementaciones falsas (readme §2.6).
**⛔ Bloqueada por:** — (si se acepta P-01 de §6, la fase de *embeddings* arranca en Pre-S1).

#### Story
Como responsable técnico, quiero fijar el runtime y los modelos locales (LLM, *embeddings*, *reranker*, NLI y OCR) midiendo con el stack levantado, para que el análisis de evidencia y la extracción se implementen sobre una base estable y no haya que reindexar el corpus después.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el protocolo de medición (3 corridas, mediana) y los datasets de OL-06 disponibles en el S1, cuando se evalúe cada candidato, entonces `docs/architecture/adr/ADR-39-modelos-locales.md` registra por candidato: memoria residente, p95 de su etapa, validez de JSON (LLM), licencia, versión exacta y la métrica principal de su componente (recall@10 y MRR, incluido español → inglés, para *embeddings* y *reranker*; exactitud sobre pares etiquetados para NLI; exactitud por campo crítico para OCR; fidelidad y JSON válido para el LLM). `[readme §1.4 Método]` `[G-3]` `[G-6]`
- **AC-2 (borde · restricciones duras)** · Dado un candidato o combinación que excede 24 GB de memoria total del stack, o p95 > 15 s en `/platform/evidence-analyses`, o p95 > 60 s por documento en extracción, o JSON válido < 99 %, o licencia no académica, cuando se evalúe, entonces queda descartado y el ADR anota el motivo y la cifra medida. `[readme §1.4]` `[NFR-01]`
- **AC-3 (embeddings primero)** · Dado que cambiar el modelo de *embeddings* obliga a reindexar Milvus, cuando se cierre la fase de *embeddings*, entonces el ADR fija modelo, dimensión del vector dense y origen del vector sparse (del propio modelo o de otra fuente) **antes** de que FEAT-06c indexe el corpus semilla, y el esquema de la colección de Milvus del readme §3.1 queda completo con esos valores. `[readme §6.1 última fila]` `[readme §6.1 #5]`
- **AC-4 (borde · empate)** · Dado un empate en la métrica principal de un componente, cuando se decida, entonces gana el de menor memoria y el ADR lo justifica. `[readme §1.4 Método]`
- **AC-5 (borde · ningún candidato cumple)** · Dado que ningún candidato de un componente cumple las restricciones duras, cuando se agote la lista, entonces el ADR lo declara y escala el ajuste de metas al usuario (G-5 / NFR-01), sin elegir un modelo que las incumpla. (asumido)
- **AC-6 (runtime)** · Dados Ollama y vLLM, cuando se comparen, entonces el ADR registra si cada uno usa realmente la GPU (Metal) de la M5 fuera de Docker, si expone API compatible con OpenAI y si soporta salida JSON restringida por esquema; un runtime sin uso real de GPU queda descartado. `[readme §1.4]`
- **AC-7 (configuración)** · Dado el ADR aprobado, cuando se cierre, entonces modelos, versiones y parámetros quedan fijados en configuración (`LLM_MODEL` y equivalentes por adapter), no en el código, y la regla de proveedores (RN-12) sigue verificada por test con esos valores. `[RN-22]` `[RN-12]`
- **AC-8 (repetible para el S4)** · Dado el protocolo usado en el S1, cuando se cierre el ADR, entonces queda como script o comando repetible para recalibrar G-5 en el S4 con síntesis, aplicabilidad, memoria y agente, y para evaluar un modelo de ~14B si SUP-2 falla. `[G-5]` `[SUP-2]` (asumido)

#### Contexto técnico
Decidir **primero los *embeddings*** (reindexar es caro); el LLM puede cambiarse después sin migrar datos. Candidatos (readme §1.4): runtime Ollama o vLLM; LLM *instruct* 7–8B multilingüe cuantizado a 4 bits (~14B solo si cumple y mejora medible); *embeddings* BGE-M3 (dense + sparse) o multilingual-e5-large; *reranker* bge-reranker-v2-m3; NLI multilingüe de la familia mDeBERTa-v3 (XNLI); OCR Tesseract `spa+eng` o PaddleOCR. *Embeddings*, *reranker* y NLI corren en CPU dentro de `rag-orchestrator`; el LLM, nativo. La recuperación híbrida (S3) necesita el vector sparse desde el esquema final del S1. El `relevance_score` se calcula con el *reranker* elegido (#8): su versión se registra en cada análisis. El motor de **PII** se decide en ADR-40, no aquí (ver §4.3 H-02).

#### Opciones (runtime)
| Opción | A favor | En contra |
|---|---|---|
| Ollama | Instalación simple, Metal probado, API compatible con OpenAI | Menos control de *batching* y concurrencia |
| vLLM | Mejor *throughput* y control de concurrencia | Soporte en Apple Silicon (Metal) por verificar |

#### Opciones (*embeddings*, decisión que fuerza reindexado)
| Opción | A favor | En contra |
|---|---|---|
| BGE-M3 | Dense + sparse en un modelo; multilingüe | Memoria y latencia en CPU a medir |
| multilingual-e5-large | Multilingüe probado | Sin sparse propio: la híbrida necesita otra fuente sparse |

**Descartado por decisión previa (no se reabre):** vision-LLM directo para OCR (readme §1.4); proveedor de nube para datos reales (RN-12).

#### Non-goals
No implementar el pipeline. No hacer *fine-tuning*. No evaluar proveedores de nube para datos reales. No decidir el detector de PII (ADR-40) ni el framework de evaluación (ADR-41).

#### Preguntas abiertas
- ¿Se mide un modelo de ~14B en el S1, o se acota a 7–8B y el ~14B queda para la recalibración del S4? → usuario
- Ver P-01 (§6): adelantar la fase de *embeddings* a Pre-S1.

---

### US-013 · ADR-40 — Detección y enmascaramiento de PII en texto libre y documentos

**Tipo:** ADR · **Feature:** FEAT-T4a (decisión) · aplicada en FEAT-06a y FEAT-01b · **Sprint:** 1 · **Estimación:** 5
**Origen:** readme §2.5 (detector de PII, formatos configurables), readme OL-03 alcance complementario (enmascaramiento de `query`), readme OL-05 tarea 12 (`PiiAdapter`) · G-8 · RN-11 · **Dueño:** Ingeniería
**Recorrido principal:** sí — **crítica, invariante de seguridad (RN-10, RN-11)**: no se negocia ni se difiere; la pregunta del doctor viaja desidentificada desde el walking skeleton
**Evidencia:** [→ readme §2.5 Desidentificación, Gate de PII], [→ readme §6 OL-03, OL-05], [→ PRD §6 RN-10, RN-11], [→ PRD §2.1 G-8], [→ PRD §13 Seguridad], [→ CLAUDE.md invariantes]
**⛔ Bloquea (se estiman `?` hasta que cierre):** FEAT-06a · enmascaramiento de PII en la pregunta antes de enviarla a Backend 2 (S1) y test de no-fuga · FEAT-T4a · desidentificación del contexto (notas) · FEAT-01b (S2) · gate de PII en documentos (`cuarentena_pii`) y adapter `pii/` · FEAT-02b/02c, FEAT-11c (S2–S4) · desidentificación de eventos, atributos y memoria de análisis.
**⛔ Bloqueada por:** — (no depende del LLM si la opción elegida no usa LLM; si la elegida lo usa, depende de ADR-39).

#### Story
Como responsable técnico, quiero decidir qué detector de PII se usa y en qué backend corre cada enmascaramiento, para que el texto libre llegue siempre desidentificado a Backend 2 y el gate de PII de documentos alcance la sensibilidad de G-8 sin violar el confinamiento de la identidad.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el dataset de PII sembrada de OL-06 (pregunta, notas, eventos, atributos y documentos sintéticos), cuando se evalúen las opciones, entonces `docs/architecture/adr/ADR-40-deteccion-pii.md` registra por opción la sensibilidad sobre identificadores directos, los falsos positivos sobre términos clínicos, la latencia y la memoria, y elige la que cumple G-8 (≥ 0,95). `[G-8]` `[readme §2.6 datasets]`
- **AC-2 (invariante · dónde se enmascara la pregunta)** · Dada la pregunta del doctor y las notas, cuando se decida el punto de enmascaramiento, entonces el ADR fija que ocurre en `clinical-api` **antes** de construir el request a Backend 2, y descarta cualquier opción que envíe texto sin desidentificar a `rag-orchestrator` para enmascararlo allí. `[RN-10]` `[RN-11]` `[CLAUDE.md]`
- **AC-3 (borde · identidad conocida)** · Dado que `clinical-api` conoce la identidad descifrada del paciente y de su representante, cuando se decida la estrategia, entonces el ADR registra si se usa coincidencia exacta con esa identidad como capa adicional, y cómo se evita que esa identidad quede en *logs* o en el contexto. `[RN-10]` (asumido)
- **AC-4 (borde · sin asumir país)** · Dados formatos de documento, teléfono o correo de distintos países, cuando se configure el detector, entonces el ADR fija que los formatos viven en configuración y que ningún patrón de país está codificado en el código. `[readme §2.5]` `[RN-22]`
- **AC-5 (documentos)** · Dado un documento `sintetico` o `real_anonimizado` con PII, y uno `real_identificado`, cuando se aplique el gate, entonces el ADR describe qué motor usa el adapter `pii/` de Backend 2 y cómo distingue la identidad esperada del paciente (verificación con `identityFound`) del resto de PII, que se enmascara. `[readme §2.5 Gate de PII]` `[readme §4.2 DocumentExtractResponse]`
- **AC-6** · Dado el ADR aprobado, cuando se cierre, entonces el motor, su versión y los umbrales quedan en configuración, y la PR que los cambie dispara la suite OL-06. `[RN-22]` `[FR-20]`

#### Contexto técnico
OL-05 tarea 12 remite el motor de `PiiAdapter` al ADR de modelos locales; se separa aquí porque la decisión tiene dos lados (Node en Backend 1 para texto libre desde el S1; Python en Backend 2 para documentos desde el S2) y una invariante propia. Una fuga de PII en el S1 contamina `AIAnalysisRecord.clinical_context_snapshot` y la memoria de análisis (irreversible sin borrar historia): por eso es ADR. El detector nunca registra valores, solo tipos (`findingTypes`).

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| A · Backend 1: patrones configurables + coincidencia exacta con la identidad conocida; Backend 2: mismo enfoque + NER local en el adapter `pii/` | Sin servicios nuevos; determinista; la identidad nunca sale de B1 | Nombres de terceros en texto libre dependen de NER solo en documentos |
| B · Servicio local de PII (contenedor Python con NER) en la red de `clinical-api`, sin acceso desde Backend 2 | Mismo motor para texto libre y documentos | Un contenedor más (memoria, operación); otra superficie de red |
| C · NER con el LLM local | Cubre nombres y contexto | No determinista; latencia y consumo del semáforo de inferencia; JSON a validar |
| **Descartada** · Enviar el texto a Backend 2 para enmascararlo | — | Viola RN-10/RN-11: el texto llega sin desidentificar a la IA |

#### Non-goals
No implementar el enmascaramiento. No cambiar el gate de PII ni las clases de datos (#14).

#### Preguntas abiertas
- Ninguna que bloquee; si la opción B supera el presupuesto de memoria fijado en ADR-39, queda descartada por la restricción de 24 GB.

---

### US-014 · ADR-41 — Framework y protocolo de evaluación de calidad de la IA

**Tipo:** ADR · **Feature:** FEAT-T5a · **Sprint:** 1 · **Estimación:** 3
**Origen:** V-07 · readme OL-06 tarea 3 ("el framework, p. ej. `ragas`, se decide en el ADR de evaluación") · **Dueño:** Ingeniería
**Recorrido principal:** sí — mide la calidad técnica de las tres capacidades de la hipótesis (recuperación, faltantes, aplicabilidad)
**Evidencia:** [→ readme §6 OL-06], [→ PRD §5 FR-20], [→ PRD §12 Evaluación], [→ PRD §18.4 T-5, AC-T5.3, AC-T5.4], [→ CLAUDE.md "Tests"]
**⛔ Bloquea (se estiman `?` hasta que cierre):** FEAT-T5a · *runner* de evaluación, métricas de generación (fidelidad) y comando `evaluate` · FEAT-T5b (S2–S4) · métricas nuevas sobre el mismo *runner*.
**⛔ Bloqueada por:** ADR-39 · solo la elección del LLM juez local (las métricas deterministas no dependen de él).

#### Story
Como responsable técnico, quiero decidir con qué framework y qué protocolo se calculan las métricas de OL-06, para que la suite sea reproducible, corra solo con modelos locales y pueda exigirse en cada PR que cambie modelo, prompt, umbral, catálogo o corpus.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las métricas de OL-06 (recuperación, generación, OCR, PII, eventos, mapeo, faltantes, discrepancias, aplicabilidad, agente, metadatos del corpus), cuando se evalúen las opciones, entonces `docs/architecture/adr/ADR-41-evaluacion-ia.md` registra qué métrica calcula cada opción, cuáles son deterministas y cuáles usan juez. `[OL-06]` `[FR-20]`
- **AC-2 (borde · reproducibilidad)** · Dada la misma configuración, cuando se ejecute `evaluate` dos veces, entonces las métricas deterministas son idénticas; el ADR descarta la opción que no lo garantiza y fija semilla y temperatura del juez en configuración. `[OL-06 AC]`
- **AC-3 (borde · juez local)** · Dado que la calibración usa datos reales anonimizados fuera del repo, cuando se elija el juez de fidelidad, entonces es un LLM **local** fuera de línea más NLI, nunca un proveedor de nube; una opción que lo exija queda descartada. `[RN-12]` `[OL-06 tarea 3]`
- **AC-4 (reporte)** · Dado un reporte de evaluación, cuando se genere, entonces distingue las métricas basadas en datos revisados por el oncólogo de las no revisadas, y guarda métricas agregadas con su configuración (modelos, prompt, umbrales, versiones de corpus y catálogo), nunca datos reales. `[OL-06 tarea 4]` `[RN-14]`
- **AC-5 (DoD)** · Dado el ADR aprobado, cuando se cierre, entonces fija cómo se adjunta el reporte a la PR que cambia modelo, prompt, umbral, **catálogo** o corpus (C-10: prevalece el PRD, que incluye el catálogo). `[FR-20]` `[AC-T5.4]`

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| `ragas` | Métricas de RAG listas (fidelidad, precisión de contexto) | Dependencia de juez LLM configurable a verificar con runtime local; versiones cambiantes |
| DeepEval | Integración con Pytest | Misma dependencia de juez; más superficie |
| Propio (Pytest + métricas deterministas + NLI + juez local) | Control total, determinismo, sin dependencias de nube | Más código a mantener |
| Híbrido (propio para deterministas, framework solo para fidelidad) | Equilibrio | Dos piezas a versionar |

#### Non-goals
No construir los datasets (FEAT-T5a). No fijar metas (DEC-07). No decidir el ADR de scoring (ADR-7).

---

### US-015 · ADR-42 — Streaming de eventos de progreso del análisis

**Tipo:** ADR · **Feature:** FEAT-10a (decisión) · **Sprint:** 4 (con la recalibración de G-5; en el S1 solo se registra el p95) · **Estimación:** 3
**Origen:** TBD-08 · readme §2.1 (🚧), §6.1 #8 (✅ + 🚧) · G-5 · **Dueño:** Ingeniería
**Recorrido principal:** no · **Workaround para el MVP:** el análisis responde JSON completo (estado actual, readme §6.1 #8) y la UI muestra un indicador de espera indeterminado con el texto de etapa fijo; el p95 del S1 solo se registra
**Evidencia:** [→ PRD §16 TBD-08], [→ readme §2.1 "Decisión sobre streaming"], [→ readme §6.1 #8], [→ PRD §2.1 G-5], [→ PRD §6 RN-06], [→ CLAUDE.md invariantes]
**⛔ Bloquea (se estiman `?` hasta que cierre, solo si la decisión es "streaming de progreso"):** FEAT-10c (S4) · UX de espera con hasta 3 opciones · FEAT-07, FEAT-08b, FEAT-08c (S4) · presupuesto de latencia de G-5 recalibrado · FEAT-02c (S2) · resumen del caso, si se aplica el mismo mecanismo (asumido).
**⛔ Bloqueada por:** ADR-39 (modelos fijados), FEAT-06a (p95 del S1 registrado) y las Features de síntesis, aplicabilidad y agente (p95 del S4).

#### Story
Como responsable técnico, quiero decidir con el p95 medido si el análisis emite eventos de progreso, para que la espera sea tolerable sin mostrar nunca contenido del LLM que aún no pasó la validación de citas y soporte.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dados el p95 de `/platform/evidence-analyses` registrado en el S1 y el medido en el S4 con síntesis, aplicabilidad, memoria y agente (protocolo de ADR-39), cuando se decida, entonces `docs/architecture/adr/ADR-42-streaming-progreso.md` registra la cifra, el umbral de decisión (configurable) y la opción elegida. `[TBD-08]` `[G-5]`
- **AC-2 (invariante)** · Dada cualquier opción con eventos, cuando se especifique, entonces los eventos solo nombran etapas (p. ej., recuperando evidencia, generando, validando), nunca contienen tokens, afirmaciones ni PII, y la respuesta final se entrega solo después de que Backend 1 persiste el `AIAnalysisRecord`. `[RN-06]` `[readme §2.1]` `[CLAUDE.md]`
- **AC-3 (borde · ruta y seguridad)** · Dada la opción SSE, cuando se diseñe, entonces sigue pasando por el Route Handler `app/api/evidence-analyses/route.ts` (no Server Action), mantiene la verificación de `Origin`, el *rate limit* de RN-30 y el *deadline* propagado, y no publica puertos de los backends. `[CLAUDE.md]` `[RN-30]`
- **AC-4 (borde · sin necesidad)** · Dado un p95 dentro de la meta, cuando se decida, entonces el ADR puede elegir "JSON completo" (estado actual) y fija el criterio que reabre la decisión en el S4. `[readme §6.1 #8]`
- **AC-5 (borde · p95 del S1 fuera de meta)** · Dado un p95 del S1 por encima de la meta, cuando se registre, entonces se mantiene el workaround (JSON completo + indicador de espera) hasta el S4 y el registro lo deja anotado como insumo del ADR, sin adelantar la implementación. `[G-5]` `[TBD-08]` (asumido)

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| A · JSON completo (estado actual, S1) | Simple; ya cumple las invariantes | Espera sin feedback si el p95 crece en el S4 |
| B · SSE con eventos de progreso por etapa (B2 → B1 → `web`) | Feedback de espera sin exponer contenido | Conexión abierta por análisis; manejo de cancelación y *deadline* |

**Descartado por decisión previa (no se reabre):** streaming de tokens (muestra contenido que luego se descarta) y *polling* (readme §6.1 #8).

#### Non-goals
No implementar SSE. No emitir contenido parcial. No cambiar el contrato `EvidenceAnalysis` (#26).

---

### US-027 · ADR-43 — Catálogo del corpus en una base de datos separada de la misma instancia

**Tipo:** ADR · **Feature:** FEAT-T4d · **Sprint:** 5 (condicional al resultado de la revisión de seguridad del gate) · **Estimación:** 2
**Origen:** TBD-10 · readme §3.3 #17 ("una base de datos separada en la misma instancia queda como endurecimiento opcional") · **Dueño:** Ingeniería (revisión de seguridad del piloto)
**Recorrido principal:** sí, condicional — la revisión de seguridad del gate G-Piloto está en el camino crítico; la base separada solo se decide si la revisión lo exige · **Workaround si no lo exige:** schema `corpus` + rol `rag_corpus` + `REVOKE ALL` + `corpus-db-net` + `pg_hba` + tests de *permission denied* (readme §3.3 #17)
**Evidencia:** [→ PRD §16 TBD-10], [→ readme §3.3 #17], [→ readme §2.5 Aislamiento de Backend 2, riesgo residual], [→ PRD §15 "Backend 2 comprometido…"]
**⛔ Bloquea (se estima `?` hasta que cierre):** FEAT-T4d · ajuste del `preflight real-data` y de los tests de *permission denied* si se elige la base separada.
**⛔ Bloqueada por:** FEAT-T4d · revisión de seguridad del piloto (insumo).

#### Story
Como responsable técnico, quiero decidir con el resultado de la revisión de seguridad si el catálogo del corpus pasa a una base de datos separada en la misma instancia, para reducir el riesgo residual aceptado de Backend 2 antes de cargar datos reales.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el informe de la revisión de seguridad del piloto, cuando se decida, entonces `docs/architecture/adr/ADR-43-corpus-base-separada.md` registra los hallazgos sobre el rol `rag_corpus`, la opción elegida y su coste (migración Alembic, roles, `pg_hba`, CI). `[TBD-10]`
- **AC-2 (borde · no reabrir)** · Dadas las alternativas ya descartadas en #17 (SQLite, colección de Milvus sin vectores, contenedor PostgreSQL extra), cuando se redacte, entonces se citan como contexto y no se evalúan de nuevo. `[readme §3.3 #17]`
- **AC-3 (invariante)** · Dada cualquier opción, cuando se especifique, entonces Backend 2 sigue sin ruta a `clinical-minio` ni a los schemas `auth`/`identity`/`clinical`/`audit`/`research`, y los tests de *permission denied* siguen pasando o se amplían. `[CLAUDE.md]`
- **AC-4 (memoria)** · Dada la opción "base separada en la misma instancia", cuando se evalúe, entonces el ADR confirma que no agrega procesos ni memoria al stack (≤ 24 GB). `[readme §1.4]` (asumido)

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| A · Mantener el schema `corpus` (estado actual, #17) | Sin migración; transacciones con el resto | Riesgo residual de escalamiento de privilegios en la misma base |
| B · Base de datos separada en la misma instancia | Aislamiento a nivel de base sin otro motor | Migración del catálogo y de roles; conexión separada |

#### Non-goals
No hacer la revisión de seguridad. No migrar.

---

### US-028 · ADR-44 — Stack de observabilidad: métricas, paneles y *tracing* distribuido

**Tipo:** ADR · **Feature:** FEAT-PL5 · **Sprint:** Post-MVP · **Estimación:** 3
**Origen:** V-08 · readme §2.7 (🚧 "Prometheus + Grafana y *tracing* distribuido (OpenTelemetry)") · G-10 · **Dueño:** Ingeniería
**Recorrido principal:** no · **Workaround para el MVP:** logs JSON con `traceId` (`X-Trace-Id`) + `/metrics` en formato Prometheus leído a mano o por script, sin Prometheus, Grafana ni OpenTelemetry (readme §2.7, lo ya decidido)
**Evidencia:** [→ readme §2.7], [→ PRD §2.1 G-10], [→ PRD §7 NFR (observabilidad)], [→ PRD §14 S6], [→ CLAUDE.md "Los logs nunca registran…"]
**⛔ Bloquea (se estiman `?` hasta que cierre):** FEAT-PL5 (S6) · paneles, *tracing* y alertas.
**⛔ Bloqueada por:** — (las métricas `/metrics` y los logs JSON con `traceId` ya están decididos desde el S1).

#### Story
Como responsable técnico, quiero decidir qué stack consume `/metrics` y si se agrega *tracing* distribuido, para que el S6 entregue observabilidad sin romper el presupuesto de memoria ni filtrar datos clínicos.

#### AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las opciones, cuando se decida, entonces `docs/architecture/adr/ADR-44-observabilidad.md` registra la memoria adicional medida de cada una y la elegida cabe en el presupuesto de 24 GB junto con el stack de ADR-39. `[readme §1.4]`
- **AC-2 (borde · no fuga)** · Dado el *tracing* distribuido, cuando se especifique, entonces los atributos de los *spans* siguen la regla de los logs: nunca identidad, PHI, secretos, contenido ni URL de documentos; pacientes por UUID. `[CLAUDE.md]` `[RN-10]`
- **AC-3 (borde · red)** · Dada una interfaz de paneles, cuando se especifique su acceso, entonces no se publica al host ningún puerto de backend, y el acceso a la UI de paneles queda restringido (VPN o `localhost`) y justificado en el ADR. `[CLAUDE.md]` (asumido)
- **AC-4** · Dado el ADR aprobado, cuando se cierre, entonces lista las métricas de IA del readme §2.7 que deben verse en paneles (latencia por etapa, afirmaciones descartadas y omitidas, sub-consultas del agente, tokens, cola de inferencia, cuarentena). `[readme §2.7]`

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| A · Solo `/metrics` + logs JSON + `traceId` (estado actual) | Cero memoria extra | Sin paneles ni trazas entre servicios |
| B · Prometheus + Grafana en Compose | Paneles y alertas | Memoria y un puerto de UI que proteger |
| C · B + OpenTelemetry (collector y visor de trazas) | Trazas de punta a punta B1 → B2 → LLM | Más memoria; riesgo de PHI en atributos |

#### Non-goals
No instrumentar. No cambiar el formato de logs ni la propagación de `X-Trace-Id`.

---

### US-032 · ADR-7 — Scoring de solidez clínica de la evidencia

**Tipo:** ADR (futuro) · **Feature:** — (CAP-17, fuera del MVP) · **Sprint:** Futuro (no planificado) · **Estimación:** `?` (no se estima: fuera del MVP)
**Origen:** TBD-09 · readme §3.3 #7 (🚧 pendiente de ADR), §6.1 #4 (✅ + 🚧) · CAP-17 · **Dueño:** Ingeniería + oncólogo
**Recorrido principal:** no · **Workaround para el MVP:** etiquetas factuales (diseño, endpoint, n, fecha) y `clinical_evidence_score` reservado (readme §3.3 #7)
**Evidencia:** [→ PRD §16 TBD-09], [→ PRD §3 No-objetivos], [→ PRD §14 Futuro], [→ PRD §18.1.2 CAP-17], [→ readme §3.3 #7, #8, #27], [→ PRD §6 RN-03, RN-28]
**⛔ Bloquea:** nada en el MVP. Mientras no cierre, `clinical_evidence_score` sigue **reservado** (sin escritura ni lectura) y el MVP muestra solo etiquetas factuales (diseño, endpoint, n, fecha).
**⛔ Bloqueada por:** cierre del piloto y decisión sobre el Post-MVP (PRD §14).

#### Story
Como responsable técnico, quiero decidir si y cómo se califica la solidez clínica de una fuente, para poder mostrarla como metadato verificable en una versión futura sin convertirla en un criterio de orden ni en una probabilidad de éxito.

#### AC (Given/When/Then)
- **AC-1 (invariante)** · Dada cualquier opción, cuando se evalúe, entonces el puntaje nunca ordena opciones (el orden sigue siendo el de RN-28), nunca se muestra como probabilidad y nunca reemplaza a `relevance_score` (#8). `[RN-28]` `[RN-03]` `[readme §3.3 #27]`
- **AC-2 (borde · autorreporte)** · Dado un puntaje calculado o autorreportado por el LLM, cuando se evalúe, entonces queda descartado por la misma razón que en #8 (no calibrado). `[readme §3.3 #8]`
- **AC-3** · Dado el ADR aprobado, cuando se cierre, entonces `docs/architecture/adr/ADR-7-scoring-evidencia-clinica.md` registra la escala elegida, quién la valida (oncólogo) y de qué metadatos verificados del corpus se deriva. (asumido)
- **AC-4 (MVP)** · Dado el MVP, cuando se audite el código y el contrato, entonces `clinical_evidence_score` permanece reservado y sin uso. `[readme §3.3 #7]`

#### Opciones
| Opción | A favor | En contra |
|---|---|---|
| A · Sin puntaje; solo etiquetas factuales (estado del MVP) | Sin riesgo de lectura prescriptiva | No resume solidez |
| B · Nivel de evidencia de una escala estándar derivada de metadatos verificados, mostrado como etiqueta | Interpretable y verificable | Requiere metadatos de diseño confiables (SUP-3) y validación clínica |
| **Descartada** · Puntaje autorreportado por el LLM | — | No calibrado (#8) |

#### Non-goals
No se planifica en el MVP. No toca el orden de RN-28.

---

## 3. Historias de decisión (DEC)

Son **investigación, no desarrollo**: estimación **siempre 1**; se refinan en *sprint planning*. Sus AC verifican el **registro** de la decisión (documento, versión o firma, con dueño y fecha) y pueden ser `(asumido)` sin penalización. La mecánica que aplica cada decisión (validadores, migraciones, UI) va en historias técnicas de la Feature indicada, no aquí. Ubicación por defecto del registro: `docs/decisions/DEC-<nn>-<slug>.md` (asumido; F3 puede fijar otra), o el bloque `validation` del catálogo cuando la decisión es contenido de `packages/clinical-catalogs` (patrón de DEC-01).

### Referencia · DEC-01 (existe, no se reescribe)

| ID | Tema | Feature | Sprint | Dueño | Est. | Nota para F3 |
|---|---|---|---|---|---|---|
| DEC-01 | Catálogo de datos críticos de mama y próstata validado y firmado · **Recorrido principal: sí — crítica** (hipótesis 2: faltantes; sin catálogo firmado el checklist no tiene vara clínica) | FEAT-04 (`backlog/features/FEAT-04-informacion-faltante.md`) | S3 (antes del cierre; ver P-03) | Oncólogo asesor | 2 | **Corrección pendiente:** la convención fija **1 punto** para toda DEC; FEAT-04 pasa de 24 a 23 puntos. Además, su pregunta Q5 (Gleason/ISUP → `Diagnosis.grade`) queda **resuelta por DEC-05** (Q-04): actualizar la nota "Pendiente de definir en refinamiento" de US-001 AC-7 para que cite DEC-05. |

---

### US-008 · DEC-02 — [Pre-S1] Protocolo y metas de las métricas de valor VM-1…VM-6

**Tipo:** Decisión · **Feature:** FEAT-00 · **Sprint:** Pre-S1 · **Estimación:** 1
**Origen:** TBD-11 · G-15 · R-15 · **Dueño:** usuario (PO) + oncólogos asesores · **Criticidad:** crítica (recorrido principal y Sprint 1)
**Recorrido principal:** sí — **crítica**: es la forma de medir la hipótesis (VM-1 reconstrucción, VM-5 faltantes, VM-2/VM-3 aplicabilidad); sin metas congeladas antes del S1 no hay validación (R-15)
**Evidencia:** [→ PRD §16 TBD-11], [→ PRD §2.2], [→ PRD §14 Pre-S1, G-Éxito], [→ PRD §18.6 SUP-4], [→ readme §6 OL-06 "Baseline manual de valor"]
**⛔ Bloquea:** FEAT-T5a · baseline manual de VM-1 y VM-2 antes de cerrar el S1 (AC-T5.2) · FEAT-T5c · feedback VM-4/VM-5 (S4) · FEAT-T5d · medición en el piloto (S6) · DEC-14 (tamaño de muestra de VM-3).
**⛔ Bloqueada por:** —

#### Story
Como product owner, junto con los oncólogos asesores, quiero fijar el protocolo y las metas de VM-1 a VM-6 antes del Sprint 1, para que el baseline manual sea comparable y las metas no se muevan después de ver los resultados.

> Escenario más probable (a refinar en sprint planning): el protocolo contempla **dos cohortes** —casos sintéticos estandarizados revisados por oncólogos (S1–S4, mecánica y baseline manual de VM-1/VM-2) y casos reales tras G-Piloto (valor, VM-1…VM-6)— y adopta las sugerencias de la tabla de PRD §2.2 — ≥ 6 casos sintéticos estandarizados (3 de mama y 3 de próstata), reducción de la mediana ≥ 50 % en VM-1 y VM-2, ≥ 85 % de concordancia en VM-3, ≥ 70 % de análisis con calificación ≥ 4 en VM-4, ≥ 80 % en VM-5 y ≥ 80 % / ≤ 20 % en VM-6 con escala Likert — porque es la propuesta escrita en el PRD; el orden de las condiciones se contrabalancea entre participantes (asumido).

#### AC
- **AC-1** · Dado el protocolo acordado, cuando se registre, entonces el documento de la decisión define por cada VM lo listado en la columna "Qué se debe definir" de PRD §2.2 (casos, criterio de "caso reconstruido", orden de condiciones, participantes, herramientas permitidas, muestra, escala, tasa mínima de respuesta), con dueño y fecha. `[PRD §2.2]` `[TBD-11]`
- **AC-2** · Dadas las metas fijadas, cuando se registren, entonces quedan marcadas como **congeladas antes del S1** y el documento declara que no se modifican tras ver resultados. `[R-15]`
- **AC-3** · Dado el protocolo, cuando se registre, entonces nombra a los oncólogos participantes del baseline y la fecha de las sesiones dentro del S1. (asumido)
- **AC-4 (dos cohortes)** · Dada la decisión del usuario de validar con casos sintéticos y con casos reales, cuando se registre el protocolo, entonces define por cada VM en qué cohorte se mide (sintética, real o ambas), cómo se reportan por separado y que las metas fijadas antes del S1 aplican a la cohorte real para G-Éxito. `[R-15]` `[PRD §14 G-Éxito]` (asumido)

---

### US-009 · DEC-03 — [Pre-S1] Estimación de capacidad de los Sprints 1–4 con el alcance v1.2

**Tipo:** Decisión · **Feature:** FEAT-00 · **Sprint:** Pre-S1 · **Estimación:** 1
**Origen:** TBD-19 · SUP-1 · R-25 · **Dueño:** Ingeniería · **Criticidad:** alta
**Recorrido principal:** sí — dimensiona el recorrido principal re-propuesto y decide qué se difiere
**Evidencia:** [→ PRD §16 TBD-19], [→ PRD §14 nota de capacidad], [→ PRD §18.6 SUP-1], [→ PRD §15 "Capacidad insuficiente"]
**⛔ Bloquea:** planificación de S1–S4; decisión de aplicar los puntos de recorte (FEAT-07 a Post-MVP; luego la parte de conflictos de FEAT-03b).
**⛔ Bloqueada por:** el backlog estimado de F3 (insumo). Las historias en `?` por ADR/DEC abiertas se estiman como rango (asumido).

#### Story
Como Ingeniería, quiero estimar los Sprints 1–4 sobre el backlog v1.2, para confirmar si el alcance cabe en 6 sprints o activar el orden de recorte acordado antes de empezar.

> Escenario más probable (a refinar en sprint planning): Ingeniería confirma el alcance S1–S4 y deja el orden de recorte de PRD §14 (CAP-07 a Post-MVP; luego conflictos de CAP-03) como contingencia preaprobada, porque es el mecanismo que el PRD ya define para SUP-1.

#### AC
- **AC-1** · Dado el backlog de F3, cuando se registre la estimación, entonces el documento lista puntos por sprint, la capacidad supuesta y el veredicto (cabe / no cabe), con fecha y dueño. `[TBD-19]`
- **AC-2** · Dado un veredicto "no cabe", cuando se registre, entonces nombra qué punto de recorte se activa y en qué orden, sin recortes fuera de los acordados. `[PRD §14]`
- **AC-3** · Dadas historias en `?`, cuando se estimen, entonces se registran como rango y se re-estiman al cerrar su ADR/DEC. (asumido)

---

### US-010 · DEC-04 — [Pre-S1] Términos de uso de LOINC, CUPS y ATC para versionar subconjuntos en el repo público

**Tipo:** Decisión · **Feature:** FEAT-00 · **Sprint:** Pre-S1 (adelantada desde "antes del S2" por Q-07) · **Estimación:** 1
**Origen:** TBD-17 · SUP-5 · Q-07 · C-21 · **Dueño:** área legal + Ingeniería · **Criticidad:** media (hay workaround, Q-07)
**Recorrido principal:** sí — decisión legal necesaria antes de G-Piloto (respuesta del usuario) y, por Q-07, antes del S1 · **Workaround para el MVP (no debilita el control):** Q-07: seed y catálogo del S1 solo con CIE-10 o códigos con permiso confirmado; el resto queda como término canónico + `no_mapeado`, y si se rechaza, subconjunto como configuración local fuera del repo. Se mantiene en Pre-S1 por Q-07 (vinculante) y porque un código publicado en un repo público no se retira del historial
**Evidencia:** [→ PRD §16 TBD-17], [→ PRD §18.6 SUP-5], [→ readme §2.5 "Catálogos en el repo público"], [→ readme §3.3 #23], [→ backlog/01-requisitos.md §14 Q-07]
**⛔ Bloquea:** FEAT-PL3 · catálogo v1 con códigos LOINC/CUPS/ATC · FEAT-PL2 · seed con códigos distintos de CIE-10 · FEAT-03a (S2) · normalización con LOINC/CUPS/ATC. Mientras no cierre, seed y catálogo del S1 usan **solo CIE-10** o códigos con permiso confirmado (Q-07).
**⛔ Bloqueada por:** —

#### Story
Como responsable técnico, junto con el área legal, quiero confirmar si los términos de uso de LOINC, CUPS y ATC permiten versionar subconjuntos en un repositorio público, para decidir desde el S1 si el catálogo vive en el repo o se monta como configuración local.

> Escenario más probable (a refinar en sprint planning): se cumple SUP-5 — los términos permiten versionar los subconjuntos con el aviso que exija cada estándar —, porque es el supuesto escrito en PRD §18.6; si un estándar no lo permite, solo ese subconjunto se monta como configuración local fuera del repo (Q-07).

#### AC
- **AC-1** · Dado cada estándar (LOINC, CUPS, ATC), cuando se registre la decisión, entonces el documento cita la fuente de los términos consultados, la conclusión (permitido / permitido con aviso / no permitido) y el aviso requerido, con fecha y firma del área legal. `[TBD-17]`
- **AC-2** · Dado un estándar "no permitido", cuando se registre, entonces el documento indica que su subconjunto se distribuye fuera del repo como configuración local y que el escaneo de CI debe impedir versionarlo. `[SUP-5]` `[Q-07]` (asumido)
- **AC-3** · Dada la decisión, cuando se cierre, entonces CIE-10 queda confirmado como el código disponible desde el S1. `[Q-07]` (asumido)

---

### US-011 · DEC-05 — [Pre-S1] Destino de TNM y Gleason/ISUP en próstata

**Tipo:** Decisión · **Feature:** FEAT-00 · **Sprint:** Pre-S1 · **Estimación:** 1
**Origen:** Q-04 · C-11 · RN-29 (sin TBD) · **Dueño:** oncólogo asesor (valida) + Ingeniería (prepara) · **Criticidad:** crítica (recorrido principal y Sprint 1)
**Recorrido principal:** sí — **crítica**: Gleason/ISUP y TNM son datos críticos de próstata para reconstruir el caso (1), detectar faltantes (2) y evaluar aplicabilidad (3); decide la migración inicial
**Evidencia:** [→ backlog/01-requisitos.md §14 Q-04, §11 C-11], [→ PRD §5 FR-23], [→ PRD §18.3.4], [→ PRD §6 RN-29], [→ readme §3.2 `Diagnosis`], [→ readme §3.3 #21]
**⛔ Bloquea:** FEAT-PL2 · migración inicial "esquema completo" (OL-01) y seed de próstata · FEAT-04 · US-001 (matriz ítem → campo para el ítem ISUP) · DEC-01 (Q5).
**⛔ Bloqueada por:** —

#### Story
Como oncólogo asesor, quiero validar dónde se registran el TNM y el Gleason/grupo ISUP en próstata, para que la migración inicial tenga destino para ambos datos críticos sin cambiar el modelo genérico de diagnóstico.

> Escenario más probable (a refinar en sprint planning): exactamente la decisión Q-04 del usuario — TNM en `staging_system`/`stage_value` para ambos tipos de cáncer y Gleason/ISUP en `Diagnosis.grade`, sin cambio de esquema —, porque así quedó resuelto C-11 en `01-requisitos.md` §14.

#### AC
- **AC-1** · Dada la propuesta Q-04, cuando el oncólogo la valide, entonces el documento de la decisión registra el destino de cada ítem (TNM → `staging_system`/`stage_value`; Gleason/ISUP → `Diagnosis.grade`), con firma y fecha. `[Q-04]` `[RN-29]`
- **AC-2** · Dado que el readme §3.2 menciona "grupo ISUP" en `stage_value`, cuando se registre, entonces el documento lo señala como texto a corregir en el readme (C-11). (asumido)
- **AC-3** · Dado un rechazo del oncólogo, cuando se registre, entonces el documento lo escala a Ingeniería antes de la migración inicial, sin diferirlo al S3. `[Q-04]` (asumido)

---

### US-016 · DEC-06 — Revisión clínica de la muestra del dataset de evaluación y del diccionario de significancia

**Tipo:** Decisión · **Feature:** FEAT-T5a · **Sprint:** 1 · **Estimación:** 1
**Origen:** readme OL-06 AC ("el oncólogo revisa una muestra del dataset (15–20 preguntas) y el diccionario de significancia de biomarcadores") · IA-10 (validación clínica parcial) · sin TBD · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — sin la revisión clínica de la muestra, el baseline no distingue lo validado (validez de la medición de la hipótesis)
**Evidencia:** [→ readme §6 OL-06 AC], [→ PRD §12 Evaluación], [→ PRD §18.6 SUP-4]
**⛔ Bloquea:** FEAT-T5a · cierre del baseline del S1 (reporte con métricas "validadas").
**⛔ Bloqueada por:** FEAT-T5a · dataset y diccionario en borrador.

#### Story
Como oncólogo asesor, quiero revisar una muestra del dataset de evaluación y el diccionario de significancia de biomarcadores, para que el baseline distinga lo validado clínicamente de lo que no.

> Escenario más probable (a refinar en sprint planning): se revisan 15–20 preguntas y el diccionario completo en una sesión del S1, porque es el tamaño que fija el AC de OL-06.

#### AC
- **AC-1** · Dada la muestra revisada, cuando se registre, entonces el documento lista los IDs de preguntas revisadas, las correcciones y la versión del diccionario aprobada, con firma y fecha. `[OL-06 AC]`
- **AC-2** · Dado el reporte del baseline, cuando se publique, entonces marca como "validadas" solo las métricas basadas en esa muestra. `[OL-06 tarea 4]` (asumido)

---

### US-017 · DEC-07 — Metas definitivas de evaluación técnica tras el baseline

**Tipo:** Decisión · **Feature:** FEAT-T5a · **Sprint:** 1 (cierre) · **Estimación:** 1
**Origen:** TBD-02 · **Dueño:** usuario (PO) + Ingeniería
**Recorrido principal:** sí — fija la vara técnica con la que se acepta el recorrido (recuperación, fidelidad, faltantes)
**Evidencia:** [→ PRD §16 TBD-02], [→ PRD §2.1 G-3, G-4, G-6…G-8, G-11…G-14], [→ readme §2.6 "Métricas iniciales"], [→ PRD §14 G-Demo]
**⛔ Bloquea:** FEAT-T5a/T5b · umbrales de regresión del DoD desde el S2.
**⛔ Bloqueada por:** FEAT-T5a · baseline técnico del S1; ADR-41.

#### Story
Como product owner, quiero fijar las metas técnicas definitivas con el baseline del Sprint 1, para que el DoD exija umbrales alcanzables y G-Demo tenga una vara estable.

> Escenario más probable (a refinar en sprint planning): se mantienen las metas iniciales de PRD §2.1 y readme §2.6 donde el baseline las alcanza o queda cerca, y se ajustan con justificación las que no; G-2 = 100 % y salidas prescriptivas = 0 no se negocian, porque G-Demo las exige tal cual (PRD §14).

#### AC
- **AC-1** · Dado el baseline, cuando se registre la decisión, entonces el documento lista cada métrica con valor medido, meta inicial y meta definitiva, con justificación de cada cambio, dueño y fecha. `[TBD-02]`
- **AC-2** · Dadas las metas definitivas, cuando se publiquen, entonces los umbrales de regresión viven en la configuración de la suite, no en el código. `[RN-22]` (asumido)
- **AC-3** · Dadas VM-1…VM-6, cuando se registre, entonces quedan **fuera** de esta decisión (las fija DEC-02 antes del S1, R-15). `[R-15]`

---

### US-018 · DEC-08 — Umbrales de tendencia por biomarcador

**Tipo:** Decisión · **Feature:** FEAT-02b · **Sprint:** 1 (antes del S2) · **Estimación:** 1
**Origen:** TBD-13 (parte: "umbrales de tendencia por biomarcador… tendencias antes del S2") · R-24 · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — la tendencia de biomarcadores (p. ej., series de PSA) forma parte del caso reconstruido (1) y del contexto del análisis
**Evidencia:** [→ PRD §16 TBD-13], [→ PRD §5 FR-04 ("umbral de cambio definido por biomarcador en el catálogo")], [→ PRD §5 FR-09 contexto con tendencia]
**⛔ Bloquea:** FEAT-02b (S2) · cálculo de la tendencia (↑, ↓, =) en ficha y vista de caso, y su envío en el contexto.
**⛔ Bloqueada por:** —

#### Story
Como oncólogo asesor, quiero validar el umbral de cambio de cada biomarcador del catálogo, para que "=" (estable) signifique un cambio clínicamente menor y no una diferencia numérica arbitraria.

> Escenario más probable (a refinar en sprint planning): Ingeniería propone un umbral por biomarcador del catálogo de mama y próstata y el oncólogo lo firma como parte de `packages/clinical-catalogs`, porque FR-04 ya ubica el umbral en el catálogo.

#### AC
- **AC-1** · Dada la propuesta, cuando el oncólogo la valide, entonces la versión del catálogo publicada lleva un bloque `validation` con alcance "tendencias", firma y fecha (patrón de DEC-01). `[FR-04]` (asumido)
- **AC-2** · Dado un biomarcador sin umbral validado, cuando se registre, entonces queda marcado `propuesta` y la decisión lo lista. (asumido)

---

### US-019 · DEC-09 — Reglas del semáforo de biomarcadores y de vigencia de diagnósticos

**Tipo:** Decisión · **Feature:** FEAT-01b · **Sprint:** 1 (antes del S2) · **Estimación:** 1
**Origen:** TBD-06 (parte: reglas clínicas) · readme §3.3 #12 y §6.1 #10 (✅ ⚠️ "validar con el oncólogo") · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — la vigencia del diagnóstico decide qué diagnóstico describe el caso (1); el semáforo es secundario
**Evidencia:** [→ PRD §16 TBD-06], [→ readme §3.3 #12], [→ readme §6.1 #10], [→ PRD §6 RN-08], [→ readme HU-05]
**⛔ Bloquea:** FEAT-01b (S2) · regla de diagnóstico extraído vs. vigente y origen del semáforo · FEAT-03a (S2) · FEAT-03b (S3) · conflictos.
**⛔ Bloqueada por:** —

#### Story
Como oncólogo asesor, quiero validar la regla de vigencia de diagnósticos y las reglas del semáforo, para que la extracción nunca reemplace en silencio un diagnóstico y el semáforo refleje una severidad que el oncólogo reconoce.

> Escenario más probable (a refinar en sprint planning): se valida tal cual la regla de #12 (la fecha decide: anterior → histórico; posterior o sin fecha confiable → `requiere_revision` con `conflicts_with_id`) y el semáforo normal / alterado / relevante / crítico con registro de su origen, porque es lo ya escrito en readme §3.3 #12 y §1.3.

#### AC
- **AC-1** · Dada la regla de #12, cuando el oncólogo la valide, entonces el documento registra "validada" o el ajuste pedido, con firma y fecha. `[readme §3.3 #12]`
- **AC-2** · Dado el semáforo, cuando se valide, entonces el documento registra de dónde sale cada nivel (rango del documento, catálogo o inferencia de la IA) y que el inferido por IA lleva aviso. `[readme HU-05]` (asumido)

---

### US-020 · DEC-10 — Plantillas de preguntas clínicas validadas por tipo de cáncer

**Tipo:** Decisión · **Feature:** FEAT-05 · **Sprint:** 5 (antes de G-Piloto, porque PRD §14 incluye las plantillas firmadas en el gate; si FEAT-05 se difiere, el PO retira ese criterio del gate) · **Estimación:** 1
**Origen:** M-05.1 (gobierno) · FR-28 · sin TBD · **Dueño:** oncólogo asesor
**Recorrido principal:** no · **Workaround para el MVP:** pregunta libre en el panel; las plantillas, si se construyen, se muestran como `propuesta` sin firma
**Evidencia:** [→ PRD §18.3.5 M-05.1], [→ PRD §5 FR-28], [→ PRD §14 G-Piloto]
**⛔ Bloquea:** FEAT-05 · cierre de CAP-05 · G-Piloto (plantillas firmadas).
**⛔ Bloqueada por:** FEAT-05 · plantillas en borrador.

#### Story
Como oncólogo asesor, quiero validar las plantillas de preguntas por tipo de cáncer, para que las preguntas prellenadas sean clínicamente pertinentes y no prescriptivas.

> Escenario más probable (a refinar en sprint planning): ≥ 5 plantillas por tipo (mama, próstata), firmadas en `packages/clinical-catalogs`, porque es la propuesta de FR-28 y M-05.1.

#### AC
- **AC-1** · Dadas las plantillas, cuando se firmen, entonces la versión del catálogo lleva `validation` con alcance "plantillas", firma y fecha, y ≥ 5 por tipo. `[M-05.1]` (asumido)
- **AC-2** · Dadas las plantillas firmadas, cuando se revise su texto, entonces ninguna contiene términos de la lista prohibida de RN-23. `[RN-23]` (asumido)

---

### US-021 · DEC-11 — Criterios de aplicabilidad, excluyentes y definición de "Parcial"

**Tipo:** Decisión · **Feature:** FEAT-08b · **Sprint:** 3 (antes de la Feature de aplicabilidad; ver P-03) · **Estimación:** 1
**Origen:** TBD-13 (parte: aplicabilidad) · R-24 · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — **crítica**: sin criterios, excluyentes y "Parcial" validados no hay orden de las opciones por aplicabilidad (hipótesis 3)
**Evidencia:** [→ PRD §16 TBD-13], [→ PRD §5 FR-25], [→ PRD §6 RN-28], [→ PRD §18.3.8 AC-08.6], [→ PRD §14 G-Piloto]
**⛔ Bloquea:** FEAT-08b · cálculo determinista de estados y "Población no comparable" · FEAT-10c · orden por aplicabilidad · FEAT-08c · criterios que dispara el agente · FEAT-T5b · dataset de aplicabilidad con verdad conocida · G-Piloto.
**⛔ Bloqueada por:** DEC-05 (destinos de TNM/ISUP para los criterios de próstata).

#### Story
Como oncólogo asesor, quiero validar los criterios de aplicabilidad de cada tipo de cáncer, cuáles son excluyentes y qué significa "Parcial" en cada uno, para que el estado por criterio sea reproducible y el orden de las opciones no oculte un juicio clínico.

> Escenario más probable (a refinar en sprint planning): se adoptan los criterios de FR-25 (subtipo, estadio o extensión, línea o tratamiento previo, biomarcadores clave, edad o estado menopáusico, estado funcional), con HER2 en mama y estado de castración en próstata como excluyentes, porque son los ejemplos de AC-08.6; la definición de "Parcial" sigue los ejemplos de FR-25.

#### AC
- **AC-1** · Dados los criterios, cuando se firmen, entonces la versión del catálogo lleva `validation` con alcance "aplicabilidad", firma y fecha; cada criterio tiene campo de destino (RN-29), marca de excluyente y regla de "Parcial". `[TBD-13]` `[RN-29]` (asumido)
- **AC-2** · Dada la decisión, cuando se registre, entonces no introduce ningún puntaje ni ponderación clínica de criterios. `[RN-28]`

---

### US-022 · DEC-12 — Canal de opt-out: referencia externa, catálogo de motivos y SLA

**Tipo:** Decisión · **Feature:** FEAT-T4b · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** TBD-21 · **Dueño:** entidad médica + administrador
**Recorrido principal:** sí — prerrequisito de G-Piloto (RN-13, RN-15): sin canal acordado no se puede garantizar el `403` sobre pacientes reales con opt-out · **Workaround de gestión (no debilita el control):** si la UI de administración de FEAT-T4b no llega, la marca se registra por CLI de administración con la referencia en el formato acordado, auditada, y el `403` se aplica igual
**Evidencia:** [→ PRD §16 TBD-21], [→ PRD §5 FR-16], [→ PRD §15 riesgo de opt-out no registrado], [→ readme §2.5 Gate G-piloto]
**⛔ Bloquea:** FEAT-T4b (S4) · UI de registro de opt-out (formato de la referencia, motivos) · FEAT-T4d (S5) · prerrequisito del gate "procedimiento documentado de registro de opt-out".
**⛔ Bloqueada por:** —

#### Story
Como administrador, junto con la entidad médica, quiero acordar el formato de la referencia al documento externo, el catálogo de motivos y el plazo de registro del opt-out, para que ninguna marca del sistema externo quede sin reflejar en OncoLens.

> Escenario más probable (a refinar en sprint planning): la referencia es el identificador del documento en el sistema externo (sin PHI), los motivos son un catálogo cerrado acordado con la entidad, y el SLA queda en el procedimiento documentado que exige el gate, porque así lo describen FR-16 y readme §2.5 (asumido en el detalle).

#### AC
- **AC-1** · Dado el acuerdo, cuando se registre, entonces el documento contiene formato de referencia, catálogo de motivos, SLA y responsable, firmado por la entidad médica con fecha. `[TBD-21]` (asumido)
- **AC-2** · Dado el formato, cuando se registre, entonces declara que la referencia no contiene identidad ni PHI. `[RN-10]` (asumido)

---

### US-023 · DEC-13 — Catálogo de motivos de egreso

**Tipo:** Decisión · **Feature:** FEAT-T4b · **Sprint:** con la Feature de egreso (FEAT-T4b, hoy S4); Post-MVP si FEAT-T4b se difiere · **Estimación:** 1
**Origen:** TBD-06 (parte: motivos de egreso) · **Dueño:** oncólogo asesor
**Recorrido principal:** no · **Workaround para el MVP:** motivo de egreso como texto de una lista provisional en configuración, marcada `propuesta`
**Evidencia:** [→ PRD §16 TBD-06], [→ PRD §5 FR-14], [→ readme §3.3 #20]
**⛔ Bloquea:** FEAT-T4b (S4) · egreso con motivo · FEAT-AP1 · snapshot longitudinal (motivo como dato).
**⛔ Bloqueada por:** —

#### Story
Como oncólogo asesor, quiero validar la lista de motivos de egreso, para que el egreso quede registrado con un motivo útil para el episodio y el snapshot de investigación.

> Escenario más probable (a refinar en sprint planning): Ingeniería propone un catálogo cerrado y corto (p. ej., fin de seguimiento, traslado a otra institución, fallecimiento, decisión del paciente) y el oncólogo lo firma (asumido: el PRD no trae propuesta).

#### AC
- **AC-1** · Dado el catálogo propuesto, cuando se firme, entonces queda versionado con firma y fecha, y el documento indica dónde vive (catálogo o configuración). (asumido)

---

### US-024 · DEC-14 — Revisión clínica de la muestra de aplicabilidad (VM-3)

**Tipo:** Decisión (gobierno) · **Feature:** FEAT-T5d (medición) · **Sprint:** 4 (o el sprint en que cierre la Feature de aplicabilidad) · **Estimación:** 1
**Origen:** M-08.1 (mixto) · VM-3 · sin TBD · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — VM-3 mide directamente si el orden por aplicabilidad es correcto (hipótesis 3)
**Evidencia:** [→ PRD §18.3.8 M-08.1], [→ PRD §2.2 VM-3], [→ PRD §14 G-Demo "VM-1 a VM-3 medidas con el oncólogo asesor"]
**⛔ Bloquea:** G-Demo (VM-3 medida) · FEAT-T5d.
**⛔ Bloqueada por:** DEC-02 (tamaño de muestra y número de revisores) · FEAT-08b (tablas de aplicabilidad generadas).

#### Story
Como oncólogo asesor, quiero revisar una muestra de tablas de aplicabilidad, para que la concordancia de VM-3 se mida con un criterio clínico y quede registrada para G-Demo.

> Escenario más probable (a refinar en sprint planning): un oncólogo revisa la muestra fijada en DEC-02 con meta ≥ 85 % de criterios concordantes, porque es la propuesta de M-08.1 y VM-3.

#### AC
- **AC-1** · Dada la muestra, cuando se revise, entonces el documento registra criterios revisados, concordancia obtenida, tratamiento de "Parcial" y firma con fecha. `[M-08.1]` (asumido)

---

### US-025 · DEC-15 — Validación legal de diferir el job de retención

**Tipo:** Decisión · **Feature:** FEAT-T4d · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** TBD-16 · PREG-2 · D-15 · **Dueño:** área legal
**Recorrido principal:** sí — condición legal para cargar datos reales; si se rechaza diferir el job, el job entra antes de G-Piloto (PREG-2) · **Workaround de gestión:** ninguno para la decisión; la política y los campos `retention_*` ya se registran desde el alta (FR-17)
**Evidencia:** [→ PRD §16 TBD-16], [→ PRD §18.6 PREG-2], [→ PRD §5 FR-17], [→ readme §3.3 #4]
**⛔ Bloquea:** FEAT-T4d · si se rechaza, nace una historia del job de retención en el S5 y se re-evalúa SUP-1 (DEC-03).
**⛔ Bloqueada por:** —

#### Story
Como área legal, quiero pronunciarme sobre diferir el job automático de retención a Post-MVP, para que el piloto arranque con la política registrada y un plan de borrado aceptado.

> Escenario más probable (a refinar en sprint planning): se aprueba diferirlo, porque durante el piloto ningún dato llega a vencer (D-15, FR-17).

#### AC
- **AC-1** · Dada la consulta, cuando se registre, entonces el documento contiene el veredicto, condiciones y firma del área legal con fecha. `[TBD-16]`
- **AC-2** · Dado un rechazo, cuando se registre, entonces nombra la historia nueva en FEAT-T4d y avisa a DEC-03. `[PREG-2]` (asumido)

---

### US-026 · DEC-16 — Alcance de "generación con IA" bajo el opt-out de `analisis_ia`

**Tipo:** Decisión · **Feature:** FEAT-T4c · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** V-15 (sin TBD) · RN-15 · FR-16 · **Dueño:** usuario (PO) + área legal
**Recorrido principal:** sí — fija la lista cerrada de endpoints con `403` por opt-out (RN-15), prerrequisito de G-Piloto
**Evidencia:** [→ backlog/01-requisitos.md §10 V-15], [→ PRD §6 RN-15], [→ PRD §5 FR-16 ("No afecta la ficha, la vista de caso ni la carga de documentos")], [→ readme §2.5]
**⛔ Bloquea:** FEAT-T4c (S5) · lista de endpoints que responden `403` por opt-out.
**⛔ Bloqueada por:** —

#### Story
Como product owner, junto con el área legal, quiero cerrar si la extracción con LLM de un documento cuenta como "generación con IA" bajo el opt-out, para que el `403` se aplique a una lista cerrada y verificable de endpoints.

> Escenario más probable (a refinar en sprint planning): el `403` cubre análisis, resumen del caso, re-ejecución y búsqueda complementaria; la carga y su extracción local **no** se bloquean, porque FR-16 dice que el opt-out no afecta la carga de documentos.

#### AC
- **AC-1** · Dada la decisión, cuando se registre, entonces el documento lista los endpoints bloqueados y los no bloqueados, con firma del área legal y fecha. `[RN-15]` (asumido)

---

### US-029 · DEC-17 — Mapeos terminológicos firmados

**Tipo:** Decisión (gobierno) · **Feature:** FEAT-T4d · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** G-Piloto ("catálogos … mapeos … firmados") · G-13 · RN-27 · V-18 · sin TBD · **Dueño:** oncólogo asesor
**Recorrido principal:** sí — criterio de G-Piloto (PRD §14: mapeos firmados) para mostrar códigos sobre pacientes reales · **Workaround en S1–S4:** mapeos `propuesta`; `no_mapeado` visible (RN-27)
**Evidencia:** [→ PRD §14 G-Piloto], [→ PRD §2.1 G-13], [→ PRD §6 RN-27], [→ readme §3.3 #23]
**⛔ Bloquea:** FEAT-T4d · gate G-Piloto.
**⛔ Bloqueada por:** DEC-04 (qué subconjuntos viven en el repo) · FEAT-03a/03b (mapeos y `no_mapeado` revisados).

#### Story
Como oncólogo asesor, quiero firmar los subconjuntos de mapeo CIE-10, LOINC, CUPS y ATC por tipo de cáncer, para que los códigos que ve el piloto provengan de un catálogo validado.

> Escenario más probable (a refinar en sprint planning): el oncólogo firma la versión del catálogo con el mismo bloque `validation` que DEC-01, porque G-Piloto exige mapeos firmados junto con los demás catálogos.

#### AC
- **AC-1** · Dada la versión del catálogo, cuando se firme, entonces lleva `validation` con alcance "mapeos", firma y fecha. (asumido)

---

### US-030 · DEC-18 — Edad de mayoría configurada

**Tipo:** Decisión · **Feature:** FEAT-T4d · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** TBD-07 · **Dueño:** área legal + entidad médica
**Recorrido principal:** sí — condición legal para menores con datos reales (FR-16) · **Workaround de gestión (no debilita el control):** el valor vive en configuración y el job lo usa; no requiere UI
**Evidencia:** [→ PRD §16 TBD-07], [→ PRD §5 FR-16 (job de mayoría de edad)], [→ CLAUDE.md "edad de mayoría (sin asumir país)"]
**⛔ Bloquea:** FEAT-T4d · valor de configuración del job (el job se implementa contra la configuración y no queda bloqueado).
**⛔ Bloqueada por:** —

#### Story
Como área legal, quiero confirmar la edad de mayoría aplicable a la entidad médica del convenio, para que el job marque "requiere ratificación" en el momento correcto sin asumir un país en el código.

> Escenario más probable (a refinar en sprint planning): el valor es la mayoría de edad de la jurisdicción de la entidad médica del convenio; como el MVP ya usa CUPS (Colombia, readme §3.3 #23), lo más probable es 18 años (asumido; vive solo en configuración).

#### AC
- **AC-1** · Dada la jurisdicción, cuando se registre, entonces el documento contiene el valor, la norma citada y la firma con fecha. (asumido)

---

### US-031 · DEC-19 — Criterio de "listo" por tipo de cáncer firmado

**Tipo:** Decisión · **Feature:** FEAT-T4d · **Sprint:** 5 (antes de G-Piloto) · **Estimación:** 1
**Origen:** RN-20 · readme §3.3 #22 · V-16 · V-18 · sin TBD · **Dueño:** oncólogo asesor (catálogo) + usuario (PO) (habilitación)
**Recorrido principal:** sí — un tipo de cáncer solo se usa con datos reales si cumple el criterio de "listo" (RN-20, G-Piloto) · **Workaround en S1–S4:** `ENABLED_CANCER_TYPES` habilita mama y próstata solo para la demo sintética
**Evidencia:** [→ PRD §6 RN-20], [→ readme §3.3 #22], [→ backlog/01-requisitos.md §10 V-16]
**⛔ Bloquea:** FEAT-T4d · G-Piloto · FEAT-PL3 · `ENABLED_CANCER_TYPES` en el entorno piloto.
**⛔ Bloqueada por:** DEC-01, DEC-11, DEC-17 (catálogos firmados) · ADR-36 (corpus con licencia) · DEC-07 (metas del dataset).

#### Story
Como oncólogo asesor, junto con el product owner, quiero firmar que mama y próstata cumplen el criterio de "listo", para que solo los tipos que lo cumplen se habiliten con datos reales.

> Escenario más probable (a refinar en sprint planning): RN-20 se aplica a mama y próstata como **prerrequisito de G-Piloto** (no del S1, cuando se habilitan para la demo sintética), con los cuatro criterios de #22, porque es la lectura que resuelve V-16 sin contradecir el S1.

#### AC
- **AC-1** · Dado cada tipo, cuando se registre, entonces el documento marca los cuatro criterios de #22 (catálogo revisado, corpus con licencia, dataset en metas, documentos típicos cubiertos) con evidencia y firma con fecha. `[readme §3.3 #22]` (asumido)

---

## 4. Exclusiones, calibraciones y hallazgos

### 4.1 TBD absorbidos por configuración (CAL, RN-22)

No son ADR (no tienen coste alto de reversión: cambiar el valor es cambiar configuración) ni DEC (tienen propuesta escrita en el PRD). Se calibran en una historia de la Feature indicada, que F3 escribe con AC de medición.

| TBD | Valor propuesto (fuente) | Variable de configuración | Historia que lo calibra | Por qué no es ADR/DEC |
|---|---|---|---|---|
| TBD-03 (**crítica**: el umbral de relevancia decide "sin evidencia" en el recorrido 3 y la confianza OCR decide qué datos reconstruyen el caso en el 1) | Umbral de relevancia y umbrales de confianza OCR; regla G-7 (subir el umbral alto si `auto_aceptado` < 98 %) | Umbral de relevancia (Backend 2) · umbrales `alta`/`media` de OCR | FEAT-06a / FEAT-T5a · calibración del umbral de relevancia (S1); FEAT-01b · calibración de confianza OCR (S2) | Valor numérico con método escrito (set de referencia, G-7); se recalibra con la suite |
| TBD-14 | N = 3 (PRD §16; readme §1.4) | `ANALYSIS_MEMORY_MAX` | FEAT-11c · calibración con latencia y evaluación (S4); si SUP-2 falla, bajar N es la primera palanca | Propuesta escrita; reversible sin migrar |
| TBD-15 | N = 5 años (FR-26) | `EVIDENCE_STALE_YEARS` | FEAT-09 · historia de vigencia (S3) con un AC que registra la confirmación del oncólogo | Propuesta escrita; el valor solo cambia una etiqueta visible |
| TBD-18 | 1 iteración, 3 sub-consultas, *deadline* (FR-30, #37) | `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`, *deadline* del agente | FEAT-08c · calibración con G-5 en el S4 | Propuesta escrita; #37 ya decide el diseño |
| TBD-20 | 10 % por lote de ingesta (FR-19, R-16) | Porcentaje de muestra humana por lote | FEAT-06c · ingesta del S3 (la revisión humana es ejecución, medida en M-08.4) | Propuesta escrita; no cambia datos ya ingeridos |

Partes CAL de TBD con DEC: TBD-02 (umbrales de regresión en la configuración de la suite, tras DEC-07) y TBD-07 (edad en configuración del job, tras DEC-18).

### 4.2 Exclusiones del MVP

| TBD | Motivo | Cita |
|---|---|---|
| TBD-05 Subtipos de leucemia y población | Leucemia es el tercer tipo, **post-piloto**; se habilita solo al cumplir el criterio de "listo" | [→ PRD §14 Post-piloto], [→ PRD §6 RN-20], [→ readme §3.3 #22] |
| TBD-09 Scoring de solidez clínica | CAP-17 es **Futuro**; el MVP muestra etiquetas factuales. Queda como ADR-7 en backlog futuro, sin planificar | [→ PRD §3 No-objetivos], [→ PRD §14 Futuro], [→ PRD §18.1.2 CAP-17] |

### 4.3 Decisiones ✅ cuestionables y hallazgos

| # | Hallazgo | Fuentes | Tratamiento |
|---|---|---|---|
| H-01 | readme §3.2 y CLAUDE.md dicen que `stage_value` cubre "grupo ISUP (próstata)", pero el PRD exige TNM **y** Gleason/ISUP en próstata y RN-29 un destino por ítem (#21 no basta tal como está escrito) | C-11 · readme §3.2 · PRD FR-23 | Resuelto por Q-04 → DEC-05; corregir el texto del readme §3.2 |
| H-02 | readme OL-05 tarea 12 remite el motor de PII al ADR de modelos locales, pero el enmascaramiento de la pregunta corre en `clinical-api` desde el S1 (OL-03), con otra invariante | readme OL-03, OL-05 | Se separa en ADR-40; ADR-39 lo excluye expresamente |
| H-03 | readme OL-03 "No incluye: rate limiting (ADR pendiente, 2.5)" contradice §2.5 y RN-30, donde el *rate limit* está decidido | C-09 | Prevalece el PRD (decidido; valores en config, S1 por Q-06). **No genera ADR** |
| H-04 | CLAUDE.md lista ADR-36 como "pendiente" y readme #36 como ✅ | C-16 | Ambos son parcialmente ciertos: licencias decididas, lista y PubMed pendientes → ADR-36 solo decide lo pendiente |
| H-05 | El esquema "completo" del Pre-S1 incluye la colección de Milvus, pero la dimensión del vector y el campo sparse dependen de ADR-39 (S1) | PRD §14 Pre-S1 · readme §3.1 · readme §6.1 #5 | ADR-39 AC-3 completa el esquema de Milvus; ver P-01 |
| H-06 | RN-20 / #22 exigen "listo" para habilitar un tipo, pero mama y próstata se habilitan desde el S1 con ~10 documentos semilla y catálogo `propuesta` | V-16 | DEC-19 (escenario: RN-20 como prerrequisito de G-Piloto) |
| H-07 | readme OL-06 tarea 5 omite el catálogo en los cambios que exigen la suite | C-10 | Prevalece el PRD (FR-20, AC-T5.4); ADR-41 AC-5 lo fija |
| H-08 | DEC-01 está estimada en 2; la convención exige 1 | backlog/features/FEAT-04 | Corrección pendiente para F3 (§3, referencia) |

### 4.4 Lo que no genera ADR ni DEC

- **Contrato `EvidenceAnalysis` y esquema con caso longitudinal (Pre-S1, PRD §14) — crítico para el recorrido principal:** decididos en readme §3.3 #24, #26, #10 y especificados en §3.1 y §4.1. El Pre-S1 los **congela** como historia técnica de FEAT-00 (F3), no como ADR. Depende de DEC-05 (destino ISUP) y, para Milvus, de ADR-39 (H-05).
- **Rate limit (RN-30):** decidido (H-03, Q-06).
- **V-13** (resolución de `cuarentena_pii` y `requiere_revision_identidad`), **V-14** (lista cerrada de endpoints de RN-17), **V-06** y **V-19** (comportamiento antes del equipo tratante): vacíos funcionales con regla ya implícita en el PRD; van como `> Pendiente de definir en refinamiento` en las historias de FEAT-01a/01b, FEAT-T4b, FEAT-T4a y FEAT-T4c (F3). No tienen opciones arquitectónicas con coste alto de reversión.
- **V-17** (prompt injection, SEG-13): AC de test en FEAT-06a, no decisión.

### 4.6 Fuera del recorrido principal (directiva de la hipótesis, 2026-10-05)

Ninguna bloquea una invariante de seguridad: todas tienen un workaround que mantiene RN-10…RN-14 y el ownership de `rag-orchestrator` intactos.

| ID | Momento | Workaround para el MVP | Por qué no rompe una invariante |
|---|---|---|---|
| ADR-42 | S4 | JSON completo + indicador de espera indeterminado | Es el estado actual (#8); nunca se emite contenido sin validar |
| ADR-44 | Post-MVP | Logs JSON + `traceId` + `/metrics` sin Prometheus/Grafana/OTel | Los logs ya excluyen identidad y PHI |
| DEC-10 | S5, como criterio del gate | Pregunta libre; plantillas `propuesta` | No toca datos |
| DEC-13 | Con FEAT-T4b; Post-MVP si se difiere | Lista provisional de motivos en configuración | No toca datos |

**En el recorrido por el gate G-Piloto (casos reales):** DEC-04 (ya en Pre-S1 por Q-07), DEC-12, DEC-15, DEC-16, DEC-17, DEC-18, DEC-19 y ADR-43 (condicional). Su gestión admite CLI o seed (marca de opt-out por CLI de administración, edad en configuración), nunca un control más débil: el `403` por opt-out, la regla de proveedores y la autorización por paciente se verifican igual en el `preflight`.

### 4.5 Equivalencia con los IDs tentativos de F1

| F1 (tentativo) | Final | | F1 (tentativo) | Final |
|---|---|---|---|---|
| DEC-02 protocolo VM | DEC-02 | | DEC-11 términos de estándares | DEC-04 |
| DEC-03 capacidad | DEC-03 | | DEC-12 canal opt-out | DEC-12 |
| DEC-04 tendencias | DEC-08 | | DEC-13 edad de mayoría | DEC-18 |
| DEC-05 aplicabilidad | DEC-11 | | DEC-14 muestra de metadatos | **CAL** (TBD-20) |
| DEC-06 mapeos firmados | DEC-17 | | DEC-15 revisión dataset eval | DEC-06 |
| DEC-07 plantillas | DEC-10 | | DEC-16 muestra aplicabilidad | DEC-14 |
| DEC-08 egreso y reglas clínicas | DEC-09 + DEC-13 | | DEC-17 metas eval | DEC-07 |
| DEC-09 N años | **CAL** (TBD-15) | | DEC-18 criterio de "listo" | DEC-19 |
| DEC-10 job de retención | DEC-15 | | Q-04 TNM/ISUP | DEC-05 |
| — (V-15) | DEC-16 (nueva) | | | |

---

## 5. Mapa de bloqueos

Las historias de la columna "Bloquea" se estiman **`?`** hasta que cierre la historia de la izquierda (salvo las que trabajan contra interfaces, contratos o catálogos en estado `propuesta` con implementaciones falsas). Orden por bloqueo del **recorrido principal**, no por tamaño.

| Orden | Historia | Recorrido | Bloquea (Feature · historia provisional) | Sprint más temprano afectado |
|---|---|---|---|---|
| 1 | DEC-05 | sí · crítica | FEAT-PL2 · migración inicial y seed de próstata; FEAT-04 · US-001 (ítem ISUP); DEC-01 Q5; DEC-11 | **S1** |
| 2 | (técnica FEAT-00) Congelar contrato `EvidenceAnalysis` y esquema | sí · crítica | Todo el walking skeleton (FEAT-06a, FEAT-10a, FEAT-PL2) | **S1** |
| 3 | DEC-02 | sí · crítica | FEAT-T5a · baseline manual VM-1/VM-2; FEAT-T5c; FEAT-T5d; DEC-14 | **S1** |
| 4 | ADR-39 (fase A: *embeddings*, *reranker*, NLI) | sí · crítica | FEAT-06c · indexación; esquema de Milvus; FEAT-06a · adapters de recuperación | **S1** |
| 5 | DEC-04 | sí (gate; workaround Q-07) | FEAT-PL3 · catálogo v1 con LOINC/CUPS/ATC; FEAT-PL2 · seed con esos códigos | S1 (solo para esos códigos) |
| 6 | DEC-03 | sí | Planificación del recorrido re-propuesto; puntos de recorte | S1 |
| 7 | ADR-36 | sí | FEAT-06c · ingesta y `CorpusRelease`; FEAT-09 | S3 (no bloquea la semilla del S1) |
| 8 | ADR-39 (fase B: runtime, LLM, OCR, p95) | sí · crítica | FEAT-06a · adapter LLM; FEAT-PL1; FEAT-01b · OCR; ADR-41 | **S1** |
| 9 | ADR-40 | sí · invariante | FEAT-06a · enmascaramiento de la pregunta; FEAT-T4a; FEAT-01b · gate de PII | **S1** |
| 10 | CAL TBD-03 (relevancia) | sí · crítica | FEAT-06a · "sin evidencia" (RN-02) | S1 |
| 11 | ADR-41 | sí | FEAT-T5a · *runner* y `evaluate`; FEAT-T5b | S1 |
| 12 | DEC-06 | sí | FEAT-T5a · cierre del baseline | S1 |
| 13 | DEC-07 | sí | FEAT-T5a/T5b · umbrales de regresión | S2 |
| 14 | DEC-09 | sí | FEAT-01b · regla de diagnóstico y semáforo; FEAT-03a; FEAT-03b | S2 |
| 15 | DEC-08 | sí | FEAT-02b · tendencia | S2 |
| 16 | CAL TBD-03 (OCR) | sí · crítica | FEAT-01b · `extraction_confidence` | S2 |
| 17 | DEC-01 (existe) | sí · crítica | FEAT-04 · US-001…US-006 (solo el catálogo firmado); DEC-19 | S3 (antes si P-03) |
| 18 | DEC-11 | sí · crítica | FEAT-08b, FEAT-10c, FEAT-08c, FEAT-T5b; DEC-19 | Feature de aplicabilidad (hoy S4) |
| 19 | DEC-14 | sí | G-Demo (VM-3); FEAT-T5d | Cierre de aplicabilidad (hoy S4) |
| 20 | DEC-12, DEC-16 | sí (gate) | FEAT-T4c · `403` por opt-out en la lista cerrada de endpoints; FEAT-T4b/T4d · registro de la marca | S5 (antes de G-Piloto; el canal se negocia desde el S3 con la entidad médica) |
| 21 | P-02 (autorización por paciente) → FEAT-T4c | sí (gate) | FEAT-T4c · pertenencia en todos los endpoints | S5 |
| 22 | DEC-15, DEC-18 | sí (gate) | FEAT-T4d · job de mayoría de edad; posible job de retención | S5 |
| 23 | DEC-17, DEC-19 | sí (gate) | FEAT-T4d · G-Piloto; FEAT-PL3 · `ENABLED_CANCER_TYPES` en piloto | S5 |
| 24 | ADR-43 | sí, condicional (gate) | FEAT-T4d · `preflight` y tests de aislamiento | S5 |
| 25 | ADR-42 | no | FEAT-10c, FEAT-07, FEAT-08b/08c (G-5) | S4 |
| 26 | DEC-13 | no | FEAT-T4b · egreso; FEAT-AP1 | Con FEAT-T4b |
| 27 | DEC-10 | no | FEAT-05; criterio del gate | S5 |
| 28 | ADR-44 | no | FEAT-PL5 | Post-MVP |
| — | ADR-7 | no | — | Futuro |

**Orden recomendado (por bloqueo del recorrido):**
1. **Pre-S1, en paralelo:** DEC-05 y la congelación del contrato y el esquema (FEAT-00) primero, porque la migración inicial y el contrato son caros de cambiar; DEC-02 (las metas de VM se congelan antes del S1, R-15, y son la medida de la hipótesis); fase A de ADR-39 si se acepta P-01; DEC-04 (Q-07); DEC-03 sobre el backlog de F3. ADR-36 arranca y puede cerrar en el S1 (D-09).
2. **Inicio del S1:** ADR-39 fase B y ADR-40 (invariante) en paralelo; calibración del umbral de relevancia; ADR-41 en cuanto haya LLM juez.
3. **Cierre del S1:** DEC-06, DEC-07, DEC-08, DEC-09 (los consume la reconstrucción del caso).
4. **Antes de las Features de faltantes y aplicabilidad:** DEC-01 y DEC-11 (ver P-03), y DEC-14 al cerrar aplicabilidad.
5. **Gate G-Piloto (casos reales, recorrido principal):** iniciar con la entidad médica y el área legal en el S3 las conversaciones de DEC-12, DEC-15, DEC-16 y DEC-18 (dependen de terceros) para cerrarlas en el S5; DEC-17, DEC-19 y ADR-43 (si la revisión de seguridad lo exige) antes de G-Piloto.
6. **Fuera del recorrido:** ADR-42 en el S4; DEC-13 con FEAT-T4b; DEC-10 como criterio del gate; ADR-44 Post-MVP.

---

## Preguntas abiertas

### P-01 · ¿Se adelanta la fase de *embeddings* de ADR-39 a Pre-S1?

- **Pregunta:** el PRD y el readme fijan el ADR de modelos locales "al inicio del Sprint 1", pero el Pre-S1 debe dejar el esquema completo (incluida la colección de Milvus) y la estimación de capacidad (DEC-03). ¿Se adelanta a Pre-S1 solo la medición *offline* de *embeddings*, *reranker* y NLI (no necesita el walking skeleton), dejando para el inicio del S1 el runtime, el LLM y el p95 de punta a punta?
- **Por qué importa:** la recuperación es la base de la hipótesis 3. Sin dimensión del vector ni campo sparse, el esquema de Milvus no está completo en Pre-S1 (H-05), y las historias del S1 que indexan el corpus o implementan adapters reales entran a la planificación en `?`, lo que deja a DEC-03 sin poder sumar el S1. Cambiar los *embeddings* a mitad del S1 obliga a reindexar.
- **Opción sugerida:** sí. Fase A de ADR-39 (*embeddings* → *reranker* → NLI) en Pre-S1 con el dataset de recuperación en español e inglés de OL-06 en borrador; fase B (runtime, LLM, OCR, p95 con el stack) en la primera semana del S1. Mismo ADR, misma numeración.
- **Alternativas descartadas:** (a) todo en el S1, como dice el PRD — deja el S1 en `?` y arriesga reindexar; (b) todo en Pre-S1 — no se puede medir el p95 de `/platform/evidence-analyses` sin el stack, que es una restricción dura.
- **Dueño:** usuario (PO) + Ingeniería.
- **Bloquea:** la completitud del esquema Pre-S1 (FEAT-00), la estimación de FEAT-06a/FEAT-06c en el S1 y DEC-03.

### P-02 · Autorización por paciente mínima viable para el piloto con casos reales

- **Pregunta:** con casos reales desde G-Piloto, la autorización por paciente (RN-15, FR-15, G-9, AC-T3.3) está en el camino crítico. ¿Qué es lo mínimo viable: (a) equipo tratante completo (`CareTeamMember` con principal y miembros, pertenencia validada en todos los endpoints, gestión por el tratante principal y el admin), o (b) un modelo reducido con asignación solo por el administrador?
- **Por qué importa:** decide el tamaño de FEAT-T4c en el S5 (el sprint con más prerrequisitos del gate) y si G-9 ("100 % de endpoints de paciente validan el equipo tratante") se cumple sin UI de autogestión. Q-02 ya adelantó la designación del principal a S4.
- **Opción sugerida:** **modelo completo en el backend, gestión mínima.** Se mantiene el esquema de #2 (`CareTeamMember`, varios miembros, uno principal) y la validación de pertenencia en **todos** los endpoints de paciente (control no negociable, G-9), pero la asignación de miembros la hace solo el administrador (CLI o pantalla mínima de admin, auditada); la autogestión del equipo por el tratante principal pasa a Post-MVP. `admin` sigue viendo todo.
- **Alternativas descartadas:** (a) equipo tratante completo con autogestión del principal en el S5 — agrega UI y flujos que no prueban la hipótesis y cargan el sprint del gate; (b) "un único equipo" donde todos los doctores ven a todos los pacientes — debilita el control: deja de ser autorización por paciente y contradice el `preflight` (autorización por equipo tratante) y G-9; (c) validar pertenencia solo en los endpoints de IA — G-9 exige todos los endpoints de paciente.
- **Dueño:** usuario (PO) + Ingeniería.
- **Bloquea:** el alcance de FEAT-T4c (S5), el `preflight real-data` (FEAT-T4d) y la estimación del S5 (DEC-03).

### P-03 · ¿Se adelanta la firma de los catálogos de datos críticos (DEC-01) y de aplicabilidad (DEC-11)?

- **Pregunta:** DEC-01 (S3) y DEC-11 (antes del S4) gobiernan las hipótesis 2 y 3. Si el slicing re-propuesto adelanta faltantes o aplicabilidad, ¿se adelanta también la sesión de firma del oncólogo, o las Features se construyen sobre el catálogo `propuesta` y la firma llega después?
- **Por qué importa:** sin catálogo firmado, M-04.x y VM-3 se miden contra una vara no validada, y el resultado de la hipótesis sería discutible. Además, SUP-4 (tiempo de los oncólogos) es el recurso más escaso: DEC-02, DEC-05, DEC-06, DEC-08, DEC-09, DEC-01, DEC-11, DEC-14 y DEC-17 compiten por él, más las sesiones de medición con casos sintéticos y con casos reales.
- **Opción sugerida:** construir sobre el catálogo `propuesta` (las historias no se bloquean; patrón de FEAT-04) y fijar la firma de DEC-01 y DEC-11 **al menos un sprint antes de la sesión de medición** de VM-3/VM-5, agrupando DEC-05, DEC-08, DEC-09, DEC-01 y DEC-11 en un mismo calendario de sesiones del oncólogo.
- **Alternativas descartadas:** (a) firmar todo en Pre-S1 — el oncólogo firmaría criterios sin haber visto el sistema y sin el destino de cada ítem implementado (RN-29); (b) firmar después de medir — invalida la medición de la hipótesis.
- **Dueño:** usuario (PO) + oncólogo asesor.
- **Bloquea:** la medición de VM-3 y VM-5 (DEC-14, FEAT-T5d) y el sprint de DEC-01 y DEC-11.

---

## Resoluciones del usuario a P-01…P-03 (2026-10-06)

Vinculantes para F3. Las historias de este fichero afectadas se ajustan así (F3 las aplica al escribir las Stories):

- **P-01 → ADR-39:** el faseo (embeddings/reranker/NLI primero vs. runtime) lo decide el propio ADR-39. Sin historia nueva.
- **P-02 → fuera del MVP:** la autorización por paciente la gestiona un sistema externo. FR-15 / FEAT-T4c pasa a Post-MVP; el MVP aplica solo RBAC. El `preflight real-data` (FEAT-T4d) no verifica pertenencia al equipo. Conflicto con PRD FR-15, G-9 y §11 registrado para enmendar la fuente.
- **P-03 → feedback por análisis valida:** puntuación 1–5 (VM-4) + dos checkboxes "faltantes correctos" / "faltantes útiles" (VM-5), sin texto libre. **DEC-01 y DEC-11** dejan de exigir firma: sus AC verifican que el catálogo se publica como `propuesta` revisada por el oncólogo y que su validación se mide con el feedback agregado (umbral en DEC-02). M-04.3 y la firma de RN-29/RN-20 quedan como conflicto con el PRD. DEC-17 (mapeos), DEC-10 (plantillas) y DEC-19 ("listo") **no** cambian salvo que el usuario lo indique.
