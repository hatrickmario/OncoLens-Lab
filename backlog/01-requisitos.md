# Inventario de requisitos · PRD v1.2

> **Fase F1 (`requirements-analyst`) · corrida completa · 2026-10-05.**
> Fuentes leídas del disco, por prioridad ante conflicto: `docs/PRD.md` v1.2 > `readme.md` > `CLAUDE.md`. `docs/AS-IS.md` y `docs/TO-BE.md` solo justifican valor (pains, JTBD): no crean requisitos. `backlog/features/FEAT-04-*.md` y `backlog/features/README.md` se leyeron solo para mapear la corrida piloto. `backlog/_piloto-v1/` no se leyó.
> Encuadre D-01: el producto entrega un **análisis de evidencia** con **opciones descritas en la evidencia**. Los restos de vocabulario v1.0 en las fuentes se registran como conflicto (§11), no se trasladan.
> Convención de evidencia: `[→ PRD §n ID]`, `[→ readme §n ID]`, `[→ CLAUDE.md]`, `[→ AS-IS §n]`. Los IDs `NFR-xx`, `SEG-xx` e `IA-xx` los asigna este inventario (orden de aparición en PRD §7, §11 y §12) y quedan fijos. Los IDs `FEAT-xx`, `DEC-xx` y `C-xx`/`V-xx`/`Q-xx` son **tentativos**.

## 0. Resumen y conteos

