# OncoLens — Product Requirements Document (PRD)

| Campo | Valor |
|---|---|
| Producto | OncoLens: apoyo a la decisión clínica en oncología basado en evidencia (RAG) |
| Versión del documento | 1.0 — MVP (Sprints 1–6 y piloto) |
| Fecha | 2026-09-25 |
| Autor | Mario Julian Bonilla Contreras |
| Documentos relacionados | [`readme.md`](../readme.md): arquitectura (§2), modelo de datos (§3), API (§4), historias (§5), tickets (§6) · [`OncoLens-C4.drawio`](../OncoLens-C4.drawio): diagramas C4 |

> **Cómo leer este documento.** El PRD define **qué** debe hacer el producto y **por qué**. El **cómo** está en el README. Cada requisito indica la sección del README que lo implementa. Lo que falta decidir se marca como **TBD — Decisión requerida**.

---

## 1. Resumen del producto

### 1.1 Problema
Un oncólogo dedica horas a revisar manualmente guías clínicas, ensayos y literatura de investigación para contrastar el perfil clínico y molecular de cada paciente con la evidencia disponible. La evidencia está dispersa, en varios idiomas (español e inglés), y cambia con el tiempo.

### 1.2 Usuarios objetivo
| Usuario | Rol en el sistema | Necesidad |
|---|---|---|
| Oncólogo | `doctor` | Encontrar al paciente, ver su perfil clínico, cargar sus documentos y obtener en minutos las opciones de tratamiento descritas en la evidencia, con citas verificables. |
| Administrador | `admin` | Gestionar usuarios, equipo tratante, egresos y el seguimiento de consentimientos y retención. |
| Entidad médica / colaboradores | Externo | Proveer datos reales anonimizados para calibración y pruebas, y comunicar exclusiones (opt-out) de investigación, bajo un contrato o convenio marco. |

**Piloto inicial:** 10 oncólogos, acceso por red privada o VPN.

### 1.3 Propuesta de valor
OncoLens presenta, en minutos, la **evidencia publicada más relevante** para el perfil clínico y molecular del paciente, junto con las **opciones de tratamiento descritas en esa evidencia**, cada una con **citas verificables** y un indicador de **relevancia de la evidencia**. Toda afirmación mostrada está respaldada por la fuente citada; lo que no supera esa verificación se muestra aparte, solo para revisión.

### 1.4 Objetivo de esta versión
Entregar un **MVP académico, con potencial de convertirse en apoyo clínico real**, que:
1. demuestre de punta a punta el cruce paciente ↔ evidencia con datos sintéticos (Sprints 1–4);
2. elimine la captura manual de datos mediante OCR local (Sprint 2);
3. esté listo para un **piloto con 10 oncólogos y datos reales** (anonimizados e identificados) después del Sprint 5, con los controles de privacidad y autorización completos.

**Alcance clínico:** cáncer de **mama** y de **próstata**. **Leucemia** entra como tercer tipo cuando cumpla su criterio de "listo" (RN-20).

---

## 2. Objetivos y métricas

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| G-1 | Recorrido completo login → paciente → pregunta → opciones citadas | Criterios de aceptación de HU-01, HU-02, HU-03, HU-06 y HU-07 en demo | 100% (Sprint 1) |
| G-2 | Cero recomendaciones sin respaldo | Recomendaciones mostradas con ≥1 cita de un chunk recuperado **y** chequeo de soporte superado | 100% |
| G-3 | Recuperación de evidencia de calidad, incluso entre idiomas | Recall@10 total / de español a inglés; MRR | ≥ 0,80 / ≥ 0,70; ≥ 0,60 *(metas iniciales, se ajustan con el baseline)* |
| G-4 | Respuestas fieles a la evidencia | Fidelidad por afirmación; precisión de citas; exactitud de "sin evidencia" | ≥ 0,90 cada una *(iniciales)* |
| G-5 | Respuesta en tiempo razonable | p95 de la consulta RAG | ≤ 15 s *(a calibrar; decide el ADR de streaming de progreso)* |
| G-6 | Ingesta sin captura manual | Exactitud de OCR por campo crítico / no crítico; p95 por documento | ≥ 95% / ≥ 90%; ≤ 60 s |
| G-7 | Datos extraídos confiables | Exactitud real de los datos marcados `auto_aceptado` | ≥ 98% (si no se cumple, se sube el umbral de confianza alta) |
| G-8 | Privacidad hacia la IA | Sensibilidad del detector de PII sobre identificadores directos; datos reales enviados a la nube | ≥ 0,95; 0 |
| G-9 | Acceso correcto | Endpoints de paciente que validan el equipo tratante; análisis sin consentimiento vigente | 100%; 0 (Sprint 5) |
| G-10 | Operable y auditable | Servicios con `/health` y `/metrics`; requests con `traceId`; *mutation score* sobre auth, autorización y cifrado | 100%; 100%; ≥ 70% (Sprint 6) |

---

## 3. No-objetivos

