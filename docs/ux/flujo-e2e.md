# Flujo E2E del oncólogo · Pre-S1

> **Dirección elegida:** C · "Mesa de trabajo" (usuario, 2026-10-09, `[Pre-S1 resp. 10]`), ampliada al flujo completo y **revisada y aprobada por el usuario el 2026-10-11** con 17 hilos de comentarios en el canvas. Esa revisión añadió las pantallas 03b, 13, 14 y 15, las preguntas de seguimiento, el filtro de antigüedad y los nombres "Caso clínico" y "Resumen y faltantes" (`[Pre-S1 resp. 14…17]`). Prototipo navegable: [`prototipo/README.md`](prototipo/README.md). Sistema de diseño: [`sistema-de-diseno.md`](sistema-de-diseno.md).
> **Datos:** todo es sintético. El paciente de referencia es el semilla de próstata (readme OL-01 b): "Paciente sintético 07". Los textos entre corchetes son marcadores que se llenan desde el catálogo, nunca contenido inventado.
> **Encuadre:** el producto entrega un análisis de evidencia, no recomendaciones (D-01). Los textos fijos de este documento son normativos para `frontend-dev` y los verifican `clinical-language-auditor` y la lista de términos prohibidos (RN-23).

Este documento cubre:
- **Happy path del MVP:** 01 → 02 → 04 → 05 → 06 → 07 → 08 → 09.
- **Alternativa:** registro (03).
- **Estados:** pantalla 10.
- **Post-MVP:** 11 y 12, diseñadas para que el sistema sea coherente de punta a punta.

Cada pantalla indica **el sprint en que aparece** y **el dato del contrato** que muestra cada elemento: `clinical-api` (readme §4.1, congelado en US-033).

## Mapa

| # | Pantalla | Ruta en `web` | Sprint | Historias principales |
|---|---|---|---|---|
| 01 | Inicio de sesión | `/login` | S1 (mínima) · S2 (expiración y bloqueo) | US-211, US-044 |
| 02 | Pacientes: búsqueda y listado | `/pacientes` | S2 | FEAT-T4a, FEAT-02a |
| 03 | Registro de paciente | `/pacientes/nuevo` | S4 (alta manual US-047); OCR asistido si hay capacidad (FEAT-01c) | US-047 |
| 03b | Registro de paciente desde PDF | `/pacientes/nuevo/pdf` | S3 o posterior · FEAT-01c (`si-hay-capacidad`) | FEAT-01c |
| 04 | Caso clínico del paciente | `/pacientes/[id]` | S2 | US-051 |
| 05 | Carga de documentos | `/pacientes/[id]/documentos` | S2 (carga) · S3 (OCR, PII, estados) | FEAT-01a, FEAT-01b |
| 06 | Revisión de datos extraídos | `/pacientes/[id]/revision` | S4 | US-107, FEAT-03b |
| 07 | Resumen y faltantes del caso | `/pacientes/[id]/caso` | S3 (vista) · S4 (checklist y registro manual) | FEAT-02b, FEAT-04, US-110 |
| 08 | Nueva pregunta y espera | `/pacientes/[id]/analisis` | S1 (ruta directa) · S2 | US-060, US-062 |
| 09 | Análisis de evidencia | `/pacientes/[id]/analisis/[analysisId]` | S1 (1 opción) · S5 (aplicabilidad, 3 opciones, seguimiento, feedback) | US-061, FEAT-08b, FEAT-10c (US-218, US-219), FEAT-T5c |
| 10 | Estados del análisis | (en 08 y 09) | S1–S6 según el estado | US-062, US-043, US-148 |
| 11 | Decisión registrada | `/pacientes/[id]/decisiones` | **Post-MVP** (FEAT-11b) | HU-12 |
| 12 | Evolución | `/pacientes/[id]/decisiones` | **Post-MVP** (FEAT-11b) | HU-23 |
| 13 | Registro de usuario (solicitud) | `/registro` | S6 · baja prioridad | US-221 |
| 14 | Aprobación de cuentas (admin) | `/admin/solicitudes` | S6 · baja prioridad | US-221 |
| 15 | Configuración del sistema (admin) | `/admin/configuracion` | S6 · baja prioridad | US-222 |