| Familia | Universo indicado | Encontrado en fuentes (grep) | En este inventario | Diferencia |
|---|---|---|---|---|
| FR | FR-01…FR-30 | 30 | 30/30 | — |
| RN | RN-01…RN-30 | 30 | 30/30 | — |
| NFR (PRD §7, filas) | 14 | 14 filas | 14/14 | — (NFR-09 es una fila de remisión "Seguridad → ver §11") |
| SEG (PRD §11, ítems) | 13 | 13 ítems | 13/13 | — |
| IA (PRD §12, filas) | 11 | 11 filas | 11/11 | — |
| CAP / T / AC-P.1 | CAP-01…CAP-11, T-1…T-5, AC-P.1 = 17 | 17 (+ CAP-12…CAP-19 fuera del MVP) | 17/17 | CAP-12…CAP-19 van a §7 (restricciones) |
| `AC-NN.N` | "53" | **54** (53 numéricos + `AC-11.2b`) | 54/54 | +1: `AC-11.2b` (R-10) no entra en un patrón `AC-NN.N` estricto |
| `AC-Tn.m` | contar aparte | **23** (T1:5, T2:4, T3:4, T4:6, T5:4) | 23/23 | `AC-T4.x` aparece en orden 1,2,3,5,6,4 en el PRD (sin hueco) |
| `AC-P.1x` | — | 2 (`AC-P.1a`, `AC-P.1b`) | 2/2 | — |
| `M-xx.y` | 36 | 36 | 36/36 | — |
| G / VM | G-1…G-16, VM-1…VM-6 | 16 / 6 | 22/22 | — |
| HU | HU-01…HU-26 | 26 (readme); el PRD cita 25 (falta HU-25) | 26/26 | HU-25 solo existe en readme (C-17) |
| OL | OL-01…OL-06 | 6 | 6/6 | — |
| TBD | TBD-01…TBD-21 | 21 | 21/21 | — |
| SUP / PREG | SUP-1…5, PREG-1…2 | 5 / 2 | 7/7 | — |
| ADR (readme §3.3 #n) | #1…#38 | 38 (+ 25 decisiones de tickets en readme §6.1) | 38/38 | 1 pendiente (#7), 3 parciales (#12, #30, #36); ADR sin ID: evaluación RAG, observabilidad, streaming, modelos locales (§7.5) |
| RU (recorridos) | — | RU-1…RU-10 | 10/10 | — |
| PP (principios) | — | PP-1…PP-7 | citados en §1 | — |
| Pains / JTBD | "P1…P12" | **9 pains** (P1, P3–P8, P10, P12) · JTBD 1–8 | 9 / 8 | P2, P9 y P11 **no existen** en AS-IS (C-19) |

**Hallazgos principales:** 19 vacíos (§10), 24 conflictos de fuentes (§11), 8 preguntas críticas de estructura (§12), 33 Features candidatas (§9) incluida FEAT-04 ya escrita.

---

## 1. Actores y necesidades

| Actor | Rol / sistema | Necesidad | Pain / JTBD (valor, no requisito) | Evidencia |
|---|---|---|---|---|
| Oncólogo tratante | `doctor` | Entender rápido el caso, saber qué falta, encontrar evidencia aplicable con citas verificables y decidir con control total ("no me digas qué hacer") | P1, P4, P5, P6, P7, P8, P12 · JTBD 1–5, 8 | [→ PRD §1.2], [→ AS-IS §4, §6] |
| Tratante principal | `doctor` + `CareTeamMember.is_primary` | Egresar y reactivar al paciente; registrar baja total | P10 (preparación) | [→ PRD §6 RN-17], [→ PRD §4 RU-8], [→ readme §5.6 HU-13] |
| Miembro del equipo tratante | `doctor` + `CareTeamMember` | Acceder solo a sus pacientes; compartir memoria de análisis | P12 | [→ PRD §5 FR-15], [→ PRD §5 FR-29] |
| Administrador | `admin` | Gestionar usuarios (CLI), equipo tratante, egresos, marcas de opt-out con referencia externa, ratificación por mayoría de edad, política de retención | — | [→ PRD §1.2], [→ PRD §4 RU-9], [→ readme §2.5] |
| Representante legal | Externo (registrado en `identity.LegalRepresentative`) | Representar al menor; su firma reposa en el sistema externo | — | [→ PRD §6 RN-16], [→ readme §3.2] |
| Entidad médica / colaboradores | Externo (convenio) | Proveer datos reales anonimizados; custodiar consentimientos; comunicar opt-outs con SLA | — | [→ PRD §1.2], [→ PRD §16 TBD-21], [→ PRD §15] |
| Oncólogo asesor / validador | Externo al rol `doctor` (gobierno) | Validar y firmar catálogos (datos críticos, aplicabilidad, mapeos, matriz ítem → campo), plantillas, muestras de evaluación; participar en baseline VM | SUP-4 | [→ PRD §14 G-Piloto], [→ PRD §18.6 SUP-4], [→ readme §6 OL-06] |
| Área legal | Externo (gobierno) | Validar diferir el job de retención; términos de uso de estándares; edad de mayoría | — | [→ PRD §16 TBD-07, TBD-16, TBD-17] |
| Ingeniería | Equipo | Estimar capacidad; decidir ADR de modelos y demás ADR técnicos | — | [→ PRD §16 TBD-01, TBD-19] |
| `web` (BFF) | Sistema | Único punto de entrada del navegador; Route Handlers; CSRF/`Origin` | — | [→ PRD §8], [→ CLAUDE.md] |
| `clinical-api` | Sistema (Backend 1) | Dueño de PostgreSQL clínico y `clinical-minio`; desidentifica; persiste antes de responder; normalización final | — | [→ PRD §8], [→ readme §3.3 #33] |
| Worker de extracción | Sistema (dentro de `clinical-api`) | Cola durable `Document` con `SKIP LOCKED`, reintentos ≤ 3 | — | [→ PRD §7 NFR-07], [→ readme §6.1 #9] |
| Job de mayoría de edad | Sistema (S5) | Marcar "requiere ratificación" | — | [→ PRD §5 FR-16] |
| `rag-orchestrator` | Sistema (Backend 2) | Recuperación, generación, validación, extracción, agente acotado; sin acceso a datos clínicos | — | [→ PRD §8], [→ PRD §11 #6] |
| LLM nativo | Sistema externo a Docker | Inferencia local (Metal) | — | [→ PRD §8], [→ readme §1.4] |
| Sistema externo de consentimientos | Externo | Custodia de consentimientos firmados; origen de la referencia de opt-out | — | [→ PRD §5 FR-16] |

**Principios de producto** (criterio de aceptación transversal, no Stories): PP-1 no prescribe · PP-2 primero el paciente · PP-3 aplicabilidad antes que relevancia · PP-4 origen verificable · PP-5 incertidumbre declarada · PP-6 el humano decide y los avisos no bloquean · PP-7 la privacidad no se negocia. [→ PRD §1.3]

**Pains y JTBD (solo justificación de valor):** P1 reconstrucción del caso → CAP-02 · P3 reconciliación → CAP-03 · P4 faltantes → CAP-04 · P5 recuperación → CAP-06 · P6 aplicabilidad → CAP-08 · P7 síntesis → CAP-07 · P8 vigencia → CAP-09 · P10 outcomes longitudinales → CAP-02/CAP-11 (paciente) · P12 confianza y trazabilidad → T-1/T-2/T-3. JTBD 1, 7 → CAP-02 · JTBD 2 → CAP-04 · JTBD 3 → CAP-05/06 · JTBD 4 → CAP-08 · JTBD 5 → CAP-07 · JTBD 6 → CAP-12 (Post-MVP) · JTBD 8 → T-1/T-2. [→ AS-IS §3, §4, §6]

---

## 2. Requisitos funcionales

Recorridos: RU-1 acceso · RU-2 registro · RU-3 ficha · RU-4 carga · RU-5 revisión · RU-6 análisis · RU-7 historial/decisión/evolución · RU-8 ciclo de vida · RU-9 administración · RU-10 vista de caso [→ PRD §4].
"✂" = candidato a división (comportamientos verificables por separado); se conserva el ID original.

| ID | Requisito (resumen) | Actor | Recorrido | Sprint(s) | CAP / T | HU | OL | Features candidatas | Evidencia |
|---|---|---|---|---|---|---|---|---|---|
| FR-01 | Login/logout con cookie opaca `HttpOnly/Secure/SameSite=Strict`; 8 h absoluta, 30 min inactividad; rotación; Argon2id; `401` genérico; bloqueo 15 min tras 5 intentos sin revelarlo; todo configurable | doctor, admin | RU-1 | 1 | T-4 | HU-01 | — (backlog S1 no detallado) | FEAT-T4a | [→ PRD §5 FR-01], [→ PRD §17], [→ readme §5 HU-01], [→ readme §2.5] |
| FR-02 | Listado paginado; búsqueda exacta por tipo+número de documento (índice ciego) y por nombre dentro del equipo tratante; filtros estado/origen; distintivo "SINTÉTICO" | doctor | RU-3 | 1 | T-4 | HU-06 | — | FEAT-T4a | [→ PRD §5 FR-02], [→ readme §5.6 HU-06] |
| FR-03 | ✂ Registro manual (S1) **y** asistido por OCR con confirmación (S2); tipos de documento (incl. tarjeta de identidad); identidad cifrada; sin captura de consentimientos; `agreement_reference`; `409` existente; `422` menor sin representante; `422` real sin convenio | doctor | RU-2 | 1 (manual) · 2 (asistido) | T-4 (manual) · CAP-01 (asistido) | HU-07, HU-08 | OL-01 (esquema), OL-05 (extracción) | FEAT-T4a (manual) · FEAT-01c (asistido) | [→ PRD §5 FR-03], [→ PRD §17], [→ readme §5.6 HU-07, HU-08] |
| FR-04 | ✂ Ficha: identificación, diagnóstico vigente (CIE-10), estado funcional, biomarcadores recientes **con tendencia** (umbral por biomarcador en catálogo), contador de pendientes, acceso a vista de caso; cada lectura auditada; `404`; `403` equipo (S5) | doctor | RU-3 | 1–2 (tendencia y procedencia OCR en S2) | CAP-02 (AC-02.4) | HU-02, HU-05 | OL-05 (`provenance`) | FEAT-02a (S1) · FEAT-02b (S2 tendencia) | [→ PRD §5 FR-04], [→ PRD §17], [→ readme §5 HU-02, HU-05] |
| FR-05 | Carga de uno o varios PDF; *magic bytes*; ≤ 20 MB; `202`; batch `207` con un `Document` por archivo; `422` formato; `409` checksum; `422` egresado | doctor | RU-4 | 2 | CAP-01 | HU-04 | OL-05 | FEAT-01a | [→ PRD §5 FR-05], [→ PRD §18 AC-01.2], [→ readme §5 HU-04] |
| FR-06 | ✂ Extracción local: capa de texto + OCR; gate de PII por clase de datos; estructuración LLM (diagnóstico, exámenes, biomarcadores, notas, **eventos**, **tratamientos previos**, **atributos**); **propuesta** de códigos; confianza por campo con señales deterministas; `source_span`; transacción; `cuarentena_pii`, `requiere_revision_identidad`, `error`, 3 reintentos, sin colgados, reproceso idempotente | worker, rag-orchestrator | RU-4 | 2 | CAP-01, CAP-02 | HU-04, HU-05 | OL-05 | FEAT-01b | [→ PRD §5 FR-06], [→ PRD §18 AC-01.3], [→ readme §6 OL-05] |
| FR-07 | Visor del documento de origen en la página del valor con fragmento resaltado; streaming vía `web`, sin caché, auditado; varias fuentes por dato | doctor | RU-3 | 2 | CAP-01 · T-1 | HU-05 (esc. 1) | OL-05 | FEAT-01a | [→ PRD §5 FR-07], [→ PRD §17] |
| FR-08 | Verificar, corregir (`manual_correction`, original → `reemplazado`) o rechazar datos extraídos, incl. eventos, tratamientos previos y mapeos; regla de diagnóstico en conflicto por fecha; resolver valores en conflicto y `no_mapeado` | doctor | RU-5 | 3 | CAP-03 | HU-09 | — | FEAT-03b | [→ PRD §5 FR-08], [→ readme §5.6 HU-09], [→ readme §3.3 #12] |
| FR-09 | ✂ Análisis de evidencia (`EvidenceAnalysis`): pregunta libre o plantilla; contexto etiquetado y desidentificado; expansión bilingüe; dense (S1) + sparse (S3); filtros; reranker y umbral; síntesis, aplicabilidad y opciones (S4); agente (S4); validación de citas y soporte; orden por aplicabilidad; ≤ 1 opción S1–S3, ≤ 3 desde S4; persistir antes de responder; bordes `sin_evidencia`, `tipo_no_habilitado`, `403`, `422`, `429`, `503`, `504`, `500` | doctor, clinical-api, rag-orchestrator | RU-6 | 1 / 3 / 4 | CAP-06, CAP-10 (y CAP-05, CAP-07, CAP-08) | HU-03, HU-10 | OL-02, OL-03, OL-04 | FEAT-06a (S1) · FEAT-06b (S3) · FEAT-10c (S4) | [→ PRD §5 FR-09], [→ PRD §17], [→ PRD §10] |
| FR-10 | ✂ (a) **Opciones** sin soporte → sección colapsada "Descartadas por falta de soporte — solo para revisión", no vinculables a tratamiento; (b) **afirmaciones sueltas** sin soporte → se omiten y cuentan en `omittedClaims` | rag-orchestrator, doctor | RU-6 | 1 | CAP-10 · T-1 | HU-03 (esc. 3) | OL-02, OL-04 | FEAT-10a · FEAT-T1a | [→ PRD §5 FR-10], [→ PRD §6 RN-01] |
| FR-11 | ✂ Avisos deterministas si una opción o criterio depende de datos pendientes (S2), en conflicto o faltantes (S3); no bloquean | clinical-api | RU-6 | 2 · 3 | CAP-10, CAP-08 · T-3 | HU-05 (PRD §17) | — | FEAT-10b | [→ PRD §5 FR-11], [→ PRD §17] |
| FR-12 | ✂ Historial: citas desde snapshot; **dos marcas** ("Desactualizado: datos del paciente" con cascada; "Evidencia o catálogo más reciente"); aplica a análisis y resúmenes; re-ejecutar crea uno nuevo; comparar | doctor | RU-7 | 4 | CAP-11 | HU-11, HU-24 | — | FEAT-11a | [→ PRD §5 FR-12], [→ PRD §18 AC-11.2, AC-11.2b, AC-11.3] |
| FR-13 | Registrar tratamiento decidido con vínculo opcional al análisis (nunca a una descartada); ATC; aparece como evento **derivado** "Decisión registrada en OncoLens" | doctor | RU-7 | 4 | CAP-11 | HU-12 | — | FEAT-11b | [→ PRD §5 FR-13], [→ PRD §18 AC-11.4] |
| FR-14 | ✂ Egreso (tratante principal o admin) con snapshot longitudinal si no hay opt-out de investigación; reactivación con episodio nuevo; opt-out de investigación borra histórico; baja total irreversible con confirmación; egresado no admite registros | tratante principal, admin | RU-8 | 4 | CAP-11 · T-4 · AC-P.1 | HU-13 | — | FEAT-T4b · FEAT-AP1 | [→ PRD §5 FR-14], [→ PRD §18 AC-P.1] |
| FR-15 | Equipo tratante (varios activos, uno principal); todos los endpoints de paciente validan pertenencia salvo `admin` | admin, doctor | RU-9 | 5 | T-4 | HU-14 | — | FEAT-T4c | [→ PRD §5 FR-15], [→ readme §5.0 S5 KR1] |
| FR-16 | ✂ Consentimientos externos; presunción con convenio; solo `admin` registra/revoca opt-out (`analisis_ia`, `investigacion`) con referencia, fecha y motivo; opt-out IA → `403` en toda generación con IA (no afecta ficha, caso ni carga); opt-out investigación → borra histórico y evita snapshot; menores: representante + job de mayoría de edad "requiere ratificación" | admin, job | RU-9 | 1 (datos) · 4 (UI admin) · 5 (validación en endpoints IA + job) | T-4 | HU-13 (PRD) / HU-14 (readme) — ver C-08 | OL-01 (`PatientOptOut`, seed d) | FEAT-T4a (S1) · FEAT-T4b (S4) · FEAT-T4c (S5) · FEAT-T4d (job) | [→ PRD §5 FR-16], [→ PRD §17], [→ readme §5.0 S4, S5] |
| FR-17 | ✂ Retención 10 años renovable a 20; al vencer = baja total; no aplica a sintéticos/anonimizados; **MVP: política y campos `retention_*` desde el alta**; job diario con aviso a 90 días → Post-MVP | sistema | — | 1 (campos); job Post-MVP | T-4 | — (operación; PRD §17) | OL-01 | FEAT-T4a | [→ PRD §5 FR-17], [→ PRD §17] |
| FR-18 | ✂ Auditoría de accesos (ficha, vista de caso, documento) y acciones (resumen, análisis, re-ejecución, carga, revisión, evolución, búsquedas complementarias, opt-out, bajas, renovaciones, borrados) sin PHI | sistema | — | 2 (accesos) · 5 (completa) | T-1 (AC-T1.5) · T-4 | — (transversal) | OL-01 (`AuditLog` desde S2) | FEAT-T1b | [→ PRD §5 FR-18], [→ PRD §18 AC-T1.5] |
| FR-19 | ✂ Corpus: fuentes públicas abiertas, licencia registrada y aceptada (`license_class`); normalización, chunking, embedding dense+sparse, versionado reanudable; metadatos estructurados (`extraido_verificado` = LLM + NLI + muestra humana); `CorpusRelease` con fecha de corte; rechazo sin licencia | sistema, rag-orchestrator | — | 1 (semilla y esquema) · 3 (ingesta) | CAP-06 (y prerrequisito de CAP-07/08/09) | — (OL-02) | OL-02 | FEAT-06c | [→ PRD §5 FR-19], [→ PRD §18 M-08.3] |
| FR-20 | ✂ Suite de evaluación reproducible obligatoria en todo cambio de modelo, prompt, umbral, catálogo o corpus; métricas G-3, G-4, G-6–G-8, G-11–G-14, G-16, metadatos; baseline técnico S1 **y** baseline manual VM-1/VM-2; medición VM-1…VM-6 | Ingeniería, oncólogos | RU-7 (VM-4) | 1 y continuo | T-5 | — (PRD) / HU-25 (readme) | OL-06 | FEAT-T5a…T5d | [→ PRD §5 FR-20], [→ PRD §17], [→ readme §5.6 HU-25] |
| FR-21 | ✂ Vista de caso: timeline con eventos derivados (R-03) y `ClinicalEvent` solo para tipos sin tabla; sección "sin fecha confiable"; tratamientos previos por línea; series (PSA siempre); atributos; **resumen del caso** a pedido con verbalización determinista + NLI, aviso RN-19 + "Verifique contra las fuentes", persistido como `resumen_caso`, sujeto a RN-15 y RN-17 | doctor | RU-10 | 1 (esquema) · 2 (vista, extracción, resumen) | CAP-02 | HU-15, HU-16 | OL-01, OL-05 | FEAT-02b (vista) · FEAT-02c (resumen) | [→ PRD §5 FR-21], [→ PRD §18 AC-02.x] |
| FR-22 | ✂ Normalización CIE-10/LOINC/CUPS/ATC con catálogo versionado y sinónimos ES/EN; `mapping_status` en toda entidad con códigos; B2 propone, B1 decide (también datos manuales); duplicado → un dato con varias fuentes; conflicto → ambos `requiere_revision` enlazados; sin reporte CAC | clinical-api, rag-orchestrator, doctor | RU-4, RU-5 | 2 (normalización y duplicados) · 3 (conflictos y revisión de mapeos) | CAP-03 | HU-17 | OL-05 | FEAT-03a (S2) · FEAT-03b (S3) | [→ PRD §5 FR-22], [→ PRD §18 AC-03.x], [→ readme §3.3 #23, #25, #33] |
| FR-23 | Checklist determinista de datos críticos (4 estados), aviso previo no bloqueante "Cargar información"/"Continuar con aviso", faltantes como "desconocido", sin LLM, matriz ítem → campo, reglas en catálogo validadas por el oncólogo | doctor, clinical-api | RU-10, RU-6 | 3 | CAP-04 | HU-18 | — | **FEAT-04 (escrita)** | [→ PRD §5 FR-23], [→ PRD §18 AC-04.x], [→ backlog/features/FEAT-04] |
| FR-24 | Síntesis con "Puntos de acuerdo" y "Discrepancias" (≥ 2 fuentes), causa de discrepancia o "no identificada", etiquetas factuales del catálogo, una sola fuente → sin discrepancias y declarado, sin puntaje de solidez | rag-orchestrator | RU-6 | 4 | CAP-07 | HU-21 | — | FEAT-07 | [→ PRD §5 FR-24], [→ PRD §18 AC-07.x] |
| FR-25 | ✂ Aplicabilidad criterio a criterio por fuente (Coincide/Parcial/No coincide/Desconocido con causa); valor del paciente copiado; estado determinista si ambos estructurados; conteo, nunca puntaje; "Población no comparable"; agregación por opción (fuente más aplicable, `perSource`) | rag-orchestrator | RU-6 | 1 (contrato) · 4 (funcionalidad) | CAP-08 | HU-22 | OL-02 (contrato) | FEAT-06a (contrato S1) · FEAT-08b (S4) | [→ PRD §5 FR-25], [→ PRD §18 AC-08.x] |
| FR-26 | Vigencia: cada cita con fecha, versión (guías), tipo e idioma; "Evidencia actualizada al ‹corte›"; "Posiblemente desactualizada" > N años; en historial "Existe una versión más reciente" | rag-orchestrator, doctor | RU-6, RU-7 | 3 | CAP-09 | HU-20 | — | FEAT-09 | [→ PRD §5 FR-26], [→ PRD §18 AC-09.x] |
| FR-27 | ✂ Base del análisis en **todo** análisis (incl. "sin evidencia"), escalonada: S1 (a, d, e, f, omitidas) · S3 (b, c, g) · S4 (h, i); resumen visible sin expandir; persistida e idéntica en historial; esquema `AnalysisBasis` final desde S1 | clinical-api, rag-orchestrator | RU-6 | 1 / 3 / 4 | T-2 | HU-20 | OL-03 (incisos S1) | FEAT-T2a (S1) · FEAT-T2b (S3) · FEAT-T2c (S4) | [→ PRD §5 FR-27], [→ PRD §18 T-2] |
| FR-28 | Plantillas por tipo de cáncer y escenario, prellenadas, editables, configurables, validadas por el oncólogo (≥ 5 por tipo) | doctor, oncólogo asesor | RU-6 | 3 | CAP-05 | HU-19 | — | FEAT-05 | [→ PRD §5 FR-28], [→ PRD §18 AC-05.2, M-05.1] |
| FR-29 | ✂ (a) Análisis, resúmenes y decisiones como eventos derivados; (b) registro de evolución (`ClinicalEvent`) solo con paciente activo; (c) memoria de los últimos N análisis por paciente, todo el equipo, sin desactualizados ni resúmenes, cascada, rotulada y no citable, desidentificada | doctor, clinical-api | RU-7 | 4 | CAP-11 | HU-23, HU-24 | OL-03 (memoria se monta sobre el gateway) | FEAT-11b (evolución) · FEAT-11c (memoria) | [→ PRD §5 FR-29], [→ PRD §18 AC-11.4–AC-11.6] |
| FR-30 | Agente acotado: única herramienta recuperación sobre corpus; ≤ 1 iteración y ≤ 3 sub-consultas en el *deadline*; regenera solo bloques afectados; registro en Base (i) y `agent_steps`; misma validación; nunca tras "sin evidencia" | rag-orchestrator | RU-6 | 4 | CAP-08 | HU-26 | — | FEAT-08c | [→ PRD §5 FR-30], [→ PRD §18 AC-08.7], [→ readme §3.3 #37] |

**Escalonados por sprint a respetar:** FR-03 (1 manual / 2 asistido) · FR-04 (1 / 2) · FR-09 (1 dense + contrato + 1 opción / 3 híbrida + filtros / 4 síntesis, aplicabilidad, ≤ 3 opciones, agente) · FR-11 (2 pendientes / 3 conflicto y faltantes) · FR-16 (1 datos / 4 UI admin / 5 validación y job) · FR-18 (2 accesos / 5 completa) · FR-19 (1 semilla / 3 ingesta) · FR-21 (1 esquema / 2 vista y resumen) · FR-22 (2 / 3) · FR-25 (1 contrato / 4) · FR-27 (S1 a,d,e,f,omitidas / S3 b,c,g / S4 h,i).

---

## 3. Reglas de negocio (invariantes → AC transversales)

"Dueña propuesta": la Feature/Story que verifica la regla de forma exhaustiva; las demás llevan regresión. Las RN que atraviesan varias capacidades o tipos de salida tienen dueña en la Feature transversal `FEAT-T1…T5`. "Sprint del control": cuándo existe el mecanismo que la hace cumplir.

| ID | Regla | Afecta a (FR / CAP) | Dueña propuesta (Feature · Story) | Sprint del control | Verificable como | Evidencia |
|---|---|---|---|---|---|---|
| RN-01 | Toda opción y afirmación generada mostrada tiene ≥ 1 cita/enlace **y** pasa soporte; datos del paciente: verbalización determinista + NLI; opción sin soporte → descartadas; afirmación suelta → omitida y contada | FR-09, FR-10, FR-21, FR-24, FR-25, FR-27 · CAP-02/07/08/10, T-1 | **FEAT-T1a** · "Validador de citas y soporte para todo tipo de afirmación" (opciones S1, resumen S2, supuestos/limitaciones S3, síntesis/aplicabilidad S4) | S1 (opciones) → S4 (todos los tipos) | Test de dominio + suite T-5 (G-2 = 100%, M-02.3, M-10.1) | [→ PRD §6 RN-01], [→ PRD §18 AC-T1.2], [→ readme §3.3 #34] |
| RN-02 | Sin chunks sobre umbral → "sin evidencia" sin LLM ni agente; `top_relevance_score = null`; Base con incisos del sprint | FR-09, FR-27, FR-30 · CAP-06 | **FEAT-06a** · guard "sin evidencia" (OL-02/OL-03) | S1 (LLM) · S4 (agente) | Test: LLM/agente no invocado; `null` ≠ `0.0` | [→ PRD §6 RN-02], [→ readme §6.1 #1] |
| RN-03 | `relevance_score` del reranker, rotulado "Relevancia de la evidencia", metadato secundario; no ordena opciones ni mide solidez | FR-09 · CAP-10 | **FEAT-10a** · tarjeta de opción (OL-04) | S1 | Test UI de rótulo; test de orden (S4) | [→ PRD §6 RN-03], [→ readme §3.3 #8] |
| RN-04 | Datos de cita copiados del corpus, nunca del texto generado; idioma original | FR-09, FR-24, FR-26 · T-1 | **FEAT-T1a** · copia de metadatos de cita | S1 | Test de dominio (OL-02 tarea 5) | [→ PRD §6 RN-04], [→ PRD §18 AC-T1.3] |
| RN-05 | Solo chunks `is_current`; histórico del corpus nunca se borra | FR-09, FR-19 · CAP-06 | **FEAT-06c** · versionado del corpus | S1 (filtro) · S3 (versionado en ingesta) | Test Milvus filtro; test de reingesta | [→ PRD §6 RN-05], [→ readme §3.3 #5] |
| RN-06 | Ningún análisis se muestra sin persistir | FR-09, FR-12, FR-21 · CAP-06/10/11/02 | **FEAT-T1a** (transversal: análisis S1, resumen S2, re-ejecución S4). *El piloto la asignó a US-OL03-01 (provisional); F3 debe absorberla* | S1 | Test: fallo de persistencia → `500` sin resultado (NFR-08) | [→ PRD §6 RN-06], [→ readme §6 OL-03], [→ backlog/features/README.md] |
| RN-07 | Dato OCR con confianza y revisión; entra al RAG etiquetado; rechazados/reemplazados nunca | FR-06, FR-08, FR-09, FR-21 · CAP-01/02/03 | **FEAT-T1a** (procedencia transversal: contexto, timeline, series, resumen) | S1 (etiquetas en contexto) · S3 (exclusión: `rechazado`/`reemplazado` existen con HU-09) | Test del constructor de contexto; AC-02.6 | [→ PRD §6 RN-07], [→ PRD §18 AC-02.6] |
| RN-08 | Un dato extraído nunca reemplaza en silencio a uno verificado; diagnóstico por fecha | FR-06, FR-08, FR-22 · CAP-03 · T-3 | **FEAT-03a** (regla en extracción S2) · regresión FEAT-03b | S2 (extracción) · S3 (resolución) | Test de las tres ramas de fecha (OL-05) | [→ PRD §6 RN-08], [→ readme §3.3 #12] |
| RN-09 | El OCR nunca crea pacientes sin confirmación | FR-03 · CAP-01 · T-3 | **FEAT-01c** · registro asistido | S2 | Test: `IntakeDraft` no crea `Patient` | [→ PRD §6 RN-09] |
| RN-10 | Identidad cifrada; nunca sale hacia IA, histórico, logs ni auditoría | FR-02, FR-03, FR-18 · T-4 | **FEAT-T4a** · identidad cifrada e índice ciego | S1 | Test SQL crudo; test de no-fuga | [→ PRD §6 RN-10], [→ readme §6 OL-01] |
| RN-11 | Contexto a IA desidentificado **siempre** (seudónimo por consulta, fechas relativas, texto libre enmascarado), incl. eventos, tratamientos previos, faltantes y análisis previos | FR-06, FR-09, FR-21, FR-23, FR-29 · T-4 | **FEAT-T4a** · historia transversal "Desidentificación del contexto" con regresión en FEAT-02c, FEAT-04, FEAT-11c. *El piloto la asignó a US-OL03-01* | S1 (base) · S2 (eventos, tratamientos) · S3 (notas, faltantes) · S4 (memoria) | Tests de no-fuga con PII sembrada (M-11.4, AC-T4.3) | [→ PRD §6 RN-11], [→ PRD §18 AC-T4.2, AC-T4.3] |
| RN-12 | Datos reales solo con modelos locales; nube solo sintéticos | FR-06, FR-09 · T-4 | **FEAT-T4a** · regla de proveedores en ambos backends | S1 (OL-02 test) / S2 (readme §5.0) — ver C-23 | Test sin llamada a la nube; `503` sin respaldo | [→ PRD §6 RN-12], [→ readme §6 OL-02] |
| RN-13 | Ningún dato real antes de S5 y gate G-piloto; calibración real fuera de app y repo | T-4 | **FEAT-T4d** · gate G-piloto y `preflight` | S1 (banderas `REAL_*=false`, seed se niega en `piloto`) · S5 (`preflight`) | `preflight` en verde; arranque falla con prerrequisito ausente | [→ PRD §6 RN-13], [→ readme §2.5] |
| RN-14 | Repo público sin datos reales ni secretos | Todo | **FEAT-PL1** · CI con escaneo de secretos y PII | S1 | Chequeo de CI | [→ PRD §6 RN-14], [→ readme §6 OL-06 AC] |
| RN-15 | Consentimiento presunto con opt-out; **toda** generación con IA sobre opt-out `analisis_ia` → `403`; sin convenio no se presume | FR-09, FR-12, FR-16, FR-21, FR-30 · T-4 | **FEAT-T4c** · "403 por opt-out en toda generación con IA" | **S5** | Test por endpoint de generación (G-9 = 0) | [→ PRD §6 RN-15], [→ PRD §18 AC-T4.6] |
| RN-16 | Tarjeta de identidad requiere representante legal registrado | FR-03 · T-4 | **FEAT-T4a** · registro manual | S1 | `422` sin representante | [→ PRD §6 RN-16], [→ PRD §18 AC-T4.5] |
| RN-17 | Solo tratante principal o admin egresan; egresado no admite ningún registro | FR-05, FR-09, FR-12, FR-14, FR-21, FR-29 · T-3/T-4 | **FEAT-T4b** · "422 por paciente egresado en todo registro" | **S4** (el egreso existe desde S4; readme lo pone en S5, ver C-07) | Test `422` por endpoint | [→ PRD §6 RN-17], [→ PRD §5 FR-14] |
| RN-18 | Retención 10→20 años; baja total borra identidad y seudonimiza; job Post-MVP | FR-14, FR-17 · T-4 | **FEAT-T4a** (campos S1) · **FEAT-T4b** (baja total S4) | S1 (campos) · S4 (baja total) | Test de baja total | [→ PRD §6 RN-18] |
| RN-19 | Toda salida generada muestra el aviso de IA y "Uso académico/investigación"; resumen agrega "Verifique contra las fuentes" | FR-09, FR-21 · T-3 | **FEAT-T3** · avisos en toda salida | S1 (análisis) · S2 (resumen) | Test UI de literales (ver C-14 sobre el literal) | [→ PRD §6 RN-19], [→ PRD §18 AC-T3.1] |
| RN-20 | Un tipo de cáncer se habilita solo si cumple "listo" (catálogo revisado, corpus ≥ 20 docs, dataset en meta, documentos de laboratorio cubiertos) | FR-09, FR-04 · T-5 | **FEAT-PL3** (`ENABLED_CANCER_TYPES`, `tipo_no_habilitado`) + DEC de criterio | S1 (configuración) · S5 (criterio firmado) | `tipo_no_habilitado` sin LLM; checklist de "listo" | [→ PRD §6 RN-20], [→ readme §3.3 #22] |
| RN-21 | Solo fuentes públicas abiertas con licencia aceptada; NCCN/ESMO excluidas sin bloquear, declaradas | FR-19, FR-27 (e) · CAP-06 | **FEAT-06c** · validación de licencia en ingesta | S1 (semilla) · S3 (ingesta) | Rechazo de documento sin licencia/ND | [→ PRD §6 RN-21], [→ readme §3.3 #36] |
| RN-22 | Todo valor "a calibrar"/"propuesta" vive en configuración | Todo | **FEAT-PL1** · convención de configuración (y regla de DoD) | S1 | Revisión de DoD; tests que cambian config | [→ PRD §6 RN-22], [→ readme §6.0 DoD] |
| RN-23 | Lenguaje no prescriptivo en salidas y UI; lista de términos prohibidos en tests | FR-09, FR-21, FR-24, FR-25 · T-3, CAP-10 | **FEAT-T3** · lista de términos prohibidos sobre UI y salidas (la suite T-5 la ejecuta) | S1 | G-14 = 0, M-10.2 = 0 | [→ PRD §6 RN-23], [→ PRD §18 AC-10.3, AC-T3.4] |
| RN-24 | Análisis previos: contexto rotulado, nunca citables ni soporte NLI | FR-29, FR-30 · CAP-11 | **FEAT-11c** · memoria de análisis | S4 (el validador de citas de S1 ya rechaza citas no recuperadas) | M-11.3 = 0; test específico | [→ PRD §6 RN-24], [→ readme §2.6] |
| RN-25 | Metadatos factuales de la fuente copiados del catálogo del corpus; ausente → "No disponible" | FR-24, FR-25, FR-26 · T-1 | **FEAT-T1a** (transversal: síntesis, aplicabilidad, vigencia) | S3 (vigencia) · S4 (etiquetas y población) | M-07.3 = 100% | [→ PRD §6 RN-25], [→ PRD §18 AC-07.3] |
| RN-26 | Avisos clínicos no bloquean; solo bloquean consentimiento, egreso y equipo tratante | FR-11, FR-12, FR-23, FR-25 · T-3 | **FEAT-T3** · "Los avisos clínicos no bloquean" (AC-T3.3) | S2 (pendientes) → S5 (verificado en G-Piloto con los bloqueos) | Test E2E por aviso | [→ PRD §6 RN-26], [→ PRD §18 AC-T3.3] |
| RN-27 | Códigos solo del catálogo versionado; sin mapeo → `no_mapeado`, nunca inventado ni descartado | FR-06, FR-13, FR-22 · CAP-03 | **FEAT-03a** · normalización | S2 | M-03.5 = 0 | [→ PRD §6 RN-27] |
| RN-28 | Aplicabilidad = conteo; orden determinista (excluyentes en No coincide ↑, Coincide ↓, relevancia desempate); opción usa fuente más aplicable; criterio de orden visible | FR-09, FR-25 · CAP-08, CAP-10 | **FEAT-10c** (orden) · regresión FEAT-08b (agregación) | S1 (texto del criterio visible, OL-04) · S4 (orden real) | Test de dominio del orden | [→ PRD §6 RN-28], [→ readme §3.3 #27, #31] |
| RN-29 | Todo ítem de catálogo tiene campo de destino; catálogo con ítems sin destino no se publica | FR-23, FR-25 · CAP-04, CAP-08 | **FEAT-04** (dueña, US-001) | S3 (validador) — hueco S1–S2 (V-12) | AC-04.5 | [→ PRD §6 RN-29], [→ backlog/features/FEAT-04] |
| RN-30 | 6 consultas/min y 1 en curso por usuario y paciente; semáforo de inferencia; aplica a análisis, resumen y re-ejecución | FR-09, FR-12, FR-21 · T-4 | **FEAT-T4a** o FEAT-06a (gateway) — por decidir (Q-06) | **Sin sprint en PRD §14** (OL-03 lo pone como alcance complementario S1 y a la vez "ADR pendiente", C-09) | Test `429` con `Retry-After` | [→ PRD §6 RN-30], [→ readme §2.5] |

### 3.1 Controles diferidos: dónde aplican y dónde **no**

| Control | Sprint | Aplica a | **No** aplica a | Evidencia |
|---|---|---|---|---|
| RN-15 `403` por opt-out `analisis_ia` | S5 | `POST /platform/evidence-analyses` (incl. búsqueda complementaria interna) · `POST …/case-summary` · `POST /platform/evidence-analyses/{id}/rerun` | `GET /platform/patients/{id}` (ficha) · `GET …/case` · `GET …/completeness` · `POST/GET …/documents` y `…/batch` · `GET …/documents/{docId}/file` · `GET …/analyses` (lectura de historial) · `GET …/compare` (lectura) · `GET /platform/question-templates` · `POST …/feedback` · `POST/GET …/clinical-events`, `…/prior-treatments`, `…/treatments` · login. **Ambiguo:** la extracción con LLM en `POST /documents/extract` (V-15) | [→ PRD §5 FR-16], [→ PRD §6 RN-15] |
| RN-17 `422` por paciente egresado | S4 | `POST /platform/evidence-analyses` · `POST …/case-summary` · `POST …/rerun` · `POST …/documents` y `…/batch` · `POST …/clinical-events` (evolución). **Ambiguo** (V-14): `POST …/treatments`, `POST …/prior-treatments`, `POST …/clinical-attributes`, `PATCH …/review`, `POST …/feedback`, `POST /platform/intake-drafts` | `GET` de lectura · `POST …/episodes` (reactivación) · `POST …/withdrawals` (baja total) · `POST/DELETE …/opt-outs` (admin) | [→ PRD §6 RN-17], [→ PRD §5 FR-14] |
| FR-15 `403` sin pertenencia al equipo | S5 | Todos los endpoints `/platform/patients/{id}/…` y `/platform/evidence-analyses…` | Rol `admin` · `/platform/auth/*` · `GET /platform/question-templates`. **Ambiguo:** alcance del listado y de la búsqueda exacta por documento en `GET /platform/patients` (FR-02 solo restringe la búsqueda por nombre) | [→ PRD §5 FR-15], [→ PRD §5 FR-02] |
| RN-30 `429` | sin fijar | Análisis, resumen, re-ejecución | Lecturas, carga de documentos (tiene su cola), feedback | [→ PRD §6 RN-30] |

---

## 4. Requisitos no funcionales, de seguridad y de IA

### 4.1 NFR (PRD §7, 14 filas)

| ID | Categoría | Requisito (texto fuente) | Meta | ¿Calibrable? | Sprint | Evidencia |
|---|---|---|---|---|---|---|
| NFR-01 | Rendimiento | Análisis de evidencia de punta a punta | p95 ≤ 15 s; tiempo máximo hacia Backend 2: 30 s | sí (S4, TBD-08) | S1 medir · S4 recalibrar | [→ PRD §7], [→ PRD §2 G-5], [→ PRD §18 M-06.2] |
| NFR-02 | Rendimiento | Extracción por documento | p95 ≤ 60 s | sí ("propuesta") | S2 | [→ PRD §7], [→ PRD §18 M-01.2] |
| NFR-03 | Rendimiento | Ficha, listado y vista de caso (sin resumen) | p95 ≤ 1 s ficha y listado; ≤ 2 s vista de caso | sí (propuesta) | S1 · S2 | [→ PRD §7], [→ PRD §18 M-02.4] |
| NFR-04 | Capacidad | Usuarios del piloto | 10 registrados, 2–3 concurrentes; 1–2 inferencias simultáneas compartidas (cola con `429`); presupuesto de tokens por bloque en ADR de modelos | sí | S1 (semáforo) · S5 | [→ PRD §7] |
| NFR-05 | Hardware | Entorno de referencia | MacBook Pro M5 32 GB; stack ≤ 24 GB | no (restricción dura) | S1 | [→ PRD §7], [→ CLAUDE.md] |
| NFR-06 | Disponibilidad | Entorno local y piloto | Sin SLA; apagado/arranque documentados; backups cifrados con prueba de restauración **por sprint** | no | ambiguo: "por sprint" vs S5 (C-22) | [→ PRD §7], [→ readme §5.0 S5] |
| NFR-07 | Fiabilidad | Cola de extracción | Durable; máx. 3 intentos; 0 documentos colgados | sí (intentos) | S2 | [→ PRD §7], [→ readme §6.1 #9] |
| NFR-08 | Fiabilidad | Consistencia análisis ↔ persistencia | 0 respuestas sin registro | no | S1 | [→ PRD §7], [→ PRD §6 RN-06] |
| NFR-09 | Seguridad | Ver §11 | — (remite a SEG-01…SEG-13) | — | — | [→ PRD §7] |
| NFR-10 | Observabilidad | Logs JSON con `traceId`; `/metrics` y `/health` | Desde S1 métricas de IA; 100% en S6 | no | S1 · S6 | [→ PRD §7], [→ PRD §2 G-10], [→ readme §2.7] |
| NFR-11 | Privacidad | PII en logs, auditoría, histórico o prompts | 0 | no | S1+ | [→ PRD §7] |
| NFR-12 | Accesibilidad | Panel de IA y vista de caso | Etiquetas, `aria-live`, teclado; estados de aplicabilidad por texto, no solo color | no | S1 (panel) · S2 (vista) · S4 (aplicabilidad) | [→ PRD §7] |
| NFR-13 | Mantenibilidad | Contratos | Cliente tipado generado desde OpenAPI; CI valida ambos specs | no | S1 | [→ PRD §7], [→ readme §2.6] |
| NFR-14 | Mantenibilidad | Catálogos clínicos | JSON versionado montado en ambos contenedores; versión registrada en cada análisis; `409` por versión distinta; cambiar catálogo no requiere desplegar código | no | S1 | [→ PRD §7], [→ readme §3.3 #38] |

### 4.2 SEG (PRD §11, 13 ítems)

| ID | Categoría | Requisito (texto fuente, resumido) | Meta / control | ¿Calibrable? | Sprint | Evidencia |
|---|---|---|---|---|---|---|
| SEG-01 | Sesión y CSRF | Cookie opaca `HttpOnly/Secure/SameSite=Strict`; expiración, bloqueo, Argon2id, logout; CSRF con `SameSite` + `Origin` | Tests de sesión y CSRF | sí (TTL, intentos) | S1 | [→ PRD §11 #1] |
| SEG-02 | Autorización | RBAC + equipo tratante; `admin` ve todos | 100% endpoints de paciente validan equipo (G-9) | no | S1 (RBAC) · S5 (equipo) | [→ PRD §11 #2] |
| SEG-03 | Identidad | AES-256-GCM en la aplicación + índice ciego HMAC; claves solo en servicio clínico; cada vista auditada | Test SQL crudo; *mutation* ≥ 70% (S6) | no | S1 (auditoría S2) | [→ PRD §11 #3] |
| SEG-04 | Desidentificación | Contexto hacia IA desidentificado y gate de PII; cubre eventos, tratamientos previos, faltantes y memoria | Sensibilidad PII ≥ 0,95 (G-8); 0 PII en prompts | sí (formatos PII) | S1 · S2 · S3 · S4 | [→ PRD §11 #4] |
| SEG-05 | Proveedores | Datos reales solo con modelos locales, en código y probado | 0 datos reales en la nube | no | S1/S2 | [→ PRD §11 #5] |
| SEG-06 | Aislamiento del servicio de IA | Sin red ni credenciales hacia almacén clínico; solo rol `rag_corpus` sobre `corpus`, revocaciones, red dedicada, `pg_hba`, tests de acceso denegado; síntesis/aplicabilidad/resumen solo con contexto desidentificado; riesgo residual aceptado | Tests *permission denied* en CI | no | S1 · S2 (minio) | [→ PRD §11 #6], [→ PRD §18 AC-T4.4] |
| SEG-07 | Credencial de servicio | JWT ES256/RS256 con `iss`, `aud`, `exp` corto y algoritmo fijado | Tests `401` (alg none, aud, exp) | sí (`exp`) | S1 | [→ PRD §11 #7] |
| SEG-08 | Cifrado | FileVault y volúmenes cifrados; TLS hacia PostgreSQL; HTTPS con CA interna | `sslmode=require`; HTTPS | no | S1 (TLS PG) · S5 (HTTPS/VPN) | [→ PRD §11 #8] |
| SEG-09 | Red | Solo `web` publica puerto, en red privada o VPN | Ningún otro puerto publicado | no | S1 · S5 (VPN) | [→ PRD §11 #9] |
| SEG-10 | Consentimientos, opt-out, retención, bajas | FR-16, FR-17, RN-15–RN-18; consentimientos firmados no se almacenan | — | sí (plazos) | S1 · S4 · S5 | [→ PRD §11 #10] |
| SEG-11 | Gate G-piloto | Banderas separadas anonimizados/identificados; prerrequisitos por `preflight`; retención = política y campos | `preflight` en verde | no | S5 | [→ PRD §11 #11], [→ readme §2.5] |
| SEG-12 | Repositorio público | Sin datos reales ni secretos; escaneo en CI; catálogos solo con subconjuntos permitidos (TBD-17) | Chequeo de CI | no | S1 | [→ PRD §11 #12] |
| SEG-13 | Prompt injection | Instrucciones separadas de los datos; chunks, pregunta, notas y análisis previos delimitados como datos | Test de inyección (no definido como AC: V-17) | no | S1 · S4 (memoria) | [→ PRD §11 #13] |

### 4.3 IA (PRD §12, 11 filas)

| ID | Área | Requisito (texto fuente, resumido) | Meta | ¿Calibrable? | Sprint | Evidencia |
|---|---|---|---|---|---|---|
| IA-01 | Modelos | Elegidos en ADR de modelos locales con restricciones duras (memoria, latencia, licencia, español, JSON válido, GPU), medido con stack completo | ≤ 24 GB, p95, JSON ≥ 99% ([→ CLAUDE.md]) | sí | inicio S1 (TBD-01) | [→ PRD §12] |
| IA-02 | Idioma | ES/EN; embeddings multilingües dense+sparse; expansión bilingüe; respuesta en idioma de la pregunta; citas en idioma original con **traducción opcional etiquetada** | Recall@10 es→en ≥ 0,70 | sí | S1 · S3 | [→ PRD §12] |
| IA-03 | Recuperación | Filtros vigencia/fuente/tipo/población; reranker multilingüe; umbral configurable; consulta enriquecida con línea de tratamiento y faltantes | Recall@10 ≥ 0,80, MRR ≥ 0,60 | sí (umbral, TBD-03) | S1 · S3 | [→ PRD §12] |
| IA-04 | Grounding | Validación de citas + NLI por afirmación (estricto), incl. población; análisis previos nunca soporte | Fidelidad ≥ 0,90; precisión de citas ≥ 0,90 | sí | S1 → S4 | [→ PRD §12] |
| IA-05 | Agente acotado | Una herramienta (recuperación), ≤ 1 iteración y ≤ 3 sub-consultas (TBD-18), en *deadline*; todo validado | G-16 ≥ 20% (propuesta) | sí | S4 | [→ PRD §12], [→ PRD §5 FR-30] |
| IA-06 | Síntesis y aplicabilidad | JSON por esquema; enumerado cerrado de estados; orden determinista; metadatos copiados del catálogo | M-07.x, M-08.x | no | S4 | [→ PRD §12] |
| IA-07 | Puntaje | `relevance_score` del reranker [0,1], versionado, secundario; scoring clínico en ADR futuro | — | no | S1 | [→ PRD §12], [→ readme §3.3 #7, #8] |
| IA-08 | Extracción | Texto + OCR local + LLM; confianza por campo determinista; eventos y tratamientos; normalización CIE-10/LOINC/CUPS/ATC; sin plantillas por laboratorio; catálogos por tipo | G-6, G-7, G-11, G-13 | sí (umbrales, TBD-03) | S2 | [→ PRD §12] |
| IA-09 | Trazabilidad | Cada análisis guarda contexto, faltantes, análisis previos usados, sub-consultas, modelos, versión de prompt, parámetros, versiones de corpus y catálogo | AC-T1.4 | no | S1 → S4 | [→ PRD §12] |
| IA-10 | Evaluación | Suite reproducible (FR-20) ES/EN por tipo; validación clínica parcial; reportes distinguen validado/no validado; VM-1…VM-6 | AC-T5.3 | sí (TBD-02) | S1+ | [→ PRD §12] |
| IA-11 | Operación | Semáforo de inferencia compartido (RN-30), tiempo máximo propagado, métricas de tokens y latencia por etapa desde S1 | — | sí | S1 | [→ PRD §12] |

---

## 5. Capacidades y criterios de aceptación del MVP

### 5.1 Capacidades (PRD §18.1.1)

| CAP / T | Capacidad | Sprint(s) | FR | `AC` | `M` | Evidencia |
|---|---|---|---|---|---|---|
| CAP-01 | Ingesta de documentos | S2 | FR-05, FR-06, FR-07 (FR-03 asistido) | AC-01.1–01.3 | M-01.1–01.3 | [→ PRD §18.3.1] |
| CAP-02 | Reconstrucción del caso | S1 (esquema) · S2 | FR-21, FR-04 | AC-02.1–02.7 | M-02.1–02.5 | [→ PRD §18.3.2] |
| CAP-03 | Reconciliación y normalización | S2–S3 | FR-22, FR-08 | AC-03.1–03.5 | M-03.1–03.5 | [→ PRD §18.3.3] |
| CAP-04 | Información faltante | S3 | FR-23 | AC-04.1–04.5 | M-04.1–04.3 | [→ PRD §18.3.4] |
| CAP-05 | Pregunta clínica | S1 · S3 | FR-28, FR-09 | AC-05.1–05.3 | M-05.1 | [→ PRD §18.3.5] |
| CAP-06 | Recuperación contextual | S1 · S3 | FR-09, FR-19 | AC-06.1–06.2 | M-06.1–06.2 | [→ PRD §18.3.6] |
| CAP-07 | Síntesis de evidencia | S4 | FR-24 | AC-07.1–07.5 | M-07.1–07.3 | [→ PRD §18.3.7] |
| CAP-08 | Aplicabilidad paciente ↔ evidencia (incl. agente) | S1 (contrato) · S4 | FR-25, FR-30 | AC-08.1–08.9 | M-08.1–08.6 | [→ PRD §18.3.8] |
| CAP-09 | Vigencia visible | S3 | FR-26 | AC-09.1–09.4 | M-09.1–09.2 | [→ PRD §18.3.9] |
| CAP-10 | Opciones descritas en la evidencia | S1 · S4 | FR-09, FR-10, FR-11 | AC-10.1–10.4 | M-10.1–10.2 | [→ PRD §18.3.10] |
| CAP-11 | Análisis, decisión, evolución y memoria | S4 | FR-12, FR-13, FR-29 | AC-11.1–11.6 (+11.2b) | M-11.1–11.4 | [→ PRD §18.3.11] |
| T-1 | Trazabilidad y procedencia | S1+ | RN-01, RN-04, FR-18 | AC-T1.1–T1.5 | (G-2, M-02.2) | [→ PRD §18.4] |
| T-2 | Incertidumbre explícita (Base del análisis) | S1 · S3 · S4 | FR-27 | AC-T2.1–T2.4 | — | [→ PRD §18.4] |
| T-3 | Control humano | S1+ | RN-08, RN-09, RN-19 (RN-23, RN-26) | AC-T3.1–T3.4 | (G-14) | [→ PRD §18.4] |
| T-4 | Privacidad, seguridad y acceso | S1–S5 | §11, FR-01, FR-15, FR-16, FR-18 | AC-T4.1–T4.6 | (G-8, G-9) | [→ PRD §18.4] |
| T-5 | Evaluación de calidad y de valor | S1+ | FR-20 | AC-T5.1–T5.4 | todos los técnicos | [→ PRD §18.4] |
| AC-P.1 | Preparación Post-MVP (sin construir) | S4 | FR-14 | AC-P.1a, AC-P.1b | — | [→ PRD §18.4] |

### 5.2 Mapa `AC-xx.y` → FR → CAP → HU (54)

"Dueña" = HU cuya historia verifica el escenario (PRD §17 + readme §5.6). Cuando un escenario tiene Then de capacidades distintas, se indica el dueño de cada uno.

| AC | Resumen | FR | CAP | HU dueña | Dueños de otros Then | Sprint |
|---|---|---|---|---|---|---|
| AC-01.1 | Heredados: magic bytes, 20 MB, `409`, `cuarentena_pii`, `requiere_revision_identidad`, 3 reintentos, sin colgados, reproceso idempotente | FR-05, FR-06, FR-07 | CAP-01 | HU-04 | HU-05 (visor, esc. 1–3) | S2 |
| AC-01.2 | Carga múltiple `207`, un `Document` por archivo, fallo aislado | FR-05 | CAP-01 | HU-04 | — | S2 |
| AC-01.3 | Eventos y tratamientos extraídos con `entry_method=ocr`, confianza, revisión, `source_span` | FR-06 | CAP-01 | HU-04 | HU-15 (visualización) | S2 |
| AC-02.1 | Timeline ordenado con derivados sin duplicados; abre el documento | FR-21 | CAP-02 | HU-15 | HU-05 / FR-07 (visor) | S2 |
| AC-02.2 | Evento sin fecha confiable → sección aparte y suma a pendientes | FR-21 | CAP-02 | HU-15 | — | S2 |
| AC-02.3 | Tratamientos previos por línea, distintos de las decisiones | FR-21 | CAP-02 | HU-15 | — | S2 |
| AC-02.4 | Series de biomarcadores; PSA siempre serie; ficha con último valor + tendencia | FR-21, FR-04 | CAP-02 | HU-15 (series) | HU-02/HU-05 (tendencia en ficha) | S2 |
| AC-02.5 | Resumen verificable: enlaces, NLI sobre verbalización, omitidas contadas, avisos y fecha; `403` opt-out; `422` egresado | FR-21 | CAP-02 | HU-16 | `403` → HU-14/FEAT-T4c (S5); `422` → HU-13/FEAT-T4b (S4); soporte → FEAT-T1a | S2 (+S4/S5) |
| AC-02.6 | `rechazado`/`reemplazado` fuera de timeline, series, resumen y contexto | FR-21, FR-08 | CAP-02 | HU-15 | HU-03 (contexto, OL-03), HU-16 (resumen) | S2–S3 |
| AC-02.7 | Atributos clínicos a su campo de destino; visibles en caso y checklist | FR-06, FR-21 | CAP-02 | HU-15 | HU-04 (extracción), HU-18 (checklist) | S2 |
| AC-03.1 | Duplicado → un dato con dos fuentes abribles | FR-22 | CAP-03 | HU-17 | — | S2 |
| AC-03.2 | Conflicto → ambos `requiere_revision` "En conflicto" enlazados; aviso en dependientes | FR-22 | CAP-03 | HU-17 | Aviso → FR-11 (HU-05/HU-10/HU-22) | S3 (PRD §14) |
| AC-03.3 | Normalización con término canónico, código y texto original; sinónimos; `no_mapeado`; B2 propone/B1 decide; `mapping_status` en toda entidad | FR-22 | CAP-03 | HU-17 | Propuesta B2 → HU-04/OL-05 | S2 (revisión de mapeos S3) |
| AC-03.4 | Heredados: diagnóstico en conflicto por fecha, RN-08, checksum | FR-08, FR-22 | CAP-03 | HU-09 | checksum → HU-04 | S2–S3 |
| AC-03.5 | Sin reporte CAC (exclusión verificable) | FR-22 | CAP-03 | HU-17 | — | — |
| AC-04.1 | Checklist con 4 estados; desde Faltante cargar o registrar a mano | FR-23 | CAP-04 | HU-18 (FEAT-04) | Registro manual → V-01 | S3 |
| AC-04.2 | Aviso previo con "Cargar información"/"Continuar con aviso"; no bloquea | FR-23 | CAP-04 | HU-18 (FEAT-04) | — | S3 |
| AC-04.3 | Faltantes viajan como "desconocido"; en Base y en aplicabilidad | FR-23 | CAP-04 | HU-18 (FEAT-04) | Base → HU-20 (FEAT-T2b); aplicabilidad → HU-22 (FEAT-08b) | S3 · S4 |
| AC-04.4 | Determinismo sin LLM; reglas en catálogo versionado | FR-23 | CAP-04 | HU-18 (FEAT-04) | — | S3 |
| AC-04.5 | Catálogo con ítem sin destino → no se publica | FR-23 | CAP-04 | HU-18 (FEAT-04) | — | S3 |
| AC-05.1 | Pregunta libre ES/EN ≤ 2000 caracteres con fuentes y filtros | FR-09 | CAP-05 | HU-03 | Filtros reales → S3 (sin HU, V-04) | S1 · S3 |
| AC-05.2 | Plantillas por tipo, prellenadas, editables, configurables y validadas | FR-28 | CAP-05 | HU-19 | Validación → DEC plantillas | S3 |
| AC-05.3 | Pregunta no terapéutica → síntesis, aplicabilidad y base; opciones solo si la evidencia las describe | FR-09 | CAP-05 | HU-03 (opciones condicionales, S1) | Síntesis → HU-21, aplicabilidad → HU-22, base → HU-20 | S1 · S4 |
| AC-06.1 | Heredados: híbrida S3, expansión, reranker, umbral, filtros, "sin evidencia", `tipo_no_habilitado`, `403/429/503/504/500`, corpus abierto | FR-09, FR-19 | CAP-06 | HU-03 | Híbrida S3 → sin HU (V-04); `403` → HU-14; `429` → RN-30 | S1 · S3 |
| AC-06.2 | Contexto con línea actual, tratamientos previos y tendencias, fechas relativas; guardado | FR-09 | CAP-06 | HU-03 | Desidentificación → FEAT-T4a | S1 (completo S2) |
| AC-07.1 | Acuerdos y discrepancias, cada afirmación citada y con soporte | FR-24 | CAP-07 | HU-21 | Soporte → FEAT-T1a | S4 |
| AC-07.2 | Discrepancia explicada o "Causa de la discrepancia no identificada" | FR-24 | CAP-07 | HU-21 | — | S4 |
| AC-07.3 | Etiquetas factuales copiadas del catálogo; "No disponible" | FR-24 | CAP-07 | HU-21 | RN-25 → FEAT-T1a | S4 |
| AC-07.4 | Una sola fuente → sin discrepancias; Base lo declara | FR-24 | CAP-07 | HU-21 | Base (g) → HU-20 (FEAT-T2b) | S4 |
| AC-07.5 | Sin puntaje de solidez ni "nivel de evidencia" | FR-24 | CAP-07 | HU-21 | — | S4 |
| AC-08.1 | Tabla de aplicabilidad por fuente con criterios del catálogo | FR-25 | CAP-08 | HU-22 | — | S4 |
| AC-08.2 | Desconocido con causa (falta en el paciente → CAP-04; no reportado) | FR-25 | CAP-08 | HU-22 | Enlace → HU-18 | S4 |
| AC-08.3 | Afirmación sobre población citada y con soporte; si no, Desconocido | FR-25 | CAP-08 | HU-22 | — | S4 |
| AC-08.4 | Valor del paciente sin verificar o en conflicto → aviso | FR-25, FR-11 | CAP-08 | HU-22 | FR-11 → FEAT-10b | S4 |
| AC-08.5 | Resumen por fuente = conteo, nunca puntaje | FR-25 | CAP-08 | HU-22 | — | S4 |
| AC-08.6 | Criterio excluyente en No coincide → "Población no comparable" | FR-25 | CAP-08 | HU-22 | — | S4 |
| AC-08.7 | Agente: ≤ 1 iteración, ≤ 3 sub-consultas, validación, listado en Base, no tras "sin evidencia" | FR-30 | CAP-08 | HU-26 | Base (i) → HU-20 (FEAT-T2c) | S4 |
| AC-08.8 | Opción hereda fuente más aplicable; muestra todas; no comparable solo si todas | FR-25 | CAP-08 | HU-22 | Orden → HU-10 | S4 |
| AC-08.9 | Valor del paciente copiado; estado por regla del catálogo si ambos estructurados | FR-25 | CAP-08 | HU-22 | — | S4 |
| AC-09.1 | Cita con fecha, versión, tipo e idioma | FR-26 | CAP-09 | HU-20 | — | S3 |
| AC-09.2 | "Evidencia actualizada al ‹corte›" | FR-26 | CAP-09 | HU-20 | — | S3 |
| AC-09.3 | > N años → "Posiblemente desactualizada" | FR-26 | CAP-09 | HU-20 | — | S3 |
| AC-09.4 | Historial conserva versión y muestra "Existe una versión más reciente" | FR-26, FR-12 | CAP-09 | HU-20 | Historial → HU-11 (S4) | S3 · S4 |
| AC-10.1 | ≤ 3 opciones (1 en S1–S3) en orden determinista; criterio visible | FR-09 | CAP-10 | HU-10 | 1 opción y texto del criterio S1 → HU-03 | S1 · S4 |
| AC-10.2 | Tarjeta: descripción, citas con vigencia, aplicabilidad, avisos, relevancia secundaria | FR-09, FR-11 | CAP-10 | HU-10 | Vigencia → HU-20; avisos → HU-05; aplicabilidad → HU-22 | S1 · S4 |
| AC-10.3 | Encabezado "Opciones descritas en la evidencia"; sin términos prescriptivos (tests de salida y UI) | FR-09 | CAP-10 | HU-03 | Transversal → FEAT-T3 | S1 |
| AC-10.4 | Heredados: descartadas, "sin evidencia", RN-01, RN-06 | FR-10, FR-09 | CAP-10 | HU-03 | — | S1 |
| AC-11.1 | Heredados: historial con snapshot; decisión con vínculo opcional, nunca a descartada | FR-12, FR-13 | CAP-11 | HU-11, HU-12 | — | S4 |
| AC-11.2 | "Desactualizado: datos del paciente" con lista de cambios y cascada | FR-12, FR-29 | CAP-11 | HU-24 | — | S4 |
| AC-11.2b | "Evidencia o catálogo más reciente disponible" | FR-12 | CAP-11 | HU-24 | — | S4 |
| AC-11.3 | Re-ejecutar crea análisis nuevo; comparación | FR-12 | CAP-11 | HU-24 | — | S4 |
| AC-11.4 | Decisión y análisis como eventos **derivados** en el timeline, sin `ClinicalEvent` | FR-13, FR-29 | CAP-11 | HU-12 | Análisis derivado → HU-03/OL-03 (S1) y HU-15 (vista) | S1 · S4 |
| AC-11.5 | Evolución como evento vinculado; en timeline; marca desactualizados; `422` egresado | FR-29 | CAP-11 | HU-23 | `422` → FEAT-T4b | S4 |
| AC-11.6 | Memoria de N análisis por paciente, todo el equipo, sin desactualizados ni resúmenes; listada en Base; no citable | FR-29 | CAP-11 | HU-24 | Base (h) → HU-20 (FEAT-T2c) | S4 |

### 5.3 Mapa `AC-Tn.m` → T (23)

| AC | Resumen | T | Requisitos | Dueña propuesta | Sprint / gate |
|---|---|---|---|---|---|
| AC-T1.1 | Todo dato mostrado indica origen (documento y página, manual, corrección o regla) y abre la fuente | T-1 | RN-07, FR-04, FR-07, FR-21, FR-23, FR-25 | FEAT-T1a | S1+ (página: V-11) |
| AC-T1.2 | Toda afirmación generada con enlace/cita y soporte; opción → descartadas; suelta → omitida | T-1 | RN-01, FR-10 | FEAT-T1a | S1 → S4 |
| AC-T1.3 | Metadatos copiados del corpus | T-1 | RN-04, RN-25 | FEAT-T1a | S1 |
| AC-T1.4 | Cada análisis guarda contexto, faltantes, modelos, prompt, parámetros y corte del corpus | T-1 | FR-09, IA-09 | FEAT-06a (gateway) | S1 (faltantes S3) |
| AC-T1.5 | Auditoría extendida (vista de caso, resumen, re-ejecución), sin PHI | T-1 | FR-18 | FEAT-T1b | **G-Piloto (S5)** |
| AC-T2.1 | Base presente en todo análisis con incisos del sprint; resumen visible sin expandir | T-2 | FR-27 | FEAT-T2a/b/c (HU-20) | S1 · S3 · S4 |
| AC-T2.2 | Incisos deterministas; (g) con soporte; (c) no contradicho y anclado a faltante; origen indicado | T-2 | FR-27, RN-01 | FEAT-T2b | S3 |
| AC-T2.3 | "Sin evidencia" explica qué se buscó y filtros | T-2 | FR-27, RN-02 | FEAT-T2a | S1 |
| AC-T2.4 | Base persistida e igual en historial | T-2 | FR-27, FR-12 | FEAT-T2a (persistencia) · FEAT-11a (historial) | S1 · S4 |
| AC-T3.1 | Aviso de IA y "Uso académico/investigación" en toda salida | T-3 | RN-19 | FEAT-T3 | S1 |
| AC-T3.2 | El sistema nunca ejecuta acciones clínicas por su cuenta | T-3 | RN-08, RN-09 | FEAT-T3 (regresión en FEAT-01c, FEAT-03a/b, FEAT-11b) | S1+ |
| AC-T3.3 | Avisos clínicos no bloquean; solo bloquean opt-out, egreso y equipo | T-3 | RN-26, RN-15, RN-17, FR-15 | FEAT-T3 | **G-Piloto (S5)** |
| AC-T3.4 | Lenguaje no prescriptivo en todo el producto | T-3 | RN-23 | FEAT-T3 | S1 |
| AC-T4.1 | Heredados completos: FR-01, FR-15, FR-16, FR-18, RN-10–RN-17, §11 y `preflight` | T-4 | SEG-01…SEG-13 | FEAT-T4a…T4d | S1–S5 |
| AC-T4.2 | Entidades nuevas sin identidad y desidentificadas hacia IA | T-4 | RN-11 | FEAT-T4a | S2–S4 |
| AC-T4.3 | No-fuga de PII sobre contexto ampliado y resumen | T-4 | RN-11, NFR-11 | FEAT-T4a | S2–S4 |
| AC-T4.4 | Servicio de IA sin acceso a datos clínicos | T-4 | SEG-06 | FEAT-PL2 (roles y `pg_hba`) · FEAT-06a | S1 |
| AC-T4.5 | Captura de menores con representante; job de mayoría de edad en S5 | T-4 | RN-16, FR-16 | FEAT-T4a (S1) · FEAT-T4d (job S5) | S1 · S5 |
| AC-T4.6 | Opt-out: `403` en toda generación; investigación borra histórico; solo `admin`; auditado | T-4 | RN-15, FR-16 | FEAT-T4c (403) · FEAT-T4b (UI/registro) | S4 · S5 |
| AC-T5.1 | Suite ampliada con datasets de eventos, duplicados, faltantes, discrepancias, aplicabilidad | T-5 | FR-20 | FEAT-T5b | S2–S4 |
| AC-T5.2 | Baseline manual VM-1/VM-2 antes de cerrar S1 (≥ 6 casos) | T-5 | FR-20 | FEAT-T5a | S1 |
| AC-T5.3 | Reportes distinguen validado / no validado | T-5 | FR-20, IA-10 | FEAT-T5a | S1+ |
| AC-T5.4 | Todo cambio de modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta reporte | T-5 | FR-20 | FEAT-T5a (DoD) | S1+ |

### 5.4 AC-P.1 (preparación Post-MVP)

| AC | Resumen | FR | Dueña | Sprint |
|---|---|---|---|---|
| AC-P.1a | `EpisodeSnapshot` longitudinal (líneas, respuestas, progresiones, fechas relativas), sin identidad ni texto libre | FR-14 | FEAT-AP1 (o dentro de FEAT-T4b, Q-01) | S4 |
| AC-P.1b | Documentado el criterio de "listo" de CAP-12 | — | FEAT-AP1 (documento) | S4 |

### 5.5 Medibles `M-xx.y` (36)

**Técnico** = lo mide la Feature de evaluación (FEAT-T5x) o un test automatizado. **Gobierno** = firma/validación humana → historia `DEC-xx`. **Mixto** = lo calcula T-5 pero depende de una revisión humana (DEC que provee la muestra o el protocolo).

| M | Criterio | Meta | Tipo | ¿Configurable? | Dueña |
|---|---|---|---|---|---|
| M-01.1 | Exactitud OCR campo crítico / no crítico | ≥ 95% / ≥ 90% | técnico | sí (TBD-02) | FEAT-T5b |
| M-01.2 | p95 extracción | ≤ 60 s | técnico | sí | FEAT-T5b / FEAT-01b |
| M-01.3 | Exactitud de `auto_aceptado` | ≥ 98% | técnico | sí (umbral alto, TBD-03) | FEAT-T5b |
| M-02.1 | Eventos correctos (tipo y fecha) | ≥ 95% (propuesta) | técnico | sí | FEAT-T5b |
| M-02.2 | Eventos y valores con origen resoluble | 100% | técnico | no | FEAT-T5b / FEAT-02b |
| M-02.3 | Afirmaciones del resumen enlazadas y con soporte | 100% de las mostradas | técnico | no | FEAT-02c |
| M-02.4 | p95 vista de caso | ≤ 2 s (propuesta) | técnico | sí | FEAT-02b |
| M-02.5 | Tiempo de reconstrucción vs baseline manual (VM-1) | ver §2.2 (≥ 50%) | **mixto** (protocolo DEC TBD-11 + sesiones con oncólogos) | sí (meta fijada antes de S1) | FEAT-T5a/T5d + DEC-02 |
| M-03.1 | Duplicados fusionados | ≥ 95% (propuesta) | técnico | sí | FEAT-T5b |
| M-03.2 | Conflictos detectados | 100% | técnico | no | FEAT-T5b |
| M-03.3 | Fusiones incorrectas | 0 | técnico | no | FEAT-T5b |
| M-03.4 | Mapeo terminológico correcto | ≥ 95% (propuesta) | técnico | sí | FEAT-T5b |
| M-03.5 | Códigos inexistentes en el catálogo | 0 | técnico | no | FEAT-03a |
| M-04.1 | Sensibilidad faltantes sembrados | ≥ 0,95 (propuesta) | técnico | sí | FEAT-T5b (US-T5-01 del piloto) |
| M-04.2 | Especificidad | ≥ 0,90 (propuesta) | técnico | sí | FEAT-T5b |
| M-04.3 | Catálogo mama/próstata firmado | antes del cierre de S3 | **gobierno** | no | DEC-01 (existe) |
| M-05.1 | Plantillas validadas por tipo | ≥ 5 (propuesta) | **gobierno** | sí | DEC-07 |
| M-06.1 | Recall@10 total / es→en; MRR | ≥ 0,80 / ≥ 0,70; ≥ 0,60 | técnico | sí (TBD-02) | FEAT-T5a |
| M-06.2 | p95 análisis completo | ≤ 15 s (recalibra S4) | técnico | sí | FEAT-T5a / FEAT-06a |
| M-07.1 | Discrepancias sembradas reportadas | ≥ 80% (propuesta) | técnico | sí | FEAT-T5b |
| M-07.2 | Fidelidad; precisión de citas | ≥ 0,90 | técnico | sí | FEAT-T5a |
| M-07.3 | Etiquetas factuales = catálogo | 100% | técnico | no | FEAT-07 |
| M-08.1 | Concordancia del oncólogo con el estado (VM-3) | ≥ 85% (propuesta) | **mixto** (revisión de muestra por oncólogo) | sí | FEAT-T5d + DEC-16 |
| M-08.2 | Criterios "Coincide" sin cita | 0 | técnico | no | FEAT-08b |
| M-08.3 | Fuentes con metadatos de población | ≥ 90% (propuesta) | técnico | sí | FEAT-06c |
| M-08.4 | Exactitud de `extraido_verificado` sobre muestra humana | ≥ 95% (propuesta) | **mixto** (muestra TBD-20) | sí | FEAT-06c + DEC-14 |
| M-08.5 | Criterios resueltos por búsqueda complementaria (G-16) | meta tras baseline (≥ 20%) | técnico | sí | FEAT-08c / FEAT-T5b |
| M-08.6 | Valores del paciente generados por el LLM | 0 | técnico | no | FEAT-08b |
| M-09.1 | Citas con fecha visible | 100% | técnico | no | FEAT-09 |
| M-09.2 | Citas de guías con versión | 100% | técnico | no | FEAT-09 |
| M-10.1 | Opciones con ≥ 1 cita y soporte | 100% | técnico | no | FEAT-T1a / FEAT-10a |
| M-10.2 | Salidas con términos prescriptivos | 0 | técnico | no | FEAT-T3 |
| M-11.1 | Análisis desactualizados marcados | 100% | técnico | no | FEAT-11a |
| M-11.2 | Citas no resolubles en historial | 0 | técnico | no | FEAT-11a |
| M-11.3 | Afirmaciones cuyo único soporte es un análisis previo | 0 | técnico | no | FEAT-11c |
| M-11.4 | Memoria con PII | 0 | técnico | no | FEAT-11c / FEAT-T4a |

Resumen: 31 técnicos · 2 de gobierno (M-04.3, M-05.1) · 3 mixtos (M-02.5, M-08.1, M-08.4).

---

## 6. Objetivos y métricas de valor

| ID | Objetivo / métrica | Meta | Se mide con | Pendiente (TBD) |
|---|---|---|---|---|
| G-1 | Recorrido completo login → paciente → caso → pregunta → análisis citado | 100% de AC de HU-01/02/03/06/07 (S1); HU-15…HU-26 (S4) | Demo S1 y S4 | — |
| G-2 | Cero opciones/afirmaciones sin respaldo | 100% | FR-20, RN-01, M-10.1, M-02.3 | — |
| G-3 | Recuperación incl. entre idiomas | Recall@10 ≥ 0,80 / ≥ 0,70; MRR ≥ 0,60 | FR-20, OL-06, M-06.1 | TBD-02 |
| G-4 | Fidelidad | Fidelidad, precisión de citas, "sin evidencia" ≥ 0,90 | FR-20, OL-06, M-07.2 | TBD-02 |
| G-5 | Tiempo de respuesta | p95 ≤ 15 s (recalibra S4) | NFR-01, M-06.2 | TBD-08 |
| G-6 | Ingesta sin captura manual | ≥ 95% / ≥ 90%; ≤ 60 s | M-01.1, M-01.2 | TBD-03 |
| G-7 | Datos `auto_aceptado` confiables | ≥ 98% | M-01.3 | TBD-03 |
| G-8 | Privacidad hacia la IA | Sensibilidad PII ≥ 0,95; 0 datos reales en la nube | FR-20, SEG-04, SEG-05 | — |
| G-9 | Acceso correcto | 100% endpoints validan equipo; 0 generaciones con opt-out | FEAT-T4c (S5) | — |
| G-10 | Operable y auditable | `/health` y `/metrics` 100%; `traceId` 100%; *mutation* ≥ 70% (S6) | NFR-10, FEAT-PL5 | — |
| G-11 | Caso reconstruido fiel | ≥ 95% (propuesta); origen 100% | M-02.1, M-02.2 | TBD-02 |
| G-12 | Faltantes detectados | ≥ 0,95 / ≥ 0,90 | M-04.1, M-04.2 | TBD-12 |
| G-13 | Normalización y reconciliación | ≥ 95%; ≥ 95%; 100%; 0 | M-03.1–M-03.4 | TBD-17 |
| G-14 | Lenguaje no prescriptivo | 0 | M-10.2, RN-23 | — |
| G-15 | Valor clínico demostrado | VM-1…VM-6 en metas fijadas antes de S1 | FR-20, AC-T5.2 | TBD-11 |
| G-16 | Búsqueda complementaria útil | propuesta ≥ 20% (meta tras baseline S4) | M-08.5 | TBD-18 |
| VM-1 | Tiempo para reconstruir el caso | reducción de mediana ≥ 50% | Sesión cronometrada; baseline manual S1 (AC-T5.2) | TBD-11 (casos, checklist P1, orden, participantes) |
| VM-2 | Tiempo hasta evidencia aplicable | reducción de mediana ≥ 50% | Ídem; baseline manual S1 | TBD-11 (preguntas de referencia, criterio, herramientas) |
| VM-3 | Concordancia en aplicabilidad | ≥ 85% de criterios | M-08.1 (revisión de muestra) | TBD-11 (muestra, nº de revisores, "Parcial") |
| VM-4 | Utilidad percibida por análisis | ≥ 70% con ≥ 4 | `POST …/feedback` (HU-25), `AnalysisFeedback` | TBD-11 (escala, tasa mínima de respuesta) |
| VM-5 | Faltantes útiles | ≥ 80% | `AnalysisFeedback` (dos campos, HU-25; piloto) | TBD-11 (momento, "correcto" vs "útil") |
| VM-6 | Verificabilidad y no prescripción percibidas | ≥ 80% / ≤ 20% | Encuesta fin de piloto | TBD-11 (instrumento) |

**Gates** [→ PRD §14]: **G-Demo** (fin S4, sintéticos): CAP-01…CAP-11, T-1, T-2, T-3, T-5 en verde salvo AC-T1.5 y AC-T3.3; G-2 = 100%; G-14 = 0; VM-1…VM-3 con el oncólogo asesor. **G-Piloto** (fin S5): G-Demo + AC-T1.5 + AC-T3.3 + T-4 completo + `preflight` + catálogos y plantillas firmados. **G-Éxito** (fin del piloto): VM-1…VM-6 en meta (R-15) y cero incidentes críticos. **Cierre del piloto**: aprendizaje documentado (no reemplaza G-Éxito). Regla R-15: metas VM fijadas antes de S1 y no se modifican.

---

## 7. Restricciones

### 7.1 Técnicas
- Stack ≤ 24 GB en MacBook Pro M5 32 GB; LLM nativo **fuera de Docker** (Metal) vía `host.docker.internal`; API compatible con OpenAI. [→ PRD §7 NFR-05], [→ PRD §8], [→ CLAUDE.md]
- p95 análisis ≤ 15 s (recalibra S4), extracción ≤ 60 s, JSON válido ≥ 99%, licencia académica, buen español; decidir primero los *embeddings* (cambiarlos obliga a reindexar). [→ CLAUDE.md], [→ readme §6.1 última fila]
- Solo PostgreSQL y Milvus como motores; MinIO como almacén; sin broker (cola en `Document`). [→ PRD §8], [→ readme §3.3 #11, #17]
- Esquema PostgreSQL **completo** en la migración inicial (S1) y colección Milvus con esquema final. [→ readme §6 OL-01, OL-02]
- Respuesta JSON completa; nunca tokens del LLM sin validar; streaming solo de progreso (TBD-08). [→ PRD §3], [→ readme §2.1]
- Catálogos: datos, no código; versión distinta entre backends → `409`. [→ PRD §7 NFR-14]

### 7.2 Legales
- Licencias del corpus: dominio público, CC BY, CC BY-SA; CC BY-NC solo MVP académico; ND y "libre lectura" excluidas; NCCN/ESMO excluidas mientras no se gestione su licencia, también en ejemplos (RN-21, ADR-36; resúmenes de PubMed sin licencia pendientes en TBD-04). [→ PRD §6 RN-21], [→ readme §3.3 #36], [→ CLAUDE.md]
- Términos de uso de LOINC/CUPS/ATC para versionar subconjuntos en repo público (TBD-17, SUP-5). [→ PRD §11 #12]
- Retención 10→20 años; job diferido sujeto a validación legal (TBD-16, PREG-2). [→ PRD §5 FR-17]
- Consentimientos fuera de OncoLens; procedimiento y SLA de opt-out con la entidad médica (TBD-21). [→ PRD §5 FR-16], [→ PRD §15]
- Edad de mayoría configurable, sin asumir país (TBD-07). [→ PRD §16]

### 7.3 Seguridad
- Regla de ownership: `rag-orchestrator` sin acceso a datos clínicos (rol `rag_corpus`, `REVOKE ALL`, red `corpus-db-net`, `pg_hba`, sin ruta a `clinical-minio`, tests *permission denied*); sesión del doctor nunca llega a Backend 2. [→ CLAUDE.md], [→ PRD §11 #6, #7]
- Clases de datos `sintetico` / `real_anonimizado` / `real_identificado` con reglas distintas de PII, proveedores y retención. [→ PRD §9], [→ readme §3.3 #14]
- Gate G-piloto: ningún dato real antes de S5 y `preflight` en verde; sin S5 solo hay demo sintética. [→ PRD §6 RN-13], [→ readme §5.0]
- Repo público sin datos reales ni secretos; logs sin identidad, PHI, secretos ni contenido/URL de documentos. [→ PRD §6 RN-14], [→ readme §2.7]

### 7.4 Alcance
- **Dentro:** mama y próstata (`ENABLED_CANCER_TYPES`); captura de menores (tarjeta de identidad, representante, job de mayoría de edad); fuentes públicas abiertas; datos sintéticos hasta S5. [→ PRD §18.1.1]
- **Fuera del MVP** (no son requisitos; solo AC-P.1 como preparación) [→ PRD §3], [→ PRD §18.1.2]:
  - Captura de consentimientos firmados (fuera de OncoLens).
  - CAP-12 cohortes históricas · CAP-13 outcomes de cohorte (Post-MVP; preparación AC-P.1) · CAP-14 comité de tumores · CAP-15 preguntas sugeridas por IA · CAP-16 leucemia y otros tipos (post-piloto con RN-20) · conversación de varios turnos · job automático de retención (Post-MVP).
  - CAP-17 puntaje de solidez clínica (TBD-09) · CAP-18 integración HCE/FHIR · CAP-19 reporte CAC (Futuro).
  - NCCN/ESMO: MVP solo si se gestiona la licencia, si no versión futura.
  - No-objetivos: probabilidad de éxito o pronóstico; decisiones autónomas; *fine-tuning*; streaming de tokens; nube o multi-institución; datos reales en la nube; datos bioinformáticos crudos; datos de contacto del paciente.

### 7.5 ADR del readme (#1–#38) como contexto

✅ decididos: #1 RBAC · #2 equipo tratante · #3 sin multi-tenancy · #4 retención (job Post-MVP) · #5 versionado del corpus · #6 cifrado de identidad · #8 `relevance_score` · #9 `entry_method=seed` · #10 metadatos denormalizados en Milvus · #11 `Document` como cola · #13 `Treatment` en S4 y sin datos de contacto · #14 clases de datos · #15 dos ejes OCR · #16 `clinical-minio` separado · #17 catálogo del corpus en schema `corpus` · #18 consentimientos externos con opt-out · #19 histórico mínimo · #20 episodios · #21 diagnóstico genérico · #22 alcance por tipo · #23 normalización terminológica · #24 caso longitudinal · #25 duplicados · #26 contrato `EvidenceAnalysis` · #27 aplicabilidad sin puntaje · #28 memoria · #29 catálogos compartidos · #31 aplicabilidad de opción · #32 fuente de verdad del timeline · #33 ownership de normalización · #34 verificación sobre datos del paciente · #35 alcance de la memoria · #37 agente acotado · #38 distribución de catálogos. [→ readme §3.3]

🚧 / parciales:
| ADR | Estado | Qué falta | TBD |
|---|---|---|---|
| #7 Scoring de evidencia clínica | 🚧 pendiente (ADR futuro) | `clinical_evidence_score` reservado | TBD-09 |
| #12 Diagnóstico extraído vs vigente | ✅ ⚠️ "reglas a validar con el oncólogo" | Validación clínica | TBD-06 (vigencia de diagnósticos) |
| #30 Fuentes del corpus | ✅ parcial: "el ADR de fuentes se hace en el S1" | Lista final de fuentes | TBD-04 |
| #36 Licencias del corpus | ✅ parcial: ingesta de resúmenes de PubMed sin licencia pendiente | Decisión | TBD-04 |
| readme §6.1 #4 `relevanceScore` | ✅ + 🚧 ADR de scoring | ídem #7 | TBD-09 |
| readme §6.1 #8 Streaming | ✅ + 🚧 ADR de streaming de progreso tras medir KR2 | ADR | TBD-08 |
| readme §6.1 #10 | ✅ ⚠️ validar con el oncólogo | ídem #12 | TBD-06 |
| readme §6.1 última fila / §1.4 Modelos locales | 🚧 ADR al inicio de S1 | ADR | TBD-01 |
| readme §2.7 Prometheus + Grafana + OpenTelemetry | 🚧 ADR futuro | ADR | **sin TBD** (V-08) |
| ADR de evaluación (framework, p. ej. `ragas`) | pendiente ([→ readme §6 OL-06 tarea 3], [→ CLAUDE.md]) | ADR | **sin TBD** (V-07) |

---

## 8. TBD-01…TBD-21 y decisiones de gobierno

Tipo: **ADR** (técnico, va a `02-adrs.md` en F2) · **DEC** (decisión clínica, legal, de producto o de capacidad → historia `DEC-xx` con dueño) · **CAL** (calibración en configuración, RN-22) · **EXC** (exclusión del MVP).

| TBD | Tema | Tipo | Dueño | Bloquea (sprint más temprano) | Feature / DEC tentativa |
|---|---|---|---|---|---|
| TBD-01 | Modelos (LLM, embeddings, reranker, NLI, OCR) y runtime | ADR | Ingeniería | **S1** (inicio; OL-02, cierre de OL-05 en S2) | FEAT-00 → ADR modelos locales |
| TBD-02 | Metas definitivas de evaluación | CAL + DEC | Usuario (PO) + Ingeniería | S1 (tras baseline); umbrales de regresión S2+ | FEAT-T5a · DEC-17 |
| TBD-03 | Umbrales de confianza OCR y de relevancia | CAL | Ingeniería (+ set de referencia) | S1 (relevancia) · S2 (OCR) | FEAT-06a · FEAT-01b |
| TBD-04 | ADR de fuentes y licencias (ADR-36): lista final, PubMed sin licencia, NCCN/ESMO | ADR (no bloqueante) | Ingeniería + área legal | S1 (no bloqueante) · S3 (KR3 ≥ 20 docs por tipo) | FEAT-00 · FEAT-06c |
| TBD-05 | Subtipos de leucemia y población | EXC (post-piloto) | Oncólogo | — | — |
| TBD-06 | Motivos de egreso y reglas clínicas (semáforo, vigencia de diagnósticos) | DEC clínica | Oncólogo | S2 (semáforo HU-05, regla de diagnóstico OL-05) · S4 (motivos de egreso) | DEC-08 |
| TBD-07 | Edad de mayoría configurada | DEC legal + CAL | Área legal / entidad médica | S5 (job) | DEC-13 · FEAT-T4d |
| TBD-08 | Streaming de eventos de progreso | ADR | Ingeniería | Fin S1 (tras medir p95) · S4 (recalibración) | ADR streaming |
| TBD-09 | Scoring de solidez clínica | ADR futuro / EXC (CAP-17) | Ingeniería + oncólogo | — | — |
| TBD-10 | Catálogo del corpus en base separada | ADR (endurecimiento opcional) | Ingeniería (revisión de seguridad) | S5 (revisión de seguridad del piloto) | FEAT-T4d |
| TBD-11 | Protocolo de VM-1…VM-6 y metas | DEC producto | Usuario (PO) + oncólogos asesores | **Pre-S1** (bloquea AC-T5.2 en S1) | FEAT-00 · DEC-02 |
| TBD-12 | Catálogo de datos críticos y reglas condicionales | DEC clínica | Oncólogo | S3 (cierre) | **DEC-01 (existe)** |
| TBD-13 | Criterios de aplicabilidad, excluyentes, "Parcial", umbrales de tendencia | DEC clínica | Oncólogo | **S2** (tendencias) · S4 (criterios) | DEC-04 (tendencias) · DEC-05 (aplicabilidad) |
| TBD-14 | N de análisis en memoria | CAL | Ingeniería | S4 | FEAT-11c |
| TBD-15 | N años para "posiblemente desactualizada" | CAL + DEC clínica | Oncólogo | S3 | DEC-09 · FEAT-09 |
| TBD-16 | Validación legal de diferir el job de retención | DEC legal | Área legal | antes de S5 (si se rechaza, el job vuelve a S5, PREG-2) | DEC-10 |
| TBD-17 | Términos de uso LOINC/CUPS/ATC en repo público | DEC legal | Área legal + Ingeniería | **"antes del S2" según PRD, pero el catálogo con códigos existe desde S1** (C-21) | DEC-11 · FEAT-PL3 |
| TBD-18 | Límites del agente | CAL | Ingeniería | S4 | FEAT-08c |
| TBD-19 | Estimación de esfuerzo S1–S4 (SUP-1) | DEC capacidad | Ingeniería | **Pre-S1** | FEAT-00 · DEC-03 |
| TBD-20 | Tamaño de la muestra humana de metadatos del corpus | DEC producto + CAL | Usuario (PO) + oncólogo | S3 (ingesta) | DEC-14 · FEAT-06c |
| TBD-21 | Canal de opt-out: formato de la referencia y catálogo de motivos (y SLA) | DEC legal / entidad médica | Entidad médica + admin | **antes de S4** (UI opt-out); G-Piloto (S5) | DEC-12 · FEAT-T4b |

**Historias de gobierno propuestas (IDs tentativos, el piloto solo fijó DEC-01):**
DEC-01 catálogo de datos críticos (existe, S3, oncólogo) · DEC-02 protocolo y metas VM (Pre-S1, PO + oncólogos) · DEC-03 estimación de capacidad (Pre-S1, Ingeniería) · DEC-04 umbrales de tendencia por biomarcador (antes de S2, oncólogo) · DEC-05 criterios de aplicabilidad, excluyentes y "Parcial" (antes de S4, oncólogo) · DEC-06 mapeos terminológicos firmados (G-Piloto, oncólogo; **sin TBD**) · DEC-07 plantillas validadas ≥ 5 por tipo (S3, oncólogo) · DEC-08 motivos de egreso y reglas clínicas (S2/S4, oncólogo) · DEC-09 antigüedad N años (S3, oncólogo) · DEC-10 validación legal del job de retención (antes de S5, área legal) · DEC-11 términos de uso de estándares (antes de S1/S2, área legal) · DEC-12 canal y SLA de opt-out (antes de S4, entidad médica) · DEC-13 edad de mayoría (S5, área legal) · DEC-14 muestra humana de metadatos (S3, PO + oncólogo) · DEC-15 revisión del dataset de evaluación y diccionario de significancia (S1, oncólogo; [→ readme §6 OL-06 AC]) · DEC-16 revisión de muestra de aplicabilidad (S4, oncólogo; M-08.1/VM-3) · DEC-17 metas definitivas de evaluación tras baseline (S1, PO + Ingeniería) · DEC-18 criterio de "listo" por tipo de cáncer firmado (S5, RN-20).

---

## 9. Features candidatas

**Convención propuesta** (ver Q-01): `FEAT-00` Pre-S1 · `FEAT-01`…`FEAT-11` = `CAP-01`…`CAP-11` (FEAT-04 ya existe y no cambia) con sufijo de letra cuando la CAP atraviesa varios sprints o subsistemas · `FEAT-T1`…`FEAT-T5` transversales (con sufijo por sprint) · `FEAT-PLn` plataforma sin CAP · `FEAT-AP1` preparación Post-MVP. Tallas tentativas S/M/L/XL.

| ID tentativo | Feature | CAP / T | Requisitos que agrupa | HU | OL | Sprint(s) | Talla | Evidencia |
|---|---|---|---|---|---|---|---|---|
| FEAT-00 | [Pre-S1] Decisiones previas al Sprint 1 | — | Contrato `EvidenceAnalysis` (ADR #26), esquema con caso longitudinal y metadatos del corpus, TBD-11 (DEC-02), TBD-19 (DEC-03), TBD-04 (ADR fuentes, no bloqueante), TBD-01 (ADR modelos, inicio S1), destino TNM/ISUP (Q-04), TBD-17 (Q-07) | — | — | Pre-S1 | M | [→ PRD §14 Pre-S1], [→ readme §5.0] |
| FEAT-PL1 | Plataforma base: monorepo, Compose, scripts de secretos/certificados, CI (build, specs, escaneo de secretos y PII), `packages/api-contracts`, `/health`, convención de configuración | T-4 · T-5 (DoD) | RN-14, RN-22, NFR-05, NFR-13, SEG-09, SEG-12 | — | — | S1 | L | [→ readme §1.4, §2.3, §2.6] |
| FEAT-PL2 | Esquema PostgreSQL completo + seed sintético + roles (`rag_corpus`, `research` solo inserción) | T-4 | OL-01; FR-17 campos; FR-21 esquema; SEG-06; AC-T4.4 | HU-01…HU-14 (OL-01) | OL-01 | S1 | L | [→ readme §6 OL-01] |
| FEAT-PL3 | Catálogos clínicos versionados: `packages/clinical-catalogs` v1, montaje solo lectura, `CLINICAL_CATALOG_VERSION`, `409`, `ENABLED_CANCER_TYPES`, validador mínimo RN-29 (absorbe US-CAT-01) | — (CAP-03/04/05/08 lo consumen) | NFR-14, RN-20, RN-27 (fuente), RN-29 (mínimo) | — | — | S1 (+ firmas S3–S5) | M | [→ readme §3.3 #29, #38], [→ backlog/features/README.md] |
| FEAT-PL4 | Pacientes: listado/búsqueda (índice ciego) — **ver FEAT-T4a** (se agrupa allí) | — | — | — | — | — | — | (fusionada) |
| FEAT-PL5 | Observabilidad y hardening: logs JSON, `traceId`, `/metrics` (IA desde S1), *mutation testing* ≥ 70% | T-1 · T-4 | NFR-10, G-10, IA-11 | — | — | S1 (métricas IA) · S6 | M | [→ readme §2.7], [→ readme §5.0 S6] |
| FEAT-T4a | [S1] Acceso, identidad cifrada y registro de pacientes: auth, RBAC, listado/búsqueda, registro manual, menores, convenio, retención (campos), desidentificación, regla de proveedores | T-4 | FR-01, FR-02, FR-03 (manual), FR-16 (datos), FR-17; RN-10, RN-11, RN-12, RN-16, RN-18 (campos), RN-30 (?) ; SEG-01–05, SEG-07 | HU-01, HU-06, HU-07 | — | S1 (+ desidentificación extendida S2–S4) | L | [→ readme §5.6 mapa HU→CAP] |
| FEAT-01a | [S2] Carga de documentos y visor: unitaria y batch `207`, cola durable, `409`, visor auditado | CAP-01 | FR-05, FR-07, NFR-07 | HU-04, HU-05 (visor) | OL-05 | S2 | L | [→ readme §6 OL-05] |
| FEAT-01b | [S2] Extracción local: OCR, gate de PII, estructuración (eventos, tratamientos, atributos), confianza determinista, propuesta de códigos | CAP-01 · CAP-02 | FR-06, RN-07, IA-08, SEG-04 | HU-04, HU-05 | OL-05 | S2 | XL | [→ readme §6 OL-05] |
| FEAT-01c | [S2] Registro asistido por OCR (`IntakeDraft`) | CAP-01 | FR-03 (asistido), RN-09 | HU-08 | — | S2 | M | [→ readme §5.6 HU-08] |
| FEAT-02a | [S1] Ficha mínima del paciente | CAP-02 | FR-04 (S1) | HU-02 | — | S1 | M | [→ readme §5 HU-02] |
| FEAT-02b | [S2] Vista de caso: timeline derivado, sin fecha confiable, tratamientos previos, series (PSA), atributos, tendencia en ficha, `prior-treatments` y `clinical-attributes` manuales (absorbe US-HU15-01) | CAP-02 | FR-21 (vista), FR-04 (tendencia), NFR-03, NFR-12 | HU-15, HU-05 | OL-05 (datos) | S2 | L | [→ readme §5 HU-15] |
| FEAT-02c | [S2] Resumen del caso verificable | CAP-02 · T-1 · T-3 | FR-21 (resumen), RN-01 (ADR-34), RN-19 | HU-16 | — | S2 | L | [→ readme §5.6 HU-16] |
| FEAT-03a | [S2] Normalización terminológica y duplicados | CAP-03 | FR-22 (parte 1), RN-08, RN-27 | HU-17 (parte 1) | OL-05 | S2 | L | [→ readme §5.0 S2] |
| FEAT-03b | [S3] Revisión de datos, conflictos y mapeos (**2.º en el orden de recorte: conflictos**) | CAP-03 | FR-08, FR-22 (parte 2), RN-08 | HU-09, HU-17 (parte 2) | — | S3 | L | [→ PRD §14 capacidad] |
| FEAT-04 | Información faltante (**escrita**: DEC-01, US-001…US-006, 24 pts) | CAP-04 · T-1 · T-2 (b) | FR-23, RN-29 | HU-18 | — | S3 | L | [→ backlog/features/FEAT-04] |
| FEAT-05 | [S3] Plantillas de preguntas clínicas | CAP-05 | FR-28 (AC-05.2, AC-05.3) | HU-19 | — | S3 | M | [→ readme §5.6 HU-19] |
| FEAT-06a | [S1] Walking skeleton del análisis: gateway (contexto, JWT, persistencia, Base S1), `/rag/query` dense + reranker + NLI + "sin evidencia", contrato final (incl. `applicability` vacío, FR-25 S1) (absorbe US-OL03-01) | CAP-06 · CAP-10 · T-1 | FR-09 (S1), FR-25 (contrato), RN-02, RN-05, RN-06, IA-01–04, NFR-01, NFR-08 | HU-03 | OL-02, OL-03 | S1 | XL | [→ readme §6 OL-02, OL-03] |
| FEAT-06b | [S3] Recuperación híbrida y filtros reales; uso de faltantes en la consulta (absorbe US-CAP06-01) | CAP-06 | FR-09 (S3), IA-03 | — (sin HU, V-04) | — | S3 | L | [→ readme §5.0 S3 KR1, KR2] |
| FEAT-06c | [S1·S3] Corpus científico: semilla con licencias y esquema de metadatos (S1); ingesta reanudable, `extraido_verificado`, `CorpusRelease` (S3) | CAP-06 (prerrequisito CAP-07/08/09) | FR-19, RN-05, RN-21, M-08.3, M-08.4 | — (OL-02) | OL-02 | S1 · S3 | XL | [→ PRD §5 FR-19] |
| FEAT-07 | [S4] Síntesis de evidencia (**1.º en el orden de recorte**) | CAP-07 | FR-24, RN-25 | HU-21 | — | S4 | L | [→ PRD §14 capacidad] |
| FEAT-08b | [S4] Aplicabilidad paciente ↔ evidencia (absorbe US-CAP08-01) | CAP-08 | FR-25, RN-28 (agregación), IA-06 | HU-22 | — | S4 | XL | [→ readme §5 HU-22] |
| FEAT-08c | [S4] Agente acotado de búsqueda complementaria | CAP-08 | FR-30, IA-05, G-16 | HU-26 | — | S4 | L | [→ readme §5.6 HU-26] |
| FEAT-09 | [S3] Vigencia visible | CAP-09 | FR-26, RN-25 | HU-20 (parte vigencia) | — | S3 | M | [→ readme §5.6 HU-20] |
| FEAT-10a | [S1] Panel de análisis y opción descrita: Route Handler, 1 opción, descartadas, relevancia secundaria, criterio de orden visible, estados (absorbe US-OL04-01) | CAP-10 · T-3 | FR-09 (UI S1), FR-10, RN-03, RN-23 (UI), NFR-12 | HU-03 | OL-04 | S1 | L | [→ readme §6 OL-04] |
| FEAT-10b | [S2·S3] Avisos de datos no verificados, en conflicto y faltantes (absorbe US-FR11-01) | CAP-10 · T-3 | FR-11, RN-26 | HU-05 | — | S2 · S3 | M | [→ PRD §5 FR-11] |
| FEAT-10c | [S4] Hasta 3 opciones ordenadas por aplicabilidad | CAP-10 | FR-09 (S4), RN-28 | HU-10 | — | S4 | M | [→ readme §5.6 HU-10] |
| FEAT-11a | [S4] Historial, dos marcas de desactualizado (cascada), re-ejecución y comparación | CAP-11 | FR-12 | HU-11, HU-24 (parte) | — | S4 | L | [→ PRD §5 FR-12] |
| FEAT-11b | [S4] Decisión de tratamiento y registro de evolución | CAP-11 | FR-13, FR-29 (b) | HU-12, HU-23 | — | S4 | M | [→ PRD §5 FR-13, FR-29] |
| FEAT-11c | [S4] Memoria de análisis no citable | CAP-11 · T-4 | FR-29 (c), RN-24, RN-11 | HU-24 (parte) | — | S4 | M | [→ PRD §5 FR-29] |
| FEAT-T1a | Trazabilidad y soporte transversal: validador de citas y soporte para todo tipo de afirmación, metadatos copiados, procedencia de datos, persistencia antes de responder | T-1 | RN-01, RN-04, RN-06, RN-07, RN-25; AC-T1.1–T1.3 | (HU-03, HU-16, HU-21, HU-22) | OL-02 | S1 → S4 | L | [→ PRD §18.4 T-1] |
| FEAT-T1b | [S2·S5] Auditoría de accesos (S2) y completa (S5) | T-1 · T-4 | FR-18, AC-T1.5 | — | OL-01 (`AuditLog`) | S2 · S5 | M | [→ PRD §5 FR-18] |
| FEAT-T2a | [S1] Base del análisis: incisos a, d, e, f y omitidas | T-2 | FR-27 (S1), AC-T2.1, AC-T2.3, AC-T2.4 | HU-20 (parte) | OL-03 | S1 | M | [→ PRD §5 FR-27] |
| FEAT-T2b | [S3] Base del análisis: faltantes, supuestos, limitaciones (absorbe US-T2-01, US-T2-xx) | T-2 | FR-27 (S3), AC-T2.2 | HU-20 | — | S3 | M | [→ backlog/features/README.md] |
| FEAT-T2c | [S4] Base del análisis: análisis previos y búsqueda complementaria | T-2 | FR-27 (S4) | HU-20 | — | S4 | S | [→ PRD §5 FR-27] |
| FEAT-T3 | Control humano: avisos RN-19, lista de términos prohibidos (UI y salidas), avisos no bloqueantes (absorbe US-T3-01) | T-3 | RN-19, RN-23, RN-26, AC-T3.1–T3.4 | — | — | S1+ (AC-T3.3 en G-Piloto) | M | [→ PRD §18.4 T-3] |
| FEAT-T4b | [S4] Ciclo de vida y opt-out (registro admin): egreso, reactivación, baja total, opt-out de investigación, `422` egresado (absorbe US-RN17-01) | T-4 · CAP-11 | FR-14, FR-16 (UI S4), RN-17, RN-18 | HU-13, HU-14 (parte) | — | S4 | L | [→ readme §5.0 S4] |
| FEAT-T4c | [S5] Equipo tratante y bloqueos: pertenencia en todos los endpoints, `403` por opt-out en toda generación (absorbe US-RN15-01, US-FR15-01) | T-4 | FR-15, FR-16 (S5), RN-15, AC-T3.3, AC-T4.6, G-9 | HU-14 | — | S5 | L | [→ readme §5.0 S5] |
| FEAT-T4d | [S5] Gate G-piloto: `preflight real-data`, VPN + HTTPS CA interna, backups con restauración, job de mayoría de edad, revisión de seguridad | T-4 | RN-13, SEG-08, SEG-09, SEG-11, NFR-06, FR-16 (job), TBD-10 | — | — | S5 | L | [→ PRD §11 #11] |
| FEAT-T5a | [S1] Baseline de evaluación técnica + baseline manual VM-1/VM-2 + suite en DoD (absorbe US-T5-02) | T-5 | FR-20, OL-06, AC-T5.2–T5.4, M-06.x, M-07.2 | — | OL-06 | S1 | L | [→ readme §6 OL-06] |
| FEAT-T5b | [S2–S4] Ampliación de datasets y métricas (eventos, duplicados, mapeo, faltantes, discrepancias, aplicabilidad, agente) (absorbe US-T5-01) | T-5 | AC-T5.1, M-01.x, M-02.1, M-03.x, M-04.1/2, M-07.1, M-08.5 | — | OL-06 | S2 · S3 · S4 | L | [→ PRD §18.4 T-5] |
| FEAT-T5c | [S4] Feedback de utilidad (VM-4, VM-5) (absorbe US-HU25-01) | T-5 | FR-20 (VM-4/5) | HU-25 | — | S4 | S | [→ readme §5.6 HU-25] |
| FEAT-T5d | [S6] Medición de VM-1…VM-6 en el piloto | T-5 | FR-20, G-15, VM-1…VM-6, M-02.5, M-08.1 | — | — | S6 | M | [→ readme §5.0 S6 KR4] |
| FEAT-AP1 | [S4] Preparación Post-MVP: snapshot longitudinal y criterio de "listo" de CAP-12 | AC-P.1 | FR-14 (snapshot) | HU-13 (parte) | — | S4 | S | [→ PRD §18.4 AC-P.1] |

(33 Features con contenido; FEAT-PL4 se fusionó en FEAT-T4a y no se cuenta. FEAT-08a "contrato de aplicabilidad S1" no se crea: queda dentro de FEAT-06a.)

**IDs provisionales del piloto que las Features futuras deben absorber** [→ backlog/features/README.md]: US-CAT-01 → FEAT-PL3 · US-OL03-01 → FEAT-06a · US-OL04-01 → FEAT-10a · US-HU15-01 → FEAT-02b · US-HU04-01 → FEAT-01a · US-MAN-01 → **sin dueño** (V-01, Q-03) · US-T2-01 y US-T2-xx → FEAT-T2b · US-T3-01 → FEAT-T3 · US-T5-01 → FEAT-T5b (fijar S3, KR4 del S3) · US-T5-02 → FEAT-T5a · US-CAP06-01 → FEAT-06b · US-CAP08-01 → FEAT-08b · US-FR11-01 → FEAT-10b · US-HU25-01 → FEAT-T5c · US-RN17-01 → FEAT-T4b · US-RN15-01 → FEAT-T4c · US-FR15-01 → FEAT-T4c. La asignación de RN-06 y RN-11 a US-OL03-01 en el piloto difiere de la propuesta transversal de §3 (FEAT-T1a / FEAT-T4a): F3 decide.

**Puntos de recorte acordados (SUP-1)**: 1.º FEAT-07 (síntesis) a Post-MVP; 2.º parte de conflictos de FEAT-03b. [→ PRD §14]

---

## 10. Vacíos

Incluye vacíos (nadie lo define), ambigüedades, referencias rotas, requisitos no verificables y dependencias no declaradas.

| # | Tipo | Descripción | Afecta a | Qué haría falta | Dueño | Bloquea |
|---|---|---|---|---|---|---|
| V-01 | vacío | Registro manual de biomarcadores y campos de `Diagnosis` (histología, grado, estadio, ECOG): sin endpoint en readme §4.1 ni PRD §10; ADR-33 exige normalizar "datos ingresados a mano (formularios…)" | AC-04.1, FR-22, FR-23, US-MAN-01 | Contrato del endpoint y Feature dueña | Usuario (PO) + Ingeniería | FEAT-04 US-004 (S3) — Q-03 |
| V-02 | vacío | Gestión de usuarios por CLI (alta, baja, roles, primer `admin`) sin FR ni AC | RU-9, SEG-02 | FR o Story técnica en FEAT-T4a | Ingeniería | S1 |
| V-03 | vacío | Lista de pacientes "requiere ratificación" para el admin (RU-9): sin endpoint ni UI | FR-16 (job S5) | Contrato y Story | Usuario (PO) | FEAT-T4d (S5) |
| V-04 | vacío | Recuperación híbrida y filtros reales (S3) sin HU propia (HU-03 es S1, HU-10 es S4); FR-17/18/19/20 sin HU (PRD §17 lo reconoce) | FR-09 S3, FR-17–FR-20 | Stories técnicas sin HU (Q-08) | Usuario (PO) | FEAT-06b, FEAT-T1b, FEAT-06c, FEAT-T5x |
| V-05 | dependencia no declarada | Egreso (S4) exige "tratante principal" (RN-17), pero `CareTeamMember` y su gestión llegan en S5 | FR-14, FR-15, RN-17 | Decidir cómo se identifica al principal en S4 | Usuario (PO) + Ingeniería | FEAT-T4b (S4) — Q-02 |
| V-06 | dependencia no declarada | Memoria "de todo el equipo tratante" (FR-29, S4) y búsqueda por nombre "dentro del equipo" (FR-02, S1) dependen del equipo (S5) | FR-02, FR-29 | Definir el comportamiento antes de S5 (todos los pacientes / todos los análisis) | Usuario (PO) | FEAT-T4a, FEAT-11c |
| V-07 | referencia sin ID | ADR de evaluación (framework de evaluación) citado en OL-06 y CLAUDE.md sin TBD | FR-20 | Asignar TBD/ADR | Ingeniería | FEAT-T5a (S1) |
| V-08 | referencia sin ID | ADR futuro de observabilidad (Prometheus/Grafana/OTel) sin TBD | NFR-10, G-10 | Asignar TBD/ADR o declarar fuera del MVP | Ingeniería | FEAT-PL5 (S6) |
| V-09 | vacío | Sprint del control de RN-30 (rate limit) no figura en PRD §14 | RN-30, IA-11 | Fijar sprint (Q-06) | Usuario (PO) | FEAT-06a / FEAT-T4a |
| V-10 | vacío | Traducción automática opcional y etiquetada de citas (PRD §12 IA-02, readme §1.3) sin FR, AC ni sprint | IA-02 | AC y sprint, o declararla opcional fuera del MVP | Usuario (PO) | FEAT-10a / FEAT-09 |
| V-11 | vacío | `Provenance` (readme §4.1) no tiene página ni origen "regla", que AC-T1.1 exige | AC-T1.1, FR-07, FR-23 | Campo en el contrato | Ingeniería | FEAT-T1a, FEAT-04 US-003 |
| V-12 | dependencia mal planteada | El catálogo existe desde S1 (y la extracción de atributos en S2 lo usa), pero el validador de RN-29 llega en S3 | RN-29, FEAT-PL3 | Adelantar validador mínimo a FEAT-PL3 | Ingeniería | S1–S2 |
| V-13 | vacío | Resolución de documentos en `cuarentena_pii` y `requiere_revision_identidad` (quién, cómo, endpoint) no definida | FR-06, riesgo "paciente equivocado" (§15) | Flujo y endpoint | Usuario (PO) + Ingeniería | FEAT-01a/01b (S2) |
| V-14 | ambigüedad | RN-17 "ningún registro": no dice si incluye `POST …/treatments`, `…/prior-treatments`, `…/clinical-attributes`, `PATCH …/review`, `POST …/feedback`, `intake-drafts` | RN-17 | Lista cerrada de endpoints | Usuario (PO) | FEAT-T4b (S4) |
| V-15 | ambigüedad | ¿La extracción con LLM (`/documents/extract`) y el registro asistido son "generación con IA" bajo RN-15? FR-16 dice que la carga no se afecta | RN-15, FR-06, FR-16 | Aclaración | Usuario (PO) + área legal | FEAT-T4c (S5) |
| V-16 | ambigüedad | RN-20 habilita un tipo solo si es "listo" (≥ 20 docs, catálogo revisado), pero mama y próstata están habilitados desde S1 con ~10 documentos semilla y catálogo `propuesta` | RN-20, FR-09 `tipo_no_habilitado` | Declarar si RN-20 aplica a mama/próstata solo como prerrequisito de G-Piloto | Usuario (PO) | FEAT-PL3 |
| V-17 | requisito no verificable | SEG-13 (prompt injection) no tiene AC ni medible en §18 | SEG-13 | AC de test (p. ej., chunk con instrucción inyectada) | Ingeniería | FEAT-06a |
| V-18 | vacío | Mapeos terminológicos firmados (G-Piloto) y criterio de "listo" (RN-20) no tienen TBD ni dueño de firma | G-Piloto, RN-20 | DEC-06, DEC-18 | Oncólogo | FEAT-T4d (S5) |
| V-19 | ambigüedad | Acceso a `GET /platform/patients` en S5: FR-02 restringe al equipo la búsqueda por nombre pero no la búsqueda exacta por documento ni el listado | FR-02, FR-15 | Regla explícita | Usuario (PO) | FEAT-T4c |

### 10.1 Supuestos y preguntas del PRD que condicionan el backlog [→ PRD §18.6]

| ID | Supuesto / pregunta | Impacto en el backlog |
|---|---|---|
| SUP-1 | La capacidad alcanza para CAP-02/03/04/07/08 (con agente)/09/11 en 6 sprints; TBD-19 antes de S1 | Marcar FEAT-07 y la parte de conflictos de FEAT-03b como puntos de recorte |
| SUP-2 | LLM local 7–8B cumple M-07.x/M-08.x en latencia con memoria | Si falla: recalibrar M-06.2, bajar N (TBD-14) o modelo ~14B (ADR) → riesgo en FEAT-07, FEAT-08b, FEAT-11c |
| SUP-3 | El corpus abierto permite extraer población, diseño y endpoint (M-08.3) | Si falla, la aplicabilidad degrada a "No reportado por la fuente" → riesgo de FEAT-08b/06c |
| SUP-4 | Oncólogos con tiempo para baseline y validación de catálogos | Todas las DEC-xx dependen de esto; sin baseline VM-1/VM-2 no comparables |
| SUP-5 | Términos de uso de LOINC/CUPS/ATC permiten versionar subconjuntos en repo público | Si falla: catálogos fuera del repo como configuración local → cambia FEAT-PL3 |
| PREG-1 | Fuentes del ADR de fuentes; NCCN/ESMO en MVP o futuro (TBD-04) | No bloquea; afecta cobertura percibida (FEAT-06c) |
| PREG-2 | ¿Aprueba legal diferir el job de retención? (TBD-16) | Si no, el job entra en S5 (nueva Story en FEAT-T4d) y se ajusta SUP-1 |

---

## 11. Conflictos de fuentes

Prioridad: PRD v1.2 > readme > CLAUDE.md. Se registra cuál prevalece; no se resuelve en silencio.

| # | Conflicto | Fuente A | Fuente B | Prevalece | Afecta a |
|---|---|---|---|---|---|
| C-01 | Rango de FR | readme §1.1: el PRD tiene "requisitos funcionales FR-01 a FR-20" | PRD §5: FR-01…FR-30 | PRD | Trazabilidad |
| C-02 | Sprint de FR-21 | PRD §17: "1–3" | PRD §5 FR-21: "1 (esquema), 2 (vista, extracción y resumen)"; §18.1.1 CAP-02 "S1 · S2"; §14 S2 | PRD §5/§14 (interno del PRD; R-23) | FEAT-02b/02c |
| C-03 | Sprint de FR-27 | PRD §17: "3"; §14 lista FR-27 solo en S3 | PRD §5 FR-27 (R-06): S1 (a, d, e, f, omitidas) · S3 · S4; readme OL-03 incluye incisos S1 | PRD §5 FR-27 (R-06, explícito) | FEAT-T2a |
| C-04 | Sprint de FR-16, FR-25 en §14 | §14 no lista FR-16 (datos) ni FR-25 (contrato) en S1 | FR-16 "1/4/5"; FR-25 "1 (contrato)/4"; §17 | Cuerpo de FR (§5) y §17 | FEAT-T4a, FEAT-06a |
| C-05 | Evento de decisión | readme §3.2 `Treatment`: "Al registrarse crea un `ClinicalEvent` de tipo `decision_oncolens`"; readme §5.6 HU-12 "crea el evento `decision_oncolens`" | PRD FR-13, FR-21 (R-03), AC-11.4: evento **derivado**, sin escribir `ClinicalEvent`; readme §3.1 enum `event_type` sin `decision_oncolens`; readme #32 | PRD | FEAT-11b, FEAT-02b |
| C-06 | "Evento `analisis_ia`" | readme §4.1 `POST /platform/evidence-analyses`: "persiste `AIAnalysisRecord` y el evento `analisis_ia` antes de responder" (además `analisis_ia` es un tipo de opt-out) | PRD AC-11.4 y readme OL-03: análisis como evento derivado, no se escribe `ClinicalEvent` | PRD (si se refería a auditoría, no está dicho) | FEAT-06a |
| C-07 | Sprint del `422` por egresado | readme §5.0 S5: "`422` para cualquier registro sobre pacientes egresados" | PRD FR-14 (S4, R-11) y RN-17; PRD FR-05 lo lista como borde en S2 (cuando aún no hay egreso) | PRD → S4 (el egreso existe desde S4) | FEAT-T4b |
| C-08 | HU dueña de la UI de opt-out | PRD FR-16 CA: "HU-13 (opt-out en UI de administración), HU-14"; PRD §17 FR-16 → HU-13, HU-14 | readme §5.0 S4: "HU-14 parcial (UI de opt-out)"; readme §5.6 HU-14 (4–5) incluye opt-out; mapa HU-13/HU-14 → T-4 | PRD en lo normativo (HU-13), pero la numeración de HU vive en el readme → **Q-05** | FEAT-T4b |
| C-09 | Rate limiting | readme OL-03 "No incluye: rate limiting (ADR pendiente, 2.5)" | readme OL-03 alcance complementario (6/min, `429`), readme §2.5 (decidido), PRD RN-30 (decidido) | PRD (decidido; valores en config) | FEAT-06a, V-09 |
| C-10 | DoD de la suite de evaluación | readme OL-06 tarea 5: PRs que cambian "un modelo, un prompt, un umbral o el corpus" (omite catálogo) | PRD FR-20, AC-T5.4; readme §2.6 y §6.0 DoD: incluye catálogo | PRD | FEAT-T5a |
| C-11 | Destino de TNM e ISUP en próstata | readme §3.2 `Diagnosis`: un único `staging_system`/`stage_value` cubre "TNM (mama), grupo ISUP (próstata)"; CLAUDE.md idem | PRD FR-23 / §18.3.4 exigen **TNM y Gleason/ISUP** en próstata; RN-29 exige destino para cada ítem | PRD (requisito) → hace falta decisión de esquema **antes de la migración S1** (Q-04) | FEAT-PL2, FEAT-04 |
| C-12 | HU de OL-01 | readme OL-01: "HU-01 a HU-14" | readme §6.0: "HU-01…25"; ninguna incluye HU-26 | readme (interno); sin efecto normativo | FEAT-PL2 |
| C-13 | Texto del resumen | readme §5.6 HU-16: "rotulado 'Generado por IA'" | PRD RN-19 / FR-21: aviso completo + "Verifique contra las fuentes" + fecha de datos | PRD | FEAT-02c |
| C-14 | Literal del aviso de IA (interno del PRD) | PRD RN-19: "Análisis generado por IA — requiere validación clínica…" (raya) | PRD AC-T3.1: "Análisis generado por IA: requiere validación clínica…" ("con el texto actualizado") | Sin resolver: ambos en v1.2; AC-T3.1 se declara "actualizado" → confirmar literal (afecta tests de UI) | FEAT-T3 |
| C-15 | Auditoría de la ficha en S1 | PRD FR-04 (S1–2) y readme HU-02 (S1): "cada lectura de la ficha se audita" | PRD FR-18: auditoría de accesos en S2; readme OL-01: `AuditLog` "usada desde Sprint 2" | PRD FR-18/§14 (S2) como sprint del control; HU-02 en S1 sin auditoría → confirmar (Q-06) | FEAT-02a, FEAT-T1b |
| C-16 | ADR-36 pendiente o decidido | CLAUDE.md: ADR pendiente "fuentes y licencias (ADR-36)" | readme §3.3 #36 ✅ (licencias) con PubMed pendiente (TBD-04) | readme (licencias decididas; lista de fuentes pendiente) | FEAT-00, FEAT-06c |
| C-17 | HU de FR-20 | PRD §17: FR-20 "— (OL-06)", "sin historia propia" | readme §5.6: HU-25 (feedback VM-4/VM-5) mapeada a T-5/FR-20; PRD nunca cita HU-25 | PRD en "sin historia propia" para la suite; HU-25 se conserva solo para el feedback (no contradice) | FEAT-T5c |
| C-18 | `GET …/clinical-attributes` | readme §4.1: `POST/GET …/clinical-attributes` (S2) | PRD §10 no lo lista | readme complementa (no contradice) | FEAT-02b |
| C-19 | Pains P2, P9, P11 | Prompt y CLAUDE.md asumen "P1…P12" | AS-IS §4 define solo P1, P3–P8, P10, P12 | AS-IS (fuente del ID); referencias rotas inexistentes en el PRD | §1 |
| C-20 | R-xx sin fila | PRD §0.0: "31 hallazgos (R-01 a R-31)" | La tabla agrupa "R-18 a R-30" y **no** tiene R-31; R-26…R-29 no se describen individualmente | PRD (referencia rota parcial) | Trazabilidad D/R |
| C-21 | Momento de TBD-17 | PRD §16 TBD-17: "verificar antes del S2" | readme §5.0 S1: `packages/clinical-catalogs` (primera versión) y OL-01 seed con códigos CIE-10, LOINC, ATC poblados desde el catálogo en el repo | PRD (fecha), pero contradice el S1 del readme → **Q-07** | FEAT-PL3, FEAT-PL2 |
| C-22 | Backups | PRD §7 NFR-06: "prueba de restauración por sprint" | readme §5.0 S5: backups cifrados y prueba de restauración en S5; PRD §14 S5 "backups" | PRD (interno ambiguo) → Q-06 | FEAT-T4d |
| C-23 | Sprint de la regla de proveedores | readme §6 OL-02 (S1): test de regla de proveedores y `503` | readme §5.0 S2: "regla de proveedores solo locales" en S2 | readme (interno); PRD no fija sprint → S1 por ticket | FEAT-T4a |
| C-24 | Bloqueo de login por IP | readme §2.5: bloqueo "por cuenta y por IP" | PRD FR-01: 5 intentos fallidos (sin IP) | readme complementa (PRD silencioso); no contradice | FEAT-T4a |

**Vocabulario v1.0:** no se encontraron usos vigentes de `recommendations[]`, `/platform/rag/query` ni "consentimiento `analisis_ia` vigente/por evento" como requisito: todas las menciones en PRD y readme son históricas o de reemplazo ("reemplaza a…", §0.2, ADR #26 "Descartado"). "Opt-out de `analisis_ia` vigente" (RN-15, AC-T4.6) es vocabulario v1.2 correcto. El único resto ambiguo es el "evento `analisis_ia`" de C-06. La mención "Busca recomendaciones" en AS-IS §3 etapa 8 describe el proceso actual (no crea requisitos).

---

## 12. Preguntas críticas para el usuario

Solo las que bloquean decisiones de **estructura** del backlog.

**Q-01 · Convención de IDs y corte de Features**
- **Pregunta:** ¿Se adopta `FEAT-01…FEAT-11` = `CAP-01…CAP-11` con sufijo de letra por sprint/subsistema (FEAT-06a, FEAT-08b…), `FEAT-T1…T5` (con sufijo), `FEAT-PLn` para plataforma, `FEAT-00` Pre-S1 y `FEAT-AP1`?
- **Por qué importa:** los IDs se vuelven inmutables al publicar en Linear; define milestones por sprint y la verificación de G-Demo/G-Piloto.
- **Sugerencia:** sí, con sufijo de letra; FEAT-04 no cambia.
- **Descartadas:** numeración secuencial libre (rompe la alineación con CAP y obliga a una tabla de equivalencias); una sola Feature por CAP multi-sprint (Features que cruzan milestones, imposible cerrar CAP-08 en S1 o FEAT-T2 en S3); AC-P.1 dentro de FEAT-T4b (posible, pero diluye la frontera Post-MVP que pide §18.1.2).
- **Dueño:** usuario (PO). **Bloquea:** F3 completo.

**Q-02 · Egreso en S4 sin equipo tratante (V-05)**
- **Pregunta:** RN-17 solo deja egresar al tratante principal o a un admin, pero `CareTeamMember` se gestiona en S5. ¿Cómo se egresa en S4?
- **Por qué importa:** decide si parte de FR-15 (designación del principal) entra en FEAT-T4b (S4) o si FEAT-T4b depende de FEAT-T4c (S5).
- **Sugerencia:** adelantar a S4 solo la **designación** del tratante principal (por admin y por seed), sin validar pertenencia en endpoints (eso sigue en S5).
- **Descartadas:** en S4 solo egresa `admin` (contradice RU-8 y HU-13 "Como tratante principal"); mover el egreso a S5 (rompe G-Demo, que exige CAP-11 y KR3 del S4 con egreso y snapshot).
- **Dueño:** usuario (PO) + Ingeniería. **Bloquea:** FEAT-T4b, FEAT-T4c, AC-P.1a.

**Q-03 · Registro manual de datos clínicos (V-01)**
- **Pregunta:** ¿En qué Feature y sprint entra el registro manual de biomarcadores y de campos de `Diagnosis` (histología, grado, estadio, ECOG), hoy sin endpoint?
- **Por qué importa:** AC-04.1 exige "registrarlo a mano" desde un faltante; ADR-33 exige normalizar datos manuales; el piloto ya lo referencia como US-MAN-01 sin dueño.
- **Sugerencia:** Story nueva en **FEAT-03b (S3)**, con el contrato del endpoint y la normalización final de Backend 1 (ADR-33), consumida por FEAT-04 US-004.
- **Descartadas:** FEAT-02b (S2) (sobrecarga el S2 y aún no existe el checklist que la motiva); dejarlo fuera del MVP (incumple AC-04.1 y FR-22 "datos manuales"); solo "Cargar documento" como acción (degrada 9 de 12 ítems de mama, hallazgo M-01 del piloto).
- **Dueño:** usuario (PO) + Ingeniería. **Bloquea:** FEAT-04 US-004, FEAT-03b.

**Q-04 · Destino de TNM y Gleason/ISUP en próstata (C-11)**
- **Pregunta:** ¿Dónde se guarda el segundo valor en próstata, si `Diagnosis` tiene un único `staging_system`/`stage_value`?
- **Por qué importa:** la migración inicial (S1) debe ser "esquema completo" y RN-29 exige destino para ambos ítems; resolverlo en S3 obliga a migrar datos.
- **Sugerencia:** decidirlo en **FEAT-00 (Pre-S1)** con el oncólogo e Ingeniería; la opción más barata es usar `Diagnosis.grade` (ya existe desde v1.2) para Gleason/ISUP y `staging_system`/`stage_value` para TNM en ambos tipos.
- **Descartadas:** `ClinicalAttribute` para TNM (rompe el modelo genérico de ADR #21); un segundo par de estadificación (cambio de esquema mayor sin evidencia); diferirlo a DEC-01 en S3 (llega tarde para OL-01 y el seed b).
- **Dueño:** Ingeniería + oncólogo. **Bloquea:** FEAT-PL2 (S1), FEAT-04.

**Q-05 · HU dueña de la UI de opt-out (C-08)**
- **Pregunta:** ¿La UI de registro/revocación de opt-out (S4) cuelga de HU-13 (como dice el PRD) o de HU-14 (como dice el readme)?
- **Por qué importa:** determina la trazabilidad HU → Feature y en qué Feature se escribe el AC-T4.6 de registro.
- **Sugerencia:** ubicarla en **FEAT-T4b (S4)** y trazar a ambas HU; HU-14 se divide en S4 (opt-out) y S5 (equipo tratante).
- **Descartadas:** solo HU-13 (mezcla el actor tratante principal con el actor admin); solo HU-14 completa en S5 (contradice FR-16 "4 (UI de administración)").
- **Dueño:** usuario (PO). **Bloquea:** FEAT-T4b, FEAT-T4c.

**Q-06 · Sprint de controles sin sprint fijo (V-09, C-15, C-22)**
- **Pregunta:** ¿En qué sprint se entregan: (a) rate limit RN-30; (b) auditoría de lectura de la ficha; (c) backups con prueba de restauración?
- **Por qué importa:** cada uno cambia la Feature dueña y el milestone.
- **Sugerencia:** (a) S1 en FEAT-06a (ya está en OL-03 como alcance complementario, y NFR-04 exige cola con `429` en piloto); (b) S2 en FEAT-T1b (`AuditLog` se usa desde S2, FR-18), con HU-02 en S1 sin auditoría; (c) S5 en FEAT-T4d, con prueba de restauración en cada sprint siguiente.
- **Descartadas:** (a) S5 (deja sin protección el semáforo en la demo y contradice el ticket S1); (b) S1 (obliga a adelantar `AuditLog` y FR-18); (c) "por sprint" desde S1 (no hay datos reales que respaldar hasta S5).
- **Dueño:** usuario (PO) + Ingeniería. **Bloquea:** FEAT-06a, FEAT-02a, FEAT-T1b, FEAT-T4d.

**Q-07 · TBD-17 antes de S1 (C-21)**
- **Pregunta:** ¿Se adelanta la verificación de términos de uso de LOINC/CUPS/ATC a Pre-S1, dado que el catálogo con códigos se versiona en el repo público desde S1?
- **Por qué importa:** si los términos no lo permiten (SUP-5), FEAT-PL3 cambia de diseño (catálogo como configuración local fuera del repo) desde el S1.
- **Sugerencia:** sí, DEC-11 en FEAT-00; mientras tanto el seed S1 usa solo CIE-10 (o códigos con permiso confirmado).
- **Descartadas:** mantener "antes del S2" (el S1 ya publica códigos); catálogo sin códigos en S1 (OL-01 exige el seed con códigos poblados desde el catálogo).
- **Dueño:** área legal + Ingeniería. **Bloquea:** FEAT-PL3, FEAT-PL2.

**Q-08 · Stories técnicas sin HU (V-04)**
- **Pregunta:** Para lo que no tiene HU (búsqueda híbrida S3, FR-17, FR-18, FR-19, FR-20 salvo feedback), ¿se escriben Stories técnicas trazadas a FR/OL sin HU, o se crean HU nuevas (HU-27+)?
- **Por qué importa:** la numeración HU vive en el readme; inventar HU rompe la regla de no inventar y la trazabilidad con PRD §17.
- **Sugerencia:** Stories técnicas con campo HU = "— (técnica, PRD §17)" y trazadas a FR, OL y AC.
- **Descartadas:** HU-27+ (sin respaldo en fuentes); colgarlas de HU-03/HU-10 (falsea el sprint: HU-03 es S1 y la híbrida es S3).
- **Dueño:** usuario (PO). **Bloquea:** FEAT-06b, FEAT-06c, FEAT-T1b, FEAT-T5a/b/d.

---

## 13. Cobertura

| Familia | Cobertura | Detalle |
|---|---|---|
| FR | **30/30** | §2 |
| RN | **30/30** | §3 (dueña y sprint del control para todas; RN-30 sin sprint en fuente) |
| NFR | **14/14** | §4.1 (NFR-09 remite a §11) |
| SEG | **13/13** | §4.2 |
| IA | **11/11** | §4.3 |
| CAP / T / AC-P.1 | **17/17** | §5.1 (CAP-12…CAP-19 en §7.4, fuera del MVP) |
| `AC-xx.y` | **54/54** | §5.2 (53 `AC-NN.N` + `AC-11.2b`) |
| `AC-Tn.m` | **23/23** | §5.3 |
| `AC-P.1x` | **2/2** | §5.4 |
| `M-xx.y` | **36/36** | §5.5 (31 técnicos, 2 de gobierno, 3 mixtos) |
| G / VM | **16/16 · 6/6** | §6 |
| HU | **26/26** | §2, §5.2, §9 (HU-25 solo en readme, C-17) |
| OL | **6/6** | §2, §9 |
| TBD | **21/21** | §8 |
| SUP / PREG | **5/5 · 2/2** | §10.1 |
| ADR readme | **38/38** | §7.5 (pendiente #7; parciales #12, #30, #36) |
| RU | **10/10** | §2 |

**Diferencias con el universo indicado en el encargo:** `AC-NN.N` = 54, no 53 (`AC-11.2b`); pains = 9, no 12 (P2, P9, P11 no existen). Rangos de NFR (14), SEG (13) e IA (11) coinciden con el número real de filas/ítems.

---

## 14. Decisiones del usuario sobre las preguntas críticas (2026-10-05)

Respondidas por el usuario (PO) tras F1. Son vinculantes para F2–F4; no se reabren.

| Q | Decisión | Consecuencia en el backlog |
|---|---|---|
| Q-01 | Convención `FEAT-nn` = `CAP-nn` con sufijo de letra por sprint/subsistema; `FEAT-T1…T5` (con sufijo); `FEAT-PLn` plataforma; `FEAT-00` Pre-S1; `FEAT-AP1` Post-MVP. FEAT-04 no cambia | Lista de Features de §9 adoptada como base de F3 |
| Q-02 | En S4 se adelanta **solo la designación** del tratante principal (por admin y por seed) en FEAT-T4b; la validación de pertenencia en todos los endpoints sigue en S5 (FEAT-T4c) | Cierra V-05; FEAT-T4b no depende de FEAT-T4c |
| Q-03 | Registro manual de biomarcadores y campos de `Diagnosis` (histología, grado, estadio, ECOG): **Story nueva en FEAT-03b (S3)** con contrato de endpoint y normalización final de Backend 1 (ADR-33); FEAT-04 US-004 la consume. El endpoint queda como vacío a incorporar en readme §4.1 | Cierra V-01; absorbe US-MAN-01 |
| Q-04 | Próstata: TNM en `staging_system`/`stage_value` (ambos cánceres); **Gleason/ISUP en `Diagnosis.grade`**. Sin cambio de esquema. Se registra como decisión en FEAT-00 [Pre-S1] con validación del oncólogo | Resuelve C-11; FEAT-PL2 y FEAT-04 (US-001 matriz ítem → campo) lo citan |
| Q-05 | UI de opt-out en **FEAT-T4b (S4)**, trazada a HU-13 y HU-14; HU-14 se divide en S4 (opt-out) y S5 (equipo tratante) | Resuelve C-08 |
| Q-06 | (a) Rate limit RN-30 en **S1** (FEAT-06a); (b) auditoría de lectura de la ficha en **S2** (FEAT-T1b), HU-02 en S1 sin auditoría; (c) backups cifrados con prueba de restauración en **S5** (FEAT-T4d) y en cada sprint siguiente | Resuelve V-09, C-09, C-15, C-22 |
| Q-07 | TBD-17 se adelanta a **Pre-S1** (DEC en FEAT-00). Hasta resolverse, seed y catálogo de S1 usan solo CIE-10 o códigos con permiso confirmado; si se rechaza (SUP-5), el catálogo se monta como configuración local fuera del repo | Resuelve C-21 |
| Q-08 | Lo que no tiene HU (híbrida S3, FR-17, FR-18, FR-19, suite FR-20) se escribe como **Stories técnicas** con HU = "— (técnica, PRD §17)", trazadas a FR, OL y AC | Resuelve V-04; no se crean HU-27+ |

## 15. Directriz de alcance del usuario (2026-10-05): recorrido principal

El MVP valida una **hipótesis**: un sistema asistido por IA/LLM ayuda al oncólogo a (1) **reconstruir el caso**, (2) **identificar faltantes** y (3) **encontrar las opciones descritas en la evidencia más aplicables a las condiciones del paciente** (encuadre D-01: opciones ordenadas por aplicabilidad, no recomendaciones). Ese es el flujo principal.

- Lo que no está en ese recorrido **se difiere o se resuelve con un workaround** documentado.
- El slicing de `readme.md` §5.0 / PRD §14 es una **sugerencia**: F3 propone un slicing mejorado, centrado en el recorrido, y se presenta explícitamente al usuario.
- No se negocian: invariantes de seguridad y privacidad (RN-10, RN-11, RN-12, RN-13, RN-14, ownership de `rag-orchestrator`), RN-01/RN-06 (citas y soporte verificados, persistir antes de responder), RN-23 (no prescriptivo).

Capacidades del recorrido (propuesta, a confirmar con el slicing): CAP-01 ingesta, CAP-02 reconstrucción, CAP-03 reconciliación (lo mínimo para no mezclar datos), CAP-04 faltantes, CAP-06 recuperación, CAP-08 aplicabilidad, CAP-10 opciones, T-1 trazabilidad, T-2 base del análisis, T-5 evaluación (mide la hipótesis). Candidatas a diferir o workaround: ciclo de vida (FR-14), equipo tratante (FR-15), UI de opt-out (FR-16), retención (FR-17), memoria/historial/decisión (CAP-11, FR-29), agente (FR-30), plantillas (CAP-05), vigencia (CAP-09), síntesis (CAP-07), observabilidad (S6).

**Validación de la hipótesis (respuesta del usuario, 2026-10-05):** combinación de **casos sintéticos** revisados por oncólogos y **pruebas mixtas con casos reales**. Consecuencia: el gate **G-piloto (RN-13)** y sus prerrequisitos siguen en el camino crítico, porque sin ellos no hay casos reales. Entran en el recorrido los controles que exige trabajar con datos reales: `preflight real-data`, VPN + HTTPS, backups cifrados, regla de proveedores solo locales (RN-12), `403` por opt-out de `analisis_ia` (RN-15) y autorización por paciente. Su **UI de gestión** puede resolverse con un workaround (CLI o seed) si eso no debilita el control. Los casos sintéticos (S1–S4) validan la mecánica; los reales (desde G-piloto) validan el valor (VM-1…VM-6).

**Slicing adoptado (usuario, 2026-10-06): "por hipótesis"**, en lugar del de `readme.md` §5.0: Pre-S1 decisiones + contrato/esquema · S1 walking skeleton · S2 caso (ingesta OCR, PII, extracción, vista de caso, normalización mínima, resumen) · S3 faltantes + aplicabilidad (FEAT-04, registro manual, revisión, híbrida, ingesta del corpus con metadatos de población, CAP-08, Base b/c) · S4 opciones ordenadas por aplicabilidad, avisos, datasets de evaluación, feedback VM-4/5 → G-Demo (sintético) · S5 G-piloto (autorización por paciente, `403` opt-out por CLI, preflight, VPN/HTTPS, backups, auditoría, DEC legales) · S6 piloto mixto con casos reales (VM-1…VM-6) y, si hay capacidad, vigencia, síntesis, plantillas, historial · Post-MVP: agente, memoria, ciclo de vida, retención, observabilidad completa. Lo diferido **conserva sus historias** (cobertura de AC del PRD §18) con workaround documentado. Cambia la definición de G-Demo respecto del PRD §14 (se registra como conflicto a corregir en la fuente).

**Resoluciones del usuario a las preguntas de F2 (2026-10-06):**

| P | Decisión | Consecuencia |
|---|---|---|
| P-01 | El faseo de embeddings vs. runtime **se resuelve dentro de ADR-39** (no se fija aquí) | ADR-39 decide si adelanta la fase de embeddings; las historias S1 que dependen de la dimensión del vector citan `⛔ ADR-39` |
| P-02 | La **autorización por paciente ya existe en otro sistema** y queda **fuera del alcance del MVP** | FR-15 (`CareTeamMember`, `403` por equipo tratante) pasa a **Post-MVP**; el MVP aplica solo **RBAC** (FR-01). El `preflight real-data` no verifica pertenencia. Conflicto con PRD FR-15, G-9, AC-T4.x y §11 → se registra para enmendar el PRD. La designación de "tratante principal" para el egreso (Q-02) queda sin efecto junto con el ciclo de vida (Post-MVP) |
| P-03 | Al cerrar cada análisis el oncólogo registra **puntuación 1–5 (VM-4)** y **dos checkboxes: aviso de faltantes correcto / útil (VM-5)**, sin texto libre (`AnalysisFeedback`). Este feedback **es la validación clínica** del sistema y **reemplaza la firma formal** de los catálogos de datos críticos (DEC-01) y de aplicabilidad (DEC-11) | Feedback (HU-25, FEAT-T5c) entra al recorrido principal en S4. DEC-01 y DEC-11 se redefinen: el catálogo se publica como `propuesta` revisada por el oncólogo (sin sesión de firma) y su validación se mide con el feedback agregado. M-04.3 (gobierno) y el criterio de firma de RN-29/RN-20 quedan en conflicto con el PRD → se registran para enmendarlo |

**Respuestas del usuario a las 7 preguntas de Pre-S1/S1 (2026-10-07):**

| # | Decisión | Historias afectadas |
|---|---|---|
| 1 | **6 sprints, recortar al happy path**, rebalanceo con una demo end-to-end por sprint (slicing v2, pendiente de aprobación) | Todas: sprint de cada historia |
| 2 | Término prescriptivo generado en ejecución → la afirmación se **omite** (cuenta en `omittedClaims`); si es la justificación de una opción → `discardedOptions` con `afirmacion_sin_soporte`. Sin cambio de contrato; nunca se muestra (RN-23) | US-064, US-068, US-095, US-129, US-130, US-166 |
| 3 | Backend 2 responde **`422`** ante un tipo de cáncer no habilitado (defensa en profundidad, mismo catálogo en ambos backends) | US-043, US-033 |
| 4 | Registro manual: **`POST …/biomarkers`** (crea `Exam` manual) y **`POST …/diagnoses`** (corrección explícita `manual_correction`; el anterior pasa a `reemplazado`); normalización final en Backend 1 (ADR-33). Se congela en el contrato de Pre-S1 | US-033, US-110, US-111, FEAT-04 US-004 |
| 5 | Validación de catálogos por feedback: **aplicabilidad ← VM-4** (≥ 70 % con ≥ 4), **datos críticos ← VM-5** (≥ 80 % correcto y útil), con muestra mínima (`muestra_insuficiente`) | US-139, DEC-01, DEC-11, DEC-19 |
| 6 | Condición manual con casos reales: **casos reales distintos con orden contrabalanceado** entre participantes | US-008 (DEC-02), US-152 |
| 7 | Texto del criterio en S1–S2: **neutro** ("Seleccionada por relevancia de la búsqueda, no por eficacia; …"); desde la aplicabilidad, "Ordenadas por coincidencia con la población estudiada, no por eficacia" | US-061 AC-3, US-126 AC-7 |

**Slicing v2 aprobado por el usuario (2026-10-07)** junto con la publicación en Linear. Reparto (496 pts): Pre-S1 12 · S1 91 · S2 88 · S3 83 · S4 79 · S5 78 (G-Demo) · S6 65 (G-Piloto → piloto mixto → G-Éxito). Lo que sale del MVP comprometido pasa a `si-hay-capacidad` o Post-MVP con workaround. Detalle por historia: `backlog/features/README.md`.

**Ajustes al slicing v2 (usuario, 2026-10-07):**
- Q-06 revisada: se acepta v2 — rate limit RN-30 (US-056) en S4; auditoría de lectura (US-102) y regla de proveedores locales RN-12 (US-050) en S6, todos antes de G-Piloto (S1–S5 solo sintético).
- **Sesión mínima en S1:** login con cookie opaca + guard (nueva historia US-211, S1); el resto de US-044 (expiración, bloqueo por intentos) sigue en S2.
- **Descarga del PDF de origen** separada del visor diferido: nueva historia US-212 (FEAT-01a, S3, 2 pts), auditada; sostiene el workaround "documento y página con enlace".
- **Suite de evaluación desde S1:** ADR-41 (US-014), DEC-06 (US-016), suite `evaluate` (US-072) y suite en DoD (US-074) pasan a S1; la calibración y el baseline técnico (US-073) y DEC-07 (US-017) siguen en S2.