- Estimar la **probabilidad de éxito** o el pronóstico de un tratamiento.
- Tomar decisiones clínicas autónomas: toda salida requiere validación del oncólogo tratante.
- Reentrenar modelos (*fine-tuning*). En este proyecto, "entrenamiento" significa **calibrar y evaluar**.
- Streaming de tokens del LLM al navegador.
- Despliegue en la nube, multi-institución o acceso desde internet.
- Enviar datos reales (anonimizados o identificados) a proveedores de IA en la nube.
- Histórico de investigación completo: modelo normalizado, desenlaces, análisis de grafos y exportación (alcance futuro; el MVP guarda solo un snapshot mínimo).
- Datos bioinformáticos crudos (TCGA/GDC, cBioPortal, TCIA): solo entran sus publicaciones y resúmenes.
- Datos de contacto del paciente (teléfono, dirección, etc.): la identidad se limita a documento y nombres.
- Scoring de solidez clínica de la evidencia (ADR futuro).

---

## 4. Recorridos de usuario

| ID | Recorrido | Pasos |
|---|---|---|
| RU-1 | Acceso | El oncólogo inicia sesión → llega al listado de pacientes → cierra sesión o la sesión expira. |
| RU-2 | Registro de paciente | "Nuevo paciente" → formulario mínimo (documento, nombres, año de nacimiento, sexo, origen del dato, consentimientos; representante legal si es menor) **o** sube un PDF y confirma los datos que sugiere el OCR → el paciente queda creado con un episodio abierto. |
| RU-3 | Ficha del paciente | Busca por documento o por nombre → ve identificación, diagnóstico (con su sistema de estadificación), estado funcional y biomarcadores con semáforo, unidad, rango, origen, confianza y estado de revisión → abre el documento de origen de cualquier valor. |
| RU-4 | Carga de documento | Sube un PDF → ve el estado (pendiente → procesando → completado, error o cuarentena) → los datos aparecen etiquetados en la ficha. |
| RU-5 | Revisión de datos extraídos | Ve el contador de pendientes → verifica, corrige o rechaza cada dato → confirma o descarta los diagnósticos en conflicto. |
| RU-6 | Consulta de evidencia | Desde la ficha, pregunta en español o en inglés → elige fuentes y filtros → recibe hasta 3 opciones (1 en los Sprints 1–3) con su relevancia, justificación en el idioma de la pregunta y citas en su idioma original (traducción opcional) → ve avisos si una opción depende de datos sin revisar → ve aparte las recomendaciones descartadas → o recibe "sin evidencia suficiente" o "tipo de cáncer fuera del alcance del piloto". |
| RU-7 | Historial y decisión | Consulta los análisis previos → registra el tratamiento decidido, opcionalmente vinculado a un análisis. |
| RU-8 | Ciclo de vida | El tratante principal egresa al paciente (se guarda el snapshot mínimo si no hay opt-out) → reactivación en un reingreso → registro de bajas de investigación o total. |
| RU-9 | Administración | El administrador gestiona usuarios (CLI) y el equipo tratante; revisa los reportes de vencimientos de retención y de pacientes que requieren ratificar su consentimiento. |

---

## 5. Requisitos funcionales

> Formato: descripción · valor · comportamiento · bordes y errores · criterios de aceptación (CA) · sprint · referencia en el README.

### FR-01 — Autenticación y sesión
- **Descripción:** login y logout con correo y contraseña; sesión persistida con token opaco.
- **Valor:** acceso seguro y revocable a datos clínicos.
- **Comportamiento:**
  - Cookie `HttpOnly`, `Secure` y `SameSite=Strict`.
  - Expiración absoluta de 8 h y por inactividad a los 30 min.
  - Rotación del token al iniciar sesión.
  - Contraseñas con Argon2id.
  - Todo el acceso pasa por `web`.
- **Bordes:**
  - Credenciales inválidas → `401` genérico.
  - 5 intentos fallidos → bloqueo de 15 min, sin revelarlo.
  - Sesión expirada → redirección al login sin mostrar datos.
  - Todos los valores son configurables.
- **CA:** escenarios 1–4 de HU-01.
- **Sprint:** 1. **README:** §2.5, HU-01.

### FR-02 — Listado y búsqueda de pacientes
- **Descripción:** listado paginado con búsqueda **exacta** por tipo y número de documento, y por nombre.
- **Comportamiento:**
  - La búsqueda por documento usa un índice ciego, sin guardar el documento en claro.
  - La búsqueda por nombre filtra dentro del equipo tratante del doctor.
  - Filtros por estado (activo o egresado) y por origen del dato.
  - Distintivo "SINTÉTICO" en los pacientes de prueba.
- **CA:** HU-06.
- **Sprint:** 1. **README:** §4.1, §2.5.

### FR-03 — Registro de paciente (manual y asistido por OCR)
- **Descripción:** alta con formulario mínimo, o con formulario precargado por el OCR y confirmado por el doctor.
- **Comportamiento:**
  - Tipos de documento habilitables: cédula de ciudadanía, tarjeta de identidad, cédula de extranjería y pasaporte (el país emisor solo en los dos últimos).
  - Documento y nombres se guardan cifrados.
  - Se capturan los consentimientos: análisis de IA, e investigación marcada por defecto (opt-out) si hay un contrato configurado.
  - Registra el origen del dato y la referencia del convenio.
- **Bordes:**
  - Identificación ya existente → `409` con la opción de abrir o reactivar el paciente.
  - Tarjeta de identidad sin representante legal → `422`.
  - El OCR nunca crea pacientes sin confirmación.