Patrón común a todas las pantallas autenticadas:
- **Cabecera navy** con `OncoLens`, navegación, la etiqueta **"Uso académico/investigación"** (RN-19) y "Cerrar sesión".
- **Barra del paciente**: nombre, resumen del diagnóstico, estado del ciclo de vida y etiqueta del origen del dato (`dataOrigin`).
- **Pestañas:** **Caso clínico** · **Resumen y faltantes** · Documentos · Revisión (n) · Análisis · Decisiones y evolución.
- **Insignias de origen del dato** en todas las tablas y listas: **OCR** (icono de escáner, azul) y **Manual** (icono de médico, morado). Siempre llevan la palabra, no solo el icono o el color.
- **Fechas:** cada dato clínico muestra la fecha del examen. Las tablas de biomarcadores indican la "fecha de referencia", que es la del último resultado registrado, y separan la fecha del examen de la fecha de carga.

## 01 · Inicio de sesión

| Elemento | Texto | Dato |
|---|---|---|
| Título | "Iniciar sesión" | — |
| Subtítulo | "Herramienta de apoyo para el análisis de evidencia. No sustituye el juicio clínico." | — |
| Campos | Correo electrónico · Contraseña `[S1 resp. 4]` | `POST /platform/auth/login` |
| Error | "Usuario o contraseña incorrectos." Es genérico y no dice qué campo falló | `401` |
| Pie | "La sesión expira tras un periodo de inactividad configurable." | TTL en configuración (RN-22) |
| Registro | "¿No tienes cuenta? Solicitar registro" (S6, US-221) | `POST /platform/auth/register` |
| Destino por rol | Oncólogo → Pacientes · administrador → Administración (pantalla 14) | rol de la sesión |

Estados: cargando (botón deshabilitado, "Entrando…"), error, bloqueo por intentos (S2), sesión expirada (redirige aquí con el aviso "Tu sesión expiró").

## 02 · Pacientes: búsqueda y listado

- **Búsqueda:** por tipo y número de documento (búsqueda exacta por índice ciego) o por nombre, con `POST /platform/patients/search`: la identidad va en el cuerpo, nunca en la URL (`[Pre-S1 resp. 22]`). El listado sin búsqueda usa `GET /platform/patients?status=&dataOrigin=&page=`.
- **Columnas** de `PatientSummary`:

| Columna | Dato |
|---|---|
| Paciente | `identification`: el nombre, más el documento enmascarado `CC ••• 4407` y el año de nacimiento (`birthYear`) |
| Diagnóstico | `diagnosis` |
| Faltantes críticos | `missingCriticalCount` |
| Por revisar | `pendingReviewCount` |
| Estado | `lifecycleStatus` |
| Origen | `dataOrigin`, como etiqueta |

- **Tipo no habilitado** (`cancerTypeEnabled = false`): "Fuera del alcance del piloto: sin análisis con IA".
- **Estados:** vacío ("No hay pacientes con ese documento. Registrar paciente nuevo"), cargando (filas esqueleto) y error ("No pudimos cargar el listado. Intenta de nuevo." más el código de traza).

## 03 · Registro de paciente

- **Campos:** tipo y número de documento, nombres, año de nacimiento, sexo, origen del dato (en S1–S5 solo "Sintético"; "Real" deshabilitado hasta G-Piloto, RN-13) y referencia del convenio (`POST /platform/patients`).
- **Representante legal:** el bloque aparece y es obligatorio solo si el paciente es menor según la edad de mayoría configurada.
- **409:** "Ya existe un paciente con ese documento." con enlace a su ficha.
- **Panel lateral:** "Registrar desde un PDF", marcado *si hay capacidad* (FEAT-01c).

## 03b · Registro de paciente desde PDF (S3 o posterior, FEAT-01c)

1. **Documento:** subir el PDF; se muestra su estado (procesando, datos extraídos, error de lectura, cuarentena) y el fragmento de origen.
2. **Datos sugeridos:** el formulario de 03, prellenado. Cada campo indica su confianza: ● alta · ▲ por revisar · ○ por completar. Un aviso resume cuántos quedan pendientes.
   - Origen y convenio siempre se completan a mano.
   - **Nada se registra sin la confirmación del usuario.** Los datos clínicos del mismo PDF siguen por 05 y 06.

