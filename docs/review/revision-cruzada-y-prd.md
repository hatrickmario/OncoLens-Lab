# OncoLens — Revisión técnica cruzada y PRD revisado

> **Documento fuente:** `readme.md` (secciones 0–7), en el commit `656777a`. Se contrastó además con `OncoLens-C4.drawio` solo cuando el propio README lo cita (p. ej., "C4 Nivel 3").
> **Fecha de revisión:** 2026-09-25.
> **Convención de etiquetas:** **[H]** Hecho (lo dice el documento) · **[I]** Inferencia (se deduce del documento) · **[R]** Recomendación (mejora sugerida) · **[TBD]** requiere una decisión de producto, negocio o técnica.
> Las referencias del tipo "§2.5" apuntan a las secciones del README; "OL-0x" a los tickets de §6 y "HU-0x" a las historias de §5.

---

## 1. Evaluación ejecutiva

La propuesta es **inusualmente madura para ser documentación previa al código**. Tiene reglas de ownership explícitas (Backend 2 sin PostgreSQL), dos mecanismos de autenticación separados, citas guardadas como snapshot, una cola de extracción durable sin broker y decisiones de diseño con sus alternativas descartadas (§3.3, §6.1). La arquitectura base es implementable y **no encontré ningún bloqueo P0**: ninguna contradicción invalida el diseño por completo.

Los hallazgos estructurales que más importan son estos:

1. **La promesa del producto va más allá de lo que el sistema mide.** §1.1 promete tratamientos "con alta probabilidad de éxito", pero el único puntaje del sistema (`confidenceScore`) mide, según el propio documento, la *relevancia de la recuperación* y no la solidez clínica ni la probabilidad de éxito (§3.2, §3.3 #7). La evaluación de calidad del RAG no tiene sprint, responsable ni métricas objetivo (§2.6). Para un producto de apoyo a decisiones clínicas, este es el mayor riesgo.
2. **La privacidad hacia Backend 2 no cumple su propio invariante.** El contrato dice que `rag-orchestrator` "nunca recibe PII" (§4.2), pero `/documents/extract` le envía el PDF clínico completo. Además, la pregunta libre del doctor y el `content` libre de `ClinicalNote` viajan al LLM sin ningún control de PII, y el contexto clínico se envía a un proveedor de *embeddings* (OL-02 #4). Esto contradice lo de "los datos del paciente nunca se vectorizan" de §1.2.
3. **Los datos extraídos por OCR entran al contexto del RAG sin revisión.** La regla "un error de OCR nunca cambia en silencio el contexto que alimenta al RAG" (§3.2) solo se aplica a `Diagnosis`. Los biomarcadores extraídos, incluida su `clinicalSignificance` asignada por IA, sí lo cambian en silencio. El flujo de corrección se asigna a un Sprint 6 cuyo objetivo no lo incluye y que el roadmap declara prescindible.
4. **La secuencia del roadmap choca con la seguridad.** Autorización por asignación, consentimiento y auditoría llegan en los Sprints 5–6 y se declaran prescindibles (§5.0). Sin embargo, desde el Sprint 2 los doctores suben PDFs reales, y desde el Sprint 1 se usa un proveedor de LLM "provisional", posiblemente en la nube.
5. **Hay brechas en la infraestructura de datos.** El bucket de PHI `clinical-documents` vive en el MinIO interno de Milvus: el dominio de Backend 2, alcanzable por red desde él y administrado con credenciales de Milvus. El catálogo `corpus_documents` se modela como una colección de Milvus "sin vectores", algo que Milvus no admite de forma nativa.
6. **Hay un desajuste de idioma que el diseño no trata.** Las historias clínicas y las preguntas están en español (§1.4), pero el corpus (NCI, PDQ, ClinicalTrials.gov) está mayoritariamente en inglés. Esto afecta directamente la búsqueda *sparse* del Sprint 3 y la elección del modelo de *embeddings*.
7. **A la experiencia de usuario le faltan flujos base.** No hay alta ni listado de pacientes, aunque HU-01 redirige a un "listado de pacientes". Tampoco hay gestión de consentimiento, asignaciones ni usuarios. Los Sprints 3–6 no tienen historias ni contratos de API.

§7 (Pull Requests) está vacía y todavía no hay código: el propio C4 lo dice. Por eso la relación Tickets/PRs ↔ Sistema solo puede evaluarse para los tickets.

---

## 2. Hallazgos críticos

Orden: P0 → P1 → P2 → P3 → P4. Dentro de cada nivel: producto → seguridad → arquitectura → integridad de datos → entrega → operación.

### P0 — Bloqueantes

**No se identificaron hallazgos P0.** Las decisiones que hoy bloquean tickets concretos (motor de OCR para OL-05; modelo de *embeddings* y proveedor de LLM para OL-02) ya están identificadas en el documento y tienen un mecanismo de desbloqueo: un spike y una interfaz `ExtractionAdapter`. Se registran como decisiones requeridas en la §4.

---

### P1 — Críticos

### [P1-01] P1 — La propuesta de valor promete "alta probabilidad de éxito", pero el sistema solo mide relevancia de recuperación

**Tipo:** Contradicción

**Secciones involucradas:** §0.3, §1.1, §1.3, §3.2 (`AIAnalysisRecord`), §3.3 #7, §4.1 (`Recommendation.confidenceScore`), §6.1 #4, OL-02 #5.

**Evidencia:**
- [H] §1.1: "respaldar la elección de un tratamiento personalizado **con alta probabilidad de éxito**".
- [H] §0.3: "el oncólogo obtiene **recomendaciones de tratamiento personalizado**".
- [H] §3.2 y §4.1: `confidenceScore` "mide la **relevancia de la evidencia recuperada** […] no la solidez clínica de esa evidencia".
- [H] §3.3 #7: el scoring de evidencia clínica sigue como "🚧 Pendiente — ADR (alta incertidumbre)" y "exige metadatos que hoy no tiene `CorpusDocument`".

**Problema:** Ningún componente, dato ni ADR —ni siquiera el pendiente— estima la probabilidad de éxito de un tratamiento: no hay datos de resultados, modelos pronósticos ni *outcomes*. El sistema recupera evidencia y genera un texto que la resume. Además, la palabra "recomendación" posiciona al producto como un sistema que *decide* y no como uno que *presenta evidencia*.

**Impacto:** Producto: expectativa imposible de cumplir. Seguridad clínica: el doctor puede leer 0,92 como probabilidad de éxito, y el nombre `confidence_score` lo refuerza (ver P2-10). Regulatorio: [I] un software que "recomienda tratamiento personalizado" podría encajar en la definición de software como dispositivo médico (SaMD) según la jurisdicción. El documento no la menciona.

**Recomendación:** [R] Reescribir el objetivo como "presentar la evidencia publicada más relevante para el perfil del paciente, con citas verificables, para apoyar la decisión del oncólogo". Eliminar "alta probabilidad de éxito" hasta que exista un modelo validado que lo sustente. [TBD] Definir la jurisdicción y el posicionamiento regulatorio (herramienta académica o de investigación, sin uso clínico real, vs. CDS) y dejarlo como No-Objetivo explícito en el PRD.

---

### [P1-02] P1 — Los biomarcadores extraídos por OCR y su `clinicalSignificance` asignada por IA cambian en silencio el contexto del RAG

**Tipo:** Contradicción / Riesgo

**Secciones involucradas:** §3.2 (`Diagnosis`, `Exam/Biomarker`), §3.3 #12, §4.2 (`DocumentExtractResponse`), HU-05, OL-03 #2.2, OL-05 #6–7.

**Evidencia:**
- [H] §3.2 (`Diagnosis`): "un error de OCR **nunca cambia en silencio el contexto que alimenta al RAG**".
- [H] OL-05 #6: los `Biomarker[]` extraídos se persisten directamente con `entry_method = ocr` y el documento pasa a `completado`.
- [H] OL-03 #2.2: el contexto del RAG incluye "`Diagnosis` activo + **biomarcadores recientes**", sin filtrar por `entry_method`.
- [H] §4.2: `DocumentExtractResponse.biomarkers[].clinicalSignificance` lo devuelve el servicio de extracción (OCR + LLM o vision-LLM).
- [H] HU-05: "en este sprint los datos extraídos son de **solo lectura**" y la corrección llega en el Sprint 6.

**Problema:** La salvaguarda contra errores de OCR solo cubre `Diagnosis`. Un biomarcador mal leído (por ejemplo, "EGFR negativo" leído como "positivo", o una unidad mal interpretada) entra directo al contexto de la siguiente consulta RAG. Además, la clasificación normal/alterado/relevante/crítico la produce un modelo de IA y no el laboratorio, y ninguna regla de negocio dice quién es la autoridad sobre ese semáforo.

**Impacto:** Seguridad clínica: una recomendación puede basarse en un biomarcador mal extraído y verse "respaldada por evidencia". Integridad de datos: el semáforo de severidad que ve el doctor (HU-05) puede ser una inferencia del LLM que se presenta como dato.

**Recomendación:** [R] Aplicar a todo dato con `entry_method = ocr` la misma regla que a `Diagnosis`: introducir un estado de verificación (p. ej., `verification_status: pendiente_revision | verificado | rechazado`) y excluir del contexto RAG los datos no verificados, o como mínimo marcarlos como "no verificados" en el prompt y en la UI. [TBD] Decidir si `clinicalSignificance` se toma literalmente del documento (bandera del laboratorio), se calcula con reglas deterministas a partir de `reference_range` o la asigna el LLM, y en ese caso marcarla siempre como sugerida. [R] Adelantar la revisión y verificación mínima al Sprint 2 (ver P2-01).

---

### [P1-03] P1 — La evaluación de calidad del RAG y la validación clínica no tienen sprint, métricas ni responsable; validar citas no garantiza *grounding*

**Tipo:** Faltante / Riesgo (IA)

**Secciones involucradas:** §2.6, §3.3 #7, §5.0 (KR3 del Sprint 1, KR1 del Sprint 4), OL-02 #5 y #8, §2.3 (`data/evaluation`).

**Evidencia:**
- [H] §2.6: la evaluación de calidad del RAG es "🚧 Pendiente — ADR futuro" y "Los tests anteriores verifican que el sistema *funciona*, no que sus recomendaciones estén bien fundamentadas".
- [H] §5.0: ningún sprint (1–6) incluye la evaluación del RAG como alcance o KR.
- [H] OL-02 #5: la validación consiste en comprobar que "todo `chunkId` citado por el LLM debe pertenecer al conjunto recuperado".
- [H] KR3 del Sprint 1: "100% de las recomendaciones generadas incluyen al menos 1 fuente citada verificable".

**Problema:** Que el `chunkId` pertenezca al conjunto recuperado prueba que la cita *existe*, no que *respalde* la afirmación. El LLM puede citar un chunk real y relevante y aun así afirmar algo que el chunk no dice: una alucinación "con cita". El KR3 se puede cumplir al 100% con recomendaciones infieles. No hay dataset de referencia definido (preguntas, respuestas esperadas y quién las valida), ni métricas objetivo (fidelidad, *recall@k*, tasa de "sin evidencia" correcta), ni participación de un oncólogo, salvo la mención "⚠️ validar con un oncólogo" en §3.3 #12.

**Impacto:** Calidad de IA: no hay forma de saber si el producto cumple su objetivo central. Producto: los KRs del Sprint 1 y del Sprint 4 miden forma, no corrección. Entrega: cambiar de modelo de *embeddings* o de LLM (explícitamente previsto) no tiene prueba de regresión.

**Recomendación:** [R] Crear un ticket de evaluación en el Sprint 1 (baseline) que se repita en cada sprint: un dataset versionado en `data/evaluation/` con N preguntas sintéticas y su evidencia esperada, y métricas de *retrieval* (recall@k, MRR) y de generación (fidelidad por afirmación, exactitud de citas, tasa correcta de "sin evidencia"). [R] Añadir a la validación de Backend 2 un chequeo de soporte (NLI o un LLM juez con verificación por afirmación) antes de aceptar una recomendación. [TBD] Metas numéricas y quién (qué oncólogo) valida el dataset.

---

### [P1-04] P1 — `/documents/extract` envía el PDF clínico completo (con PII) a Backend 2 y posiblemente a un proveedor externo, lo que contradice el invariante "Backend 2 nunca recibe PII"

**Tipo:** Contradicción (seguridad y privacidad)

**Secciones involucradas:** §1.4 (ADR de OCR), §2.1 (Flujo 1), §2.5, §3.1 (aislamiento de MinIO), §4.2 (descripción de la API y `DocumentExtractRequest`), OL-05 #5 y #11.

**Evidencia:**
- [H] §4.2 `info.description`: "**Nunca recibe PII** ni credenciales de PostgreSQL/MinIO clinical-documents".
- [H] §2.5: "Backend 2 nunca debería necesitar PII para generar una recomendación".
- [H] §4.2 y OL-05 #11: Backend 2 descarga el PDF (historia clínica o examen, con nombre, documento de identidad, etc.) mediante una URL prefirmada y lo procesa.
- [H] §1.4: las alternativas de OCR incluyen Textract, Document AI y vision-LLMs en la nube, que "implica enviar el documento a un tercero".

**Problema:** El invariante es verdadero para `/rag/query` y falso para `/documents/extract`. En la práctica, Backend 2 es un procesador de PHI, y su proveedor de OCR/LLM también puede serlo. El aislamiento por credenciales de MinIO evita el acceso *permanente*, pero no el acceso al *contenido*. El modelo de amenazas que justifica aislar Backend 2 ("la capa más expuesta a proveedores externos", §2.1) aplica justamente a este flujo.

**Impacto:** Seguridad: si se compromete Backend 2, se expone PHI durante la extracción, además de los logs del proveedor. Cumplimiento: la afirmación falsa en el contrato puede llevar a omitir controles (retención en el proveedor, DPA, residencia de datos). Arquitectura: la decisión de dónde vive el OCR se tomó asumiendo que Backend 2 no maneja PII.

**Recomendación:** [R] Corregir el invariante: "Backend 2 no **persiste** PHI y no recibe **identificadores directos** en `/rag/query`; en `/documents/extract` procesa PHI de forma transitoria". [R] Añadir controles específicos: nada de PDF en disco ni en logs (ya en OL-05 #11), timeouts y memoria acotados, y para proveedores en la nube: contrato de tratamiento de datos, no retención y región definida. [TBD] Decidir si el OCR con PHI puede salir a la nube (bloquea el ADR de §1.4) y la jurisdicción normativa aplicable.

---

### [P1-05] P1 — La anonimización no cubre el texto libre (pregunta del doctor, notas clínicas) ni los cuasi-identificadores

**Tipo:** Riesgo / Ambigüedad (privacidad)

**Secciones involucradas:** §2.5 ("Consentimiento y anonimización", "Minimización"), §4.1 (`query`), §4.2 (`ClinicalContext.clinicalNotes[].content`, `recordedAt`), OL-03 #2.3 y #5, KR3 del Sprint 5.

**Evidencia:**
- [H] §2.5: el contexto "se anonimiza **cuando es necesario**".
- [H] OL-03 #2.3: *allowlist* de campos estructurados; el test de no-fuga verifica solo `mrn`, `fullName`, `birthDate` y `patientId`.
- [H] §4.2: `clinicalNotes[].content` es texto libre extraído por OCR (§3.1 `CLINICAL_NOTE.content`); `query` es texto libre escrito por el doctor.
- [H] KR3 del Sprint 5: auditar "una muestra de payloads" como libres de PII.

**Problema:** Una nota clínica extraída por OCR ("Paciente Juan Pérez, CC 123…, remitido por…") o una pregunta ("¿qué le doy a la señora Gómez…?") lleva PII al LLM aunque los campos estructurados estén limpios. Las fechas exactas (`recordedAt`) combinadas con un diagnóstico raro y sus biomarcadores son cuasi-identificadores. "Cuando es necesario" deja la regla sin definir.

**Impacto:** Privacidad: fuga de PII hacia un proveedor externo de LLM desde el Sprint 3, cuando los filtros empiezan a enviar notas. Hoy el riesgo es bajo porque OL-03 envía `clinicalNotes: []`. Cumplimiento: el KR3 del Sprint 5 muestrea en lugar de controlar.

**Recomendación:** [R] Reemplazar "cuando es necesario" por "siempre". [R] Añadir un paso de desidentificación del texto libre en Backend 1 (detección de nombres, identificaciones, teléfonos y direcciones) antes de enviar `query` y `clinicalNotes`, con test automatizado sobre casos sintéticos con PII embebida. [R] Generalizar fechas (p. ej., meses relativos al diagnóstico) en lugar de fechas absolutas. [TBD] Nivel de desidentificación exigido (norma aplicable).

---

### [P1-06] P1 — Los controles de acceso, consentimiento y auditoría llegan en sprints "prescindibles", mientras que desde el Sprint 1 y el Sprint 2 ya pueden entrar datos reales

**Tipo:** Desalineación (roadmap ↔ seguridad)

**Secciones involucradas:** §2.5, §3.3 #4, §5.0 (Sprints 1, 2, 5 y 6 y la nota final), HU-02, HU-04, OL-01 (sin `AuditLog`), OL-03 ("No incluye").

**Evidencia:**
- [H] §2.5: el consentimiento (`consent_ai_analysis = true`) y la asignación son condiciones para usar los datos de un paciente.
- [H] §5.0: `PatientAssignment` y el consentimiento van en el Sprint 5 y `AuditLog` en el Sprint 6. "Si los Sprints 5–6 no llegan a ejecutarse, el producto sigue siendo demostrable".
- [H] HU-02 y HU-04: "cualquier doctor autenticado puede ver cualquier paciente".
- [H] Sprint 2: el doctor "sube el PDF que ya tiene", es decir, potencialmente real.
- [H] Sprint 1: se elige "**1 proveedor de LLM** provisional"; el ADR self-hosted vs. nube queda para "producción".
- [H] §2.3: `data/` "nunca PHI real", una regla que solo cubre el repositorio y no la base de datos ni las cargas.

**Problema:** El documento no establece en ningún momento que los Sprints 1–4 operen **exclusivamente con datos sintéticos**. Sin esa regla, el roadmap permite un MVP que procesa PHI real sin autorización por paciente, sin consentimiento y sin auditoría, y que la envía a un proveedor elegido provisionalmente.

**Impacto:** Seguridad y cumplimiento: un MVP que "funciona" pero no se puede usar legalmente con pacientes reales. Producto: la afirmación "demostrable sin los Sprints 5–6" solo es cierta con datos sintéticos.

**Recomendación:** [R] Añadir una regla de negocio explícita: "Hasta completar los controles de los Sprints 5 y 6 (asignación, consentimiento, auditoría de accesos, desidentificación del texto libre), el sistema solo procesa datos sintéticos". Poner el mecanismo por escrito: seed con `entry_method = seed`, advertencia en la UI y bloqueo de carga en entornos marcados como `demo`. [R] Adelantar `AuditLog` de accesos a PHI (lectura de la ficha, consulta RAG, carga) al Sprint 2, ya que su costo es bajo. [TBD] Definir qué es "producción" en este proyecto (ver P3-06).

---

### [P1-07] P1 — El bucket de PHI `clinical-documents` vive en el MinIO interno de Milvus: el ownership, la red y las credenciales se contradicen

**Tipo:** Contradicción / Riesgo (arquitectura y seguridad)

**Secciones involucradas:** §2.1 (Flujo 1: "PostgreSQL + MinIO"), §2.4 (diagrama de despliegue), §3.1 (título "Milvus + MinIO (Backend 2)", "Aislamiento de MinIO por dominio"), §4.2, OL-05 #2 y #5.

**Evidencia:**
- [H] §2.4: el único MinIO es `milvus-minio`, conectado solo a `milvus-standalone`. El diagrama no muestra ninguna arista `clinical-api → MinIO` ni `rag-orchestrator → MinIO`.
- [H] §3.1: "aunque se reutiliza la **misma instancia de MinIO**, los buckets están separados por credenciales"; el título del apartado asigna MinIO a Backend 2.
- [H] §2.2: Backend 1 es "Dueño exclusivo de PostgreSQL", pero no se menciona como dueño de ningún almacenamiento de objetos.
- [H] OL-05 #5: la URL prefirmada se firma con el hostname interno de MinIO "resoluble desde `rag-orchestrator`".

**Problema:**
1. El ownership es ambiguo: el almacén de PHI pertenece a Backend 1, pero la instancia pertenece a la infraestructura de Milvus, dominio de Backend 2.
2. [I] Milvus accede a su MinIO con credenciales propias, típicamente de administrador (root), así que el contenedor de Milvus puede leer `clinical-documents`.
3. Backend 2 necesita una ruta de red hacia la misma instancia que guarda la PHI; el aislamiento depende solo de políticas IAM de MinIO.
4. La regla de §2.1 ("Backend 1 posee… todo lo que toca PostgreSQL") no dice quién opera el almacenamiento de objetos clínico, ni su cifrado, *backup* y retención.

**Impacto:** Seguridad: el radio de impacto de un compromiso de Milvus o Backend 2 incluye la PHI en reposo. Operación: *backups*, retención y cifrado quedan acoplados al ciclo de vida de Milvus (reinstalar Milvus arriesga documentos clínicos). Documentación: el diagrama de despliegue no refleja el Flujo 1.

**Recomendación:** [R] Crear una instancia de almacenamiento de objetos dedicada a `clinical-documents` (`clinical-minio`), propiedad de Backend 1. Para la URL prefirmada, exponer a Backend 2 solo un *endpoint* de lectura o, mejor, que Backend 1 envíe el binario en el cuerpo del request (flujo *push*) y así eliminar la ruta de red de Backend 2 hacia el almacén de PHI. Actualizar §2.4, §3.1 y el Flujo 1. [TBD] *Push* del binario vs. URL prefirmada.

---

### [P1-08] P1 — Idioma: documentos y preguntas en español contra un corpus mayoritariamente en inglés, con búsqueda *sparse* monolingüe

**Tipo:** Faltante / Riesgo (IA)

**Secciones involucradas:** §1.2 (#3 búsqueda híbrida), §1.4 ("precisión sobre historias clínicas/exámenes **en español**"), §2.1, §3.1 (`CorpusChunk.sparse_vector`), §4.1 (ejemplo de pregunta en español), §5.0 (Sprint 3, KR3: NCI, PDQ, ensayos), OL-02 (spike de *embeddings*).

**Evidencia:**
- [H] Las preguntas del ejemplo (§4.1) y los criterios de OCR (§1.4) están en español.
- [H] Las fuentes del corpus son NCI, PDQ y ClinicalTrials.gov (§2.1, §5.0), y los ejemplos citan la guía NCCN y el ensayo FLAURA.
- [I] Estas fuentes están mayoritariamente en inglés; PDQ tiene versiones en español, sobre todo para pacientes.
- [H] El spike del Sprint 1 elige el modelo de *embeddings* priorizando "cambiarlo después obliga a reindexar", sin mencionar el idioma como criterio.

**Problema:** Una búsqueda *sparse* (léxica, tipo BM25 o SPLADE monolingüe) sobre una pregunta en español prácticamente no recupera términos de chunks en inglés, lo que vacía de valor el objetivo del Sprint 3 ("búsqueda híbrida"). La recuperación *dense* solo funciona entre idiomas si el modelo es multilingüe. Tampoco se define en qué idioma responde el LLM ni en qué idioma se guarda `chunkTextSnapshot`, que el doctor puede no poder verificar.

**Impacto:** Calidad de IA: *recall* bajo, más respuestas de "sin evidencia" o evidencia irrelevante. Arquitectura: una decisión equivocada en el spike obliga a reindexar todo el corpus, justo el costo que el documento quiere evitar.

**Recomendación:** [R] Hacer del idioma un criterio obligatorio del spike de *embeddings* (modelo multilingüe o normalización o traducción de la pregunta a inglés antes de recuperar). Definir la estrategia *sparse* para textos en otro idioma (p. ej., la pregunta traducida o normalizada a términos biomédicos). Incluir preguntas en español en el dataset de evaluación (P1-03). [TBD] Idioma del corpus, de la respuesta y de las citas mostradas.

---

### [P1-09] P1 — No hay ningún flujo para dar de alta pacientes ni para listarlos; el producto promete ingesta de "datos personales" que el MVP excluye

**Tipo:** Faltante / Contradicción (producto ↔ API)

**Secciones involucradas:** §1.2 #1, §3.2 (`PatientContactInfo`), §3.3 #13, §4.1, HU-01 (escenario 1), HU-04, OL-01 #9, OL-05.

**Evidencia:**
- [H] §1.2 #1: "Ingesta de historia clínica, **datos personales** y exámenes vía OCR".
- [H] §3.2 y §3.3 #13: `PatientContactInfo` queda "fuera del MVP", y "el contrato de extracción (4.2) no la extrae".
- [H] HU-01: "el frontend redirige al **listado de pacientes**", pero no existe ningún `GET /platform/patients` ni historia de usuario para el listado.
- [H] §4.1 y OL-05: la carga exige un `patientId` existente. Los únicos pacientes que existen son los 3 del seed (OL-01 #9).
- [H] §5.0: ningún sprint define la creación de pacientes.

**Problema:** Con lo documentado, el sistema nunca podría usarse con un paciente nuevo: no se puede crear un `Patient` por API, por OCR ni por UI. La navegación posterior al login lleva a una pantalla sin contrato.

**Impacto:** Producto: el recorrido central "login → ver paciente → preguntar" depende del seed. Entrega: OL-04 depende de "login y ficha" pero no de cómo el doctor *llega* al paciente.

**Recomendación:** [R] Añadir al alcance del Sprint 1 un `GET /platform/patients` (paginado, con búsqueda por `mrn` y nombre). Hasta el Sprint 5 lista todos los pacientes; después, solo los asignados. [TBD] Decidir cómo se crean los pacientes: formulario manual mínimo (`mrn`, nombre, nacimiento, sexo, consentimiento), integración con un sistema de historia clínica electrónica (fuera de alcance) o extracción de identidad por OCR. Corregir §1.2 #1 para quitar "datos personales" del MVP o incluirlos de forma coherente.

---

### P2 — Altos

### [P2-01] P2 — El flujo de corrección y resolución de diagnósticos está asignado a un Sprint 6 que no lo incluye; `is_active = false` mezcla "histórico" con "pendiente de revisión"

**Tipo:** Contradicción / Desalineación

**Secciones involucradas:** §3.2 (`Diagnosis`), §3.3 #12, §5.0 (Sprint 2 "Fuera de alcance", Sprint 6), HU-05, OL-05 #7.

**Evidencia:**
- [H] §3.2, §3.3 #12, HU-05 y OL-05 remiten el "flujo de corrección" y la decisión del doctor sobre diagnósticos al **Sprint 6**.
- [H] §5.0, Sprint 6: el objetivo es "Observabilidad, seguridad y hardening" y sus KRs no mencionan la corrección. Además, el Sprint 6 es de "menor valor" y "puede no ejecutarse".
- [H] §3.2: `Diagnosis.is_active` marca "vigente vs. histórico"; OL-05 #7 usa `is_active = false` para los diagnósticos extraídos que difieren y esperan decisión.

**Problema:** Un diagnóstico extraído distinto del activo (por ejemplo, una recurrencia real) queda guardado como si fuera histórico, sin forma de verlo como pendiente ni de resolverlo, posiblemente para siempre. No se distingue un diagnóstico descartado, uno pendiente y uno histórico.

**Impacto:** Seguridad clínica: el contexto del RAG puede quedar desactualizado en silencio, justo lo contrario de lo que la regla pretendía evitar. Datos: el estado no se puede interpretar sin mirar `entry_method` y fechas.

**Recomendación:** [R] Añadir un estado explícito (`review_status` o un enum `pendiente_revision`) en `Diagnosis`, y en los demás datos de OCR según P1-02. Como mínimo, mostrar en la ficha un aviso de "diagnóstico extraído pendiente de revisión" desde el Sprint 2. [R] Asignar el flujo de corrección a un sprint cuyo objetivo lo incluya (p. ej., un Sprint 2.5 o el Sprint 4) y sacarlo del Sprint 6 "prescindible".

---

### [P2-02] P2 — `AIAnalysisRecord` no guarda lo necesario para cumplir la "auditoría reproducible" prometida

**Tipo:** Faltante (integridad de datos y trazabilidad)

**Secciones involucradas:** §2.5 ("Trazabilidad… auditoría posterior reproducible"), §3.1 (`AI_ANALYSIS_RECORD`), §3.2, OL-03 #2.5.

**Evidencia:**
- [H] §2.5: la auditoría debe ser "reproducible incluso si el corpus se reingiere".
- [H] §3.1: `AIAnalysisRecord` guarda `query_text`, `sources_selected`, `filters_applied`, `recommendations` y `top_confidence_score`, pero no el **contexto clínico enviado**, ni el modelo o proveedor de LLM y su versión, ni el modelo de *embeddings*, la versión del prompt, el umbral de relevancia, el *top-k* o la versión del corpus.

**Problema:** Los datos del paciente cambian con el tiempo (nuevos exámenes por OCR, correcciones), y el LLM, el prompt y el umbral "a calibrar" también cambian. Con lo que se persiste no se puede reconstruir *qué vio el modelo* ni *con qué configuración* se generó una recomendación.

**Impacto:** Trazabilidad clínica, que es el valor declarado del producto. Tampoco se puede comparar el efecto de cambiar de proveedor (P1-03).

**Recomendación:** [R] Añadir a `AIAnalysisRecord`: `clinical_context_snapshot` (jsonb, el payload ya desidentificado que se envió), `llm_provider`, `llm_model`, `embedding_model`, `prompt_version`, `retrieval_params` (k, umbral, modo dense/híbrido) y `status` (`con_evidencia | sin_evidencia`). Backend 2 debe devolver estos metadatos en `RagQueryInternalResponse`.

---

### [P2-03] P2 — Embeber el contexto clínico contradice "los datos del paciente nunca se vectorizan" y lo envía al proveedor de *embeddings*

**Tipo:** Contradicción

**Secciones involucradas:** §1.2 #2, OL-02 #4, §2.2 (LLM Providers "de generación y de embedding").

**Evidencia:**
- [H] §1.2 #2: "los datos del propio paciente **nunca se vectorizan**".
- [H] OL-02 #4: "embed (**pregunta + resumen del contexto clínico**)".

**Problema:** Se vectoriza el contexto clínico, aunque el vector no se persista. Si el proveedor de *embeddings* es externo, recibe datos clínicos por una vía que las reglas de privacidad no contemplan. Además, el documento no define qué es el "resumen del contexto clínico" ni cómo se construye.

**Impacto:** Documentación contradictoria que puede llevar a omitir el proveedor de *embeddings* en el análisis de privacidad y en la decisión nube vs. self-hosted.

**Recomendación:** [R] Reformular §1.2 #2 como "los datos del paciente nunca se **persisten** en la base vectorial ni forman parte del corpus". Tratar al proveedor de *embeddings* como receptor de datos clínicos desidentificados, con los mismos requisitos que el proveedor de LLM. Definir la construcción de la consulta de *retrieval* en `domain/`.

---

### [P2-04] P2 — El camino navegador → Backend 1 no está definido para los endpoints que no son de RAG, y falta protección CSRF

**Tipo:** Ambigüedad / Faltante (arquitectura ↔ API, seguridad)

**Secciones involucradas:** §2.1 ("El frontend nunca habla directo con el servicio de IA"), §2.1 Flujo 1 (`FE->>BE1`), §2.2 (Frontend), §2.4 ("`clinical-api` expone su puerto al host (vía `web`)"), §2.5, §4.1 (`servers: https://localhost/api`), OL-04 (criterio de aceptación de red).

**Evidencia:**
- [H] OL-04: "solo aparecen requests a `web` (`/api/rag`), ninguno directo a `clinical-api`".
- [H] Para la carga (HU-04), la ficha (HU-02), el listado de documentos y el login (HU-01) no se define si pasan por Route Handlers, Server Actions, RSC o llamadas directas.
- [H] §4.1 publica `https://localhost/api` como servidor de `clinical-api`, que choca con el prefijo `/api` que usan los Route Handlers de Next.js.
- [H] La autenticación es por cookie (§2.5) y no se menciona `SameSite` ni tokens CSRF.

**Problema:** No está claro si el navegador habla con `clinical-api` directamente, que según §2.4 expone un puerto al host. Si lo hace, se necesita CORS y la cookie queda en el dominio de `clinical-api`. Si no, faltan los proxies. Con cookies de sesión y endpoints `POST` (`/rag/query`, carga), la protección CSRF es obligatoria.

**Impacto:** Seguridad: CSRF sobre acciones que generan análisis o cargan documentos, y posible exposición de `clinical-api` al host. Entrega: cada ticket de frontend va a resolverlo de forma distinta.

**Recomendación:** [R] Decidir un patrón único: todo acceso del navegador pasa por `web` (Route Handlers y Server Actions) y `clinical-api` no publica puerto al host, o bien se publica detrás del mismo origen con un *reverse proxy*. Definir la cookie con `SameSite=Lax` o `Strict`, verificación de `Origin`/token CSRF y el dominio y ruta de la cookie. Documentar la carga *multipart* a través de `web` (límite de tamaño del Route Handler).

---

### [P2-05] P2 — El ciclo de vida de la autenticación está incompleto: sin logout, TTL, gestión de usuarios ni protección contra fuerza bruta

**Tipo:** Faltante (seguridad)

**Secciones involucradas:** §2.5, §3.1 (`SESSION`), HU-01, OL-01 #9.

**Evidencia:**
- [H] Solo existe `POST /platform/auth/login`. `Session.revoked` existe, pero no hay endpoint de logout ni de revocación.
- [H] `expires_at` y `last_seen_at` ("sliding expiration") no tienen valores definidos.
- [H] HU-01: la protección contra fuerza bruta queda "fuera de alcance", ligada al ADR de *rate limiting*, que no tiene sprint.
- [H] No se define el algoritmo de hash de contraseñas, ni cómo se crean, desactivan o reinician usuarios. El seed crea un solo doctor.

**Impacto:** El caso de uso de "revocar una sesión (dispositivo robado, baja de un doctor)", que justifica la sesión persistida en §2.5, no se puede ejecutar. El login queda expuesto a fuerza bruta de forma indefinida.

**Recomendación:** [R] Añadir al Sprint 1: `POST /platform/auth/logout`, un TTL absoluto y uno de inactividad (valores [TBD]), hash de contraseñas con Argon2id o bcrypt, y un límite mínimo de intentos fallidos por cuenta e IP, independiente del ADR general. [TBD] Proceso de alta y baja de usuarios (script de administración vs. UI de administrador).

---

### [P2-06] P2 — El consentimiento y las asignaciones no tienen API, responsable ni historial

**Tipo:** Faltante / Ambigüedad

**Secciones involucradas:** §2.5, §3.1 (`PATIENT.consent_ai_analysis`, `PATIENT_ASSIGNMENT`), §3.3 #2 y #4, Sprint 5.

**Evidencia:**
- [H] El consentimiento es un booleano con `consent_recorded_at`; no hay quién lo registró, ni versión del texto, ni revocación.
- [H] `PatientAssignment`: "solo una asignación activa por paciente a la vez", sin restricción de base de datos definida.
- [H] No hay endpoints ni historias para registrar o revocar el consentimiento ni para asignar o desasignar doctores; tampoco se define quién puede hacerlo.

**Problema:** El Sprint 5 exige 100% de validación de asignación y 0 análisis sin consentimiento, pero no hay forma de administrar esos datos. La regla de "un doctor por paciente" no refleja la oncología multidisciplinaria (comités de tumores, interconsultas) [I].

**Impacto:** El Sprint 5 no se puede entregar tal como está. Además, la revocación del consentimiento no tiene efecto definido sobre los análisis ya guardados.

**Recomendación:** [R] Modelar el consentimiento como eventos (`PatientConsent`: otorgado o revocado, por quién, cuándo, versión) o, como mínimo, añadir `consent_recorded_by`. Definir endpoints de administración (rol `admin`) y un índice único parcial `(patient_id) WHERE is_active`. [TBD] ¿Uno o varios doctores activos por paciente? ¿Qué pasa con los análisis previos si se revoca el consentimiento?

---

### [P2-07] P2 — `PatientSummary` no cubre lo que exigen HU-05 y el mockup

**Tipo:** Desalineación (historias ↔ API ↔ datos)

**Secciones involucradas:** §1.3, §4.1 (`PatientSummary`, `Biomarker`), HU-02, HU-05.

**Evidencia:**
- [H] HU-05: "todo dato con `entry_method = ocr` se muestra como tal"; "ver los biomarcadores **y datos clínicos** que el sistema extrajo".
- [H] §4.1 `Biomarker` expone `name`, `value`, `resultType`, `clinicalSignificance` y `sourceDocumentId`, pero no `entryMethod`, `unit`, `referenceRange` ni la fecha del examen.
- [H] §1.3: el mockup tiene "pestañas de resumen clínico y de exámenes/biomarcadores". No hay endpoint que exponga `ClinicalNote` ni un listado de `Exam`.
- [H] "biomarcadores recientes" no está definido: ¿cuántos? ¿con qué ventana de tiempo? ¿el último valor por nombre?

**Problema:** La UI no puede mostrar la procedencia de OCR, las unidades ni los rangos (necesarios para interpretar el semáforo), ni las notas clínicas extraídas. La definición de "reciente" también afecta el contexto del RAG (OL-03 #2.2).

**Recomendación:** [R] Añadir `entryMethod`, `unit`, `referenceRange`, `performedAt` y `examType` al `Biomarker` de la ficha. Definir "reciente" (p. ej., el último valor por `name`, o una ventana de N meses) [TBD]. Añadir `GET /platform/patients/{id}/clinical-notes` (paginado) o sacar las notas clínicas del alcance de HU-05.

---

### [P2-08] P2 — La colección `corpus_documents` "sin vectores" no es viable en Milvus, y el versionado entre documento y chunks no es atómico

**Tipo:** Riesgo (arquitectura ↔ datos)

**Secciones involucradas:** §3.1 (`CORPUS_DOCUMENT`: "colección Milvus corpus_documents — catálogo, sin vectores"), §3.2 (`CorpusDocument`, `CorpusChunk.is_current`), §3.3 #5, OL-02 #2.

**Evidencia:**
- [H] El catálogo se modela como colección de Milvus sin vectores.
- [I] Milvus (al menos en las versiones 2.x de uso común) exige al menos un campo vectorial por colección y está optimizado para búsqueda vectorial, no para un catálogo con actualizaciones frecuentes de estado (`status`, `is_current`, `last_checked_at`).
- [H] Al versionar, hay que cambiar `is_current` en el documento **y** en todos sus chunks. Milvus no ofrece transacciones entre colecciones.

**Problema:** Técnicamente, obliga a un vector ficticio. Operativamente, un fallo a mitad del versionado deja chunks vigentes de una versión que ya no lo es, o al revés, y eso afecta qué evidencia se recupera.

**Recomendación:** [R] Guardar el catálogo `CorpusDocument` (y el estado del pipeline) en un almacén relacional **propio de Backend 2**: una base PostgreSQL o SQLite separada, sin relación con la base clínica. Así se respeta la regla "Backend 2 sin acceso a la PostgreSQL clínica". En Milvus quedan solo los chunks. Definir el procedimiento de versionado como idempotente y reanudable (insertar la versión nueva, verificar, luego despublicar la anterior). [TBD] Confirmar la versión de Milvus y sus capacidades (también afecta el riesgo de OL-02 sobre `sparse_vector` sin poblar).

---

### [P2-09] P2 — Fuentes del corpus: licencias, fuente genómica no definida y actualización sin entregable

**Tipo:** Ambigüedad / Riesgo (producto ↔ datos)

**Secciones involucradas:** §0.3, §1.1 ("evidencia actualizada"), §1.3 (fuente "plataformas de investigación genómica"), §2.1 (Fuentes: NCI, PDQ, ensayos), §3.1 (`source_type: genomic_study`), §4.1 (ejemplos NCCN), §5.0 (Sprint 2: ingesta "no es un entregable"; Sprint 3 KR3), OL-02 #7.

**Evidencia:**
- [H] Los ejemplos de §4.1 citan "NCCN Guidelines v3.2024"; OL-02 #7 exige "solo documentos públicos cuya licencia permita su uso". [I] Los términos de uso de NCCN restringen el uso de su contenido, y en particular su uso con IA, sin licencia.
- [H] El panel ofrece la fuente "genómica", pero ninguna sección nombra una fuente genómica concreta (el KR3 del Sprint 3 lista NCI, PDQ y ensayos).
- [H] La ingesta automatizada es un "carril paralelo" sin criterios de aceptación en ningún sprint; no se define la frecuencia de actualización.

**Impacto:** Legal: riesgo de licencia si se ingiere NCCN. Producto: un filtro "genómica" sin datos detrás, y la promesa de "evidencia actualizada" sin mecanismo que la cumpla.

**Recomendación:** [R] Cambiar los ejemplos a fuentes con licencia compatible. Nombrar la fuente genómica (o quitar el filtro hasta tenerla) [TBD]. Convertir la ingesta en un entregable con criterios de aceptación y frecuencia de actualización definida [TBD].

---

### [P2-10] P2 — El nombre `confidence_score` contradice su semántica, y su escala no está definida

**Tipo:** Ambigüedad

**Secciones involucradas:** §3.1, §3.2, §3.3 #7 y #8, §4.1, OL-02 #5, OL-04.

**Evidencia:**
- [H] La UI lo rotula "Relevancia de la evidencia", pero el campo se llama `confidence_score` / `top_confidence_score` en la base de datos, la API y los contratos.
- [H] Es "derivado de forma determinista de los scores de retrieval", pero no se define la función (¿similitud coseno del mejor chunk? ¿promedio? ¿normalización a [0,1]? ¿cambia al pasar a híbrido con fusión RRF?).

**Impacto:** Los consumidores futuros del campo (historial, `Treatment`, reportes) heredarán el nombre engañoso. Los valores no son comparables entre modelos de *embeddings* ni entre dense e híbrido, lo que invalida ordenar el historial por `top_confidence_score`.

**Recomendación:** [R] Renombrar ahora, antes de que exista código, a `relevance_score` / `top_relevance_score`, y reservar un campo separado para el futuro score clínico del ADR #7. Documentar la fórmula y su escala en `domain/`, y guardar su versión (P2-02).

---

### [P2-11] P2 — Los Sprints 3–6 no tienen historias de usuario, contratos de API ni cambios de datos

**Tipo:** Faltante (roadmap ↔ API/datos)

**Secciones involucradas:** §5.0, §4.1, §5.1–5.5.

**Evidencia:** [H] Sprint 4 (historial de análisis, `Treatment`), Sprint 5 (asignación, consentimiento) y Sprint 6 (corrección manual según otras secciones) no tienen endpoints, historias ni criterios de aceptación. Faltan, por ejemplo, `GET /platform/patients/{id}/analyses` y `POST /platform/patients/{id}/treatments`.

**Impacto:** No se puede verificar que los KRs de esos sprints sean alcanzables. `Treatment` no tiene historia de usuario que defina cuándo y cómo se registra una decisión.

**Recomendación:** [R] Antes de iniciar cada sprint, escribir sus historias con criterios de aceptación y los endpoints correspondientes. En el PRD quedan como requisitos con API [TBD].

---

### [P2-12] P2 — No hay control de costo ni de abuso del LLM, y un timeout en Backend 1 no cancela el trabajo en Backend 2

**Tipo:** Faltante / Riesgo (operación y costo)

**Secciones involucradas:** §2.5 (*rate limiting* como ADR sin sprint), §2.7 (métricas de tokens y costo en el Sprint 6), OL-03 #2.4 (timeout de 30 s), OL-04 (deshabilitar el botón).

**Evidencia:** [H] El *rate limiting* no tiene sprint. La prevención de consultas duplicadas es solo del cliente (botón deshabilitado). [I] Si Backend 1 corta a los 30 s, Backend 2 sigue consumiendo el LLM y el resultado se descarta sin quedar persistido.

**Recomendación:** [R] Aplicar un límite simple por usuario (consultas por minuto) en el Sprint 1 y un presupuesto de tokens por consulta. Propagar un *deadline* a Backend 2 (header) para que aborte. Registrar tokens por consulta desde el Sprint 1, aunque el dashboard llegue en el Sprint 6. Opcional: `Idempotency-Key` en `/rag/query`.

---

### [P2-13] P2 — Nada verifica que el PDF subido corresponda al paciente, y no se detectan documentos duplicados

**Tipo:** Faltante / Riesgo (integridad de datos clínicos)

**Secciones involucradas:** §4.1 (carga), §4.2 (`DocumentExtractResponse`), OL-05 #8.

**Evidencia:** [H] El contrato de extracción no devuelve la identidad del paciente que figura en el documento. La idempotencia de OL-05 #8 es por `source_document_id`, así que subir dos veces el mismo PDF crea dos `Document` con biomarcadores duplicados.

**Impacto:** Si se sube un documento en la ficha equivocada, los biomarcadores de otro paciente alimentan su RAG, un error clínico grave y silencioso.

**Recomendación:** [R] Extraer del documento un identificador de control (p. ej., el `mrn` o el nombre) y compararlo en Backend 1. Si no coincide, marcar el documento para revisión en lugar de persistir. Esto choca con la minimización en Backend 2 (P1-04), así que es una decisión [TBD]. Guardar un `checksum` del PDF en `Document` y rechazar o advertir los duplicados por paciente.

---

### P3 — Medios

### [P3-01] P3 — Contradicciones en el transporte y TLS

**Tipo:** Contradicción. **Secciones:** §2.4, §2.5, §4.2 (`servers: http://rag-orchestrator:8000`), C4 (contenedores: "HTTPS, JWT interno"), OL-01 (riesgo `sslmode`).
**Evidencia:** [H] La API interna se declara `http://`, mientras que el C4 dice HTTPS. La cookie es `Secure` y el servidor público es `https://localhost/api`, pero no hay un terminador TLS en el diagrama de despliegue.
**Problema e impacto:** El JWT y la PHI viajan en claro por la red interna, y se desconoce dónde termina TLS en local.
**Recomendación:** [R] Definir un *reverse proxy* con TLS para el tráfico público y documentar si la red interna usa HTTP (aceptable en local, con la red de Compose como frontera) o TLS. Alinear el C4 con §4.2.

### [P3-02] P3 — Semántica de los filtros del panel IA sin definir

**Tipo:** Ambigüedad. **Secciones:** §1.3, §3.2 (`ClinicalNote`), §4.1 (`filtersApplied`), §2.5 (minimización), OL-03.
**Evidencia:** [H] `historiaCompleta` choca con la regla "nunca la historia clínica completa por defecto". No se define cómo se combinan (¿`historiaCompleta` + `ultimosSeisMeses`?), a qué entidades aplica `ultimosSeisMeses`, ni qué ocurre si el paciente no tiene diagnóstico activo (HU-03 lo presupone).
**Recomendación:** [R] Hacer una tabla de verdad de los filtros → consulta SQL, con un tope de volumen de contexto (tokens). Definir el comportamiento sin diagnóstico activo (¿bloquear la consulta o avisar?) [TBD].

### [P3-03] P3 — Métricas y KRs ambiguos o engañosos

**Tipo:** Ambigüedad. **Secciones:** §5.0 (KR1 del Sprint 2 "≥90% de precisión"; KR1 del Sprint 4 "≥2 recomendaciones cuando hay evidencia suficiente"), OL-05 (set **sintético**).
**Problema:** No se define "precisión" (¿por campo? ¿por carácter? ¿exactitud del valor del biomarcador?). Un set sintético no representa escaneos reales. Exigir ≥2 recomendaciones puede empujar al LLM a generar alternativas débiles, y "evidencia suficiente" no está definida.
**Recomendación:** [R] Medir la exactitud por campo crítico (nombre y valor del biomarcador, estadio), con un umbral separado para los campos críticos. Reformular el KR1 del Sprint 4 como "hasta N recomendaciones, cada una sobre el umbral de relevancia".

### [P3-04] P3 — Sin codificación clínica estándar (diagnóstico, estadio, biomarcadores)

**Tipo:** Faltante. **Secciones:** §3.1 (`DIAGNOSIS.cancer_type`, `stage`; `BIOMARKER.name`, `value`; `CORPUS_CHUNK.cancer_type_tags`).
**Problema:** Son strings libres. Nada garantiza el cruce paciente ↔ corpus (el filtro por `cancer_type_tags` no tiene regla de población), ni la deduplicación de diagnósticos por `cancer_type` + `stage` (OL-05 #7 compara strings libres extraídos por OCR).
**Recomendación:** [R] Aunque sea mínimo, adoptar vocabularios controlados (p. ej., CIE-O/CIE-10 para el tipo de cáncer, edición TNM para el estadio, nomenclatura HGVS para variantes) o normalizar a un catálogo interno [TBD].

### [P3-05] P3 — Descripciones que afirman búsqueda "híbrida" antes del Sprint 3

**Tipo:** Contradicción menor. **Secciones:** §0.3, §1.2 #3, §4.1 (`/rag/query`: "Backend 2 hace retrieval híbrido"), §4.2, C4 N4 (`hybridSearch`), frente a §5.0 y OL-02 (solo dense en los Sprints 1–2).
**Recomendación:** [R] Indicar en los contratos "dense (Sprints 1–2), híbrido (Sprint 3+)".

### [P3-06] P3 — Entornos, requisitos no funcionales y continuidad sin definir

**Tipo:** Faltante. **Secciones:** §0.4, §2.4 ("despliegue cloud fuera de alcance"), OL-01 #9 (el seed "se niega a ejecutarse en producción"), §3.3 #4 (retención fuera de alcance).
**Problema:** Se habla de "producción" sin que exista. No hay metas de disponibilidad, concurrencia, *backup*/restauración de PostgreSQL, MinIO y Milvus, ni retención.
**Recomendación:** [R] Definir entornos (`local`, `demo`) y la variable que los distingue. Establecer NFRs mínimos (usuarios concurrentes, latencia de la ficha) y un procedimiento de *backup* para la demo [TBD].

### [P3-07] P3 — §7 (Pull Requests) vacía; no hay trazabilidad ticket → PR

**Tipo:** Faltante (entrega). **Secciones:** §7, §6, C4 N4 ("todavía no existe código real").
**Recomendación:** [R] Al implementar, enlazar cada PR con su ticket OL-xx, sus historias y sus criterios de aceptación, siguiendo la Definition of Done de §6.0.

### [P3-08] P3 — La ingesta del corpus reutiliza un `DocumentExtractionService` con contrato clínico

**Tipo:** Desalineación. **Secciones:** §2.2, §4.2 ("reutiliza `DocumentExtractionService` en proceso"), `DocumentExtractResponse` (diagnóstico, biomarcadores).
**Problema:** El contrato de salida es específico de las historias clínicas. Una guía o un ensayo necesita texto estructurado por secciones, no biomarcadores.
**Recomendación:** [R] Separar el OCR genérico (texto y layout) de la estructuración clínica. Solo el primero se reutiliza en la ingesta.

---

### P4 — Bajos

### [P4-01] P4 — El C4 Nivel 4 no coincide con el contrato de §4.2

**Tipo:** Desalineación. **Evidencia:** [H] `RagQueryRequest` tiene `sources: string[]` y `filters: PatientFilters`, y `RagQueryResult` tiene `sources: Citation[]` a nivel superior. En §4.2 no se envían filtros a Backend 2, `sourcesSelected` es un objeto y las citas van dentro de cada recomendación. **Recomendación:** [R] Alinear o regenerar el diagrama a partir del código.

### [P4-02] P4 — Inconsistencias menores en los contratos

**Tipo:** Ambigüedad. **Evidencia:** [H] El prefijo `/platform/...` frente a `/rag/query` sin prefijo, con la misma ruta en ambos servicios. §4.1 no documenta el `401`. §4.2 no documenta `422` (validación de FastAPI), `5xx` ni timeouts. No se valida que `sourcesSelected` tenga al menos una fuente en `true`. **Recomendación:** [R] Normalizar a `/platform/rag/query` (o documentar la excepción), y completar los códigos y validaciones.

### [P4-03] P4 — Las instrucciones de instalación no coinciden con la infraestructura

**Tipo:** Contradicción menor. **Evidencia:** [H] §1.4 dice que Compose levanta "PostgreSQL y Milvus" y las apps se corren a mano; §2.4 muestra las apps dentro de Compose. No se mencionan los buckets ni las credenciales de MinIO, ni las claves ES256/RS256. **Recomendación:** [R] Unificar y añadir la generación de claves y buckets al setup.

### [P4-04] P4 — `Role`, `Permission`, `RolePermission` y `PatientAssignment` no tienen schema asignado

**Tipo:** Ambigüedad. **Evidencia:** [H] §2.5 y §3.1 listan `auth` → `User`, `Session`; OL-01 pone `Role` en `auth`. **Recomendación:** [R] Declararlo en §3.1 (`auth`: RBAC; `clinical`: `PatientAssignment`).

### [P4-05] P4 — "BFF" describe de forma incompleta a Backend 1

**Tipo:** Ambigüedad terminológica. **Evidencia:** [H] Backend 1 es dueño del dominio clínico y de sus datos; el adaptador al frontend son, en realidad, los Route Handlers de `web`. **Recomendación:** [R] Describirlo como "servicio de plataforma clínica + gateway de IA".

### [P4-06] P4 — Valor de `consent_ai_analysis` en el seed

**Tipo:** Faltante. **Evidencia:** [H] OL-01 #9 no fija el consentimiento de los pacientes semilla; cuando el Sprint 5 active la validación, el flujo E2E de OL-04 fallaría si queda en `false`. **Recomendación:** [R] Seed con `true` en (a) y `false` en un paciente adicional para probar el `403`.

---

## 3. Alineación entre artefactos

| Relación | Estado | Hallazgo clave |
|---|---|---|
| Producto ↔ Arquitectura | Parcialmente alineado | La arquitectura soporta recuperar evidencia y citarla, pero ningún componente soporta "alta probabilidad de éxito" (P1-01) ni "evidencia actualizada": la ingesta no tiene entregable (P2-09). Hay alta de datos personales en el producto, no en la arquitectura del MVP (P1-09). |
| Producto ↔ Datos | Parcialmente alineado | El modelo representa bien la procedencia (`entry_method`, `source_document_id`) y los snapshots de citas. Faltan: el estado de verificación de datos de OCR (P1-02, P2-01), el contexto y la configuración de cada análisis (P2-02), el historial de consentimiento (P2-06) y la codificación clínica (P3-04). |
| Producto ↔ API | Parcialmente alineado | Los recorridos del Sprint 1–2 están cubiertos, salvo el listado y el alta de pacientes (P1-09), el logout (P2-05) y la vista de notas clínicas (P2-07). Los Sprints 3–6 no tienen API (P2-11). |
| Arquitectura ↔ Datos | Contradictorio | MinIO de PHI dentro de la infraestructura de Milvus y con ownership contradictorio (P1-07). Catálogo del corpus en Milvus sin vectores (P2-08). La regla "Backend 2 no maneja PII" no se sostiene con el flujo de extracción (P1-04). |
| Arquitectura ↔ API | Parcialmente alineado | Las fronteras de servicio y los esquemas de autenticación coinciden con §4.1 y §4.2. No está definido el camino navegador → `clinical-api` fuera del RAG, ni CSRF (P2-04). HTTP vs. HTTPS interno (P3-01). |
| API ↔ Datos | Parcialmente alineado | `AIAnalysisRecord`, `Document`, `Biomarker` y `CitedSource` mapean 1:1 con §3.1. La API omite `entryMethod`, `unit` y `referenceRange` (P2-07). `confidence_score` nombra algo que no es (P2-10). |
| Roadmap ↔ Arquitectura | Parcialmente alineado | Buenas decisiones de secuencia (colección con esquema final, cola en `Document` desde OL-01). Pero los controles de privacidad y seguridad van detrás de la entrada de datos potencialmente reales (P1-06), y el flujo de corrección se asigna a un sprint que no lo contiene (P2-01). |
| Roadmap ↔ APIs/Datos | Ambiguo | Los Sprints 1–2 están bien soportados por OL-01…OL-05. Los Sprints 3–6 no tienen contratos (P2-11). La evaluación del RAG no está en ningún sprint (P1-03). |
| Historias ↔ APIs | Parcialmente alineado | HU-01…HU-05 son implementables, con excepciones: HU-01 redirige a un listado sin endpoint (P1-09), HU-05 exige mostrar el origen OCR, un campo que la API no expone (P2-07), y "datos clínicos" en HU-05 no tiene endpoint. |
| Tickets/PRs ↔ Sistema propuesto | Parcialmente alineado (tickets) / Faltante (PRs) | Los tickets OL-01…OL-05 reflejan fielmente la arquitectura y sus decisiones. §7 está vacía y no hay código (P3-07). |

---

## 4. Decisiones requeridas

| ID | Decisión | Por qué importa | Secciones afectadas |
|---|---|---|---|
| D-01 | Posicionamiento del producto: herramienta académica o de investigación sin uso clínico real vs. apoyo a decisiones clínicas (CDS). Jurisdicción normativa aplicable. | Define si se requieren controles regulatorios y qué puede prometer el producto (P1-01). | §0.3, §1.1, §2.5 |
| D-02 | ¿Se permite procesar PHI real antes de completar los controles de los Sprints 5–6? (Recomendación: no.) | Condiciona el uso de proveedores externos y el significado del MVP (P1-06). | §5.0, §2.5 |
| D-03 | Motor de OCR y si la PHI puede salir a la nube (ADR existente de §1.4). | Bloquea el cierre de OL-05 y define los controles de P1-04. | §1.4, §4.2, OL-05 |
| D-04 | Modelo de *embeddings*, **incluyendo el criterio de idioma**, y proveedor de LLM provisional (nube vs. self-hosted) con su tratamiento de datos. | Bloquea OL-02. Cambiarlo después obliga a reindexar (P1-08, P2-03). | §1.4, §5.0, OL-02 |
| D-05 | Idioma del corpus, de la respuesta del LLM y de las citas mostradas al doctor. | Calidad del *retrieval* y verificabilidad de las citas (P1-08). | §1.2, §3.1, §4.1 |
| D-06 | Política de verificación de datos extraídos por OCR: ¿entran al contexto del RAG sin revisión? ¿Quién asigna `clinicalSignificance`? | Seguridad clínica (P1-02, P2-01). | §3.2, §4.2, HU-05, OL-05 |
| D-07 | Mecanismo de alta de pacientes (formulario manual, integración con historia clínica electrónica, OCR). | Sin él, el producto no sirve fuera del seed (P1-09). | §1.2, §4.1, §5.0 |
| D-08 | Almacén de objetos de PHI: instancia separada y modelo *push* vs. URL prefirmada. | Ownership, radio de impacto y *backups* (P1-07). | §2.4, §3.1, §4.2, OL-05 |
| D-09 | Dataset de evaluación del RAG: tamaño, metas por métrica, oncólogo validador. | Sin esto no se puede afirmar que el producto cumple su objetivo (P1-03). | §2.6, §5.0 |
| D-10 | Patrón navegador → `clinical-api` (todo por `web` vs. mismo origen con *reverse proxy*) y estrategia CSRF. | Seguridad y consistencia de todos los tickets de frontend (P2-04). | §2.1, §2.4, §4.1 |
| D-11 | Parámetros de sesión (TTL absoluto e inactividad), alta y baja de usuarios, límite de intentos. | Seguridad de la autenticación (P2-05). | §2.5, HU-01 |
| D-12 | Consentimiento: modelo de eventos y efecto de la revocación. ¿Uno o varios doctores activos por paciente? | Entregabilidad del Sprint 5 (P2-06). | §2.5, §3.1 |
| D-13 | Almacén del catálogo `CorpusDocument` (relacional propio de Backend 2 vs. Milvus). | Viabilidad técnica y consistencia del versionado (P2-08). | §3.1, §3.2, OL-02 |
| D-14 | Fuentes del corpus con licencia válida, fuente genómica concreta y frecuencia de actualización. | Riesgo legal y promesa de "evidencia actualizada" (P2-09). | §0.3, §1.3, §5.0 |
| D-15 | Verificación de identidad documento ↔ paciente en la extracción (en tensión con la minimización). | Riesgo de adjudicar datos al paciente equivocado (P2-13). | §4.2, OL-05 |
| D-16 | ADR de scoring de evidencia clínica (ya abierto) y renombre de `confidence_score`. | Semántica del puntaje que ve el doctor (P2-10). | §3.3 #7, §4.1 |

---

## 5. Orden recomendado de remediación

### Antes de implementar (antes o durante el arranque del Sprint 1)
1. Corregir la propuesta de valor y el posicionamiento (P1-01, D-01).
2. Establecer la regla "solo datos sintéticos hasta completar los controles" (P1-06, D-02).
3. Corregir los invariantes de privacidad en §1.2, §2.5 y §4.2 para reflejar la extracción y los *embeddings* (P1-04, P2-03).
4. Renombrar `confidence_score` → `relevance_score` antes de crear la migración de OL-01 (P2-10).
5. Añadir a OL-01 las columnas de trazabilidad de `AIAnalysisRecord` (P2-02) y el estado de verificación de datos de OCR (P1-02, P2-01). Cuestan poco en la migración inicial y mucho después.
6. Separar el almacén de objetos de PHI y actualizar §2.4, §3.1 y el Flujo 1 (P1-07, D-08).
7. Mover el catálogo del corpus fuera de Milvus (P2-08, D-13).
8. Incluir el idioma en el spike de *embeddings* (P1-08, D-04, D-05).
9. Definir el patrón navegador → `clinical-api` y CSRF (P2-04, D-10).
10. Añadir el listado de pacientes al Sprint 1 y decidir el alta (P1-09, D-07).

### Antes del MVP o release (Sprints 1–4)
1. Ticket de evaluación del RAG con baseline en el Sprint 1 y regresión en cada sprint (P1-03, D-09).
2. Logout, TTL, hash de contraseñas y límite de intentos (P2-05).
3. Flujo de revisión de datos de OCR en un sprint que lo contenga (P2-01, P1-02).
4. Campos faltantes de `PatientSummary` y definición de "reciente" (P2-07).
5. Detección de duplicados y chequeo de identidad del documento (P2-13, D-15).
6. Límite de consultas y *deadline* propagado a Backend 2 (P2-12).
7. Historias y contratos de los Sprints 3–4 (P2-11), semántica de los filtros (P3-02) y KRs medibles (P3-03).
8. Fuentes del corpus con licencia e ingesta como entregable (P2-09, D-14).

### Antes de producción (o de cualquier uso con datos reales)
1. Asignación, consentimiento con historial y auditoría de accesos (Sprint 5 y P2-06). Auditoría adelantada si es posible.
2. Desidentificación del texto libre con tests (P1-05).
3. Decisión del OCR y del LLM con acuerdos de tratamiento de datos, o self-hosted (D-03, D-04).
4. TLS de extremo a extremo, *backups*, entornos definidos (P3-01, P3-06).
5. Observabilidad del Sprint 6 (métricas, `traceId`, costo).
6. Validación clínica de los resultados de evaluación por un oncólogo (D-09).

### Post-MVP
1. ADR de scoring de evidencia clínica (#7).
2. Codificación clínica estándar (P3-04).
3. Streaming de eventos de progreso (según el KR2).
4. Separación OCR genérico / estructuración clínica para la ingesta (P3-08).
5. Correcciones documentales menores (P4-01…P4-06, P3-05, P3-07).

---

## 6. Product Requirements Document (PRD) — OncoLens MVP v0.1

> **Versión cubierta:** la que representa el documento fuente: roadmap de los Sprints 1–6 (§5.0), con detalle ejecutable para los Sprints 1–2.
> **Criterio de redacción:** este PRD incorpora los hallazgos de la revisión. Cada requisito lleva su origen: **[H]** del documento, **[I]** inferido, **[R]** recomendación de la revisión incorporada para resolver una contradicción o un vacío. Todo lo que exige una decisión aparece como **TBD — Decisión requerida** y remite a la tabla de decisiones (D-xx).

### 6.1. Resumen del producto

**Problema.** [H] Un oncólogo necesita horas de revisión manual de guías, ensayos y literatura genómica para contrastar el perfil clínico y molecular de un paciente con la evidencia disponible (§1.1).

**Usuarios objetivo.**
- [H] **Doctor/oncólogo** (rol `doctor`): consulta pacientes, carga documentos, formula preguntas clínicas.
- [H] **Administrador** (rol `admin`): ve todos los pacientes (§2.5). Sus responsabilidades de gestión (usuarios, asignaciones, consentimiento) son **TBD — Decisión requerida (D-11, D-12)**.
- [H] Fuera de alcance: pacientes como usuarios, multi-institución (§3.3 #3).

**Propuesta de valor.** [R, resuelve P1-01] En minutos y no en horas, OncoLens presenta la **evidencia publicada más relevante** para el perfil clínico y molecular del paciente, junto con opciones de tratamiento descritas en esa evidencia, **cada una con citas verificables** y un indicador de **relevancia de la evidencia**. El sistema **no** estima la probabilidad de éxito de un tratamiento ni sustituye el juicio del oncólogo tratante.

**Objetivo de la versión.** [H] Demostrar de punta a punta que el sistema puede cruzar el perfil clínico de un paciente con evidencia científica y presentar opciones de tratamiento citadas (Sprint 1). Después, eliminar la captura manual con OCR (Sprint 2), mejorar la búsqueda (Sprint 3), comparar alternativas y trazar decisiones (Sprint 4), y habilitar la operación multiusuario segura (Sprints 5–6).
[R, P1-06] **Condición de uso:** hasta cumplir los criterios de salida de la §6.14 (liberación con datos reales), el sistema opera **solo con datos sintéticos**.

### 6.2. Objetivos

| ID | Objetivo | Métrica (origen) |
|---|---|---|
| G-1 | Recorrido de punta a punta: login → paciente → pregunta → opciones citadas. | 100% de los criterios de aceptación de HU-01…HU-03 en demo [H, KR1 del Sprint 1]. |
| G-2 | Cero recomendaciones sin evidencia. | 100% de las recomendaciones con ≥1 cita de un chunk recuperado en la misma consulta [H, KR3 del Sprint 1]. |
| G-3 | Recomendaciones **fieles** a la evidencia citada. | Fidelidad por afirmación ≥ **TBD** sobre el dataset de evaluación [R, P1-03; D-09]. |
| G-4 | Respuesta en tiempo razonable. | `/rag/query` p95 ≤ 15 s contra el corpus semilla (*meta propuesta, a calibrar*) [H, KR2 del Sprint 1]. |
| G-5 | Ingesta de documentos sin captura manual. | Exactitud por campo crítico ≥ 90% (*propuesta*) [H+R, KR1 del Sprint 2; P3-03]; OCR p95 ≤ 60 s [H]; 100% de los documentos con estado consultable [H]. |
| G-6 | Búsqueda que respeta lo que pide el doctor. | Búsqueda híbrida en el 100% de las consultas; 100% de los filtros conectados a datos reales [H, Sprint 3]. |
| G-7 | Comparar alternativas y cerrar el ciclo hasta la decisión. | Historial consultable; `Treatment` registrable con vínculo opcional al análisis; 0 citas no resolubles [H, Sprint 4]. |
| G-8 | Acceso y privacidad correctos. | 100% de los endpoints de paciente validan la asignación; 0 análisis sin consentimiento; payloads hacia Backend 2 libres de PII verificados por **test automatizado** [H+R, Sprint 5; P1-05]. |
| G-9 | Operable y diagnosticable. | 100% de los servicios con `/health` y `/metrics`; 100% de las requests con `traceId` [H, Sprint 6]. |

### 6.3. No-objetivos

- [R, P1-01] Estimar la probabilidad de éxito o el pronóstico de un tratamiento.
- [R, P1-01] Tomar decisiones clínicas autónomas: toda salida requiere validación del oncólogo tratante [H, aviso de OL-04].
- [H] Multi-tenancy / varias instituciones (§3.3 #3).
- [H] `PatientContactInfo` y datos de contacto del paciente (§3.3 #13). [R, P1-09] En consecuencia, **el OCR del MVP no extrae datos personales de contacto**.
- [H] Streaming de tokens del LLM al navegador (§2.1, §6.1 #8).
- [H] Despliegue en la nube (§2.4), salvo que se decida una demo desplegada (TBD).
- [H] Cifrado a nivel de columna (§3.3 #6).
- [H] Scoring de solidez clínica de la evidencia (ADR #7 abierto; post-MVP).
- [R, P1-06] Uso con PHI real antes de cumplir los criterios de la §6.14.

### 6.4. Recorridos de usuario

**RU-1 — Acceso.** El doctor inicia sesión → ve el **listado de pacientes** [R, P1-09] → elige un paciente. Puede cerrar sesión [R, P2-05].

**RU-2 — Ficha del paciente.** Ve la identidad mínima, el diagnóstico vigente, los biomarcadores recientes con su semáforo, unidad, rango y **origen** (seed, OCR o corrección manual), los documentos cargados con su estado y los **datos extraídos pendientes de revisión** [R, P1-02, P2-01, P2-07].

**RU-3 — Consulta de evidencia.** Desde la ficha abre el panel IA → escribe una pregunta → (desde el Sprint 3) elige fuentes y filtros → recibe 1 opción (Sprints 1–3) o hasta N opciones rankeadas (Sprint 4+), cada una con su relevancia de la evidencia, su justificación y sus citas; o un mensaje explícito de "sin evidencia suficiente". Ve el aviso de validación clínica.

**RU-4 — Carga de documento.** Sube un PDF (historia clínica o examen) → recibe confirmación con el estado `pendiente` → el estado avanza hasta `completado` o `error` → los datos extraídos aparecen en la ficha **marcados como no verificados** hasta que el doctor los revisa [R, P1-02].

**RU-5 — Revisión de datos extraídos.** [R, P2-01] El doctor acepta, corrige o rechaza los datos extraídos (incluido el diagnóstico que difiere del activo). Sprint: **TBD — Decisión requerida (D-06)**; se recomienda no dejarlo en el Sprint 6.

**RU-6 — Historial y decisión** (Sprint 4). El doctor consulta los análisis previos del paciente y registra el tratamiento decidido, opcionalmente vinculado a un análisis.

**RU-7 — Administración** (Sprint 5). **TBD — Decisión requerida (D-11, D-12):** alta y baja de usuarios, asignación de doctores y registro o revocación del consentimiento.

### 6.5. Requisitos funcionales

> Formato: descripción · valor para el usuario · comportamiento principal · casos borde y errores · criterios de aceptación (CA). Sprint entre corchetes.

**FR-01 — Inicio de sesión** [Sprint 1] [H: HU-01, §2.5]
- *Descripción:* autenticación con email y contraseña que crea una `Session` persistida con token opaco.
- *Valor:* acceso seguro al panel.
- *Comportamiento:* `POST /platform/auth/login` → crea `Session` (solo `token_hash`) → cookie `oncolens_session` `HttpOnly`, `Secure` y `SameSite` [R, P2-04]. Redirige al listado de pacientes (FR-04).
- *Bordes/errores:* credenciales inválidas → `401` genérico sin revelar qué campo falló y sin crear `Session`. Usuario inactivo → `401`. Intentos fallidos repetidos → bloqueo temporal; umbral **TBD (D-11)** [R, P2-05].
- *CA:* los escenarios 1 y 2 de HU-01. Las contraseñas se guardan con Argon2id o bcrypt [R]. Ningún log contiene la contraseña ni el token.

**FR-02 — Ciclo de vida de la sesión** [Sprint 1] [R, P2-05]
- *Descripción:* validación en cada request, expiración y cierre.
- *Valor:* poder revocar el acceso (justificación de §2.5).
- *Comportamiento:* el Guard valida `token_hash` (no revocada, no expirada), actualiza `last_seen_at` y aplica TTL absoluto e inactividad (valores **TBD — D-11**). `POST /platform/auth/logout` marca `revoked = true`.
- *Bordes:* una sesión expirada en medio de una consulta RAG → `401` y redirección al login sin mostrar datos (CA de OL-04).
- *CA:* tras el logout, cualquier request con esa cookie → `401`.

**FR-03 — Ficha resumen del paciente** [Sprint 1; ampliada en Sprint 2] [H: HU-02, HU-05; R: P2-07]
- *Descripción:* `GET /platform/patients/{patientId}` → `PatientSummary`.
- *Valor:* contexto clínico antes de preguntar.
- *Comportamiento:* devuelve `mrn`, nombre, fecha de nacimiento, diagnóstico activo y biomarcadores recientes con `name`, `value`, `unit`, `referenceRange`, `resultType`, `clinicalSignificance`, `performedAt`, `entryMethod`, `verificationStatus` y `sourceDocumentId`. Definición de "reciente": **TBD — Decisión requerida** (propuesta: el último valor por biomarcador).
- *Bordes:* paciente inexistente → `404` y estado vacío en la UI. Sin diagnóstico activo → la ficha lo indica. Sin asignación (Sprint 5+) → `403`.
- *CA:* los escenarios de HU-02. El dato de OCR se distingue visualmente (HU-05) y el dato no verificado se marca [R].

**FR-04 — Listado de pacientes** [Sprint 1] [R, P1-09]
- *Descripción:* `GET /platform/patients` paginado, con búsqueda por `mrn` o nombre.
- *Valor:* es el destino del login (HU-01) y el punto de entrada a la ficha.
- *Comportamiento:* en los Sprints 1–4 devuelve todos los pacientes (solo datos sintéticos); desde el Sprint 5, solo los asignados (salvo `admin`).
- *CA:* después del login el doctor ve los pacientes semilla y navega a la ficha.

**FR-05 — Alta de paciente** [Sprint **TBD**] [R, P1-09]
- **TBD — Decisión requerida (D-07):** mecanismo (formulario mínimo, integración, OCR). Hasta que se decida, los pacientes solo existen por seed y el producto no es utilizable con pacientes nuevos. Esta limitación queda declarada.

**FR-06 — Consulta de evidencia (RAG)** [Sprint 1; híbrida en el 3; rankeada en el 4] [H: HU-03, §2.1 Flujo 2, §4.1, §4.2, OL-02, OL-03, OL-04]
- *Descripción:* `POST /rag/query` (público) → Backend 1 construye el contexto desidentificado → `POST /rag/query` (interno) → *retrieval* sobre chunks vigentes → LLM → validación → persistencia → respuesta.
- *Valor:* evidencia citada en minutos.
- *Comportamiento:* entrada `patientId`, `query`, `sourcesSelected` (al menos una en `true` [R]) y `filtersApplied` opcional. Salida: `AIAnalysisRecord` con `recommendations[]` (máximo 1 en los Sprints 1–3; hasta N **TBD** en el Sprint 4+), cada una con `treatment`, `relevanceScore` [R, P2-10], `rationale` y `citedSources[]`. Respuesta JSON completa, sin streaming de tokens [H].
- *Bordes/errores:* body inválido → `422`. Paciente inexistente → `404`. Sin asignación o sin consentimiento (Sprint 5+) → `403`. Backend 2 inalcanzable o con error → `502`. Timeout → `504`, con cancelación propagada a Backend 2 [R, P2-12]. Si falla la persistencia → `500` sin mostrar la recomendación [H]. Paciente sin diagnóstico activo → **TBD** (propuesta: advertencia y consulta permitida) [R, P3-02]. Límite de consultas superado → `429` [R, P2-12].
- *CA:* los escenarios de HU-03 y los CA de OL-02, OL-03 y OL-04. El `id` devuelto existe en la base con el mismo `trace_id`. El payload interno no contiene PII (FR-15).

**FR-07 — Respuesta explícita "sin evidencia"** [Sprint 1] [H: HU-03 escenario 2, §4.1, §4.2, OL-02 #4]
- *Comportamiento:* si ningún chunk supera el umbral de relevancia, Backend 2 responde `recommendations: []` **sin invocar al LLM**. Backend 1 persiste con `top_relevance_score = null` y responde `200`. La UI muestra "No se encontró evidencia suficiente en las fuentes consultadas".
- *CA:* no hay llamada al LLM (verificable), no se muestra ninguna tarjeta y el registro queda persistido.

**FR-08 — Validación de citas y fidelidad** [Sprint 1 citas; fidelidad **TBD**] [H: OL-02 #5; R: P1-03]
- *Comportamiento:* toda cita debe corresponder a un chunk recuperado en la misma consulta; las demás se descartan, y una recomendación sin citas se descarta. `title`, `sourceName`, `externalId` y `chunkTextSnapshot` se copian del chunk, nunca del texto generado [H]. [R] Además, cada `rationale` pasa por un chequeo de soporte contra sus chunks citados (método **TBD — D-09**); si no tiene soporte, la recomendación se descarta.
- *CA:* el test (c) de OL-02 (cita a un chunk no recuperado → descartada) y, [R], un test con un `rationale` que contradice su chunk → descartado.

**FR-09 — Persistencia trazable del análisis** [Sprint 1] [H: §2.5, §3.2, OL-03 #2.5–2.6; R: P2-02]
- *Comportamiento:* antes de responder, se persiste un `AIAnalysisRecord` inmutable con los campos de §3.1 más `clinical_context_snapshot`, `llm_provider`, `llm_model`, `embedding_model`, `prompt_version`, `retrieval_params` y `status`.
- *CA:* con el registro se puede reconstruir qué contexto y qué configuración produjeron la respuesta.

**FR-10 — Carga de documento clínico** [Sprint 2] [H: HU-04, §4.1, OL-05 #1–3]
- *Comportamiento:* carga *multipart* a través de `web` [R, P2-04] → validación de PDF por *magic bytes*, tamaño máximo (20 MB *propuesta*) y `documentType` → almacenamiento en el almacén de objetos clínico **propiedad de Backend 1** [R, P1-07] → `Document` en `pendiente` → `202`.
- *Bordes:* no es PDF → `422`, sin `Document` ni objeto guardado. Paciente inexistente → `404`. Mismo PDF ya cargado para el paciente (checksum) → advertencia o rechazo **TBD** [R, P2-13]. Entorno con datos reales antes de la §6.14 → carga bloqueada [R, P1-06].
- *CA:* los escenarios de HU-04 y los CA de OL-05.

**FR-11 — Extracción asíncrona y estado** [Sprint 2] [H: §2.1 Flujo 1, §3.3 #11, OL-05 #4–9]
- *Comportamiento:* un *worker* toma los documentos con `SKIP LOCKED` → `procesando` → Backend 2 extrae (motor **TBD — D-03**) → Backend 1 valida y persiste en una transacción única con `entry_method = ocr` y `source_document_id` → `completado`. Consulta de estado (`GET …/documents/{id}`) y listado paginado (`GET …/documents`).
- *Bordes:* documento ilegible → `error` sin reintento. Timeout o `5xx` → reintento hasta `attempts` (3, *propuesta*). Documento colgado tras un reinicio → vuelve a `pendiente` o pasa a `error`. Nunca se persisten datos parciales. Reprocesar no duplica datos. [R, P2-13] Identidad del documento que no coincide con el paciente → estado de revisión (**TBD — D-15**).
- *CA:* los CA de OL-05.

**FR-12 — Visualización de datos extraídos** [Sprint 2] [H: HU-05; R: P2-07]
- *Comportamiento:* la ficha muestra los biomarcadores con semáforo, origen, documento fuente y estado de verificación, más los documentos en `error` con la invitación a recargar. Visualización de notas clínicas extraídas: requiere `GET …/clinical-notes` (**TBD**: incluir o sacar del alcance).
- *CA:* los escenarios de HU-05.

**FR-13 — Revisión de datos extraídos por OCR** [Sprint **TBD** — D-06] [R: P1-02, P2-01; H: §3.2, §3.3 #12]
- *Comportamiento:* todo dato con `entry_method = ocr` nace `pendiente_revision`. Mientras esté pendiente, **no entra al contexto del RAG** (o entra marcado como no verificado; la opción es **TBD — D-06**). Un diagnóstico extraído que difiere del activo nunca reemplaza al activo [H]; queda pendiente y **no** como histórico. El doctor acepta, corrige (`manual_correction`) o rechaza.
- *CA:* un biomarcador extraído y pendiente no aparece en el `ClinicalContext` enviado a Backend 2 (si se elige la opción de exclusión). El diagnóstico pendiente es visible como tal en la ficha.

**FR-14 — Búsqueda híbrida y filtros reales** [Sprint 3] [H: §5.0 Sprint 3, §3.3 #10]
- *Comportamiento:* *retrieval* dense + sparse con filtro `is_current = true` y `source_type ∈ sourcesSelected`. Los filtros de paciente se traducen en consultas sobre `ClinicalNote` y `Biomarker` según una tabla de verdad (**TBD**, P3-02) y con un tope de contexto. Estrategia de idioma para *sparse* y *dense*: **TBD — D-04, D-05** [R, P1-08].
- *CA:* los KR1 y KR2 del Sprint 3. Las métricas de *retrieval* sobre el dataset de evaluación no retroceden respecto al baseline dense.

**FR-15 — Desidentificación del contexto clínico** [Sprint 1 estructurado; texto libre antes de enviar notas (Sprint 3)] [H: §2.5, OL-03 #2.3; R: P1-05, P2-03]
- *Comportamiento:* *allowlist* de campos estructurados, `pseudoPatientId` aleatorio por consulta y fuera del prompt [H]. [R] Desidentificación del texto libre (`query`, `clinicalNotes.content`) y generalización de fechas **siempre**, no "cuando es necesario". Lo mismo aplica al texto que se envía al proveedor de *embeddings*.
- *CA:* el test de no-fuga de OL-03, ampliado con casos sintéticos de PII embebida en la pregunta y en las notas.

**FR-16 — Recomendaciones rankeadas** [Sprint 4] [H: §5.0 Sprint 4; R: P3-03]
- *Comportamiento:* hasta N opciones (N **TBD**) ordenadas por relevancia, cada una sobre el umbral y con citas. No se fuerza un mínimo de 2.
- *API:* mismo contrato de FR-06.

**FR-17 — Historial de análisis** [Sprint 4] [H: KR2 del Sprint 4; R: P2-11]
- *API:* `GET /platform/patients/{id}/analyses` (paginado) y `GET …/analyses/{analysisId}`: **contrato TBD**.
- *CA:* toda cita del historial se muestra desde su snapshot (KR3 del Sprint 4).

**FR-18 — Registro de la decisión de tratamiento** [Sprint 4] [H: §3.2 `Treatment`, §3.3 #13; R: P2-11]
- *Comportamiento:* el doctor registra el tratamiento decidido (`description`, `status`, fechas) con `based_on_analysis_id` opcional.
- *API:* `POST/GET /platform/patients/{id}/treatments`: **contrato e historia TBD**.

**FR-19 — Autorización por asignación** [Sprint 5] [H: §2.5, §3.3 #2]
- *Comportamiento:* los endpoints de paciente exigen una `PatientAssignment` activa, salvo `admin`. Sin ella → `403`. Cardinalidad (uno o varios doctores activos): **TBD — D-12**.
- *CA:* KR1 del Sprint 5 con tests de autorización.

**FR-20 — Consentimiento para análisis IA** [Sprint 5] [H: §2.5; R: P2-06]
- *Comportamiento:* `/rag/query` → `403` si no hay consentimiento vigente. Registro y revocación con autor, fecha y versión; efecto de la revocación sobre los análisis previos **TBD — D-12**.
- *CA:* KR2 del Sprint 5.

**FR-21 — Auditoría de accesos y acciones** [H: Sprint 6; R: adelantar al Sprint 2, P1-06]
- *Comportamiento:* `AuditLog` para login y logout, lectura de la ficha, consulta RAG, carga de documento, revisión y corrección, cambios de consentimiento y asignación. Sin PHI en `metadata`.

**FR-22 — Ingesta y versionado del corpus** [Sprint 1 seed manual; Sprints 2–3 automatizada] [H: §3.2, §3.3 #5, OL-02 #7; R: P2-08, P2-09]
- *Comportamiento:* normalización → chunking → *embedding* → inserción con `is_current`. Las versiones anteriores se conservan sin participar en el *retrieval*. Catálogo en un almacén **TBD — D-13** (recomendado: relacional propio de Backend 2). Solo fuentes con licencia válida (**TBD — D-14**). Frecuencia de actualización: **TBD**.
- *CA:* KR3 del Sprint 3 (≥ 3 fuentes, ≥ 50 documentos). El versionado es reanudable ante fallos.

**FR-23 — Administración de usuarios, asignaciones y consentimiento** [Sprint 5] [R: P2-05, P2-06]
- **TBD — Decisión requerida (D-11, D-12):** script de administración vs. UI y endpoints de `admin`.

### 6.6. Reglas de negocio

| ID | Regla | Origen |
|---|---|---|
| BR-01 | Toda recomendación mostrada tiene ≥1 cita a un chunk recuperado en la misma consulta; si no, se descarta. | [H] OL-02 #5 |
| BR-02 | Sin chunks sobre el umbral → "sin evidencia", sin invocar al LLM y persistiendo con `top_relevance_score = null`. | [H] §3.3 #8, OL-02 |
| BR-03 | El puntaje mostrado es **relevancia de la evidencia recuperada** (determinista) y se rotula así; no mide solidez clínica ni probabilidad de éxito. | [H] §3.3 #7 + [R] P1-01, P2-10 |
| BR-04 | Los datos de citas se copian del corpus, nunca del texto generado. | [H] OL-02 #5 |
| BR-05 | Solo participan en el *retrieval* los chunks `is_current = true`; el histórico nunca se borra. | [H] §3.3 #5 |
| BR-06 | Ningún análisis se muestra sin haber quedado persistido. | [H] OL-03 #2.6 |
| BR-07 | Backend 2 no accede a la PostgreSQL clínica ni tiene credenciales permanentes sobre el almacén de documentos clínicos. Procesa PHI **solo de forma transitoria** en la extracción y nunca la persiste ni la registra en logs. | [H] §2.1, §3.1 + [R] P1-04 |
| BR-08 | El contexto enviado a Backend 2 se desidentifica **siempre** (campos estructurados, texto libre, fechas). `pseudoPatientId` es aleatorio por consulta y no va en el prompt. | [H] §2.5 + [R] P1-05 |
| BR-09 | Los datos del paciente nunca se persisten en la base vectorial ni forman parte del corpus. | [R] P2-03, reformula §1.2 #2 |
| BR-10 | Un diagnóstico extraído por OCR nunca reemplaza automáticamente al activo: si no hay activo, queda activo **pendiente de revisión**; si es igual, no se inserta; si difiere, queda pendiente. | [H] §3.2 + [R] P2-01 |
| BR-11 | Todo dato de OCR nace `pendiente_revision`; su uso en el contexto del RAG queda sujeto a D-06. | [R] P1-02 |
| BR-12 | La extracción es todo o nada por documento; reprocesar no duplica. | [H] OL-05 #6, #8 |
| BR-13 | Solo se aceptan PDF validados por contenido, hasta el tamaño máximo configurado. | [H] HU-04 |
| BR-14 | Sprint 5+: un doctor solo accede a los pacientes asignados (salvo `admin`), y solo se analizan pacientes con consentimiento vigente. | [H] §2.5 |
| BR-15 | `entry_method = seed` solo existe fuera de producción; el seed se niega a ejecutarse en producción. | [H] §3.3 #9 |
| BR-16 | Hasta cumplir la §6.14, solo se procesan datos sintéticos. | [R] P1-06 |
| BR-17 | Toda salida muestra el aviso "Recomendación generada por IA — requiere validación clínica del oncólogo tratante". | [H] OL-04 #5 |
| BR-18 | Los valores marcados como *propuesta, a calibrar* viven en configuración. | [H] §6.0 DoD |

### 6.7. Requisitos no funcionales

| Categoría | Requisito | Meta | Origen |
|---|---|---|---|
| Rendimiento | Latencia de `/rag/query` de punta a punta | p95 ≤ 15 s (*a calibrar*); timeout de Backend 1 → Backend 2 de 30 s (*propuesta*) | [H] KR2 del Sprint 1, OL-03 |
| Rendimiento | Procesamiento de OCR | p95 ≤ 60 s por documento (*propuesta*) | [H] KR2 del Sprint 2 |
| Rendimiento | Latencia de la ficha y el listado | **TBD** | [R] P3-06 |
| Disponibilidad | Entorno local o demo | **TBD** (sin meta en la fuente) | [R] P3-06 |
| Escalabilidad | Usuarios concurrentes y tamaño del corpus | **TBD**; corpus ≥ 50 documentos en el Sprint 3 | [H]/[R] |
| Fiabilidad | Cola de extracción durable ante reinicios; reintentos acotados | máx. 3 intentos (*propuesta*); 0 documentos colgados indefinidamente | [H] OL-05 |
| Fiabilidad | Consistencia análisis ↔ persistencia | 0 respuestas sin registro persistido | [H] OL-03 |
| Seguridad | Ver §6.11 | — | — |
| Observabilidad | Logs JSON con `traceId` propagado (`X-Trace-Id`) | 100% de las requests correlacionables (Sprint 6); `traceId` desde el Sprint 1 | [H] §2.7, OL-03 |
| Observabilidad | `/health` y `/metrics` (Prometheus) en ambos backends | 100% (Sprint 6) | [H] §2.7 |
| Observabilidad | Tokens y costo por consulta | registrado desde el Sprint 1 [R]; dashboard en el Sprint 6 | [R] P2-12 |
| Costo | Límite de consultas por usuario y presupuesto de tokens por consulta | valores **TBD** | [R] P2-12 |
| Calidad de IA | Ver §6.12 | — | — |
| Accesibilidad | Etiquetas, `aria-live`, navegación por teclado en el panel IA | 100% de los componentes del panel | [H] OL-04 #6 |

### 6.8. Resumen de arquitectura

- [H] **web** (Next.js, React 19, App Router): UI y **único punto de contacto del navegador**. [R, P2-04] Todo el acceso a `clinical-api` pasa por Route Handlers o Server Actions de `web`; `clinical-api` no se expone al navegador (patrón definitivo **TBD — D-10**).
- [H] **clinical-api** (Node LTS, Express 5, Prisma, Zod): servicio de plataforma clínica, dueño exclusivo de PostgreSQL. Auth/Authz, API de pacientes y documentos, *worker* de extracción, gateway de IA, persistencia de análisis. [R, P1-07] También es dueño del **almacén de objetos clínico** (instancia separada del MinIO de Milvus; **TBD — D-08**).
- [H] **rag-orchestrator** (Python, FastAPI, Pydantic): *retrieval*, generación, validación y extracción de documentos. No tiene acceso a PostgreSQL clínica ni puerto publicado al host. [R, P2-08] El catálogo del corpus vive en un almacén propio (**TBD — D-13**).
- [H] **Milvus** (con etcd y MinIO propios): solo chunks del corpus público.
- [H] **Proveedores de LLM y *embeddings***: detrás de adapters; elección **TBD — D-04**.
- [H] **Autenticación:** cookie de sesión opaca (navegador → web → clinical-api) ≠ JWT de servicio ES256/RS256 (clinical-api → rag-orchestrator), con `iss`, `aud`, `exp` corto y algoritmo fijado.
- [H] **Flujos:** Flujo 1 (carga → cola → extracción → transacción) y Flujo 2 (consulta → contexto desidentificado → *retrieval* → LLM → validación → persistencia → respuesta).
- [H] **Sacrificios aceptados:** dos runtimes, un salto de red extra y disciplina de contratos (cliente tipado generado desde OpenAPI).

### 6.9. Resumen del modelo de datos

**PostgreSQL (clinical-api)**, schemas `auth`, `clinical` y `audit` [H]:
- `auth`: `User`, `Session`, `Role`, `Permission`, `RolePermission` [R, P4-04 asigna el schema a RBAC].
- `clinical`: `Patient`, `PatientAssignment` [R, P4-04], `Diagnosis`, `ClinicalNote`, `Exam`, `Biomarker`, `Document`, `Treatment` (Sprint 4), `AIAnalysisRecord`. `PatientContactInfo` fuera del MVP [H].
- `audit`: `AuditLog` [H; R: adelantar su uso].

**Cambios incorporados por la revisión** (aplicar en OL-01, antes de la primera migración):
| Entidad | Cambio | Hallazgo |
|---|---|---|
| `AIAnalysisRecord` | `confidence_score` → `relevance_score` (dentro del JSON) y `top_confidence_score` → `top_relevance_score`; nuevos `clinical_context_snapshot`, `llm_provider`, `llm_model`, `embedding_model`, `prompt_version`, `retrieval_params`, `status` | P2-10, P2-02 |
| `Diagnosis`, `Exam`/`Biomarker`, `ClinicalNote` | `verification_status` (`pendiente_revision` \| `verificado` \| `rechazado`); `verified_by` y `verified_at` | P1-02, P2-01 |
| `Document` | `checksum` (duplicados por paciente) | P2-13 |
| `Patient` / consentimiento | `consent_recorded_by`, o una entidad de eventos `PatientConsent` (**TBD — D-12**) | P2-06 |
| `PatientAssignment` | índice único parcial según D-12 | P2-06 |

**Corpus (rag-orchestrator)** [H + R]:
- Milvus `corpus_chunks`: `chunk_id`, `document_id` (referencia lógica), `dense_vector`, `sparse_vector`, `chunk_text`, `chunk_index`, `section`, `source_type`, `cancer_type_tags` (regla de población **TBD**, P3-04), `is_current`, `created_at`. Esquema completo desde el Sprint 1.
- Catálogo `CorpusDocument`: mismos atributos de §3.1, en un almacén **TBD — D-13** (recomendado: relacional propio de Backend 2).
- Almacén de objetos del corpus: `corpus-raw` y `corpus-normalized` (Backend 2). Almacén de objetos clínico: `clinical-documents` (Backend 1, instancia separada — D-08).

### 6.10. Requisitos de API

**Pública (`clinical-api`, cookie de sesión; accedida vía `web`):**

| Endpoint | Sprint | Estado del contrato |
|---|---|---|
| `POST /platform/auth/login` | 1 | Definido en HU-01 (no en el OpenAPI) |
| `POST /platform/auth/logout` | 1 | **Nuevo [R]**: contrato TBD |
| `GET /platform/patients` (paginado, búsqueda) | 1 | **Nuevo [R]**: contrato TBD |
| `GET /platform/patients/{patientId}` | 1 (ampliado en el 2) | Definido en §4.1; ampliar `Biomarker` [R] |
| `POST /rag/query` (recomendado: `/platform/rag/query` [R, P4-02]) | 1 | Definido en §4.1; renombrar el campo del score [R]; añadir `401` y `429` |
| `POST /platform/patients/{patientId}/documents` | 2 | Definido en §4.1 |
| `GET /platform/patients/{patientId}/documents` | 2 | Descrito (§4.1, endpoints adicionales); contrato TBD |
| `GET /platform/patients/{patientId}/documents/{documentId}` | 2 | Descrito; contrato TBD |
| `GET /platform/patients/{patientId}/clinical-notes` | 2 o TBD | **Nuevo [R]**: incluir o sacar de HU-05 |
| Revisión de datos de OCR (aceptar, corregir, rechazar) | TBD (D-06) | **Nuevo [R]**: TBD |
| `GET /platform/patients/{id}/analyses`, `GET …/analyses/{analysisId}` | 4 | **TBD** |
| `POST/GET /platform/patients/{id}/treatments` | 4 | **TBD** |
| Administración: usuarios, asignaciones, consentimiento | 5 | **TBD (D-11, D-12)** |

**Interna (`rag-orchestrator`, JWT de servicio):**
| Endpoint | Cambios requeridos |
|---|---|
| `POST /rag/query` | La respuesta añade metadatos (`llmModel`, `embeddingModel`, `promptVersion`, `retrievalParams`) [R, P2-02]; acepta un *deadline* [R, P2-12]; documentar `422`/`5xx`. |
| `POST /documents/extract` | Descripción corregida: procesa PHI de forma transitoria [R, P1-04]; entrada por URL prefirmada o *push* del binario (**TBD — D-08**); identificador de control opcional (**TBD — D-15**). |

**Reglas transversales:** errores `{ error, message }` sin detalles internos [H]. Contratos tipados generados desde OpenAPI en `packages/api-contracts` [H]. CI valida ambos specs [H].

### 6.11. Requisitos de seguridad

1. [H] Sesión opaca persistida (solo el hash), `HttpOnly` y `Secure`; [R] `SameSite` y protección CSRF (P2-04); TTL e inactividad (D-11); logout.
2. [H] JWT de servicio asimétrico con validación estricta (`iss`, `aud`, `exp`, algoritmo fijado; rechazo de `alg: none`); la cookie nunca llega a Backend 2.
3. [H] Backend 2 sin red hacia PostgreSQL y sin puerto publicado; [R] sin ruta de red hacia el almacén de objetos clínico si se elige el modelo *push* (D-08).
4. [H] Validación en cada borde (Zod, Pydantic); PDF por *magic bytes*.
5. [H] Separación de schemas; cifrado de volumen; `sslmode=require`.
6. [R] Desidentificación completa del contexto enviado a Backend 2 y a los proveedores de LLM y *embeddings* (BR-08, P1-05, P2-03).
7. [R] Backend 2 trata la PHI de extracción de forma transitoria: sin disco, sin logs; con proveedor externo, acuerdo de tratamiento de datos y no retención (P1-04; D-03).
8. [H] Logs sin PHI, PII ni secretos (incluidas URLs prefirmadas completas).
9. [H+R] RBAC, asignación y consentimiento (Sprint 5); auditoría de accesos a PHI adelantada (P1-06).
10. [R] Límite de intentos de login y de consultas (P2-05, P2-12).
11. [R] Solo datos sintéticos hasta la §6.14 (BR-16).
12. [H] Mitigación de *prompt injection*: instrucciones de sistema separadas; chunks, pregunta y [R] notas de OCR delimitados como datos.

### 6.12. Requisitos de IA/ML

| Área | Requisito | Origen |
|---|---|---|
| Modelos | Modelo de *embeddings* elegido en un spike al inicio del Sprint 1 con criterios **idioma (ES↔EN)**, calidad biomédica, dimensión, costo y privacidad. LLM provisional detrás de `LLMAdapter`. | [H] §5.0 + [R] P1-08; **TBD — D-04** |
| *Retrieval* | Dense (Sprints 1–2), híbrido (Sprint 3+), siempre con `is_current = true`; filtro por `source_type` desde el Sprint 3; *top-k* y umbral configurables. | [H] |
| Idioma | Estrategia explícita para preguntas en español sobre un corpus en inglés (modelo multilingüe o traducción o normalización de la pregunta); idioma de la respuesta y de las citas. | [R] P1-08; **TBD — D-05** |
| Prompt y contexto | Salida JSON estructurada; contexto desidentificado; separación instrucciones/datos; tope de tokens de contexto. | [H] OL-02 #6 + [R] |
| *Grounding* | Validación de citas (BR-01) + chequeo de soporte por recomendación (FR-08). | [H] + [R] P1-03 |
| Puntaje | `relevanceScore` determinista con fórmula y escala documentadas y versionadas; el score clínico queda para el ADR #7. | [H] + [R] P2-10 |
| Evaluación | Dataset versionado en `data/evaluation/` (sintético, con preguntas en español), métricas: recall@k y MRR (*retrieval*); fidelidad, exactitud de citas y tasa correcta de "sin evidencia" (generación); exactitud por campo del OCR. Baseline en el Sprint 1 y regresión en cada cambio de modelo, prompt o umbral. Metas y validador clínico: **TBD — D-09**. | [H] §2.6 + [R] P1-03, P3-03 |
| Trazabilidad | Cada análisis guarda el contexto, los modelos, la versión del prompt y los parámetros (FR-09). | [R] P2-02 |
| Latencia y costo | p95 ≤ 15 s; tokens y costo por consulta registrados; presupuesto por consulta. | [H] + [R] P2-12 |
| Dependencia del proveedor | Adapters intercambiables; reevaluar las métricas de §6.12 al cambiar de proveedor. | [H] + [R] |
| Explicabilidad | Justificación y citas con snapshot por recomendación; rótulo "Relevancia de la evidencia". | [H] |
| Extracción (OCR) | Motor **TBD — D-03**; salida limitada al contrato de §4.2; los datos nacen pendientes de revisión (BR-11); `clinicalSignificance`: fuente de verdad **TBD — D-06**. | [H] + [R] P1-02 |

### 6.13. Estrategia de pruebas

| Nivel | Alcance | Herramientas |
|---|---|---|
| Unitarias | Servicios de Backend 1 y 2; `domain/` (umbral, score determinista, validación de citas, chequeo de soporte). | Vitest, Pytest [H] |
| Integración de API | Endpoints públicos (Supertest) e internos (TestClient), incluidos los casos de error `401`/`403`/`404`/`422`/`429`/`502`/`504`. | [H] + [R] |
| Seguridad | JWT (ausente, expirado, `aud` incorrecto, `alg` distinto, `none`); cookie rechazada en Backend 2; **no-fuga de PII** con PII embebida en texto libre [R]; acceso denegado de Backend 2 al almacén clínico; CSRF [R]; autorización por asignación (Sprint 5); *mutation testing* de auth ≥ 70% (Sprint 6). | [H] + [R] |
| Datos | Constraints, `Restrict`, idempotencia del seed, transacción de extracción, cola concurrente, recuperación de trabajos colgados, duplicados por checksum [R]. | [H] + [R] |
| Contratos | Cliente tipado generado desde OpenAPI; validación de los specs en CI. | [H] |
| E2E | Login → listado [R] → ficha → consulta → tarjeta con cita; flujo "sin evidencia"; carga → estado → biomarcadores con origen. | Playwright [H] + [R] |
| Calidad de IA | Suite de evaluación de §6.12 en CI (o bajo demanda) con umbrales de regresión. | [R] P1-03 (framework TBD, p. ej. `ragas` [H]) |

### 6.14. Roadmap y alcance de la versión

| Sprint | Objetivo [H] | Alcance incluido (con ajustes [R]) | Dependencias |
|---|---|---|---|
| 1 | Walking skeleton | FR-01, FR-02 [R], FR-03, FR-04 [R], FR-06 (dense, 1 recomendación), FR-07, FR-08 (citas), FR-09, FR-15 (estructurado), FR-22 (seed manual). **Spike de *embeddings* y LLM con criterio de idioma.** **Baseline de evaluación [R].** Límite de consultas y de intentos de login [R]. | D-04, D-05, D-10, D-11 |
| 2 | Ingesta OCR | FR-10, FR-11, FR-12. [R] Estado `pendiente_revision` (BR-11) y auditoría de accesos (FR-21, adelantada). | D-03, D-06, D-08, D-15 |
| 2–4 (**TBD**) | Revisión de datos de OCR | FR-13 [R]: fuera del Sprint 6 "prescindible". | D-06 |
| 3 | Híbrida + filtros | FR-14; FR-15 (texto libre, prerrequisito para enviar notas) [R]; FR-22 automatizada y con licencias [R]. | D-05, D-13, D-14 |
| 4 | Rankeadas + trazabilidad | FR-16, FR-17, FR-18 (contratos TBD). | Historias y contratos [R] |
| 5 | Autorización real | FR-19, FR-20, FR-23. | D-12 |
| 6 | Observabilidad y hardening | FR-21 completo, `/health` y `/metrics` completos, *mutation testing*, TLS y *backups* [R]. | — |

**Criterios de salida para operar con datos reales** [R, P1-06]: FR-13, FR-15 (completo), FR-19, FR-20 y FR-21 implementados y probados; D-01, D-03 y D-04 resueltos con controles de privacidad; resultados de evaluación (§6.12) revisados por un oncólogo. Sin estos criterios, la versión es **demo con datos sintéticos**. [H] Si los Sprints 5–6 no se ejecutan, el producto sigue siendo demostrable de punta a punta **en ese modo**.

### 6.15. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación | Hallazgo |
|---|---|---|---|---|
| Alucinación "con cita" (afirmación no respaldada por el chunk citado) | Alta | Crítico | Chequeo de soporte (FR-08), evaluación continua (§6.12), aviso de validación clínica | P1-03 |
| Error de OCR que altera el contexto del RAG | Media | Crítico | `pendiente_revision` (BR-11), revisión (FR-13) | P1-02 |
| Fuga de PII al proveedor de LLM o *embeddings* | Media | Alto | Desidentificación completa (FR-15), tests, proveedor self-hosted o con acuerdo | P1-05, P2-03 |
| PHI procesada fuera de la institución por el OCR | Media | Alto | D-03; controles de BR-07 | P1-04 |
| *Recall* bajo por el desajuste de idioma | Alta | Alto | Criterio de idioma en el spike; evaluación con preguntas en español | P1-08 |
| Uso de datos reales sin controles | Media | Crítico | BR-16 y criterios de salida | P1-06 |
| Compromiso de Milvus o Backend 2 que expone documentos clínicos | Baja | Alto | Almacén clínico separado, modelo *push* | P1-07 |
| Documento cargado en el paciente equivocado | Media | Crítico | Identificador de control (D-15), checksum | P2-13 |
| Versionado del corpus inconsistente | Media | Medio | Catálogo relacional, versionado reanudable | P2-08 |
| Licencia de fuentes (p. ej., NCCN) | Media | Alto | Solo fuentes con licencia (D-14) | P2-09 |
| Costo del LLM sin control | Media | Medio | Límite de consultas, presupuesto, *deadline* | P2-12 |
| Reindexación por cambio de modelo de *embeddings* | Media | Alto | Spike temprano con todos los criterios | P1-08 [H] |
| Interpretación del puntaje como probabilidad de éxito | Alta | Alto | Rótulo, nombre `relevance_score`, propuesta de valor corregida | P1-01, P2-10 |
| Ambigüedad regulatoria (SaMD) | **TBD** | Alto | D-01 | P1-01 |

### 6.16. Preguntas abiertas / TBD

Todas corresponden a la tabla de la §4 (D-01…D-16). Además:
- Definición de "biomarcadores recientes" (FR-03).
- Tabla de verdad de los filtros del panel IA y comportamiento sin diagnóstico activo (FR-06, FR-14).
- N máximo de recomendaciones rankeadas (FR-16).
- Umbral de relevancia, *top-k*, TTLs de sesión y límites de consultas e intentos (configuración).
- Contratos de los Sprints 4–5 (historial, tratamientos, administración).
- Metas de rendimiento de la ficha y el listado, disponibilidad y concurrencia (§6.7).
- Codificación clínica estándar (P3-04, post-MVP).
- Validación del flujo de diagnósticos con un oncólogo (§3.3 #12, ⚠️ del documento fuente).

---

## 7. Trazabilidad

| Requisito | Historia de usuario | API | Datos | Arquitectura | Roadmap |
|---|---|---|---|---|---|
| FR-01 Login | HU-01 | `POST /platform/auth/login` (fuera del OpenAPI) | `User`, `Role`, `Session` | web → clinical-api (Guard) | Sprint 1 · backlog de §6.0 |
| FR-02 Sesión / logout | ⚠️ ninguna | ⚠️ logout no definido | `Session.revoked`, `expires_at` | Guard | ⚠️ sin sprint en la fuente (R: Sprint 1) |
| FR-03 Ficha | HU-02, HU-05 | `GET /platform/patients/{id}` | `Patient`, `Diagnosis`, `Exam`, `Biomarker` | clinical-api | Sprints 1–2 |
| FR-04 Listado | ⚠️ solo referido en HU-01 | ⚠️ no definido | `Patient` | clinical-api | ⚠️ sin sprint (R: Sprint 1) |
| FR-05 Alta de paciente | ⚠️ ninguna | ⚠️ ninguna | `Patient` | ⚠️ | ⚠️ ninguno — **no trazable** |
| FR-06 Consulta RAG | HU-03 | `POST /rag/query` (4.1 y 4.2) | `AIAnalysisRecord`, `CorpusChunk` | Flujo 2 · OL-02/03/04 | Sprints 1/3/4 |
| FR-07 Sin evidencia | HU-03 esc. 2 | igual | `top_confidence_score = null` | `domain/` Backend 2 | Sprint 1 |
| FR-08 Citas y fidelidad | HU-03 | `citedSources` | `recommendations[].cited_sources` | `domain/` Backend 2 | Sprint 1 (citas) · ⚠️ fidelidad sin sprint |
| FR-09 Persistencia trazable | HU-03 (implícito) | respuesta de 4.1 | `AIAnalysisRecord` (⚠️ faltan campos, P2-02) | clinical-api | Sprint 1 |
| FR-10 Carga | HU-04 | `POST …/documents` | `Document`, almacén clínico | Flujo 1 | Sprint 2 |
| FR-11 Extracción y estado | HU-04, HU-05 | `POST /documents/extract`, `GET …/documents[/{id}]` | `Document` (cola), `Exam`, `Biomarker`, `Diagnosis`, `ClinicalNote` | *worker* + `DocumentExtractionService` | Sprint 2 |
| FR-12 Ver datos extraídos | HU-05 | `GET /platform/patients/{id}` (⚠️ sin `entryMethod`), ⚠️ sin endpoint de notas | `Biomarker`, `ClinicalNote` | web | Sprint 2 |
| FR-13 Revisión de OCR | ⚠️ ninguna | ⚠️ ninguna | ⚠️ sin estado de verificación | ⚠️ | ⚠️ "Sprint 6" que no lo incluye — **no trazable** |
| FR-14 Híbrida y filtros | ⚠️ ninguna | `sourcesSelected`, `filtersApplied` (4.1) | `sparse_vector`, `source_type`, `ClinicalNote` | Backend 2 | Sprint 3 |
| FR-15 Desidentificación | HU-03 (implícito) | `ClinicalContext` (4.2) | — | clinical-api (OL-03) | Sprint 1 (estructurado) · ⚠️ texto libre sin sprint |
| FR-16 Rankeadas | ⚠️ ninguna | `recommendations[]` | `recommendations` | Backend 2 | Sprint 4 |
| FR-17 Historial | ⚠️ ninguna | ⚠️ no definido | `AIAnalysisRecord` | clinical-api | Sprint 4 |
| FR-18 Tratamiento | ⚠️ ninguna | ⚠️ no definido | `Treatment` | clinical-api (módulo `treatments`) | Sprint 4 |
| FR-19 Asignación | ⚠️ ninguna | `403` en 4.1 | `PatientAssignment` | Guard | Sprint 5 |
| FR-20 Consentimiento | ⚠️ ninguna | `403` en `/rag/query` | `Patient.consent_ai_analysis` | Guard / RAG Gateway | Sprint 5 |
| FR-21 Auditoría | ⚠️ ninguna | — | `AuditLog` | clinical-api | Sprint 6 (R: adelantar) |
| FR-22 Corpus | ⚠️ ninguna | ninguna (en proceso) | `CorpusDocument`, `CorpusChunk` | `IngestionPipelineService` | Sprint 1 (seed) · ⚠️ ingesta automatizada sin entregable |
| FR-23 Administración | ⚠️ ninguna | ⚠️ ninguna | `User`, `PatientAssignment`, consentimiento | ⚠️ | Sprint 5 implícito — **no trazable** |

**No trazables de punta a punta:** FR-02 (logout), FR-04 (listado), **FR-05 (alta de paciente)**, **FR-13 (revisión de OCR)**, FR-15 (texto libre), FR-17/FR-18 (sin contrato), **FR-23 (administración)** y la fidelidad de FR-08 (sin sprint). Todos provienen de los hallazgos P1-02, P1-03, P1-05, P1-09, P2-01, P2-05, P2-06 y P2-11.

---

## Autoverificación final

- **Capacidades ↔ arquitectura:** todas las capacidades del PRD tienen componente asignado. "Probabilidad de éxito" se eliminó por no tener soporte (P1-01).
- **Historias ↔ APIs/datos:** HU-01…HU-05 tienen API y datos. Las brechas (listado, logout, `entryMethod`, notas) están listadas como requisitos nuevos [R] o TBD.
- **APIs ↔ datos:** los campos renombrados y añadidos (§6.9) se reflejan en §6.10.
- **Secuencia del roadmap:** los prerrequisitos (desidentificación del texto libre antes de enviar notas; estado de verificación antes de usar datos de OCR; controles antes de datos reales) quedan antes de lo que habilitan.
- **Seguridad consistente:** el invariante de Backend 2 se reformuló (BR-07), igual que "nunca se vectorizan" (BR-09) y "cuando es necesario" (BR-08).
- **Evaluación de IA:** definida en la §6.12, con las metas como TBD.
- **Contradicciones resueltas en el PRD:** P1-01, P1-04, P1-07 (dirección recomendada, con D-08 abierto), P2-01, P2-03, P2-10 y P3-05.
- **Sin requisitos inventados:** todo lo que no está en la fuente aparece como [R] ligado a un hallazgo, o como TBD.