- **CA:** HU-07 y HU-08.
- **Sprint:** 1 (manual), 2 (asistido). **README:** §3.2, §4.1.

### FR-04 — Ficha del paciente
- **Descripción:** identificación, diagnóstico vigente, estado funcional, biomarcadores recientes y contador de datos pendientes de revisión.
- **Comportamiento:**
  - "Reciente" = último valor por biomarcador.
  - Cada dato muestra su origen, confianza y estado de revisión.
  - Cada lectura de la ficha se audita.
  - Si el tipo de cáncer no está habilitado, la ficha lo indica.
- **Bordes:** `404` si el paciente no existe; `403` si el doctor no está en el equipo tratante (Sprint 5).
- **CA:** HU-02 y HU-05.
- **Sprint:** 1–2. **README:** §4.1.

### FR-05 — Carga de documento clínico
- **Descripción:** carga de un PDF (historia clínica o examen) con extracción asíncrona.
- **Comportamiento:** PDF validado por *magic bytes*, máximo 20 MB; binario guardado en el almacén clínico; respuesta `202`.
- **Bordes:**
  - Formato inválido → `422`.
  - Archivo duplicado (checksum) → `409`.
  - Paciente egresado → `422`.
- **CA:** HU-04.
- **Sprint:** 2. **README:** §2.1 Flujo 1, OL-05.

### FR-06 — Extracción con confianza y gate de PII
- **Descripción:** extracción local del contenido, con una etiqueta de confianza por campo.
- **Comportamiento:**
  - Capa de texto digital, y OCR solo en las páginas escaneadas.
  - Detección de PII según la clase de datos.
  - Estructuración con el LLM local.
  - **Confianza por campo** (alta, media o baja), calculada con señales deterministas: calidad de lectura, anclaje en el texto, validación de dominio y consistencia.
  - Origen del semáforo: documento, regla o inferencia de IA.
  - Posición del valor en el documento.
  - Persistencia en una transacción.
- **Bordes:**
  - PII inesperada en datos sintéticos o anonimizados → `cuarentena_pii`, sin persistir datos.
  - Identidad del documento distinta de la del paciente → `requiere_revision_identidad`.
  - Documento ilegible → `error`; timeout → reintento, hasta 3 veces.
  - Reiniciar el servicio nunca deja un documento colgado.
  - Reprocesar no duplica datos.
- **CA:** OL-05.
- **Sprint:** 2. **README:** §3.2, OL-05.

### FR-07 — Visor del documento de origen
- **Descripción:** desde cualquier dato extraído, abrir el PDF en la página del valor, con el fragmento resaltado.
- **Comportamiento:** el PDF se sirve en *streaming* a través de `web`, sin caché, y cada apertura se audita.
- **CA:** HU-05, escenario 1.
- **Sprint:** 2. **README:** §4.1.

### FR-08 — Revisión de datos extraídos
- **Descripción:** verificar, corregir o rechazar cualquier dato extraído.
- **Comportamiento:**
  - Una corrección crea un dato `manual_correction` y el original pasa a reemplazado.
  - Los datos rechazados no entran al RAG.
  - **Diagnóstico en conflicto:** con fecha anterior al vigente → histórico; con fecha posterior o sin fecha confiable → pendiente de revisión, y el oncólogo lo confirma o lo descarta.
- **CA:** HU-09.
- **Sprint:** 3. **README:** §3.2, §3.3 #12.

### FR-09 — Consulta de evidencia (RAG)
- **Descripción:** pregunta en lenguaje natural sobre un paciente, con fuentes y filtros.
- **Comportamiento:**
  - Contexto clínico **etiquetado** (confianza y revisión) y **desidentificado**.
  - Expansión bilingüe de la pregunta.
  - Recuperación *dense* (y *sparse* desde el Sprint 3) con filtros de vigencia, fuente, tipo de cáncer y población.
  - *Reranker* y umbral de relevancia.
  - Generación en el idioma de la pregunta.
  - Validación de citas y **chequeo de soporte estricto**.
  - Máximo 1 recomendación en los Sprints 1–3 y hasta 3 desde el Sprint 4.
  - Respuesta JSON completa; se persiste antes de responder.
- **Bordes:**
  - Sin evidencia → `status: sin_evidencia`, sin invocar al LLM.
  - Tipo de cáncer no habilitado → `tipo_no_habilitado`, sin invocar al LLM.
  - `403` sin consentimiento o sin pertenecer al equipo tratante (Sprint 5).
  - `429` por límite de consultas o cola de inferencia.
  - `503` si el LLM local no está disponible, **sin respaldo en la nube** para datos reales.
  - `504` si vence el tiempo máximo.
  - `500` si falla la persistencia, sin mostrar el resultado.
- **CA:** HU-03 y HU-10.
- **Sprint:** 1 (dense), 3 (híbrida), 4 (rankeadas). **README:** §2.1 Flujo 2, §4.

### FR-10 — Recomendaciones descartadas visibles para revisión
- **Descripción:** las recomendaciones que no superan la validación se muestran aparte.
- **Comportamiento:**
  - Sección colapsada "Descartadas por falta de soporte — solo para revisión", con el motivo y las afirmaciones sin soporte resaltadas.
  - No cuentan como recomendaciones y no pueden vincularse a un tratamiento.
- **CA:** HU-03, escenario 3.
- **Sprint:** 1.