## 04 · Caso clínico del paciente

- **Avisos superiores** (no bloquean, RN-26): "3 datos extraídos por revisar · no bloquean el análisis" y "2 datos críticos faltantes".
- **Diagnóstico vigente**, de `Diagnosis`:

| Fila | Dato |
|---|---|
| Tipo | `cancerType` y CIE-10 (`icd10Code`) |
| Histología | `histology` |
| Gradación | `grade` con su espécimen y alcance, de `gradings[]` (DEC-05) |
| Estadio | `stagingSystem`/`stageValue`, con el aviso "sin verificar" si aplica |
| Estado funcional | `performanceScale`/`performanceValue` |
| Diagnosticado | `diagnosedAt` |
| Origen | `Provenance` y "ver documento de origen" |

- **Biomarcadores recientes**, de `Biomarker`:

| Columna | Dato |
|---|---|
| Biomarcador | `name` y código LOINC |
| Valor | `value`, `unit` y `performedAt` |
| Rango | `referenceRange` |
| Tendencia | `trend`, con flecha y texto |
| Significancia | `clinicalSignificance`, con símbolo y texto, no solo color |
| Origen y revisión | `provenance.entryMethod`, `extractionConfidence` y `reviewStatus`. Son dos ejes: confianza y revisión (RN-07) |

- **Acciones:** Cargar documentos · Registrar un dato a mano · **Abrir vista de caso** (primaria).

## 05 · Carga de documentos

- Zona de arrastre y "Elegir archivos" (varios PDF, `POST …/documents/batch`, respuesta `207`). Tipo de documento: historia clínica o examen.
- Tabla de estados por archivo, de `Document.ocrStatus`:

| Estado | Texto y siguiente paso |
|---|---|
| `completado` | "6 datos extraídos · 3 por revisar" |
| `procesando` | "Se actualiza solo; puedes seguir trabajando" |
| `pendiente` | "En cola" |
| `cuarentena_pii` | "Contiene datos personales que no se pudieron enmascarar. No entra al análisis." |
| `error` | "No se pudo leer el texto. Reintentar o registra los datos a mano" |
| duplicado (`409`) | "Mismo contenido que un documento ya cargado. No se procesa de nuevo." |

## 06 · Revisión de datos extraídos

- Encabezado: "Un dato extraído nunca reemplaza en silencio a uno verificado. Lo que no revises entra al análisis rotulado como “sin verificar”." (RN-07, RN-08).
- **Tarjeta por dato:**
  - el valor, la confianza con sus señales deterministas y el mapeo;
  - el fragmento del documento de origen, con su página;
  - las acciones **Verificar · Corregir · Rechazar** (`PATCH …/clinical-data/{type}/{itemId}/review`).
- **Conflicto:** el vigente verificado y el extraído, lado a lado, con "Mantener el vigente", "Usar el nuevo (el vigente pasa a reemplazado)" y "Registrar ambos con su espécimen" (gradación, DEC-05).
- **Término sin mapear:** "Sin código en el catálogo versionado: queda como no_mapeado, nunca se inventa un código" (RN-27). Selector del catálogo.
- Vacío: "No hay datos por revisar."

## 07 · Resumen y faltantes del caso

- **Columna izquierda · Datos críticos.** Viene de `CaseView.completeness` y lleva la versión del catálogo (`catalogVersion`). Cada ítem lleva un estado:

| Símbolo | Estado |
|---|---|
| ✓ | verificado |
| ◐ | sin verificar |
| ◌ | falta (icono neutro, no ✕ rojo) |

  Texto: "Los faltantes no bloquean: si continúas, el análisis los trata como “desconocido” y lo deja escrito en la Base del análisis."
- **"Registrar nuevo examen o dato crítico"**, con dos caminos que llevan **al mismo flujo**:
  - **Desde documento (OCR):** lleva a 05.
  - **Ingresar a mano:** un selector de examen o dato (primero los críticos faltantes, después los exámenes nuevos del catálogo), con valor, unidad y fecha del examen (`POST /platform/patients/{id}/biomarkers` o `…/diagnoses`).
  - En los dos casos el dato se normaliza con el catálogo y conserva su origen; si viene de un documento, pasa por Revisión.