### FR-11 — Avisos de datos no verificados
- **Descripción:** si una recomendación depende de datos pendientes de revisión, se indica en su tarjeta.
- **Comportamiento:** el sistema lo calcula de forma determinista, sin depender del LLM.
- **Sprint:** 2.

### FR-12 — Historial de análisis
- **Descripción:** listar y consultar los análisis previos de un paciente.
- **Comportamiento:** las citas se muestran desde su snapshot, junto con el contexto enviado y los modelos usados.
- **CA:** HU-11.
- **Sprint:** 4.

### FR-13 — Registro de la decisión de tratamiento
- **Descripción:** registrar el tratamiento decidido por el doctor.
- **Comportamiento:** con vínculo opcional al análisis que lo originó, nunca a una recomendación descartada.
- **CA:** HU-12.
- **Sprint:** 4.

### FR-14 — Ciclo de vida: egreso, reactivación y bajas
- **Descripción:** egresar, reactivar y registrar bajas del paciente.
- **Comportamiento:**
  - El egreso lo ejecutan el tratante principal o un administrador y guarda el snapshot mínimo de investigación si no hay opt-out.
  - La reactivación abre un episodio nuevo y conserva la historia.
  - **Baja de investigación:** borra el histórico.
  - **Baja total:** borra la identidad, los representantes, el histórico y los PDFs, seudonimiza el resto y el paciente sale de OncoLens. Es irreversible y requiere confirmación explícita.
- **CA:** HU-13.
- **Sprint:** 4.

### FR-15 — Equipo tratante y autorización por paciente
- **Descripción:** varios doctores activos por paciente, uno de ellos principal.
- **Comportamiento:** todos los endpoints de paciente validan la pertenencia al equipo, salvo el rol `admin`.
- **CA:** HU-14; KR1 del Sprint 5.
- **Sprint:** 5.

### FR-16 — Consentimientos
- **Descripción:** consentimientos registrados como eventos (`analisis_ia`, `investigacion`).
- **Comportamiento:**
  - Cada evento guarda la base legal y el firmante (paciente o representante legal).
  - Investigación es opt-out bajo el contrato marco.
  - Se acepta la marca de opt-out que envía la entidad médica.
  - Al cumplir la mayoría de edad (edad configurable), el paciente queda marcado "requiere ratificación" y el consentimiento de los padres sigue vigente hasta que lo ratifique o lo revoque.
- **Sprint:** 1 (datos), 4 (opt-out en UI), 5 (validación en todos los endpoints).

### FR-17 — Retención de datos
- **Comportamiento:**
  - Hasta 10 años desde la aceptación del contrato o la primera cita (la más temprana).
  - Renovación automática hasta 20 años si no hay baja.
  - Al vencer, la misma acción que la baja total.
  - Job diario auditado y aviso 90 días antes.
  - No aplica a los datos sintéticos ni a los anonimizados.
- **Sprint:** 5.

### FR-18 — Auditoría
- **Descripción:** registro de accesos y acciones.
- **Comportamiento:** registra lectura de la ficha, consulta RAG, carga, apertura del documento de origen, revisión, consentimientos, bajas, renovaciones y borrados; **nunca** guarda PHI ni identidad (solo UUID).
- **Sprint:** 2 (accesos), 5 (completa).

### FR-19 — Corpus científico
- **Descripción:** ingesta de fuentes solo textuales con licencia registrada.
- **Comportamiento:**
  - Normalización, fragmentación, *embedding* multilingüe (dense + sparse) y versionado reanudable; se conserva el histórico.
  - Catálogo en el schema `corpus` de PostgreSQL.
- **Bordes:** un documento sin licencia registrada se rechaza.
- **CA:** KR3 del Sprint 3.
- **Sprint:** 1 (semilla), 3 (ingesta como entregable).

### FR-20 — Evaluación de calidad de la IA
- **Descripción:** suite de evaluación reproducible, con baseline en el Sprint 1.
- **Comportamiento:** es obligatoria en cada cambio de modelo, prompt, umbral o corpus. Métricas de G-3, G-4, G-6, G-7 y G-8.
- **CA:** OL-06.
- **Sprint:** 1 y continuo.

---

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | Toda recomendación mostrada tiene ≥1 cita a un chunk recuperado en la misma consulta **y** supera el chequeo de soporte. Si no, se descarta y se muestra solo en la sección de descartadas. |
| RN-02 | Sin chunks sobre el umbral de relevancia → "sin evidencia", sin invocar al LLM, persistiendo con `top_relevance_score = null`. |
| RN-03 | El puntaje mostrado es **relevancia de la evidencia recuperada**, calculado por el *reranker* y rotulado así. No mide solidez clínica ni probabilidad de éxito. |
| RN-04 | Los datos de las citas (título, fuente, identificador, texto) se copian del corpus, nunca del texto generado. Se muestran en su idioma original. |
| RN-05 | Solo participan en la recuperación los chunks vigentes (`is_current`). El histórico del corpus nunca se borra. |
| RN-06 | Ningún análisis se muestra sin haber quedado persistido. |
| RN-07 | Todo dato extraído por OCR lleva su confianza y su estado de revisión, y entra al RAG **etiquetado**. Los datos rechazados o reemplazados nunca entran. |
| RN-08 | Un dato extraído nunca reemplaza en silencio a uno verificado. En diagnósticos, la vigencia se decide por fecha (FR-08). |
| RN-09 | El OCR nunca crea pacientes sin la confirmación de un doctor. |
| RN-10 | La identidad (documento y nombres) se guarda cifrada y **nunca** sale del servicio clínico hacia la IA, el histórico, los *logs* ni la auditoría. |
| RN-11 | El contexto enviado a la IA se desidentifica **siempre**: seudónimo aleatorio por consulta, fechas relativas y texto libre enmascarado. |
| RN-12 | Los datos reales (anonimizados o identificados) **solo** se procesan con modelos locales. La nube solo se usa con datos sintéticos. |
| RN-13 | Ningún dato real entra a la aplicación antes de completar el Sprint 5 y el gate G-piloto. La calibración con datos reales anonimizados se hace fuera de la aplicación y fuera del repositorio. |
| RN-14 | El repositorio público nunca contiene datos reales ni secretos. |
| RN-15 | Consultar exige un consentimiento `analisis_ia` vigente. La investigación es opt-out bajo el contrato marco; sin contrato configurado no se presume consentimiento. |
| RN-16 | Un paciente con tarjeta de identidad requiere al menos un representante legal con firma registrada. |
| RN-17 | Solo el tratante principal o un administrador egresan a un paciente. Un paciente egresado no admite consultas ni cargas hasta su reactivación. |
| RN-18 | Retención: 10 años, renovable automáticamente hasta 20 si no hay baja. Al vencer o con la baja total se borra la identidad y se seudonimiza el resto. |
| RN-19 | Toda salida muestra "Recomendación generada por IA — requiere validación clínica del oncólogo tratante" y "Uso académico/investigación". |
| RN-20 | Un tipo de cáncer se habilita solo si cumple su criterio de "listo": catálogo revisado por el oncólogo, corpus con licencia (≥ 20 documentos), dataset de evaluación que cumple las metas y documentos de laboratorio típicos cubiertos. |
| RN-21 | Solo se ingieren fuentes con licencia registrada. NCCN y ESMO quedan excluidas mientras su licencia esté pendiente. |
| RN-22 | Todo valor marcado "a calibrar" vive en configuración, no en el código. |

---

## 7. Requisitos no funcionales

| Categoría | Requisito | Meta |
|---|---|---|
| Rendimiento | Consulta RAG de punta a punta | p95 ≤ 15 s *(a calibrar)*; tiempo máximo hacia Backend 2: 30 s |
| Rendimiento | Extracción por documento | p95 ≤ 60 s |
| Rendimiento | Ficha y listado | p95 ≤ 1 s |
| Capacidad | Usuarios del piloto | 10 registrados, 2–3 concurrentes; 1–2 inferencias simultáneas (cola con `429`) |
| Hardware | Entorno de referencia | MacBook Pro M5, 32 GB; memoria total del stack ≤ 24 GB (ADR de modelos locales) |
| Disponibilidad | Entorno local y piloto | Sin SLA formal. Apagado y arranque documentados; *backups* cifrados con prueba de restauración por sprint |
| Fiabilidad | Cola de extracción | Durable ante reinicios; máximo 3 intentos; 0 documentos colgados |
| Fiabilidad | Consistencia análisis ↔ persistencia | 0 respuestas sin registro |
| Seguridad | Ver §11 | — |
| Observabilidad | Logs JSON con `traceId`; `/metrics` y `/health` | Desde el Sprint 1 para las métricas de IA; 100% en el Sprint 6 |
| Privacidad | PII en *logs*, auditoría, histórico o prompts | 0 |
| Accesibilidad | Panel de IA | Etiquetas, región `aria-live` y navegación por teclado |
| Mantenibilidad | Contratos | Cliente tipado generado desde OpenAPI; CI valida ambos specs |

---

## 8. Resumen de arquitectura

*(Detalle en README §2 y en el diagrama C4.)*

- **web** (Next.js): UI y BFF. Es el único punto de entrada del navegador, con HTTPS de una CA interna y acceso por red privada o VPN.
- **clinical-api** (Node/Express): plataforma clínica y gateway de IA. Dueño de PostgreSQL (schemas `auth`, `identity`, `clinical`, `audit`, `research`) y de `clinical-minio` (PDFs). Incluye el *worker* de extracción y los jobs de retención y mayoría de edad.
- **rag-orchestrator** (Python/FastAPI): recuperación, generación, validación y extracción. Dueño de Milvus y del schema `corpus`, al que accede con un rol limitado. **Sin acceso a los datos clínicos.** *Embeddings*, *reranker* y NLI corren en CPU.
- **LLM nativo** (Ollama o vLLM en macOS, con GPU Metal), fuera de Docker. Una API compatible con OpenAI permite cambiar de runtime sin tocar código.
- **Motores de datos:** solo **PostgreSQL y Milvus**. MinIO se usa como almacén de archivos.
- **Autenticación:** sesión del doctor (cookie opaca) ≠ credencial de servicio (JWT ES256). La sesión nunca llega a Backend 2.

---

## 9. Resumen del modelo de datos

*(Detalle en README §3.)*