- **Columna principal:**
  - CTA "Analizar la evidencia para este caso", con **Cargar información** y **Continuar con aviso** (`continueWithWarning`);
  - **serie de PSA** (`biomarkerSeries`, PSA siempre como serie);
  - **Timeline** (`timeline`, con `derived` y `datePrecision`);
  - **Tratamientos previos** por línea (`priorTreatments`);
  - **Atributos clínicos** (`attributes`).
- Pie: "el análisis previo aparece en el timeline como evento derivado, nunca como dato del paciente" (RN-24, C-06).

## 08 · Nueva pregunta y espera

- **Aviso** si se continuó con faltantes.
- **Pregunta** en español o inglés (máximo 2000 caracteres, `query`). Ayuda: "No escribas nombres ni documentos: el contexto que sale hacia la IA se desidentifica siempre."
- **Fuentes** (`sourcesSelected`):
  - Guías y resúmenes (NCI PDQ);
  - Publicaciones (PMC OA con licencia abierta);
  - **Ensayos clínicos deshabilitado:** "no incluidos en el corpus del MVP" (ADR-36).
- **Antigüedad de la evidencia:** control deslizante de 2000 al año actual, con atajos "Últimos 5 años", "Últimos 10 años" (por defecto) y "Toda la evidencia" (`filtersApplied.publishedFromYear`, US-220, `[Pre-S1 resp. 15]`).
  - Las publicaciones se filtran por año de publicación y las guías NCI PDQ por su última actualización.
  - El filtro queda en la Base del análisis.
  - Es operable con teclado.
- **Contexto que se envía** (`filtersApplied`).
- **Espera:** el progreso por pasos, nunca contenido (TBD-08): "Contexto preparado y desidentificado → Evidencia recuperada → Verificando citas y soporte → Calculando aplicabilidad". Botón Cancelar. Texto: "el contenido aparece completo cuando está validado".
- **Análisis previos** con la marca "Desactualizado": *si hay capacidad*.

## 09 · Análisis de evidencia (respuesta `EvidenceAnalysis`)

Layout C: el caso a la izquierda y el análisis a la derecha.

**Columna izquierda:**
- resumen del caso;
- "Datos críticos usados" (de `analysisBasis.patientDataUsed` y `missingCriticalData`);
- **Fragmento citado**, con el texto original del chunk sin traducir (`citedSources[].chunkTextSnapshot`), su licencia y su autoría.

**Columna principal, en orden:**
1. Pregunta y metadatos (`queryText`, `queryLanguage`, `analysisBasis.sourcesConsulted`, `continuedWithWarning`, `createdAt`).
2. **Aviso IA** (`disclaimer`): "Análisis generado por IA: requiere validación clínica del oncólogo tratante" (RN-19, PRD B-06, `[S1 resp. 9]`). El prototipo conserva la raya como referencia histórica.
3. **Encabezado "Opciones descritas en la evidencia"** y criterio: "Ordenadas por coincidencia con la población estudiada, no por eficacia" (RN-28, `[§15 resp. 7]`).
4. **Explicación del orden:** "1) menos criterios excluyentes en “No coincide”, 2) más criterios en “Coincide”, 3) relevancia de la búsqueda solo como desempate."
5. **Tabla de aplicabilidad:** una fila por criterio del catálogo, con el valor del paciente, y una columna por opción con la **fuente más aplicable** (`applicability[]`, `evidenceOptions[].perSource`). Celdas con símbolo y texto: ✓ Coincide · ◐ Parcial · ✕ No coincide (marca "no excluyente" o "excluyente") · ? Desconocido. **La fila Resumen tiene que cuadrar con las celdas** (`applicabilitySummary`). Una frase explica el desempate cuando lo hay.
6. **Tarjeta por opción** (`evidenceOptions[]`, hasta 3):
   - `option`;
   - `rationale`, **siempre con "las fuentes" como sujeto** (RN-23);
   - `warnings` como avisos que no bloquean;
   - citas (`citedSources[]`) con `sourceName`, `title`, `authors` ("No disponible" si falta), `studyDesign`/`trialPhase`, `sampleSize`, `publishedAt`/`lastUpdatedAt`, `language`, **`licenseClass`**, "ver fragmento", "fuente original" (`sourceUrl`) y la marca `possiblyOutdated`;
   - `relevanceScore` al final, con el texto "metadato secundario, no ordena ni mide eficacia" (RN-03).