| Área | Entidades |
|---|---|
| Acceso | `User`, `Role`, `Permission`, `RolePermission`, `Session` |
| Identidad (cifrada) | `PatientIdentity`, `LegalRepresentative` |
| Paciente y ciclo de vida | `Patient` (sin datos personales; origen, convenio, retención), `CareEpisode`, `CareTeamMember`, `PatientConsent`, `IntakeDraft` |
| Datos clínicos | `Diagnosis` (estadificación y escala funcional genéricas por tipo de cáncer), `ClinicalNote`, `Exam`, `Biomarker` (con confianza, revisión, origen del semáforo y posición en el documento), `Document` (cola de extracción), `Treatment` |
| IA | `AIAnalysisRecord` (recomendaciones, descartadas, relevancia, contexto desidentificado, modelos, versión del prompt, parámetros) |
| Investigación (mínimo) | `ResearchSubjectMap`, `EpisodeSnapshot` (JSON versionado, sin identidad ni texto libre) |
| Auditoría | `AuditLog` (sin PHI) |
| Corpus | `CorpusDocument` (schema `corpus`: licencia, idioma, tipo de cáncer, versión) · `CorpusChunk` (Milvus: dense + sparse y metadatos de filtrado) |

**Clases de datos:** `sintetico` (identificación aleatoria, etiquetado) · `real_anonimizado` (calibración y pruebas) · `real_identificado` (pacientes del piloto con documento y nombres).

---

## 10. Requisitos de API

*(Contratos en README §4.)*

| Método y ruta | Requisito | Sprint |
|---|---|---|
| `POST /platform/auth/login` · `…/logout` | FR-01 | 1 |
| `GET /platform/patients` | FR-02 | 1 |
| `POST /platform/patients` · `POST/GET /platform/intake-drafts` | FR-03 | 1 / 2 |
| `GET /platform/patients/{id}` · `…/biomarkers` · `…/clinical-notes` | FR-04 | 1–2 |
| `POST/GET /platform/patients/{id}/documents` · `…/documents/{docId}` | FR-05, FR-06 | 2 |
| `GET …/documents/{docId}/file` | FR-07 | 2 |
| `PATCH …/clinical-data/{type}/{itemId}/review` | FR-08 | 3 |
| `POST /platform/rag/query` | FR-09, FR-10, FR-11 | 1 |
| `GET …/analyses` · `…/analyses/{id}` | FR-12 | 4 |
| `POST/GET …/treatments` | FR-13 | 4 |
| `POST …/episodes/current/close` · `POST …/episodes` · `POST …/withdrawals` · `POST …/consents` | FR-14, FR-16 | 1 / 4 |
| `POST/DELETE …/care-team` | FR-15 | 5 |
| Interna: `POST /rag/query` · `POST /documents/extract` (JWT de servicio) | FR-06, FR-09 | 1 / 2 |

**Reglas transversales:**
- Errores con la forma `{ error, message }`, sin detalles internos.
- El navegador solo llama a `web`.
- Todo endpoint que muta verifica `Origin`.
- Idempotencia opcional en la consulta RAG (`Idempotency-Key`).

---

## 11. Requisitos de seguridad y privacidad

1. **Sesión:** cookie opaca `HttpOnly`/`Secure`/`SameSite=Strict`; expiración, bloqueo, Argon2id y logout (FR-01). CSRF: `SameSite` más verificación de `Origin`.
2. **Autorización:** RBAC más equipo tratante; `admin` ve todos.
3. **Identidad:** AES-256-GCM en la aplicación más índice ciego HMAC; claves solo en el servicio clínico; cada vista se audita (RN-10).
4. **Desidentificación** del contexto hacia la IA y **gate de PII** en los documentos (RN-11, FR-06).
5. **Proveedores:** datos reales solo con modelos locales, aplicado en código y probado (RN-12).
6. **Aislamiento del servicio de IA:**
   - sin credenciales ni red hacia el almacén clínico;
   - en PostgreSQL, solo el rol `rag_corpus` sobre el schema `corpus`, con revocaciones explícitas, red dedicada, `pg_hba` restringido y tests de acceso denegado en CI.

   **Riesgo residual aceptado:** comparte servidor con los datos clínicos.
7. **Credencial de servicio:** JWT ES256/RS256 con `iss`, `aud`, `exp` corto y algoritmo fijado.
8. **Cifrado:** FileVault y volúmenes cifrados; TLS hacia PostgreSQL; HTTPS con una CA interna.
9. **Red:** solo `web` publica un puerto, en la interfaz de la red privada o VPN.
10. **Consentimientos, retención y bajas:** FR-16 y FR-17; RN-15 a RN-18.
11. **Gate G-piloto:** banderas separadas para datos reales anonimizados e identificados; prerrequisitos verificados por `preflight` (RN-13).
12. **Repositorio público:** sin datos reales ni secretos, con escaneo en CI (RN-14).
13. ***Prompt injection*:** instrucciones separadas de los datos; chunks, pregunta y notas delimitados.

---

## 12. Requisitos de IA/ML

| Área | Requisito |
|---|---|
| Modelos | Elegidos en el **ADR de modelos locales** con restricciones duras (memoria, latencia, licencia, español, JSON válido, GPU) y medición con el stack completo. |
| Idioma | Preguntas y documentos en español o en inglés. *Embeddings* multilingües (dense + sparse); expansión bilingüe de la pregunta; respuesta en el idioma de la pregunta; citas en su idioma original, con traducción opcional etiquetada. |
| Recuperación | Filtros de vigencia, fuente, tipo de cáncer y población; *reranker* multilingüe; umbral de relevancia configurable. |
| *Grounding* | Validación de citas más chequeo de soporte NLI por afirmación (estricto). |
| Puntaje | `relevance_score` del *reranker*, normalizado a [0,1] y versionado. El scoring clínico queda para un ADR futuro. |
| Extracción | Capa de texto, OCR local y LLM de estructuración; confianza por campo con señales deterministas; sin plantillas por laboratorio; catálogos por tipo de cáncer. |
| Trazabilidad | Cada análisis guarda el contexto enviado, los modelos, la versión del prompt y los parámetros. |
| Evaluación | Suite reproducible (FR-20) con datasets en español e inglés por tipo de cáncer. Validación clínica **parcial**: el oncólogo revisa una muestra y los reportes distinguen lo validado de lo no validado. |
| Operación | Semáforo de inferencia, tiempo máximo propagado y métricas de tokens y latencia por etapa desde el Sprint 1. |

---

## 13. Estrategia de pruebas

| Nivel | Alcance |
|---|---|
| Unitarias | Servicios y `domain/`: umbral, relevancia, citas, soporte, confianza de OCR, regla de proveedores, reglas de diagnóstico y retención. |
| Integración de API | Todos los códigos de estado documentados, en ambos backends. |
| Seguridad | No-fuga de PII (incluida PII escrita en la pregunta); cifrado e índice ciego; CSRF; JWT; acceso denegado del rol `rag_corpus`; gate G-piloto; autorización por equipo tratante; *mutation testing*. |
| Datos | Restricciones, cola concurrente, recuperación ante reinicios, duplicados, transacción de extracción, versionado del corpus. |
| Contratos | Cliente generado desde OpenAPI; validación de specs en CI. |
| E2E (Playwright) | Login → listado → ficha → consulta → tarjeta con cita; sin evidencia; carga → etiquetas → documento de origen; egreso y reactivación. |
| Calidad de IA | Suite de FR-20 con umbrales de regresión. |

---

## 14. Roadmap y alcance de la versión

| Sprint | Objetivo | Alcance principal | Datos |
|---|---|---|---|
| 1 | Walking skeleton | FR-01, FR-02, FR-03 (manual), FR-04, FR-09 (dense), FR-10, FR-19 (semilla), FR-20 (baseline); ADR de modelos locales | Sintéticos (calibración anonimizada fuera de la app) |
| 2 | Ingesta OCR | FR-03 (asistido), FR-05, FR-06, FR-07, FR-11, FR-18 (accesos) | Sintéticos |
| 3 | Híbrida, filtros y revisión | FR-08, FR-09 (híbrida), FR-19 (ingesta) | Sintéticos |
| 4 | Rankeadas, trazabilidad y ciclo de vida | FR-09 (hasta 3), FR-12, FR-13, FR-14, FR-16 (opt-out en UI) | Sintéticos |
| 5 | Autorización y gate del piloto | FR-15, FR-16, FR-17, FR-18; acceso por VPN; *backups* | **Datos reales tras el gate G-piloto** |
| 6 | Observabilidad y hardening | Métricas, trazas, *mutation testing* | Piloto |
| Post-piloto | Tercer tipo de cáncer | Leucemia (RN-20) con el flujo de menores completo | Piloto |
| Futuro | Investigación | Histórico completo, desenlaces, grafos, exportación | — |

**Criterios de liberación:**
- **Demo:** Sprints 1–4 con datos sintéticos.
- **Piloto con datos reales o demo ampliada:** además, el Sprint 5 y el `preflight` en verde.

---

## 15. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Afirmaciones no respaldadas por la cita ("alucinación con cita") | Alta | Crítico | Chequeo de soporte estricto, descartadas visibles, evaluación continua |
| Error de OCR que altera la recomendación | Media | Crítico | Confianza por campo, etiquetas en el RAG, aviso por recomendación, revisión, visor del documento |
| Documento cargado en el paciente equivocado | Media | Crítico | Verificación de la identidad del documento; checksum |
| Fuga de identidad hacia la IA, los *logs* o el histórico | Media | Alto | Identidad cifrada y confinada, desidentificación, gate de PII, tests de no-fuga |
| Datos reales en la nube por mala configuración | Baja | Alto | Regla de proveedores en código y en ambos backends, con test |
| Backend 2 comprometido alcanza datos clínicos a través de PostgreSQL | Baja | Alto | Rol limitado, revocaciones, `pg_hba`, red dedicada, tests; opción de base separada |
| Baja calidad de recuperación español ↔ inglés | Alta | Alto | *Embeddings* multilingües, expansión bilingüe, *reranker*, métricas de español a inglés |
| Latencia o memoria insuficientes en la laptop | Media | Alto | LLM nativo con GPU, ADR de modelos locales, límites de memoria, cola |
| Licencias de las fuentes | Media | Alto | Solo fuentes con licencia registrada; NCCN y ESMO excluidas |
| Uso del puntaje como probabilidad de éxito | Alta | Alto | Rótulo "Relevancia de la evidencia", propuesta de valor explícita, avisos |
| Validación clínica limitada | Alta | Medio | Revisión parcial del oncólogo, reportes que distinguen lo validado |
| Pérdida de la clave de cifrado de identidad | Baja | Alto | Procedimiento documentado de generación y respaldo de claves |
| Robo o falla de la laptop del piloto | Baja | Alto | FileVault, *backups* cifrados fuera del equipo, prueba de restauración |