7. **Descartadas** (`discardedOptions[]`), plegadas: "para revisión, no son opciones", con su `discardReason`.
8. **Base del análisis** (`analysisBasis`): datos usados, faltantes, supuestos, fuentes consultadas, **no incluidas: "NCCN, ESMO (licencia no abierta)"** (solo como exclusión, `[Pre-S1 resp. 12]`), corte del corpus, limitaciones y afirmaciones omitidas (`omittedClaims`).
9. **Preguntas de seguimiento sobre este análisis** (S5, US-218 y US-219, `[Pre-S1 resp. 14]`), antes del feedback:
   - **Contador:** "n de 10 preguntas usadas" (`ANALYSIS_FOLLOWUP_MAX`).
   - **Recuadro "Contexto fijo de esta conversación":** paciente desidentificado, datos del análisis, pregunta y hallazgos, y evidencia del mismo corpus.
   - **Cada respuesta** llega completa y validada: citas y NLI, la fuente nueva marcada "nueva en el seguimiento" y el aviso RN-19.
   - **Estados:** `sin_evidencia` (ofrece ampliar la antigüedad o abrir un análisis nuevo), `fuera_de_contexto` (otro paciente u otro tema: se ofrece un análisis nuevo) y `409` por límite.
   - Las preguntas y respuestas se guardan en **Backend 1**, ligadas al análisis (`POST/GET …/evidence-analyses/{id}/follow-ups`; en Backend 2, `POST /rag/follow-up`).
   - Los hallazgos del análisis son memoria rotulada, nunca soporte citable (RN-24).
10. **Feedback** (`POST …/feedback`): "¿Qué tan útil fue este análisis?", de 1 a 5, más "El aviso de faltantes fue correcto" y "El aviso de faltantes fue útil". Opcional y sin texto libre.
11. Acciones: "Registrar la decisión del oncólogo" (Post-MVP) · "Nueva pregunta".
12. Pie con RN-19 y "Uso académico/investigación".

**Variante S1–S4:** una sola opción, sin tabla (`applicability = []`), con el criterio "Seleccionada por relevancia de la búsqueda, no por eficacia" `[§15 resp. 7]`.

## 10 · Estados del análisis

| Estado | Disparador | Texto clave | Bloquea |
|---|---|---|---|
| Sin evidencia | `status = sin_evidencia` | "Ningún fragmento del corpus superó el umbral de relevancia… No se generaron opciones." Muestra qué se buscó. La relevancia máxima "no aplica" (`topRelevanceScore = null`, nunca 0, RN-02). Lleva el aviso IA | — |
| Tipo no habilitado | `status = tipo_no_habilitado` | "El análisis con IA está habilitado solo para mama y próstata." | Solo la IA |
| Opt-out | `403` | "Análisis con IA no disponible para este paciente… Aplica a todo lo generado con IA." El botón queda deshabilitado con el motivo | Sí (legal) |
| Error | `5xx`, `502`, tiempo agotado | "No se pudo completar el análisis. No se muestra ningún resultado parcial." más el código de traza | — |
| Desactualizado | `staleness` (historial) | "Cambiaron datos que este análisis usó…" y "Re-ejecutar con los datos actuales" | No |
| Egresado | `422` | "El paciente está egresado. No admite registros nuevos hasta su reactivación." | Sí (legal) |
| Avisos | `warnings`, revisión, faltantes | Dato sin verificar, en conflicto, faltante, población no comparable, posiblemente desactualizada | **Nunca** (RN-26) |

## 11 · Decisión registrada (Post-MVP)

- Texto: "La decisión es del oncólogo tratante. Vincularla a un análisis solo deja constancia de qué evidencia se consultó; no significa que el análisis la indicara."
- Campos: régimen (catálogo ATC), línea, inicio previsto y análisis consultado (opcional).
- **Workaround del MVP:** el tratamiento se registra como tratamiento previo en la vista de caso.

## 12 · Evolución (Post-MVP)