---

## 16. Preguntas abiertas / TBD

| ID | Tema | Estado |
|---|---|---|
| TBD-01 | Modelos concretos (LLM, *embeddings*, *reranker*, NLI, OCR) y runtime (Ollama o vLLM) | **TBD — Decisión requerida:** ADR de modelos locales, al inicio del Sprint 1 |
| TBD-02 | Metas definitivas de evaluación | **TBD:** se ajustan con el baseline del Sprint 1 |
| TBD-03 | Calibración de los umbrales de confianza del OCR y de relevancia | **TBD:** con el set de referencia (sintético y anonimizado) |
| TBD-04 | Licencias de NCCN y ESMO; otras fuentes en español | **TBD — Decisión requerida:** ADR de fuentes y licencias |
| TBD-05 | Subtipos de leucemia (LLA, LMA, LMC, LLC) y población (pediátrica o adulta) | **TBD:** con el oncólogo al preparar el tercer tipo |
| TBD-06 | Lista de motivos de egreso y reglas clínicas (semáforo, vigencia de diagnósticos) | **TBD:** validación con el oncólogo |
| TBD-07 | Edad de mayoría configurada | **TBD:** configuración, sin asumir un país |
| TBD-08 | Streaming de eventos de progreso | **TBD:** ADR tras medir el p95 del Sprint 1 |
| TBD-09 | Scoring de solidez clínica de la evidencia | **TBD:** ADR futuro |
| TBD-10 | Catálogo del corpus en una base separada de la misma instancia (endurecimiento opcional) | **TBD:** según la revisión de seguridad del piloto |

---

## 17. Trazabilidad

| Requisito | Historia | API | Datos | Arquitectura | Sprint |
|---|---|---|---|---|---|
| FR-01 Autenticación | HU-01 | `/platform/auth/*` | `User`, `Session` | web → clinical-api (Guard) | 1 |
| FR-02 Listado | HU-06 | `GET /platform/patients` | `PatientIdentity` (índice ciego) | clinical-api / IdentityService | 1 |
| FR-03 Registro | HU-07, HU-08 | `POST /platform/patients`, `intake-drafts` | `Patient`, `PatientIdentity`, `LegalRepresentative`, `PatientConsent`, `IntakeDraft` | clinical-api + extracción | 1–2 |
| FR-04 Ficha | HU-02, HU-05 | `GET /platform/patients/{id}` | `Diagnosis`, `Biomarker`, `Exam` | clinical-api | 1–2 |
| FR-05 Carga | HU-04 | `POST …/documents` | `Document` | clinical-api + clinical-minio | 2 |
| FR-06 Extracción | HU-04, HU-05 | `/documents/extract` | `Document`, datos clínicos | Worker + rag-orchestrator | 2 |
| FR-07 Visor | HU-05 | `…/documents/{docId}/file` | `Document`, `AuditLog` | web → clinical-api → clinical-minio | 2 |
| FR-08 Revisión | HU-09 | `PATCH …/review` | `review_status`, `conflicts_with_id` | ClinicalReview | 3 |
| FR-09 Consulta RAG | HU-03, HU-10 | `POST /platform/rag/query`, `/rag/query` | `AIAnalysisRecord`, `CorpusChunk` | RagGateway + RAGOrchestratorService | 1/3/4 |
| FR-10 Descartadas | HU-03 | ídem | `discarded_recommendations` | Domain (SupportChecker) | 1 |
| FR-11 Avisos | HU-05 | ídem | `provenance` | Domain | 2 |
| FR-12 Historial | HU-11 | `…/analyses` | `AIAnalysisRecord` | clinical-api | 4 |
| FR-13 Tratamiento | HU-12 | `…/treatments` | `Treatment` | clinical-api | 4 |
| FR-14 Ciclo de vida | HU-13 | `…/episodes`, `…/withdrawals` | `CareEpisode`, `EpisodeSnapshot` | Patients + RetentionJobs | 4 |
| FR-15 Equipo tratante | HU-14 | `…/care-team` | `CareTeamMember` | Middleware | 5 |
| FR-16 Consentimientos | HU-07, HU-13 | `…/consents` | `PatientConsent`, `LegalRepresentative` | Patients + jobs | 1/4/5 |
| FR-17 Retención | — (operación) | — | `Patient.retention_*` | RetentionJobs | 5 |
| FR-18 Auditoría | — (transversal) | — | `AuditLog` | clinical-api | 2/5 |
| FR-19 Corpus | — (OL-02) | — | `CorpusDocument` (schema `corpus`), `CorpusChunk` | IngestionPipelineService | 1/3 |
| FR-20 Evaluación | — (OL-06) | — | `data/evaluation` (sintético) | Suite de evaluación | 1+ |

**Sin historia propia:** FR-17 (retención), FR-18 (auditoría), FR-19 (corpus) y FR-20 (evaluación) son requisitos operativos o técnicos, cubiertos por tickets (OL-01, OL-02, OL-06) y por los criterios del Sprint 5. Sus historias de usuario se escriben al iniciar el sprint correspondiente.