- Tipo de evento (respuesta, toxicidad, progresión), valor del catálogo, fecha con su precisión y una descripción breve. La descripción "se enmascara antes de cualquier uso con IA".
- No disponible si el paciente está egresado (`422`).
- El timeline se actualiza. Los análisis siguientes reciben la evolución como contexto desidentificado y los anteriores pasan a "Desactualizado".

## 13 · Registro de usuario (S6, baja prioridad)

- **Campos:** usuario, contraseña con la política institucional, y confirmación.
- **Al enviar:** "Solicitud enviada · Pendiente de aprobación".
- **Si inicia sesión antes de la aprobación:** "Tu cuenta aún no ha sido aprobada".
- **Errores:** usuario existente o con solicitud pendiente (`409`) y contraseñas que no coinciden.

## 14 · Aprobación de cuentas (admin, S6)

- **Menú "Administración":** Solicitudes de cuenta · Configuración del sistema · Auditoría (por diseñar). Solo lo ven los administradores, que llegan aquí al iniciar sesión.
- **Tabla:** usuario, fecha de la solicitud y estado, con **Aprobar** / **Rechazar** (el rechazo admite un motivo opcional). Cada acción queda en auditoría.

## 15 · Configuración del sistema (admin, S6)

- **Usuarios y roles:**
  - crear usuario (contraseña temporal, rol `doctor` o `admin`);
  - cambiar rol, desactivar o reactivar;
  - eliminar, con confirmación; si el usuario tiene registros se sugiere desactivar.
- **Pacientes:** dar de alta (03 o 03b). El administrador **no ve datos clínicos ni análisis** (`[Pre-S1 resp. 17]`).
  - El diseño muestra además "Reasignar" y "Egresar/Reactivar": son **Post-MVP** (equipo tratante P-02 y ciclo de vida) y no entran en US-222.
- **Parámetros del sistema y Análisis con IA y corpus:**
  - expiración de sesión, edad de mayoría, modo de registro y origen de datos;
  - tipos habilitados, fuentes, límite de seguimiento (10) y antigüedad por defecto.
  - **En el MVP se muestran en solo lectura** (RN-22: viven en la configuración validada al arranque). El diseño los dibuja editables; editarlos exigiría un ADR.
  - **"Almacenamiento de conversaciones": resuelto, Backend 1** (ownership). No es un parámetro.
  - El rol `investigador` que aparece en el diseño **no entra en el MVP** (roles: `doctor` y `admin`).

## Brechas con el contrato (resueltas en US-033 antes de congelar)

| # | Brecha | Decisión |
|---|---|---|
| UX-1 | `CitedSource` no tiene licencia, autoría ni enlace, y CC BY y ADR-36 obligan a atribuir | Se añaden `licenseClass`, `authors` (nullable) y `sourceUrl` (nullable), copiados del catálogo del corpus (RN-04, RN-25) `[Pre-S1 resp. 11]` |
| UX-2 | Gradación estructurada en la ficha, la revisión y el registro | `Diagnosis.gradings[]` (DEC-05, US-033 AC-11) |
| UX-3 | Marcadores de cita en línea dentro del `rationale` | **No** se añaden: cada opción lista sus citas debajo, sin cambiar el contrato |
| UX-4 | Cola global de revisión | **No** se añade: la revisión es por paciente (`pendingReviewCount` y pestaña Revisión) |
| UX-5 | `sourcesSelected.ensayos` sin corpus en el MVP (ADR-36) | El contrato se mantiene; la UI la muestra deshabilitada con su motivo |
| UX-6 | Preguntas de seguimiento sin endpoint ni entidad | `POST/GET …/evidence-analyses/{id}/follow-ups`, `FollowUpTurn`, endpoint interno `POST /rag/follow-up` (sin estado, `[Pre-S1 resp. 19]`) y `clinical.analysis_follow_up` (US-033 AC-13) `[Pre-S1 resp. 14]` |
| UX-7 | Filtro de antigüedad | `filtersApplied.publishedFromYear` en los dos backends y registro en `AnalysisBasis` (US-033 AC-14) `[Pre-S1 resp. 15]` |
| UX-8 | Cuentas pendientes y administrador sin datos clínicos | `auth.user.account_status` y matriz de permisos del rol `admin` (US-033 AC-15) `[Pre-S1 resp. 16, 17]` |
