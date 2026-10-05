# OncoLens — Product Requirements Document (PRD)

| Campo | Valor |
|---|---|
| Producto | OncoLens: apoyo a la decisión clínica en oncología basado en evidencia (RAG) |
| Versión del documento | **1.2** — MVP (Sprints 1–6 y piloto), reconciliado con el Discovery y con la revisión de coherencia |
| Fecha | 2026-10-04 (v1.1 y v1.2; v1.0: 2026-09-25) |
| Autor | Mario Julian Bonilla Contreras |
| Documentos relacionados | [`readme.md`](../readme.md): arquitectura (§2), modelo de datos (§3), API (§4), historias (§5), tickets (§6) · [`OncoLens-C4.drawio`](OncoLens-C4.drawio): diagramas C4 · [`AS-IS.md`](AS-IS.md): proceso actual, pain points (P), JTBD y oportunidades · [`TO-BE.md`](TO-BE.md): solución objetivo por fases. **El conjunto README + PRD + C4 es autocontenido**: no depende de otros documentos. |

> **Cómo leer este documento.** El PRD define **qué** debe hacer el producto y **por qué**. El **cómo** está en el README. Cada requisito indica la sección del README que lo implementa. Lo que falta decidir se marca como **TBD — Decisión requerida**. Los criterios de aceptación detallados (Gherkin y medibles) de cada capacidad están en la **§18**, con IDs estables (`CAP-xx`, `T-x`, `AC-xx.y`, `M-xx.y`) pensados para descomponer el backlog. Los IDs `P` (pain points), `JTBD` y `Opp.` se definen en [`AS-IS.md`](AS-IS.md); los `D-xx` y `R-xx`, en la §0 de este documento.

---

## 0. Registro de cambios

### 0.0 Versión 1.2 (2026-10-04): revisión de coherencia

La v1.2 resuelve 31 hallazgos (R-01 a R-31) de una revisión de coherencia entre PRD, README, C4 y To-Be: contradicciones, requisitos sin soporte en el modelo y ambigüedades sin ADR. Se aceptaron todas las propuestas, con estas aclaraciones de los equipos:
- **R-08:** un solo módulo `evidence-analysis` (incluye el historial).
- **R-11:** los **consentimientos se firman y guardan en un sistema externo**. En el MVP se **asume opt-out** para el análisis con IA y para investigación: todo paciente cargado bajo el convenio se considera incluido, salvo que el **administrador** registre una marca de opt-out con la referencia al sistema externo. Un paciente **egresado** no admite ningún registro, ni siquiera de evolución, hasta su reactivación.
- **R-13:** el MVP incluye un **agente mínimo**: una búsqueda complementaria acotada (FR-30).

| Hallazgo | Decisión | Dónde |
|---|---|---|
| R-01 | La opción hereda la aplicabilidad de su fuente más aplicable; muestra todas sus fuentes; "población no comparable" solo si todas lo son | FR-25, RN-28 |
| R-02 | Todo ítem de catálogo tiene un campo de destino: `Diagnosis.histology` y `grade`, entidad `ClinicalAttribute` | FR-23, §9 |
| R-03 | Eventos derivados de las tablas que ya existen; `ClinicalEvent` guarda solo los tipos sin tabla propia | FR-21, FR-29 |
| R-04 | Backend 2 **propone** el código; Backend 1 es **dueño** de la normalización final, incluidos los datos manuales | FR-22, §8 |
| R-05 | Afirmaciones sobre datos del paciente: verbalización determinista + NLI; supuestos: consistencia + anclaje a un faltante | RN-01, FR-21, FR-27 |
| R-06 | Base del análisis escalonada: S1 (a, d, e, f), S3 (b, c, g), S4 (h, i) | FR-27, RN-02 |
| R-07 | Carga múltiple en `POST …/documents/batch` (`207`) | FR-05, §10 |
| R-09 | Memoria por paciente; sin análisis desactualizados ni resúmenes; todo el equipo tratante; desactualizado en cascada | FR-29 |
| R-10 | Dos marcas: datos del paciente cambiados / evidencia o catálogo más reciente | FR-12 |
| R-11 | Modelo de opt-out (ver arriba); RN-15 cubre toda generación con IA | FR-03, FR-16, RN-15, RN-16, RN-17 |
| R-12 | Licencias aceptadas: dominio público, CC BY y CC BY-SA; NC solo en el MVP académico; ND excluida | FR-19, RN-21 |
| R-13 | Agente mínimo acotado | FR-30 |
| R-14 · R-15 | G-Demo verifica AC-T1.5 y AC-T3.3 en G-Piloto; G-Éxito separado del cierre del piloto | §14 |
| R-16 | `extraido_verificado` = LLM + NLI contra el texto + muestreo humano | FR-19, FR-20 |
| R-17 | Criterio de orden visible; percepción de prescripción en VM-6 | RN-28, §2.2 |
| R-18 a R-30 | Correcciones de modelo, API, reglas y textos | §5, §6, §9, README |

### 0.1 Versión 1.1 (2026-10-04): reconciliación con el Discovery

La v1.1 incorpora las decisiones (D-01 a D-16) tomadas al contrastar este PRD con el Discovery de 4 entrevistas a oncólogos, cuyos hallazgos están consolidados en [`AS-IS.md`](AS-IS.md). La arquitectura, la seguridad, la privacidad y la evaluación de la v1.0 **se conservan**. Cambia la capa de producto que va encima.

| Diferencia | Criticidad | Decisión | Dónde queda en este PRD |
|---|---|---|---|
| D-01 Encuadre "recomendación" vs. "apoyo a la decisión" | Urgente | ✅ Se reencuadra la salida como **análisis de evidencia**, con opciones **descritas** en la evidencia y ordenadas por aplicabilidad | §1.3, G-1, FR-09, FR-10, RN-03, RN-19, RN-23 |
| D-02 No hay reconstrucción del caso | Urgente | ✅ Se agrega **CAP-02**: timeline, tratamientos previos, series de biomarcadores y resumen verificable | FR-21, FR-04 |
| D-03 Relevancia ≠ aplicabilidad | Urgente | ✅ Enfoque en **aplicabilidad**: comparación criterio a criterio, sin puntaje clínico | FR-25, RN-28 |
| D-04 Métricas solo técnicas | Urgente | ✅ Se agregan métricas de valor. Quedan identificados **qué se debe definir** y **sugerencias** | §2.2 (G-15, VM-1 a VM-6), TBD-11 |
| D-05 Información faltante | Alta | ✅ Checklist determinista de datos críticos | FR-23 |
| D-06 Vigencia no visible | Alta | ✅ Fecha, versión, corte del corpus y alerta de antigüedad | FR-26 |
| D-07 Incertidumbre parcial | Alta | ✅ Supuestos y datos ausentes declarados | FR-27 |
| D-08 Síntesis + detalle de T-2 | Alta | ✅ Síntesis con acuerdos y discrepancias; **"Base del análisis" (T-2) detallada** | FR-24, FR-27 |
| D-09 Cobertura de guías | Alta | ✅ El MVP se acota a **fuentes públicas de acceso abierto**. El ADR de fuentes se hace, pero **la licencia de NCCN/ESMO no bloquea**: se puede gestionar en el MVP o en una versión futura. Se sigue registrando la licencia de cada documento. | FR-19, RN-21, TBD-04 |
| D-10 Reconciliación limitada | Media | ✅ Reconciliación más **normalización con CIE-10 (diagnósticos), LOINC (laboratorios y biomarcadores), CUPS (procedimientos, Colombia) y ATC (medicamentos)**. **El MVP no genera el reporte a la Cuenta de Alto Costo (CAC)**, que queda como alcance futuro. | FR-22, RN-27, §3 |
| D-11 Investigación iterativa | Media | ✅ Cada análisis, decisión y evolución (progreso, resultados) **se documenta en la historia del paciente en OncoLens**. Los análisis previos y la evolución **entran como contexto** de los análisis siguientes, **rotulados y nunca citables como evidencia**. | FR-29, FR-12, FR-13, RN-24 |
| D-12 Cohortes y outcomes históricos | Media | ✅ Post-MVP, con preparación en el MVP (snapshot longitudinal) | §3, FR-14 |
| D-13 Apoyo a la pregunta clínica | Media | ✅ Plantillas en el MVP; preguntas sugeridas por IA en Post-MVP | FR-28 |
| D-14 Leucemia y menores | Baja | ✅ **Se mantiene** toda la configuración para menores (tarjeta de identidad, representante legal, job de mayoría de edad). Leucemia sigue en Post-MVP. | FR-03, FR-16, RN-16, RN-20 |
| D-15 Job de retención 10–20 años | Baja | ✅ Se mantienen la política y los campos; el **job automático se difiere a Post-MVP** (sujeto a validación legal, TBD-16) | FR-17 |
| D-16 Comité de tumores | Baja | ✅ Post-MVP | §3 |

### 0.2 Versión 1.0 (2026-09-25)
Versión inicial: MVP RAG con recomendaciones citadas, OCR local, privacidad y piloto.

---

## 1. Resumen del producto

### 1.1 Problema
Un oncólogo dedica horas a **reconstruir el caso** a partir de documentos dispersos, **detectar qué información falta** y revisar manualmente guías, ensayos y literatura para decidir **qué evidencia aplica realmente a su paciente**. La evidencia está dispersa, en varios idiomas (español e inglés) y cambia con el tiempo. El Discovery muestra que el mayor desperdicio ocurre **antes y alrededor del razonamiento clínico**, no dentro de él. Ver [`AS-IS.md`](AS-IS.md).

### 1.2 Usuarios objetivo
| Usuario | Rol en el sistema | Necesidad |
|---|---|---|
| Oncólogo | `doctor` | Entender rápido un caso a partir de sus documentos, saber qué falta, encontrar evidencia aplicable al paciente con citas verificables y decidir con control total. Lo que dicen los oncólogos: "Ayúdame a entender mejor el caso y a tomar una mejor decisión; no me digas qué hacer". |
| Administrador | `admin` | Gestionar usuarios, equipo tratante, egresos, **marcas de opt-out** (cuyo consentimiento de origen reposa en el sistema externo) y la política de retención. |
| Entidad médica / colaboradores | Externo | Proveer datos reales anonimizados para calibración y pruebas, bajo un contrato o convenio marco. **Custodia los consentimientos firmados en su propio sistema** y comunica las exclusiones (opt-out), que el administrador registra en OncoLens. |

**Piloto inicial:** 10 oncólogos, acceso por red privada o VPN.

### 1.3 Propuesta de valor
OncoLens **reconstruye el caso del paciente** a partir de sus documentos, en un timeline verificable con tratamientos previos y trayectorias, **señala los datos críticos que faltan** y, ante una pregunta clínica, presenta un **análisis de evidencia** con tres partes:
1. una **síntesis** de lo que dicen las fuentes, con sus acuerdos y discrepancias;
2. la **aplicabilidad** de cada fuente al paciente, criterio a criterio;
3. las **opciones terapéuticas descritas en la evidencia**, ordenadas por aplicabilidad.

Cada afirmación tiene una **cita verificable** o un enlace a su dato de origen. Lo que no supera la verificación se muestra aparte, solo para revisión. La incertidumbre se declara en la **Base del análisis**. OncoLens **no prescribe ni decide**: el oncólogo decide.

**Principios de producto (no negociables):** PP-1 ayuda a entender y decidir, no prescribe · PP-2 primero el paciente, después el documento · PP-3 aplicabilidad antes que relevancia · PP-4 toda afirmación tiene un origen verificable · PP-5 la incertidumbre se declara · PP-6 el humano decide y puede continuar (los avisos clínicos no bloquean) · PP-7 la privacidad no se negocia por funcionalidad.

### 1.4 Objetivo de esta versión
Entregar un **MVP académico, con potencial de convertirse en apoyo clínico real**, que:
1. demuestre de punta a punta el ciclo **caso reconstruido → datos faltantes → análisis de evidencia aplicable → decisión del oncólogo**, con datos sintéticos (Sprints 1–4);
2. elimine la captura manual de datos mediante OCR local con normalización terminológica (Sprint 2);
3. esté listo para un **piloto con 10 oncólogos y datos reales** (anonimizados e identificados) después del Sprint 5, con los controles de privacidad y autorización completos;
4. **mida si el apoyo de la IA mejora el análisis del oncólogo** (métricas de valor, §2.2).

**Alcance clínico:** cáncer de **mama** y de **próstata**. **Leucemia** entra como tercer tipo cuando cumpla su criterio de "listo" (RN-20). La captura de datos de menores se mantiene desde el MVP.

---

## 2. Objetivos y métricas

### 2.1 Métricas técnicas y de calidad

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| G-1 | Recorrido completo login → paciente → caso → pregunta → análisis de evidencia citado | Criterios de aceptación de HU-01, HU-02, HU-03, HU-06 y HU-07 en demo (S1); HU-15 a HU-26 en la demo del S4 | 100% |
| G-2 | Cero opciones u otras afirmaciones generadas sin respaldo | Opciones, afirmaciones de síntesis, de aplicabilidad y del resumen del caso mostradas con ≥1 cita o enlace **y** chequeo de soporte superado | 100% |
| G-3 | Recuperación de evidencia de calidad, incluso entre idiomas | Recall@10 total / de español a inglés; MRR | ≥ 0,80 / ≥ 0,70; ≥ 0,60 *(metas iniciales, se ajustan con el baseline)* |
| G-4 | Respuestas fieles a la evidencia | Fidelidad por afirmación; precisión de citas; exactitud de "sin evidencia" | ≥ 0,90 cada una *(iniciales)* |
| G-5 | Respuesta en tiempo razonable | p95 del análisis de evidencia | ≤ 15 s *(a calibrar; se recalibra en el S4 con síntesis, aplicabilidad, memoria y búsqueda complementaria; decide el ADR de streaming de progreso)* |
| G-6 | Ingesta sin captura manual | Exactitud de OCR por campo crítico / no crítico; p95 por documento | ≥ 95% / ≥ 90%; ≤ 60 s |
| G-7 | Datos extraídos confiables | Exactitud real de los datos marcados `auto_aceptado` | ≥ 98% (si no se cumple, se sube el umbral de confianza alta) |
| G-8 | Privacidad hacia la IA | Sensibilidad del detector de PII sobre identificadores directos; datos reales enviados a la nube | ≥ 0,95; 0 |
| G-9 | Acceso correcto | Endpoints de paciente que validan el equipo tratante; generaciones con IA sobre pacientes con opt-out de análisis IA registrado | 100%; 0 (Sprint 5) |
| G-10 | Operable y auditable | Servicios con `/health` y `/metrics`; requests con `traceId`; *mutation score* sobre auth, autorización y cifrado | 100%; 100%; ≥ 70% (Sprint 6) |
| G-11 | Caso reconstruido fiel | Eventos del set de referencia extraídos correctamente (tipo y fecha); eventos y valores con origen resoluble | ≥ 95% *(propuesta)*; 100% |
| G-12 | Datos faltantes detectados | Sensibilidad / especificidad sobre faltantes sembrados | ≥ 0,95 / ≥ 0,90 *(propuestas)* |
| G-13 | Normalización y reconciliación | Conceptos mapeados correctamente a CIE-10/LOINC/CUPS/ATC; duplicados fusionados; conflictos detectados; fusiones incorrectas | ≥ 95% *(propuesta)*; ≥ 95%; 100%; 0 |
| G-14 | Lenguaje no prescriptivo | Salidas generadas o textos de UI con términos prescriptivos prohibidos (RN-23) | 0 |
| G-15 | Valor clínico demostrado | Métricas VM-1 a VM-6 (§2.2) | Metas fijadas antes del S1 junto con el protocolo (TBD-11) |
| G-16 | Búsqueda complementaria útil (FR-30) | Criterios de aplicabilidad que pasan de "Desconocido: no reportado por la fuente" a un estado evaluado gracias a la búsqueda complementaria | Se mide en el S4; meta tras el baseline *(propuesta: ≥ 20%)* |

### 2.2 Métricas de valor clínico (D-04)

Responden a la pregunta del proyecto: **¿el apoyo de la IA mejora el análisis del oncólogo?** Siguiendo D-04, cada métrica deja identificado **qué falta definir** y una **sugerencia** de partida. Todo queda sujeto a TBD-11.

| ID | Métrica | Sugerencia de medición | Meta sugerida | Qué se debe definir |
|---|---|---|---|---|
| VM-1 | Tiempo para reconstruir el caso | Sesión cronometrada: manual vs. OncoLens, sobre el mismo caso sintético estandarizado | Reducción de la mediana ≥ 50% | Casos estandarizados (sugerido: ≥ 6, 3 de mama y 3 de próstata); qué cuenta como "caso reconstruido" (checklist de preguntas del Discovery P1); orden de las condiciones para evitar el sesgo de aprendizaje; participantes |
| VM-2 | Tiempo hasta encontrar evidencia aplicable | Desde la pregunta hasta que el oncólogo identifica la evidencia que considera aplicable | Reducción de la mediana ≥ 50% | Preguntas de referencia por caso; criterio de "evidencia aplicable encontrada"; herramientas permitidas en la condición manual |
| VM-3 | Concordancia en aplicabilidad | El oncólogo revisa una muestra de tablas de aplicabilidad | ≥ 85% de los criterios | Tamaño de la muestra; si revisa uno o dos oncólogos (y concordancia entre ellos); tratamiento de "Parcial" |
| VM-4 | Utilidad percibida por análisis | Calificación de 1 a 5 al cerrar cada análisis, opcional y en un clic | ≥ 70% de los análisis con ≥ 4 | Escala y redacción de la pregunta; tasa mínima de respuesta para que la métrica sea válida |
| VM-5 | Faltantes útiles | En el piloto, % de análisis en los que el oncólogo confirma que el aviso de faltantes fue correcto y útil | ≥ 80% | Momento de la confirmación; cómo distinguir "correcto" de "útil" |
| VM-6 | Verificabilidad y no prescripción percibidas | Encuesta al final del piloto: "Pude verificar el origen de lo que me mostró OncoLens" y "Sentí que OncoLens me indicaba qué tratamiento dar" (R-17) | ≥ 80% de acuerdo en la primera; ≤ 20% en la segunda | Instrumento (escala Likert sugerida); otras preguntas de confianza |

**Baseline:** antes de cerrar el Sprint 1 se mide la condición manual de VM-1 y VM-2 con los oncólogos asesores (FR-20).

**Regla (R-15):** las metas de VM-1 a VM-6 se fijan **antes del S1**, junto con el protocolo (TBD-11), y no se modifican después de ver los resultados.

---

## 3. No-objetivos

- Estimar la **probabilidad de éxito** o el pronóstico de un tratamiento.
- **Prescribir** o tomar decisiones clínicas autónomas: toda salida requiere validación del oncólogo tratante y se redacta como evidencia descrita, no como indicación (RN-23).
- Reentrenar modelos (*fine-tuning*). En este proyecto, "entrenamiento" significa **calibrar y evaluar**.
- Streaming de tokens del LLM al navegador.
- Despliegue en la nube, multi-institución o acceso desde internet.
- Enviar datos reales (anonimizados o identificados) a proveedores de IA en la nube.
- **Puntaje de solidez clínica de la evidencia** (ADR futuro, TBD-09). El MVP muestra etiquetas factuales (diseño, endpoint, n, fecha), no un puntaje.
- Datos bioinformáticos crudos (TCGA/GDC, cBioPortal, TCIA): solo entran sus publicaciones y resúmenes.
- Datos de contacto del paciente (teléfono, dirección, etc.): la identidad se limita a documento y nombres.
- **Reporte a la Cuenta de Alto Costo (CAC):** el MVP normaliza con CIE-10, LOINC, CUPS y ATC, pero no genera, exporta ni envía el reporte CAC (D-10).
- **Integración con la historia clínica electrónica institucional (HCE/FHIR):** la "historia del paciente" de este PRD es la que se mantiene dentro de OncoLens (D-11).

**Post-MVP (visión, fuera de esta versión, ver [`TO-BE.md`](TO-BE.md)):**
- CAP-12 Exploración de cohortes históricas y CAP-13 outcomes longitudinales de cohorte. El MVP solo guarda el snapshot longitudinal (FR-14).
- CAP-14 Paquete para comité de tumores.
- CAP-15 Preguntas clínicas sugeridas por IA.
- CAP-16 Leucemia y otros tipos de cáncer (RN-20).
- Conversación de varios turnos dentro de un mismo análisis.
- Job automático de retención (FR-17).

---

## 4. Recorridos de usuario

| ID | Recorrido | Pasos |
|---|---|---|
| RU-1 | Acceso | El oncólogo inicia sesión → llega al listado de pacientes → cierra sesión o la sesión expira. |
| RU-2 | Registro de paciente | "Nuevo paciente" → formulario mínimo (documento, nombres, año de nacimiento, sexo, origen del dato, referencia del convenio; representante legal si es menor; sin captura de consentimientos, que reposan en el sistema externo) **o** sube un PDF y confirma los datos que sugiere el OCR → el paciente queda creado con un episodio abierto. |
| RU-3 | Ficha del paciente | Busca por documento o por nombre → ve identificación, diagnóstico (con su sistema de estadificación y código CIE-10), estado funcional y biomarcadores con semáforo, unidad, rango, **tendencia**, origen, confianza y estado de revisión → abre el documento de origen de cualquier valor. |
| RU-4 | Carga de documentos | Sube uno o **varios** PDF (carga múltiple) → ve el estado de cada uno (pendiente → procesando → completado, error o cuarentena) → los datos aparecen etiquetados y normalizados en la ficha y en la vista de caso. |
| RU-5 | Revisión de datos extraídos | Ve el contador de pendientes → verifica, corrige o rechaza cada dato → confirma o descarta los diagnósticos y valores **en conflicto** → mapea los términos **no mapeados**. |
| RU-10 | **Vista de caso** | Abre la vista de caso → ve el **timeline** de eventos, los **tratamientos previos** por línea, las **series** de biomarcadores (PSA siempre como serie) y el **checklist de datos críticos** → pide el **resumen del caso** verificable → carga o registra lo que falta. |
| RU-6 | Análisis de evidencia | Desde la vista de caso, ve los **datos críticos faltantes** y elige "Cargar información" o "Continuar con aviso" → escribe una pregunta en español o en inglés, o parte de una **plantilla** → elige fuentes y filtros → recibe la **síntesis** (acuerdos y discrepancias), la **tabla de aplicabilidad** por fuente, hasta 3 **opciones descritas en la evidencia** (1 en los Sprints 1–3) ordenadas por aplicabilidad (con el criterio de orden visible), con citas, vigencia y avisos, y la **Base del análisis**, incluida la búsqueda complementaria si se ejecutó (FR-30) → ve aparte lo descartado → o recibe "sin evidencia suficiente" o "tipo de cáncer fuera del alcance del piloto". |
| RU-7 | Historial, decisión y evolución | Consulta los análisis previos (con la marca **"Desactualizado"** si cambiaron sus datos) → re-ejecuta y compara → registra el tratamiento decidido, opcionalmente vinculado a un análisis → **registra la evolución** (respuesta, toxicidad, progresión; solo con el paciente activo), que entra al timeline y al contexto de los análisis siguientes → califica la utilidad del análisis. |
| RU-8 | Ciclo de vida | El tratante principal egresa al paciente (se guarda el snapshot longitudinal si no hay opt-out de investigación) → mientras está egresado no admite registros → reactivación en un reingreso → baja total si se solicita. |
| RU-9 | Administración | El administrador gestiona usuarios (CLI) y el equipo tratante; **registra o revoca marcas de opt-out** (análisis IA, investigación) con la referencia al sistema externo; revisa los pacientes que cumplieron la mayoría de edad para que ratifiquen su consentimiento en el sistema externo. |

---

## 5. Requisitos funcionales

> Formato: descripción · valor · comportamiento · bordes y errores · criterios de aceptación (CA) · sprint · referencia en el README. Los IDs `CAP-xx` y `T-x` remiten a [`TO-BE.md`](TO-BE.md) y a los criterios de aceptación de la §18.

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
  - Tipos de documento habilitables: cédula de ciudadanía, **tarjeta de identidad** (se mantiene, D-14), cédula de extranjería y pasaporte (el país emisor solo en los dos últimos).
  - Documento y nombres se guardan cifrados.
  - **No se capturan consentimientos** (R-11): se firman y guardan en el sistema externo de la entidad médica. El formulario registra la **referencia del convenio** (`agreement_reference`), que habilita la presunción de consentimiento (RN-15).
  - Registra el origen del dato.
- **Bordes:**
  - Identificación ya existente → `409` con la opción de abrir o reactivar el paciente.
  - Tarjeta de identidad sin representante legal registrado → `422`.
  - Paciente real sin referencia de convenio → `422`.
  - El OCR nunca crea pacientes sin confirmación.
- **CA:** HU-07 y HU-08.
- **Sprint:** 1 (manual), 2 (asistido). **README:** §3.2, §4.1.

### FR-04 — Ficha del paciente
- **Descripción:** identificación, diagnóstico vigente, estado funcional, biomarcadores recientes, contador de datos pendientes de revisión y acceso a la vista de caso (FR-21).
- **Comportamiento:**
  - "Reciente" = último valor por biomarcador, **junto con su tendencia** respecto del valor anterior (↑, ↓, =) cuando hay dos o más valores. "=" (estable) significa un cambio menor que el **umbral de cambio definido por biomarcador en el catálogo** (R-24).
  - Diagnóstico con su código **CIE-10** y biomarcadores con su código **LOINC** cuando están mapeados (FR-22).
  - Cada dato muestra su origen, confianza y estado de revisión.
  - Cada lectura de la ficha se audita.
  - Si el tipo de cáncer no está habilitado, la ficha lo indica.
- **Bordes:** `404` si el paciente no existe; `403` si el doctor no está en el equipo tratante (Sprint 5).
- **CA:** HU-02 y HU-05; AC-02.4.
- **Sprint:** 1–2. **README:** §4.1.

### FR-05 — Carga de documentos clínicos
- **Descripción:** carga de uno o **varios** PDF (historia clínica o examen) con extracción asíncrona (CAP-01).
- **Comportamiento:** cada PDF se valida por *magic bytes*, con un máximo de 20 MB; el binario se guarda en el almacén clínico; respuesta `202`. La **carga múltiple** usa `POST …/documents/batch` (R-07): se crea un `Document` por archivo con su propio estado, la respuesta es `207` con el resultado de cada archivo, y el fallo de uno no detiene los demás.
- **Bordes:**
  - Formato inválido → `422`.
  - Archivo duplicado (checksum) → `409`.
  - Paciente egresado → `422`.
- **CA:** HU-04; AC-01.2.
- **Sprint:** 2. **README:** §2.1 Flujo 1, OL-05.

### FR-06 — Extracción con confianza, normalización y gate de PII
- **Descripción:** extracción local del contenido, con una etiqueta de confianza por campo, incluidos **eventos clínicos fechados** y **tratamientos previos** (CAP-01, CAP-02).
- **Comportamiento:**
  - Capa de texto digital, y OCR solo en las páginas escaneadas.
  - Detección de PII según la clase de datos.
  - Estructuración con el LLM local: diagnóstico, exámenes, biomarcadores, notas, **eventos** (diagnóstico, cirugía, procedimiento, inicio y fin de tratamiento, respuesta, progresión, toxicidad, recaída) y **tratamientos previos** (línea, esquema, fechas, motivo de fin).
  - **Propuesta de códigos** contra el catálogo versionado (CIE-10, LOINC, CUPS y ATC), con su confianza. La normalización final la decide Backend 1 (FR-22, R-04).
  - Extracción de los **atributos clínicos** del catálogo (por ejemplo, estado menopáusico, histología, grado, sitios metastásicos) hacia su campo de destino (R-02).
  - **Confianza por campo** (alta, media o baja), calculada con señales deterministas: calidad de lectura, anclaje en el texto, validación de dominio y consistencia.
  - Origen del semáforo: documento, regla o inferencia de IA.
  - Posición del valor en el documento (`source_span`).
  - Persistencia en una transacción.
- **Bordes:**
  - PII inesperada en datos sintéticos o anonimizados → `cuarentena_pii`, sin persistir datos.
  - Identidad del documento distinta de la del paciente → `requiere_revision_identidad`.
  - Documento ilegible → `error`; timeout → reintento, hasta 3 veces.
  - Reiniciar el servicio nunca deja un documento colgado.
  - Reprocesar no duplica datos.
- **CA:** OL-05; AC-01.3.
- **Sprint:** 2. **README:** §3.2, OL-05.

### FR-07 — Visor del documento de origen
- **Descripción:** desde cualquier dato extraído, evento o afirmación del resumen, abrir el PDF en la página del valor, con el fragmento resaltado.
- **Comportamiento:** el PDF se sirve en *streaming* a través de `web`, sin caché, y cada apertura se audita. Un dato con varias fuentes (FR-22) permite abrir cualquiera de ellas.
- **CA:** HU-05, escenario 1.
- **Sprint:** 2. **README:** §4.1.

### FR-08 — Revisión de datos extraídos
- **Descripción:** verificar, corregir o rechazar cualquier dato extraído, incluidos eventos, tratamientos previos y mapeos terminológicos.
- **Comportamiento:**
  - Una corrección crea un dato `manual_correction` y el original pasa a reemplazado.
  - Los datos rechazados no entran al RAG.
  - **Diagnóstico en conflicto:** con fecha anterior al vigente → histórico; con fecha posterior o sin fecha confiable → pendiente de revisión, y el oncólogo lo confirma o lo descarta.
  - **Valores en conflicto** (FR-22) y **términos no mapeados** se resuelven aquí.
- **CA:** HU-09.
- **Sprint:** 3. **README:** §3.2, §3.3 #12.

### FR-09 — Análisis de evidencia (RAG)
- **Descripción:** pregunta clínica en lenguaje natural sobre un paciente, con fuentes y filtros, que devuelve un **análisis de evidencia** (D-01) con síntesis, aplicabilidad, opciones descritas en la evidencia y Base del análisis (CAP-06, CAP-10).
- **Comportamiento:**
  - La pregunta es libre (diagnóstico, secuencia, toxicidad, valor de un biomarcador o tratamiento) o parte de una plantilla (FR-28).
  - Contexto clínico **etiquetado** (confianza y revisión) y **desidentificado**, que incluye: diagnóstico (con histología y grado), **atributos clínicos**, biomarcadores con su **tendencia**, **línea de tratamiento actual y tratamientos previos**, **eventos relevantes** con fechas relativas, **datos críticos faltantes** (FR-23) y **análisis previos y evolución** rotulados (FR-29).
  - Expansión bilingüe de la pregunta.
  - Recuperación *dense* (y *sparse* desde el Sprint 3) con filtros de vigencia, fuente, tipo de cáncer y población.
  - *Reranker* y umbral de relevancia.
  - Generación en el idioma de la pregunta de: síntesis (FR-24), aplicabilidad (FR-25) y opciones descritas; **búsqueda complementaria acotada** si quedan criterios sin evidencia (FR-30, desde el S4).
  - Validación de citas y **chequeo de soporte estricto** para toda afirmación, incluidas las de población del estudio.
  - **Orden de las opciones por aplicabilidad** (RN-28); la relevancia queda como metadato secundario (RN-03).
  - La sección de opciones aparece solo si la evidencia describe opciones terapéuticas.
  - Máximo 1 opción en los Sprints 1–3 y hasta 3 desde el Sprint 4.
  - Respuesta JSON completa (`EvidenceAnalysis`); se persiste antes de responder.
- **Bordes:**
  - Sin evidencia → `status: sin_evidencia`, sin invocar al LLM, con la Base del análisis (FR-27).
  - Tipo de cáncer no habilitado → `tipo_no_habilitado`, sin invocar al LLM.
  - `403` si el paciente tiene **opt-out de análisis IA** registrado o si el doctor no pertenece al equipo tratante (Sprint 5).
  - `422` si el paciente está egresado.
  - `429` por límite de consultas o cola de inferencia.
  - `503` si el LLM local no está disponible, **sin respaldo en la nube** para datos reales.
  - `504` si vence el tiempo máximo.
  - `500` si falla la persistencia, sin mostrar el resultado.
- **CA:** HU-03, HU-10; AC-06.x y AC-10.x.
- **Sprint:** 1 (dense, 1 opción, contrato `EvidenceAnalysis`), 3 (híbrida), 4 (síntesis, aplicabilidad, hasta 3, búsqueda complementaria). **README:** §2.1 Flujo 2, §4.

### FR-10 — Opciones descartadas visibles para revisión
- **Descripción:** lo que no supera la validación nunca se muestra como válido (R-21).
- **Comportamiento:**
  - **Opciones** sin soporte → sección colapsada "Descartadas por falta de soporte — solo para revisión", con el motivo y las afirmaciones sin soporte resaltadas. No cuentan como opciones y no pueden vincularse a un tratamiento.
  - **Afirmaciones sueltas** (síntesis, aplicabilidad, resumen del caso, supuestos, limitaciones) sin soporte → se **omiten** y se cuentan en la Base del análisis (`omittedClaims`), sin mostrar su texto.
- **CA:** HU-03, escenario 3.
- **Sprint:** 1.

### FR-11 — Avisos de datos no verificados
- **Descripción:** si una opción o un criterio de aplicabilidad depende de datos pendientes de revisión, **en conflicto** o **faltantes**, se indica en su tarjeta.
- **Comportamiento:** el sistema lo calcula de forma determinista, sin depender del LLM. Los avisos **no bloquean** (RN-26).
- **Sprint:** 2 (pendientes), 3 (conflicto y faltantes).

### FR-12 — Historial de análisis
- **Descripción:** listar y consultar los análisis previos de un paciente (CAP-11).
- **Comportamiento:**
  - Las citas se muestran desde su snapshot, junto con el contexto enviado, los modelos usados y la versión del corpus.
  - **Dos marcas distintas** (R-10):
    - **"Desactualizado: datos del paciente"** si, después de ejecutarlo, se agregó, corrigió o rechazó algún dato que usó (comparación determinista contra la huella de su contexto), con la lista de cambios. Se propaga en cascada a los análisis que lo usaron como memoria (FR-29).
    - **"Evidencia o catálogo más reciente disponible"** si cambió la versión del corpus (`CorpusRelease`) o del catálogo clínico desde que se ejecutó.
  - Aplica a los análisis de evidencia y a los resúmenes del caso.
  - **Re-ejecutar** crea un análisis nuevo con los datos actuales; el anterior no cambia.
  - **Comparar** muestra opciones nuevas o eliminadas y criterios de aplicabilidad que cambiaron.
- **CA:** HU-11, HU-24; AC-11.2, AC-11.3.
- **Sprint:** 4.

### FR-13 — Registro de la decisión de tratamiento
- **Descripción:** registrar el tratamiento decidido por el doctor.
- **Comportamiento:** con vínculo opcional al análisis que lo originó, nunca a una opción descartada. Fármacos normalizados con ATC. La decisión aparece en el timeline como evento **derivado** "Decisión registrada en OncoLens" (FR-21, R-03).
- **CA:** HU-12; AC-11.4.
- **Sprint:** 4.

### FR-14 — Ciclo de vida: egreso, reactivación y bajas
- **Descripción:** egresar, reactivar y registrar bajas del paciente.
- **Comportamiento:**
  - El egreso lo ejecutan el tratante principal o un administrador y guarda el **snapshot longitudinal** de investigación si no hay **opt-out de investigación** registrado: secuencia de líneas, respuestas, progresiones y decisiones con fechas relativas y códigos normalizados, sin identidad ni texto libre (preparación de CAP-12/13, D-12).
  - La reactivación abre un episodio nuevo y conserva la historia.
  - **Opt-out de investigación** registrado por el administrador (FR-16): borra el histórico, igual que la antigua baja de investigación.
  - **Baja total:** borra la identidad, los representantes, el histórico y los PDFs, seudonimiza el resto y el paciente sale de OncoLens. Es irreversible y requiere confirmación explícita.
- **CA:** HU-13; AC-P.1.
- **Sprint:** 4.
- **Paciente egresado (R-11):** no admite análisis, resúmenes, cargas ni registro de evolución hasta su reactivación (RN-17).

### FR-15 — Equipo tratante y autorización por paciente
- **Descripción:** varios doctores activos por paciente, uno de ellos principal.
- **Comportamiento:** todos los endpoints de paciente validan la pertenencia al equipo, salvo el rol `admin`.
- **CA:** HU-14; KR1 del Sprint 5.
- **Sprint:** 5.

### FR-16 — Consentimientos externos y marcas de opt-out
- **Descripción:** los consentimientos (`analisis_ia`, `investigacion`) se **firman y custodian en el sistema externo** de la entidad médica. OncoLens **no los captura**. En el MVP se **asume opt-out** (R-11): todo paciente cargado bajo un convenio registrado se considera incluido, salvo que tenga una marca de opt-out.
- **Comportamiento:**
  - Solo el **administrador** registra o revoca una marca de opt-out (`analisis_ia` o `investigacion`), con la referencia al documento del sistema externo, la fecha y el motivo de catálogo. Cada marca es un evento auditado; la vigente es la última de cada tipo.
  - **Opt-out de análisis IA:** bloquea toda generación con IA sobre el paciente (análisis, resumen del caso, re-ejecución) con `403` (RN-15). No afecta la ficha, la vista de caso ni la carga de documentos.
  - **Opt-out de investigación:** borra el histórico de investigación y evita el snapshot al egresar (FR-14).
  - **Menores:** el representante legal se sigue registrando (identidad cifrada, vigencia), pero su firma reposa en el sistema externo. Al cumplir la mayoría de edad (edad configurable), el **job de mayoría de edad** (se mantiene, D-14) marca al paciente "requiere ratificación" para que el administrador gestione la ratificación en el sistema externo; mientras tanto se mantiene la presunción.
- **Bordes:** registrar un opt-out con un análisis en curso no lo interrumpe, pero bloquea los siguientes.
- **CA:** HU-13 (opt-out en UI de administración), HU-14.
- **Sprint:** 1 (datos), 4 (UI de administración de opt-out), 5 (validación en todos los endpoints de IA y job de mayoría de edad).

### FR-17 — Retención de datos
- **Comportamiento:**
  - Hasta 10 años desde la aceptación del contrato o la primera cita (la más temprana).
  - Renovación automática hasta 20 años si no hay baja.
  - Al vencer, la misma acción que la baja total.
  - No aplica a los datos sintéticos ni a los anonimizados.
  - **MVP (D-15):** se registran la política y los campos `retention_*` desde el alta. Durante el piloto ningún dato llega a vencer, así que el **job diario auditado con aviso a 90 días se difiere a Post-MVP**, sujeto a validación legal (TBD-16).
- **Sprint:** 1 (campos y política); job en Post-MVP.

### FR-18 — Auditoría
- **Descripción:** registro de accesos y acciones.
- **Comportamiento:** registra lectura de la ficha y de la **vista de caso**, generación del **resumen del caso**, análisis de evidencia y **re-ejecuciones**, carga, apertura del documento de origen, revisión, **registro de evolución**, **búsquedas complementarias**, **marcas de opt-out**, bajas, renovaciones y borrados; **nunca** guarda PHI ni identidad (solo UUID).
- **Sprint:** 2 (accesos), 5 (completa).

### FR-19 — Corpus científico
- **Descripción:** ingesta de **fuentes públicas de acceso abierto**, solo textuales, con licencia registrada y **aceptada** (D-09, R-12).
- **Comportamiento:**
  - Fuentes del MVP: NCI PDQ, ClinicalTrials.gov, PubMed/PMC (subconjunto de acceso abierto), guías de práctica clínica públicas y publicaciones de TCGA/GDC, cBioPortal y TCIA. La lista final la fija el ADR de fuentes (TBD-04).
  - **Licencias aceptadas (R-12, ADR-36):** dominio público, **CC BY** y **CC BY-SA**. **CC BY-NC** solo para el MVP académico, documentado y marcado en el catálogo. **Excluidas:** licencias ND y "libre lectura" sin licencia de reutilización. Cada documento guarda su `license_class`. La ingesta de resúmenes de PubMed sin licencia explícita queda por decidir en el ADR-36 (TBD-04).
  - Normalización, fragmentación, *embedding* multilingüe (dense + sparse) y versionado reanudable; se conserva el histórico.
  - **Metadatos estructurados por documento** (prerrequisito de FR-24, FR-25 y FR-26): tipo y diseño del estudio, fase, endpoint principal, tamaño de muestra, **criterios de población** estructurados (subtipo, estadio o extensión, línea o tratamiento previo, biomarcadores, edad o estado menopáusico, estado funcional), fecha de publicación o actualización y versión de la guía. Se toman de la fuente cuando la publica en forma estructurada (por ejemplo, ClinicalTrials.gov) o se extraen al ingerir con verificación (R-16): **`extraido_verificado` = extracción con el LLM + chequeo NLI de cada metadato contra el texto de la fuente + revisión humana de una muestra** (propuesta: 10% por lote de ingesta; TBD-20). Un dato no disponible o que no pasa el NLI queda como `no_disponible`.
  - Catálogo en el schema `corpus` de PostgreSQL, con **fecha de corte** del corpus versionada.
- **Bordes:** un documento sin licencia registrada, o con una licencia no aceptada, se rechaza. **NCCN y ESMO no bloquean el MVP**: se incorporan si se gestiona su licencia, en el MVP o en una versión futura.
- **CA:** KR3 del Sprint 3; M-08.3 (la meta se revisa con el baseline del corpus, R-16).
- **Sprint:** 1 (semilla y esquema de metadatos), 3 (ingesta como entregable).

### FR-20 — Evaluación de calidad de la IA y del valor clínico
- **Descripción:** suite de evaluación reproducible, con baseline en el Sprint 1, más la medición de las métricas de valor (T-5).
- **Comportamiento:**
  - Es obligatoria en cada cambio de modelo, prompt, umbral, **catálogo** o corpus.
  - Métricas de G-3, G-4, G-6, G-7, G-8, **G-11 a G-14**, **G-16** y la **exactitud de los metadatos del corpus** (sobre la muestra revisada de R-16), con datasets sintéticos para eventos y timeline, duplicados y conflictos, normalización, faltantes sembrados, discrepancias sembradas y aplicabilidad con verdad conocida.
  - **Baseline manual de VM-1 y VM-2** antes de cerrar el Sprint 1, y medición de VM-1 a VM-6 según §2.2 (TBD-11).
- **CA:** OL-06; AC-T5.x.
- **Sprint:** 1 y continuo.

### FR-21 — Reconstrucción del caso (CAP-02) · *nuevo en v1.1*
- **Descripción:** vista de caso centrada en el paciente: timeline, tratamientos previos, series de biomarcadores y resumen verificable (D-02, JTBD 1 y 7).
- **Valor:** reemplaza la reconstrucción manual del caso, el dolor "transversal más fuerte" del Discovery.
- **Comportamiento:**
  - **Timeline:** eventos ordenados por fecha, con tipo, fecha y precisión (día, mes o año), origen, confianza y revisión; los eventos sin fecha confiable van a una sección aparte y suman a pendientes.
  - **Fuente de verdad del timeline (R-03, ADR-32):** los eventos de entidades con tabla propia se **derivan** en la vista y no se duplican: diagnóstico (`Diagnosis`), examen (`Exam`), inicio y fin de tratamiento previo (`PriorTreatment`), decisión (`Treatment`) y análisis o resumen (`AIAnalysisRecord`). `ClinicalEvent` **solo guarda** los tipos sin tabla propia: cirugía, procedimiento, respuesta, progresión, toxicidad, recaída y otra evolución.
  - **Tratamientos previos** (`PriorTreatment`) agrupados por línea: esquema (ATC), entorno (neoadyuvante, adyuvante, metastásico…), inicio, fin o "en curso" y motivo de fin. Se distinguen de las decisiones registradas en OncoLens.
  - **Series de biomarcadores:** todos los valores fechados en gráfico y tabla; en próstata el **PSA siempre como serie**.
  - **Resumen del caso** generado a pedido: cada afirmación enlaza a uno o más datos, eventos o documentos y pasa el chequeo de soporte sobre datos estructurados (RN-01, ADR-34): el dato referenciado se **verbaliza con una plantilla determinista** y la afirmación se verifica con NLI contra ese texto. Lo que no pasa se omite y se cuenta. Muestra el aviso de RN-19 **más** "Verifique contra las fuentes", con la fecha de los datos (R-22). Se persiste como análisis de tipo `resumen_caso`. Exige que el paciente no tenga opt-out de análisis IA (RN-15) y esté activo (RN-17).
  - Los datos rechazados o reemplazados no aparecen.
  - Los análisis, las decisiones y la evolución registrada también aparecen en el timeline (FR-29).
  - **Atributos clínicos** (`ClinicalAttribute`, R-02) visibles en la vista de caso con su origen.
- **CA:** HU-15, HU-16; AC-02.1 a AC-02.6; G-11.
- **Sprint:** 1 (esquema), 2 (vista, extracción y resumen; R-23). **README:** §3.1, §4.1, HU-15.

### FR-22 — Reconciliación y normalización terminológica (CAP-03) · *nuevo en v1.1*
- **Descripción:** detectar datos repetidos y en conflicto entre documentos y normalizar con estándares (D-10).
- **Comportamiento:**
  - **Estándares:** **CIE-10** para diagnósticos, **LOINC** para exámenes de laboratorio y biomarcadores, **CUPS** (Colombia) para procedimientos y **ATC** (OMS) para medicamentos. Viven en un catálogo terminológico versionado, acotado a mama y próstata, con sinónimos en español e inglés (por ejemplo, "c-erbB-2" → HER2 → código LOINC correspondiente).
  - El dato guarda el código, el término canónico, el texto original y `mapping_status`; aplica a **toda** entidad con códigos (R-19). Un término no reconocido queda `no_mapeado`, pendiente de revisión, sin descartarse.
  - **Ownership (R-04, ADR-33):** Backend 2 **propone** el código durante la extracción, con su confianza; **Backend 1 es dueño de la normalización final** y la aplica también a los datos ingresados a mano (formularios, evolución, tratamientos previos), con la misma versión del catálogo.
  - **Duplicado:** mismo concepto, misma fecha (para biomarcadores, la fecha del examen `Exam.performed_at`) y mismo valor (unidad normalizada) en dos documentos → un solo dato con varias fuentes.
  - **Conflicto:** misma fecha y valores distintos → ambos en `requiere_revision`, marcados "En conflicto" y enlazados; lo que dependa de ellos muestra un aviso hasta resolverlo.
  - Se mantienen el checksum de archivo y la regla de diagnóstico en conflicto (FR-08).
  - **Sin reporte CAC en el MVP** (§3).
- **CA:** HU-17; AC-03.1 a AC-03.5; G-13.
- **Sprint:** 2 (normalización y duplicados), 3 (conflictos y revisión de mapeos). **README:** §3.2, §3.3 #23.

### FR-23 — Información faltante (CAP-04) · *nuevo en v1.1*
- **Descripción:** checklist determinista de datos críticos por tipo de cáncer (D-05, JTBD 2).
- **Comportamiento:**
  - Cada dato crítico aparece como **Presente y verificado**, **Presente sin verificar**, **Faltante** o **No aplica** (regla condicional no cumplida), con acceso directo para cargarlo o registrarlo.
  - Antes de cada análisis, si faltan datos críticos, el sistema los lista y ofrece "Cargar información" o "Continuar con aviso"; **no bloquea** (RN-26).
  - Los faltantes viajan al análisis como "desconocido" y aparecen en la aplicabilidad y en la Base del análisis.
  - Mismo estado y misma versión del catálogo dan el mismo resultado, **sin LLM**.
  - **Todo ítem del catálogo tiene un campo de destino en el modelo de datos (R-02):** histología y grado en `Diagnosis`; estado menopáusico, estado de castración, sitios metastásicos y similares en `ClinicalAttribute`; biomarcadores en `Biomarker`; tratamientos previos en `PriorTreatment`. La matriz "ítem → campo" vive en el catálogo y un ítem sin destino no puede publicarse (regla de validación del catálogo y de la DoD).
  - Las reglas, incluidas las condicionales, viven en el catálogo versionado y las valida el oncólogo (TBD-12). Lista inicial propuesta: mama (histología, grado, TNM, RE, RP, HER2 con ISH condicional, Ki-67, estado menopáusico, ECOG, tratamientos previos si es avanzado, BRCA germinal condicional); próstata (serie de PSA, Gleason/ISUP, TNM, metástasis por imagen, estado de castración condicional, tratamientos previos, ECOG, HRR/BRCA condicional en mCRPC).
- **CA:** HU-18; AC-04.1 a AC-04.4; G-12.
- **Sprint:** 3. **README:** §4.1, HU-18.

### FR-24 — Síntesis de evidencia (CAP-07) · *nuevo en v1.1*
- **Descripción:** síntesis que preserva las diferencias entre fuentes (D-08, JTBD 5).
- **Comportamiento:**
  - Con dos o más fuentes sobre el umbral: secciones **"Puntos de acuerdo"** y **"Discrepancias"**, cada afirmación con cita y chequeo de soporte.
  - Cada discrepancia muestra la diferencia de contexto que la explica (población, endpoint, fecha o diseño) cuando existe en los metadatos; si no, "Causa de la discrepancia no identificada".
  - **Etiquetas factuales por fuente** (tipo y diseño, fase, endpoint principal, n, fecha), copiadas del catálogo, nunca generadas (RN-25).
  - Con una sola fuente: sin sección de discrepancias, y la Base del análisis lo declara.
  - Sin puntaje de solidez clínica (TBD-09).
- **CA:** HU-21; AC-07.1 a AC-07.5.
- **Sprint:** 4. **README:** §4, HU-21.

### FR-25 — Aplicabilidad paciente ↔ evidencia (CAP-08) · *nuevo en v1.1*
- **Descripción:** para cada fuente, comparación criterio a criterio entre el paciente y la población del estudio (D-03, JTBD 4).
- **Comportamiento:**
  - Criterios por tipo de cáncer, definidos en el catálogo (TBD-13): subtipo, estadio o extensión, línea o tratamiento previo, biomarcadores clave, edad o estado menopáusico, estado funcional.
  - Por criterio: valor del paciente, valor de la población del estudio y estado **Coincide / Parcial / No coincide / Desconocido**. Desconocido indica su causa: **falta en el paciente** (enlaza a FR-23) o **no reportado por la fuente**.
  - **Parcial** tiene una definición operativa por criterio en el catálogo (R-24, TBD-13). Por ejemplo: rango del estudio que contiene solo parte del valor del paciente, o subgrupo reportado pero no como población principal.
  - El **valor del paciente** se copia del contexto, nunca lo genera el LLM. El **valor de la población del estudio** sale de los metadatos estructurados o de una afirmación citada que pasa el chequeo de soporte; si no, el criterio queda en Desconocido. Nunca se infiere.
  - Cuando ambos valores son estructurados, el **estado** se calcula de forma determinista con la regla del catálogo; el LLM solo asigna el estado cuando el valor del estudio es textual, y esa asignación también se valida (ADR-34).
  - Un dato del paciente pendiente o en conflicto muestra el aviso de FR-11.
  - El resumen por fuente es un **conteo** (por ejemplo, "4 coinciden · 1 parcial · 1 desconocido"), nunca un número o porcentaje clínico (RN-28).
  - Un criterio marcado como excluyente en el catálogo que queda en No coincide muestra "**Población no comparable**" en la fuente.
  - **Aplicabilidad de una opción (R-01, ADR-31):** la opción **hereda el resumen de su fuente más aplicable** (según el orden de RN-28), muestra **todas** sus fuentes con su propio resumen (`perSource`), y queda marcada "Población no comparable" **solo si todas** sus fuentes lo están.
- **CA:** HU-22; AC-08.1 a AC-08.7; VM-3.
- **Sprint:** 1 (contrato), 4 (funcionalidad). **README:** §4, HU-22.

### FR-26 — Vigencia visible (CAP-09) · *nuevo en v1.1*
- **Descripción:** temporalidad de la evidencia visible para el oncólogo (D-06).
- **Comportamiento:**
  - Cada cita muestra la fecha de publicación o actualización, la **versión** (en guías), el tipo de fuente y el idioma.
  - Cada análisis muestra "Evidencia actualizada al ‹fecha de corte del corpus›".
  - Una fuente con más de N años desde su última actualización se marca "Posiblemente desactualizada" (N configurable; propuesta 5, TBD-15).
  - En el historial, la cita conserva su versión y muestra "Existe una versión más reciente" si la hay.
- **CA:** HU-20; AC-09.1 a AC-09.4.
- **Sprint:** 3.

### FR-27 — Base del análisis (T-2, incertidumbre explícita) · *nuevo en v1.1*
- **Descripción:** bloque presente en **todo** análisis de evidencia, incluido el de "sin evidencia", que declara sobre qué se construyó el análisis y qué no sabe (D-07, D-08).
- **Contenido, forma de construcción y sprint (escalonado, R-06):**

  | Inciso | Contenido | Cómo se construye | Sprint |
  |---|---|---|---|
  | (a) Datos del paciente usados | Lista de los datos del contexto, con su estado de revisión (verificado, sin verificar, en conflicto) y su origen | Determinista, desde el contexto enviado | S1 |
  | (b) Datos críticos faltantes | Faltantes del checklist (FR-23) y si el oncólogo eligió "Continuar con aviso" | Determinista, desde FR-23 | S3 |
  | (c) Supuestos | Supuestos explícitos del análisis. Por ejemplo: "se asume enfermedad no metastásica porque no hay estudios de extensión" | Reglas deterministas del catálogo, ancladas a un faltante. El LLM puede proponer supuestos adicionales, que se aceptan solo si (1) **no son contradichos** por el contexto (NLI ≠ contradicción) y (2) están **anclados a un dato faltante** del checklist (R-05, ADR-34). Se rotulan "supuesto", nunca como hecho. | S3 |
  | (d) Fuentes y filtros consultados | Fuentes seleccionadas, filtros, idioma, número de fuentes recuperadas y sobre el umbral | Determinista | S1 |
  | (e) Fuentes no incluidas | Fuentes que el corpus no contiene (por ejemplo, "NCCN y ESMO no incluidas" mientras aplique RN-21) | Determinista, desde `CorpusRelease` | S1 |
  | (f) Fecha de corte del corpus | Fecha y versión del corpus usadas | Determinista | S1 |
  | (g) Limitaciones | Por ejemplo: "síntesis basada en una sola fuente", "evidencia solo de ensayos fase II", "población del estudio no comparable en el criterio X" | Las estructurales son deterministas; las redactadas por el LLM pasan el chequeo de soporte | S3 |
  | (h) Contexto de análisis previos | Qué análisis previos y qué evolución se usaron como contexto (FR-29), con la marca "contexto, no evidencia" | Determinista | S4 |
  | (i) Búsqueda complementaria | Sub-consultas que ejecutó el agente acotado (FR-30), qué criterio buscaban y si encontraron evidencia | Determinista, desde el registro del agente | S4 |
  | — Afirmaciones omitidas | Número de afirmaciones omitidas por falta de soporte (`omittedClaims`, R-21) | Determinista | S1 |

- **Reglas:**
  - Se muestra siempre con los incisos disponibles en el sprint. El esquema `AnalysisBasis` es final desde el S1, así que no hay migración.
  - Su resumen (número de faltantes, supuestos, fuentes no incluidas y afirmaciones omitidas) es visible sin expandir.
  - Se persiste en el registro del análisis y se muestra igual en el historial.
  - Si el resultado es "sin evidencia", explica qué se buscó y con qué filtros.
- **CA:** HU-20; AC-T2.1 a AC-T2.4.
- **Sprint:** 1 (a, d, e, f y afirmaciones omitidas), 3 (b, c, g), 4 (h, i). **README:** §4.1 (`AnalysisBasis`).

### FR-28 — Plantillas de preguntas clínicas (CAP-05) · *nuevo en v1.1*
- **Descripción:** plantillas por tipo de cáncer y escenario (D-13).
- **Comportamiento:** prellenadas con el contexto del caso, editables antes de enviarlas, configurables y validadas por el oncólogo (propuesta: ≥ 5 por tipo). Las preguntas sugeridas por IA quedan para Post-MVP (CAP-15).
- **CA:** HU-19; AC-05.2.
- **Sprint:** 3.

### FR-29 — Investigación iterativa: historia del paciente y memoria de análisis · *nuevo en v1.1*
- **Descripción:** la investigación clínica es iterativa. Cada análisis, decisión y evolución se documenta en la historia del paciente dentro de OncoLens y alimenta los análisis siguientes (D-11).
- **Comportamiento:**
  - **Documentación en la historia del paciente:** cada análisis de evidencia, cada resumen del caso y cada decisión aparecen en el timeline como eventos **derivados** de sus tablas (FR-21, R-03).
  - **Registro de evolución:** el oncólogo registra progreso y resultados (respuesta al tratamiento, toxicidad con su grado, progresión, recaída, cambio o suspensión de tratamiento), manualmente o desde documentos nuevos. Cada registro es un `ClinicalEvent` vinculado al tratamiento y, si aplica, al análisis que lo originó. **Solo con el paciente activo** (RN-17, R-11).
  - **Memoria de análisis (agente IA):** al ejecutar un análisis nuevo, el contexto incluye los **últimos N análisis de evidencia del paciente** (N configurable; propuesta 3, TBD-14), resumidos (pregunta enmascarada, síntesis breve, opciones descritas, decisión vinculada) y la **evolución registrada después de cada uno**. Alcance (R-09, ADR-35):
    - **por paciente**, no por episodio, para conservar la historia tras una reactivación;
    - incluye los análisis de **todo el equipo tratante**;
    - **excluye** los análisis marcados "Desactualizado: datos del paciente" y los `resumen_caso`;
    - si un análisis usado como memoria queda desactualizado, el que lo usó también queda desactualizado (**cascada**, FR-12).
    - Las decisiones y la evolución registradas por el oncólogo entran como **dato clínico**, con su estado de revisión.
    - Los análisis previos entran **rotulados como "análisis previo de IA"**: son contexto, **nunca evidencia**. No son citables, y una afirmación cuyo único soporte sea un análisis previo se descarta (RN-24).
    - Todo pasa por la misma desidentificación (RN-11).
  - Se mantienen el estado "Desactualizado", la re-ejecución y la comparación (FR-12).
  - La conversación de varios turnos dentro de un mismo análisis queda Post-MVP.
- **CA:** HU-23, HU-24; AC-11.x.
- **Sprint:** 4. **README:** §3.1 (`ClinicalEvent`), §4.

### FR-30 — Agente de análisis acotado: búsqueda complementaria · *nuevo en v1.2*
- **Descripción:** comportamiento agéntico mínimo del MVP (R-13, ADR-37). Después del primer borrador, si quedan criterios de aplicabilidad en "Desconocido: no reportado por la fuente" o puntos de la síntesis sin evidencia, el orquestador **planifica y ejecuta sub-consultas dirigidas** sobre el corpus y vuelve a generar solo los bloques afectados.
- **Comportamiento:**
  - Única herramienta: la **recuperación sobre el corpus** (con los mismos filtros, umbral, *reranker* y validación). El agente no accede a datos clínicos, no navega fuera del corpus y no decide nada clínico.
  - **Límites** (propuestas, TBD-18): máximo **1 iteración adicional** y **3 sub-consultas** por análisis, dentro del *deadline* del análisis. Si el tiempo no alcanza, se devuelve el primer resultado validado.
  - Cada sub-consulta, su objetivo (criterio o punto de síntesis) y su resultado quedan en la Base del análisis (inciso i) y en el registro del análisis.
  - Lo encontrado pasa por la misma validación de citas y chequeo de soporte (RN-01). La memoria sigue sin ser citable (RN-24).
- **Bordes:** sin evidencia nueva → los criterios siguen en Desconocido y se declara en la Base del análisis. El agente nunca se ejecuta si el primer resultado es "sin evidencia" (RN-02).
- **CA:** HU-26; AC-08.7; G-16.
- **Sprint:** 4. **README:** §2.1 Flujo 2, HU-26.


---

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | Toda opción y toda afirmación generada mostrada (síntesis, aplicabilidad, resumen del caso, supuestos, limitaciones) tiene ≥1 cita a un chunk recuperado en la misma consulta, o un enlace a un dato del paciente, **y** supera el chequeo de soporte. Para afirmaciones sobre datos del paciente, el dato se verbaliza con una plantilla determinista y se verifica con NLI contra ese texto (ADR-34). Los supuestos siguen su propia regla (FR-27 inciso c). Si no pasa: una **opción** va a la sección de descartadas; una **afirmación suelta** se omite y se cuenta en `omittedClaims` (R-21). |
| RN-02 | Sin chunks sobre el umbral de relevancia → "sin evidencia", sin invocar al LLM ni al agente (FR-30), persistiendo con `top_relevance_score = null` y con la Base del análisis en los incisos disponibles en el sprint (FR-27, R-06). |
| RN-03 | El puntaje de **relevancia de la evidencia recuperada** lo calcula el *reranker* y se rotula así. Es un **metadato secundario**: no ordena las opciones (RN-28), no mide solidez clínica ni probabilidad de éxito. |
| RN-04 | Los datos de las citas (título, fuente, identificador, texto) se copian del corpus, nunca del texto generado. Se muestran en su idioma original. |
| RN-05 | Solo participan en la recuperación los chunks vigentes (`is_current`). El histórico del corpus nunca se borra. |
| RN-06 | Ningún análisis se muestra sin haber quedado persistido. |
| RN-07 | Todo dato extraído por OCR lleva su confianza y su estado de revisión, y entra al RAG **etiquetado**. Los datos rechazados o reemplazados nunca entran. |
| RN-08 | Un dato extraído nunca reemplaza en silencio a uno verificado. En diagnósticos, la vigencia se decide por fecha (FR-08). |
| RN-09 | El OCR nunca crea pacientes sin la confirmación de un doctor. |
| RN-10 | La identidad (documento y nombres) se guarda cifrada y **nunca** sale del servicio clínico hacia la IA, el histórico, los *logs* ni la auditoría. |
| RN-11 | El contexto enviado a la IA se desidentifica **siempre**: seudónimo aleatorio por consulta, fechas relativas y texto libre enmascarado. Aplica también a eventos, tratamientos previos, faltantes y análisis previos. |
| RN-12 | Los datos reales (anonimizados o identificados) **solo** se procesan con modelos locales. La nube solo se usa con datos sintéticos. |
| RN-13 | Ningún dato real entra a la aplicación antes de completar el Sprint 5 y el gate G-piloto. La calibración con datos reales anonimizados se hace fuera de la aplicación y fuera del repositorio. |
| RN-14 | El repositorio público nunca contiene datos reales ni secretos. |
| RN-15 | **Consentimiento presunto con opt-out (R-11).** Los consentimientos se firman y custodian en el sistema externo. Un paciente con referencia de convenio registrada se considera incluido para análisis con IA e investigación, salvo que el administrador haya registrado una marca de opt-out. **Toda generación con IA** (análisis de evidencia, resumen del caso, re-ejecución, búsqueda complementaria) sobre un paciente con opt-out de `analisis_ia` vigente responde `403`. Sin convenio registrado no se presume consentimiento. |
| RN-16 | Un paciente con tarjeta de identidad requiere al menos un representante legal registrado en OncoLens; la firma del consentimiento reposa en el sistema externo. |
| RN-17 | Solo el tratante principal o un administrador egresan a un paciente. Un paciente egresado **no admite ningún registro** (análisis, resúmenes, cargas ni registro de evolución) hasta su reactivación (R-11). |
| RN-18 | Retención: 10 años, renovable automáticamente hasta 20 si no hay baja. Al vencer o con la baja total se borra la identidad y se seudonimiza el resto. El job automático se difiere a Post-MVP (FR-17). |
| RN-19 | Toda salida generada (análisis, resumen del caso) muestra "**Análisis generado por IA — requiere validación clínica del oncólogo tratante**" y "Uso académico/investigación". El resumen del caso agrega "Verifique contra las fuentes" (R-22). |
| RN-20 | Un tipo de cáncer se habilita solo si cumple su criterio de "listo": catálogo revisado por el oncólogo (incluidos datos críticos, criterios de aplicabilidad y mapeos terminológicos), corpus con licencia (≥ 20 documentos), dataset de evaluación que cumple las metas y documentos de laboratorio típicos cubiertos. |
| RN-21 | Solo se ingieren **fuentes públicas de acceso abierto** con licencia registrada **y aceptada**: dominio público, CC BY, CC BY-SA; CC BY-NC solo en el MVP académico; ND y "libre lectura" excluidas (R-12). NCCN y ESMO quedan excluidas mientras su licencia no se gestione; su ausencia **no bloquea** el MVP y se declara en la Base del análisis. |
| RN-22 | Todo valor marcado "a calibrar" o "propuesta" vive en configuración, no en el código. |
| RN-23 | **Lenguaje no prescriptivo.** El encabezado de las opciones es "Opciones descritas en la evidencia". Ninguna salida generada ni texto de la UI usa formulaciones prescriptivas dirigidas al paciente ("recomendado para este paciente", "debe recibir", "el mejor tratamiento", "indicado para usted"). Se verifica con una lista de términos prohibidos en los tests. |
| RN-24 | Los **análisis previos de IA** pueden entrar como contexto rotulado (FR-29), pero **nunca son citables** ni cuentan como soporte en el chequeo NLI. Las citas solo provienen del corpus; los enlaces solo a datos del paciente. |
| RN-25 | Los metadatos factuales de una fuente (diseño, fase, endpoint, n, fecha, versión, criterios de población) se copian del catálogo del corpus, nunca del texto generado. Un dato ausente se muestra "No disponible". |
| RN-26 | Los avisos clínicos (faltantes, sin verificar, en conflicto, población no comparable, desactualizado) **no bloquean**. Solo bloquean las reglas legales y de acceso: consentimiento, egreso y equipo tratante. |
| RN-27 | Los códigos terminológicos (CIE-10, LOINC, CUPS, ATC) salen de un catálogo versionado. Un término sin mapeo queda `no_mapeado` para revisión y nunca se descarta ni se le asigna un código inventado. |
| RN-28 | **Aplicabilidad sin puntaje clínico.** El resumen de aplicabilidad es un conteo por estado. Las opciones se ordenan de forma determinista: (1) menos criterios excluyentes en No coincide; (2) más criterios en Coincide; (3) mayor relevancia de la evidencia como desempate. Una opción con varias fuentes usa la de mayor aplicabilidad (ADR-31). La UI muestra **visible** el criterio de orden: "Ordenadas por coincidencia con la población estudiada, no por eficacia" (R-17). |
| RN-29 | Todo ítem de un catálogo clínico (dato crítico o criterio de aplicabilidad) tiene un campo de destino en el modelo de datos; un catálogo con ítems sin destino no se publica (R-02). |
| RN-30 | El límite de consultas por usuario (6 por minuto y 1 en curso por usuario y paciente) y el semáforo de inferencia aplican a **toda** generación con IA: análisis, resumen del caso y re-ejecución (R-25, R-30). |

---

## 7. Requisitos no funcionales

| Categoría | Requisito | Meta |
|---|---|---|
| Rendimiento | Análisis de evidencia de punta a punta | p95 ≤ 15 s *(a calibrar; se recalibra con síntesis y aplicabilidad en el S4)*; tiempo máximo hacia Backend 2: 30 s |
| Rendimiento | Extracción por documento | p95 ≤ 60 s |
| Rendimiento | Ficha, listado y vista de caso (sin generar resumen) | p95 ≤ 1 s ficha y listado; ≤ 2 s vista de caso *(propuesta)* |
| Capacidad | Usuarios del piloto | 10 registrados, 2–3 concurrentes; 1–2 inferencias simultáneas compartidas por análisis, resumen del caso, extracción y búsqueda complementaria (cola con `429`); presupuesto de tokens por bloque (contexto, memoria, síntesis, aplicabilidad) definido en el ADR de modelos locales |
| Hardware | Entorno de referencia | MacBook Pro M5, 32 GB; memoria total del stack ≤ 24 GB (ADR de modelos locales) |
| Disponibilidad | Entorno local y piloto | Sin SLA formal. Apagado y arranque documentados; *backups* cifrados con prueba de restauración por sprint |
| Fiabilidad | Cola de extracción | Durable ante reinicios; máximo 3 intentos; 0 documentos colgados |
| Fiabilidad | Consistencia análisis ↔ persistencia | 0 respuestas sin registro |
| Seguridad | Ver §11 | — |
| Observabilidad | Logs JSON con `traceId`; `/metrics` y `/health` | Desde el Sprint 1 para las métricas de IA; 100% en el Sprint 6 |
| Privacidad | PII en *logs*, auditoría, histórico o prompts | 0 |
| Accesibilidad | Panel de IA y vista de caso | Etiquetas, región `aria-live`, navegación por teclado; los estados de aplicabilidad se distinguen por texto, no solo por color |
| Mantenibilidad | Contratos | Cliente tipado generado desde OpenAPI; CI valida ambos specs |
| Mantenibilidad | Catálogos clínicos | Artefacto JSON versionado y montado en ambos contenedores; la versión se registra en cada análisis y Backend 2 rechaza con `409` una versión distinta a la suya (R-20, ADR-38); cambiar un catálogo no requiere desplegar código |

---

## 8. Resumen de arquitectura

*(Detalle en README §2, el diagrama C4 y [`TO-BE.md`](TO-BE.md).)*

- **web** (Next.js): UI y BFF. Es el único punto de entrada del navegador, con HTTPS de una CA interna y acceso por red privada o VPN. Incluye la **vista de caso** y el **panel de análisis de evidencia**.
- **clinical-api** (Node/Express): plataforma clínica y gateway de IA. Dueño de PostgreSQL (schemas `auth`, `identity`, `clinical`, `audit`, `research`) y de `clinical-minio` (PDFs). Incluye el *worker* de extracción y el job de mayoría de edad. Un solo módulo de IA en Node, `evidence-analysis`, que incluye el gateway y el historial (R-08). **Nuevos módulos v1.1, todos deterministas y con acceso a datos del paciente:** `CaseTimelineService` (FR-21), `ReconciliationService`, **dueño de la normalización terminológica final**, incluidos los datos manuales (FR-22, ADR-33), `CompletenessService` (FR-23), construcción de la Base del análisis (FR-27), detector de análisis desactualizados (FR-12) y memoria de análisis (FR-29).
- **rag-orchestrator** (Python/FastAPI): recuperación, generación, validación y extracción. Dueño de Milvus y del schema `corpus`, al que accede con un rol limitado. **Sin acceso a los datos clínicos.** *Embeddings*, *reranker* y NLI corren en CPU. **Nuevos servicios v1.1, todos basados en modelos:** `SynthesisService` (FR-24), `ApplicabilityService` (FR-25), generación del resumen del caso (FR-21), **agente acotado de búsqueda complementaria** (FR-30), extracción de eventos, tratamientos previos y atributos con **propuesta de códigos** (FR-06) y metadatos estructurados del corpus (FR-19).
- **Catálogos clínicos versionados** (`packages/clinical-catalogs`): datos críticos, criterios de aplicabilidad, sinónimos y subconjuntos de CIE-10, LOINC, CUPS y ATC por tipo de cáncer, y plantillas de preguntas, más la matriz "ítem → campo" (RN-29). Es un artefacto JSON versionado y montado en ambos contenedores; Backend 2 rechaza una versión distinta (ADR-38).
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
| Paciente y ciclo de vida | `Patient` (sin datos personales; origen, convenio, retención), `CareEpisode`, `CareTeamMember`, **`PatientOptOut`** (marcas de opt-out registradas por el administrador, con referencia al sistema externo; reemplaza a `PatientConsent`), `IntakeDraft` |
| Datos clínicos | `Diagnosis` (estadificación y escala funcional genéricas; **CIE-10**), `ClinicalNote`, `Exam`, `Biomarker` (confianza, revisión, origen del semáforo, posición en el documento, **LOINC**, término original, estado de mapeo), `Document` (cola de extracción), `Treatment` (decisión; **ATC**) |
| Caso longitudinal · *v1.1* | **`ClinicalEvent`** (solo tipos sin tabla propia: cirugía, procedimiento, respuesta, progresión, toxicidad, recaída, evolución; **CUPS** en procedimientos), **`PriorTreatment`** (líneas previas; **ATC**), **`ClinicalAttribute`** (atributos del catálogo sin tabla propia: estado menopáusico, estado de castración, sitios metastásicos…), **`ClinicalDataSource`** (varias fuentes por dato); `Diagnosis` agrega `histology` y `grade` |
| IA | `AIAnalysisRecord` (tipo `analisis_evidencia` o `resumen_caso`; síntesis, aplicabilidad, opciones descritas, descartadas, Base del análisis, faltantes, análisis previos usados, versiones de corpus y catálogo, huella del contexto, contexto desidentificado, modelos, prompt y parámetros), **`AnalysisFeedback`** (VM-4) |
| Investigación (mínimo) | `ResearchSubjectMap`, `EpisodeSnapshot` (JSON versionado **longitudinal**, sin identidad ni texto libre) |
| Auditoría | `AuditLog` (sin PHI) |
| Corpus | `CorpusDocument` (schema `corpus`: licencia y `license_class`, idioma, tipo de cáncer, versión, **diseño, fase, endpoint, n, criterios de población, versión de guía, fecha de actualización, origen de metadatos**) · `CorpusChunk` (Milvus: dense + sparse y metadatos de filtrado) · **`CorpusRelease`** (fecha de corte y versión) · **`CorpusReleaseDocument`** (qué documentos incluye cada versión, N:M) |

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
| `POST/GET /platform/patients/{id}/documents` · **`POST …/documents/batch`** (varios, `207`) · `…/documents/{docId}` | FR-05, FR-06 | 2 |
| `GET …/documents/{docId}/file` | FR-07 | 2 |
| `PATCH …/clinical-data/{type}/{itemId}/review` | FR-08, FR-22 | 3 |
| **`GET /platform/patients/{id}/case`** · **`POST …/case-summary`** | FR-21 | 2 |
| **`GET /platform/patients/{id}/completeness`** | FR-23 | 3 |
| **`POST/GET /platform/patients/{id}/clinical-events`** · **`POST/GET …/prior-treatments`** | FR-21, FR-29 | 2 / 4 |
| **`GET /platform/question-templates?cancerType=`** | FR-28 | 3 |
| **`POST /platform/evidence-analyses`** (reemplaza `POST /platform/rag/query`) | FR-09, FR-10, FR-11, FR-24 a FR-27, FR-29 | 1 |
| `GET …/patients/{id}/analyses` · `…/analyses/{id}` · **`POST /platform/evidence-analyses/{id}/rerun`** · **`GET …/{id}/compare?with=`** | FR-12 | 4 |
| **`POST /platform/evidence-analyses/{id}/feedback`** | FR-20 (VM-4) | 4 |
| `POST/GET …/treatments` | FR-13 | 4 |
| `POST …/episodes/current/close` · `POST …/episodes` · `POST …/withdrawals` (baja total) · **`POST/DELETE …/opt-outs`** (solo `admin`) | FR-14, FR-16 | 1 / 4 |
| `POST/DELETE …/care-team` | FR-15 | 5 |
| Interna: `POST /rag/query` (contrato `EvidenceAnalysis`) · `POST /documents/extract` · **`POST /case/summary`** (JWT de servicio) | FR-06, FR-09, FR-21 | 1 / 2 |

**Reglas transversales:**
- Errores con la forma `{ error, message }`, sin detalles internos.
- El navegador solo llama a `web`.
- Todo endpoint que muta verifica `Origin`.
- Idempotencia opcional en el análisis de evidencia (`Idempotency-Key`).

---

## 11. Requisitos de seguridad y privacidad

1. **Sesión:** cookie opaca `HttpOnly`/`Secure`/`SameSite=Strict`; expiración, bloqueo, Argon2id y logout (FR-01). CSRF: `SameSite` más verificación de `Origin`.
2. **Autorización:** RBAC más equipo tratante; `admin` ve todos.
3. **Identidad:** AES-256-GCM en la aplicación más índice ciego HMAC; claves solo en el servicio clínico; cada vista se audita (RN-10).
4. **Desidentificación** del contexto hacia la IA y **gate de PII** en los documentos (RN-11, FR-06). Cubre las entidades nuevas (eventos, tratamientos previos, faltantes) y los análisis previos usados como memoria (FR-29).
5. **Proveedores:** datos reales solo con modelos locales, aplicado en código y probado (RN-12).
6. **Aislamiento del servicio de IA:**
   - sin credenciales ni red hacia el almacén clínico;
   - en PostgreSQL, solo el rol `rag_corpus` sobre el schema `corpus`, con revocaciones explícitas, red dedicada, `pg_hba` restringido y tests de acceso denegado en CI;
   - la síntesis, la aplicabilidad y el resumen del caso trabajan **solo** con el contexto desidentificado que recibe.

   **Riesgo residual aceptado:** comparte servidor con los datos clínicos.
7. **Credencial de servicio:** JWT ES256/RS256 con `iss`, `aud`, `exp` corto y algoritmo fijado.
8. **Cifrado:** FileVault y volúmenes cifrados; TLS hacia PostgreSQL; HTTPS con una CA interna.
9. **Red:** solo `web` publica un puerto, en la interfaz de la red privada o VPN.
10. **Consentimientos presuntos, opt-out, retención y bajas:** FR-16 y FR-17; RN-15 a RN-18. Los consentimientos firmados no se almacenan en OncoLens.
11. **Gate G-piloto:** banderas separadas para datos reales anonimizados e identificados; prerrequisitos verificados por `preflight` (RN-13). La "retención activa" del gate se cumple con la política y los campos registrados (FR-17).
12. **Repositorio público:** sin datos reales ni secretos, con escaneo en CI (RN-14). Los catálogos terminológicos versionados en el repo solo contienen subconjuntos permitidos por los términos de uso de cada estándar (TBD-17).
13. ***Prompt injection*:** instrucciones separadas de los datos; chunks, pregunta, notas y **análisis previos** delimitados y tratados como datos.

---

## 12. Requisitos de IA/ML

| Área | Requisito |
|---|---|
| Modelos | Elegidos en el **ADR de modelos locales** con restricciones duras (memoria, latencia, licencia, español, JSON válido, GPU) y medición con el stack completo, incluidas síntesis y aplicabilidad. |
| Idioma | Preguntas y documentos en español o en inglés. *Embeddings* multilingües (dense + sparse); expansión bilingüe de la pregunta; respuesta en el idioma de la pregunta; citas en su idioma original, con traducción opcional etiquetada. |
| Recuperación | Filtros de vigencia, fuente, tipo de cáncer y población; *reranker* multilingüe; umbral de relevancia configurable; consulta enriquecida con la línea de tratamiento y los faltantes. |
| *Grounding* | Validación de citas más chequeo de soporte NLI por afirmación (estricto), incluidas las afirmaciones sobre la población del estudio. Los análisis previos nunca cuentan como soporte (RN-24). |
| Agente acotado | Búsqueda complementaria con una sola herramienta (recuperación sobre el corpus), máximo 1 iteración y 3 sub-consultas *(propuestas, TBD-18)*, dentro del *deadline*; todo lo encontrado pasa por la validación (FR-30). |
| Síntesis y aplicabilidad | Salida JSON por esquema; estados de aplicabilidad de un enumerado cerrado; orden determinista (RN-28); metadatos factuales copiados del catálogo (RN-25). |
| Puntaje | `relevance_score` del *reranker*, normalizado a [0,1], versionado y secundario. El scoring clínico queda para un ADR futuro. |
| Extracción | Capa de texto, OCR local y LLM de estructuración; confianza por campo con señales deterministas; eventos y tratamientos previos; normalización CIE-10, LOINC, CUPS y ATC; sin plantillas por laboratorio; catálogos por tipo de cáncer. |
| Trazabilidad | Cada análisis guarda el contexto enviado, los faltantes, los análisis previos usados, las sub-consultas del agente, los modelos, la versión del prompt, los parámetros y las versiones de corpus y catálogo. |
| Evaluación | Suite reproducible (FR-20) con datasets en español e inglés por tipo de cáncer. Validación clínica **parcial**: el oncólogo revisa una muestra y los reportes distinguen lo validado de lo no validado. Métricas de valor VM-1 a VM-6 (§2.2). |
| Operación | Semáforo de inferencia compartido (RN-30), tiempo máximo propagado y métricas de tokens y latencia por etapa (incluidas síntesis, aplicabilidad y búsqueda complementaria) desde el Sprint 1. |

---

## 13. Estrategia de pruebas

| Nivel | Alcance |
|---|---|
| Unitarias | Servicios y `domain/`: umbral, relevancia, citas, soporte, confianza de OCR, regla de proveedores, reglas de diagnóstico y retención, **checklist de faltantes, matriz ítem → campo, reconciliación, normalización final, orden por aplicabilidad y agregación por opción, detector de desactualizados (dos marcas y cascada), selección de memoria, construcción de la Base del análisis, verbalización de datos para el NLI, límites del agente**. |
| Integración de API | Todos los códigos de estado documentados, en ambos backends. |
| Seguridad | No-fuga de PII (incluida PII escrita en la pregunta, en eventos, en atributos y en análisis previos); cifrado e índice ciego; CSRF; JWT; acceso denegado del rol `rag_corpus`; gate G-piloto; autorización por equipo tratante; **`403` en toda generación con IA sobre un paciente con opt-out**; **`422` en cualquier registro sobre un paciente egresado**; *mutation testing*. |
| Datos | Restricciones, cola concurrente, recuperación ante reinicios, duplicados, transacción de extracción, versionado del corpus y de catálogos. |
| Contratos | Cliente generado desde OpenAPI; validación de specs en CI. |
| E2E (Playwright) | Login → listado → ficha → **vista de caso** → **faltantes** → análisis → síntesis, aplicabilidad (con búsqueda complementaria) y opción con cita y criterio de orden visible; sin evidencia; carga (unitaria y múltiple) → etiquetas → documento de origen; **registro de evolución → análisis desactualizado → re-ejecutar**; opt-out registrado por el administrador → `403`; egreso y reactivación. |
| Calidad de IA | Suite de FR-20 con umbrales de regresión. |
| Lenguaje | Lista de términos prescriptivos prohibidos sobre las salidas del set de evaluación y sobre los textos de UI (RN-23). |

---

## 14. Roadmap y alcance de la versión

| Sprint | Objetivo | Alcance principal | Datos |
|---|---|---|---|
| Pre-S1 | Decisiones | Contrato `EvidenceAnalysis`; esquema con caso longitudinal y metadatos del corpus; protocolo de métricas de valor (TBD-11); ADR de fuentes (no bloqueante) | — |
| 1 | Walking skeleton | FR-01, FR-02, FR-03 (manual), FR-04, FR-09 (dense, contrato `EvidenceAnalysis`, 1 opción), FR-10, FR-17 (campos), FR-19 (semilla y esquema de metadatos), FR-20 (baseline técnico **y manual de VM-1/VM-2**); ADR de modelos locales; ADR de fuentes | Sintéticos (calibración anonimizada fuera de la app) |
| 2 | Ingesta OCR y caso | FR-03 (asistido), FR-05 (múltiple), FR-06 (eventos, tratamientos previos, normalización), FR-07, FR-11, FR-18 (accesos), **FR-21** (vista de caso y resumen), **FR-22** (normalización y duplicados) | Sintéticos |
| 3 | Híbrida, revisión, faltantes y vigencia | FR-08, FR-09 (híbrida), FR-19 (ingesta), **FR-22** (conflictos), **FR-23**, **FR-26**, **FR-27**, **FR-28** | Sintéticos |
| 4 | Síntesis, aplicabilidad, iteración y ciclo de vida | FR-09 (hasta 3), **FR-24**, **FR-25**, **FR-30**, FR-12 (dos marcas de desactualizado, re-ejecutar, comparar), FR-13, **FR-29**, FR-14 (snapshot longitudinal), FR-16 (UI de opt-out para el administrador), feedback VM-4 | Sintéticos |
| 5 | Autorización y gate del piloto | FR-15, FR-16 (bloqueo por opt-out en todos los endpoints de IA y job de mayoría de edad), FR-18 (completa); acceso por VPN; *backups* | **Datos reales tras el gate G-piloto** |
| 6 | Observabilidad, hardening y medición de valor | Métricas, trazas, *mutation testing*; medición de VM-1 a VM-6 en el piloto | Piloto |
| Post-piloto | Tercer tipo de cáncer | Leucemia (RN-20), con el flujo de menores que ya existe | Piloto |
| Post-MVP | Visión | CAP-12 cohortes, CAP-13 outcomes de cohorte, CAP-14 comité de tumores, CAP-15 preguntas sugeridas por IA, conversación de varios turnos, job automático de retención, reporte CAC | — |
| Futuro | Investigación y plataforma | CAP-17 puntaje de solidez clínica (ADR), CAP-18 integración con HCE (FHIR), histórico completo, grafos, exportación | — |

**Criterios de liberación:**
- **G-Demo (fin del S4, datos sintéticos):** todos los criterios de CAP-01 a CAP-11, T-1, T-2, T-3 y T-5 en verde, **salvo AC-T1.5 (auditoría completa) y AC-T3.3 (bloqueos por opt-out y equipo tratante), que se verifican en G-Piloto** (R-14); G-2 = 100% y G-14 = 0; métricas técnicas en meta; VM-1 a VM-3 medidas con el oncólogo asesor.
- **G-Piloto (fin del S5):** G-Demo + AC-T1.5 + AC-T3.3 + T-4 completo + `preflight` en verde + catálogos (datos críticos, aplicabilidad, mapeos, matriz ítem → campo) y plantillas firmados por el oncólogo.
- **G-Éxito (fin del piloto):** VM-1 a VM-6 **en las metas fijadas antes del S1** (R-15) y cero incidentes críticos (fuga de identidad, dato real en la nube, afirmación sin soporte mostrada como válida, salida prescriptiva, generación con IA sobre un paciente con opt-out).
- **Cierre del piloto:** se documenta el aprendizaje (incluidas las métricas fuera de meta) y la decisión sobre el Post-MVP. El cierre no reemplaza a G-Éxito.

> **Capacidad (SUP-1, R-25):** Ingeniería entrega la estimación de los Sprints 1–4 **antes del S1** (TBD-19). La v1.1 y la v1.2 agregan capacidades, incluido el agente acotado, sin cambiar los 6 sprints. La única capacidad liberada es el job de retención (D-15), porque la configuración de menores se mantiene (D-14). El PRD no tiene estimaciones; si Ingeniería confirma que no alcanza, el orden de recorte acordado es: CAP-07 (síntesis) a Post-MVP, luego la parte de conflictos de CAP-03.

---

## 15. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Afirmaciones no respaldadas por la cita ("alucinación con cita") | Alta | Crítico | Chequeo de soporte estricto en todas las afirmaciones, descartadas visibles, evaluación continua |
| Error de OCR que altera el análisis | Media | Crítico | Confianza por campo, etiquetas en el RAG, avisos, revisión, visor del documento, reconciliación |
| Documento cargado en el paciente equivocado | Media | Crítico | Verificación de la identidad del documento; checksum |
| Fuga de identidad hacia la IA, los *logs* o el histórico | Media | Alto | Identidad cifrada y confinada, desidentificación (incluido el contexto ampliado), gate de PII, tests de no-fuga |
| Datos reales en la nube por mala configuración | Baja | Alto | Regla de proveedores en código y en ambos backends, con test |
| Backend 2 comprometido alcanza datos clínicos a través de PostgreSQL | Baja | Alto | Rol limitado, revocaciones, `pg_hba`, red dedicada, tests; opción de base separada |
| Baja calidad de recuperación español ↔ inglés | Alta | Alto | *Embeddings* multilingües, expansión bilingüe, *reranker*, métricas de español a inglés |
| Latencia o memoria insuficientes en la laptop (más aún con síntesis y aplicabilidad) | Media | Alto | LLM nativo con GPU, ADR de modelos locales, límites de memoria, cola, recalibración de G-5 |
| Licencias de las fuentes | Media | Medio | Solo fuentes abiertas con licencia registrada; NCCN y ESMO no bloquean; ausencia declarada en la Base del análisis |
| Interpretación del análisis como prescripción (también por el orden de las opciones) | Alta | Alto | Encuadre "análisis de evidencia", lenguaje no prescriptivo verificado (RN-23), criterio de orden visible (RN-28), pregunta específica en VM-6, avisos |
| **Latencia del agente acotado** (iteración adicional) | Media | Medio | Límites de FR-30, *deadline*, devolución del primer resultado validado si no alcanza el tiempo, G-5 recalibrado en el S4 |
| **Uso de datos de un paciente que hizo opt-out en el sistema externo, pero cuya marca no se registró en OncoLens** | Media | Alto | Registro de opt-out por el administrador con SLA acordado con la entidad médica (TBD-21); auditoría; gate G-piloto exige el procedimiento documentado |
| Uso del puntaje de relevancia como probabilidad de éxito | Media | Alto | Relevancia como metadato secundario (RN-03), aplicabilidad sin puntaje (RN-28) |
| **Retroalimentación de la IA con sus propias salidas** (memoria de análisis) | Media | Alto | Análisis previos rotulados y no citables (RN-24); el NLI solo acepta corpus y datos del paciente; test específico |
| **Metadatos de población insuficientes en el corpus** | Media | Alto | Preferir fuentes con metadatos estructurados (ClinicalTrials.gov); extracción verificada; M-08.3; "No reportado por la fuente" visible |
| **Mapeo terminológico incorrecto** | Media | Medio | Catálogo versionado y validado; `no_mapeado` para revisión; G-13 |
| **Capacidad insuficiente para el alcance v1.1** | Media | Alto | Orden de recorte acordado (§14); validación de estimaciones por Ingeniería |
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
| TBD-04 | ADR de fuentes y licencias (ADR-36): lista final de fuentes públicas abiertas, licencias aceptadas (R-12), ingesta o no de resúmenes de PubMed sin licencia explícita, gestión de NCCN y ESMO | **TBD — Decisión requerida en el S1, no bloqueante** (D-09) |
| TBD-05 | Subtipos de leucemia (LLA, LMA, LMC, LLC) y población (pediátrica o adulta) | **TBD:** con el oncólogo al preparar el tercer tipo |
| TBD-06 | Lista de motivos de egreso y reglas clínicas (semáforo, vigencia de diagnósticos) | **TBD:** validación con el oncólogo |
| TBD-07 | Edad de mayoría configurada | **TBD:** configuración, sin asumir un país |
| TBD-08 | Streaming de eventos de progreso | **TBD:** ADR tras medir el p95 del Sprint 1 (y del S4, con síntesis y aplicabilidad) |
| TBD-09 | Scoring de solidez clínica de la evidencia | **TBD:** ADR futuro |
| TBD-10 | Catálogo del corpus en una base separada de la misma instancia (endurecimiento opcional) | **TBD:** según la revisión de seguridad del piloto |
| TBD-11 | Protocolo de métricas de valor VM-1 a VM-6 | **TBD — Decisión requerida antes del S1:** casos, participantes, orden de las condiciones, instrumentos y metas (§2.2, columna "Qué se debe definir") |
| TBD-12 | Catálogo de datos críticos por tipo de cáncer y sus reglas condicionales | **TBD:** validación del oncólogo antes del cierre del S3 (lista inicial en FR-23) |
| TBD-13 | Criterios de aplicabilidad por tipo de cáncer, cuáles son excluyentes, definición operativa de "Parcial" por criterio y umbrales de tendencia por biomarcador (R-24) | **TBD:** validación del oncólogo antes del S4 (tendencias antes del S2) |
| TBD-14 | Número de análisis previos que entran como memoria (N) | **TBD:** propuesta 3; se calibra con latencia y evaluación |
| TBD-15 | Antigüedad para "posiblemente desactualizada" (N años) | **TBD:** propuesta 5; validación del oncólogo |
| TBD-16 | Validación legal de diferir el job de retención | **TBD — Decisión requerida:** área legal, antes del S5 |
| TBD-17 | Términos de uso de LOINC, CUPS y ATC para versionar subconjuntos en un repositorio público | **TBD:** verificar antes del S2 |
| TBD-18 | Límites del agente acotado: iteraciones, sub-consultas y presupuesto de tiempo (FR-30) | **TBD:** propuesta 1 iteración y 3 sub-consultas; se calibra con G-5 en el S4 |
| TBD-19 | Estimación de esfuerzo de los Sprints 1–4 con el alcance v1.2 (SUP-1) | **TBD — Decisión requerida antes del S1:** Ingeniería |
| TBD-20 | Tamaño de la muestra humana para verificar metadatos del corpus (R-16) | **TBD:** propuesta 10% por lote de ingesta |
| TBD-21 | Canal de opt-out: formato de la referencia al sistema externo y catálogo de motivos | **TBD:** con la entidad médica, antes del S4 |

---

## 17. Trazabilidad

| Requisito | Historia | API | Datos | Arquitectura | Discovery | Sprint |
|---|---|---|---|---|---|---|
| FR-01 Autenticación | HU-01 | `/platform/auth/*` | `User`, `Session` | web → clinical-api (Guard) | — | 1 |
| FR-02 Listado | HU-06 | `GET /platform/patients` | `PatientIdentity` (índice ciego) | clinical-api / IdentityService | — | 1 |
| FR-03 Registro | HU-07, HU-08 | `POST /platform/patients`, `intake-drafts` | `Patient`, `PatientIdentity`, `LegalRepresentative`, `IntakeDraft` | clinical-api + extracción | — | 1–2 |
| FR-04 Ficha | HU-02, HU-05 | `GET /platform/patients/{id}` | `Diagnosis`, `Biomarker`, `Exam` | clinical-api | P1 | 1–2 |
| FR-05 Carga | HU-04 | `POST …/documents`, `…/documents/batch` | `Document` | clinical-api + clinical-minio | Etapa 1 | 2 |
| FR-06 Extracción | HU-04, HU-05 | `/documents/extract` | `Document`, datos clínicos, `ClinicalEvent`, `PriorTreatment` | Worker + rag-orchestrator | P1 | 2 |
| FR-07 Visor | HU-05 | `…/documents/{docId}/file` | `Document`, `AuditLog` | web → clinical-api → clinical-minio | P12 | 2 |
| FR-08 Revisión | HU-09 | `PATCH …/review` | `review_status`, `conflicts_with_id`, `mapping_status` | ClinicalReview | P3 | 3 |
| FR-09 Análisis de evidencia | HU-03, HU-10 | `POST /platform/evidence-analyses`, `/rag/query` | `AIAnalysisRecord`, `CorpusChunk` | EvidenceGateway + RAGOrchestratorService | P5 | 1/3/4 |
| FR-10 Descartadas | HU-03 | ídem | `discarded_options` | Domain (SupportChecker) | P12 | 1 |
| FR-11 Avisos | HU-05 | ídem | `provenance` | Domain | P12 | 2–3 |
| FR-12 Historial | HU-11, HU-24 | `…/analyses`, `…/rerun`, `…/compare` | `AIAnalysisRecord` (`context_fingerprint`) | clinical-api / StaleAnalysisDetector | §2 loops | 4 |
| FR-13 Tratamiento | HU-12 | `…/treatments` | `Treatment`, `ClinicalEvent` | clinical-api | — | 4 |
| FR-14 Ciclo de vida | HU-13 | `…/episodes`, `…/withdrawals` | `CareEpisode`, `EpisodeSnapshot` (longitudinal) | Patients | P10 (prep.) | 4 |
| FR-15 Equipo tratante | HU-14 | `…/care-team` | `CareTeamMember` | Middleware | — | 5 |
| FR-16 Consentimientos externos y opt-out | HU-13, HU-14 | `…/opt-outs` | `PatientOptOut`, `LegalRepresentative` | Patients + job de mayoría de edad | — | 1/4/5 |
| FR-17 Retención | — (operación) | — | `Patient.retention_*` | (job en Post-MVP) | — | 1 |
| FR-18 Auditoría | — (transversal) | — | `AuditLog` | clinical-api | P12 | 2/5 |
| FR-19 Corpus | — (OL-02) | — | `CorpusDocument`, `CorpusChunk`, `CorpusRelease` | IngestionPipelineService | P8 | 1/3 |
| FR-20 Evaluación | — (OL-06) | `…/feedback` | `data/evaluation`, `AnalysisFeedback` | Suite de evaluación | D-04 | 1+ |
| FR-21 Caso | HU-15, HU-16 | `…/case`, `…/case-summary`, `/case/summary` | `ClinicalEvent`, `PriorTreatment` | CaseTimelineService + CaseSummary (B2) | P1, P10 / JTBD 1, 7 | 1–3 |
| FR-22 Reconciliación | HU-17 | `PATCH …/review` | `ClinicalDataSource`, códigos | ReconciliationService + catálogos | P3 | 2–3 |
| FR-23 Faltantes | HU-18 | `…/completeness` | catálogo | CompletenessService | P4 / JTBD 2 | 3 |
| FR-24 Síntesis | HU-21 | `/platform/evidence-analyses` | `AIAnalysisRecord.synthesis` | SynthesisService (B2) | P7 / JTBD 5 | 4 |
| FR-25 Aplicabilidad | HU-22 | ídem | `AIAnalysisRecord.applicability`, `CorpusDocument.population_criteria` | ApplicabilityService (B2) | P6 / JTBD 4 | 1/4 |
| FR-26 Vigencia | HU-20 | ídem | `CorpusDocument`, `CorpusRelease` | Domain (B2) | P8 | 3 |
| FR-27 Base del análisis | HU-20 | ídem | `AIAnalysisRecord.analysis_basis` | AnalysisBasisBuilder (B1) | P12 / JTBD 8 | 3 |
| FR-28 Plantillas | HU-19 | `…/question-templates` | catálogo | clinical-api | Etapa 7 | 3 |
| FR-29 Iteración y memoria | HU-23, HU-24 | `…/clinical-events`, `/platform/evidence-analyses` | `ClinicalEvent`, `AIAnalysisRecord.prior_analyses_used` | AnalysisMemory (B1) | §2 loops, P10 | 4 |
| FR-30 Agente acotado | HU-26 | `/platform/evidence-analyses` | `AIAnalysisRecord.agent_steps` | RAGOrchestratorService (B2) | P6, P5 | 4 |

**Sin historia propia:** FR-17 (retención), FR-18 (auditoría), FR-19 (corpus) y FR-20 (evaluación) son requisitos operativos o técnicos, cubiertos por tickets (OL-01, OL-02, OL-06) y por los criterios del Sprint 5. Sus historias de usuario se escriben al iniciar el sprint correspondiente.

---

## 18. Criterios de aceptación del MVP

> Esta sección define la **frontera del MVP**: qué se entrega, cómo se demuestra que está terminado y qué queda fuera. Un entregable está dentro del MVP solo si aparece en la §18.1.1 y tiene criterios en las §18.3 y §18.4. Está terminado cuando cumple todos sus escenarios Gherkin (`AC-xx.y`) y criterios medibles (`M-xx.y`), además de la *Definition of Done* del README (§6.0). Las métricas de valor están en la §2.2 y los gates de salida, en la §14. Los valores *(propuesta, a calibrar)* siguen RN-22.

### 18.1 Alcance del MVP por capacidad

#### 18.1.1 Dentro del MVP

| ID | Capacidad | Resumen | Sprint |
|---|---|---|---|
| CAP-01 | Ingesta de documentos | PDF → texto/OCR local → datos con confianza, revisión y fragmento de origen; carga múltiple | S2 |
| CAP-02 | Reconstrucción del caso | Timeline de eventos, tratamientos previos, series de biomarcadores y resumen verificable | S1 (esquema) · S2 |
| CAP-03 | Reconciliación y normalización | Duplicados entre documentos, valores en conflicto y normalización CIE-10, LOINC, CUPS y ATC | S2–S3 |
| CAP-04 | Información faltante | Checklist determinista de datos críticos por tipo de cáncer | S3 |
| CAP-05 | Pregunta clínica | Libre (ES/EN) o desde plantillas por escenario | S1 · S3 |
| CAP-06 | Recuperación contextual | Híbrida, bilingüe, solo vigente, con filtros y contexto del caso | S1 · S3 |
| CAP-07 | Síntesis de evidencia | Acuerdos, discrepancias explicadas y etiquetas factuales por fuente | S4 |
| CAP-08 | Aplicabilidad paciente ↔ evidencia | Comparación criterio a criterio, sin puntaje clínico; agregación por opción; **agente acotado de búsqueda complementaria** (FR-30) | S1 (contrato) · S4 |
| CAP-09 | Vigencia visible | Fecha, versión, corte del corpus y alerta de antigüedad | S3 |
| CAP-10 | Opciones descritas en la evidencia | Hasta 3, ordenadas por aplicabilidad, con lenguaje no prescriptivo | S1 · S4 |
| CAP-11 | Análisis, decisión, evolución y memoria | Historial, análisis desactualizado, re-ejecución, registro de la decisión y de la evolución, memoria de análisis no citable | S4 |
| T-1 | Trazabilidad y procedencia | Transversal | S1+ |
| T-2 | Incertidumbre explícita | Bloque "Base del análisis", escalonado por incisos | S1 · S3 · S4 |
| T-3 | Control humano | Transversal | S1+ |
| T-4 | Privacidad, seguridad y acceso | Heredado de la §11 y extendido a las entidades nuevas | S1–S5 |
| T-5 | Evaluación de calidad y de valor | Suite técnica más métricas de valor clínico | S1+ |

**Alcance clínico:** cáncer de **mama** y de **próstata**. La **captura de datos de menores** (tarjeta de identidad, representante legal, job de mayoría de edad) **se mantiene** (D-14). **Fuentes:** solo públicas de acceso abierto con licencia registrada; NCCN y ESMO no bloquean (D-09). **Datos:** sintéticos hasta el S5; reales solo después del gate G-piloto (RN-13).

#### 18.1.2 Fuera del alcance del MVP

| Elemento | Fase | Motivo |
|---|---|---|
| Captura de consentimientos firmados | Fuera de OncoLens | Los consentimientos se firman y custodian en el sistema externo; OncoLens solo registra marcas de opt-out (R-11) |
| CAP-12 Exploración de cohortes históricas | Post-MVP | Sin base histórica real hasta el piloto (D-12). El MVP solo la prepara (AC-P.1). |
| CAP-13 Outcomes longitudinales de cohorte | Post-MVP | Depende de CAP-12. El outcome del **paciente actual** sí está dentro (CAP-02). |
| CAP-14 Paquete para comité de tumores | Post-MVP | No está priorizado en el Discovery (D-16) |
| CAP-15 Preguntas sugeridas por IA | Post-MVP | El MVP usa plantillas configuradas (CAP-05) |
| CAP-16 Leucemia y otros tipos de cáncer | Post-MVP | Sin evidencia de Discovery. Requiere el criterio de "listo" de RN-20. |
| Conversación de varios turnos dentro de un análisis | Post-MVP | Capacidad. Cada pregunta nueva es un análisis nuevo; la memoria de análisis previos sí está en el MVP (CAP-11). |
| Job automático de retención a 10–20 años | Post-MVP | Ningún dato vence durante el piloto. La política y los campos se mantienen (D-15; validación legal en TBD-16). |
| NCCN y ESMO en el corpus | MVP si se gestiona la licencia, o versión futura | No bloquean el MVP (D-09); su ausencia se declara en la Base del análisis. |
| CAP-17 Puntaje de solidez clínica de la evidencia | Futuro | ADR pendiente (TBD-09) |
| CAP-18 Integración con HCE (FHIR) | Futuro | Hipótesis, no viene de los documentos fuente. La historia del paciente del MVP vive dentro de OncoLens (D-11). |
| CAP-19 Reporte a la Cuenta de Alto Costo (CAC) | Futuro | El MVP solo normaliza con CIE-10, LOINC, CUPS y ATC (D-10). |
| **No-objetivos heredados del §3** | Fuera de esta versión | Probabilidad de éxito o pronóstico; decisiones autónomas; *fine-tuning*; streaming de tokens; nube o multi-institución; datos reales en la nube; datos bioinformáticos crudos; datos de contacto |

---

### 18.2 Definiciones

| Término | Definición |
|---|---|
| **Evento clínico** | Hecho fechado del paciente: diagnóstico, procedimiento, inicio o fin de una línea de tratamiento, respuesta, progresión, toxicidad relevante, examen o decisión registrada en OncoLens. |
| **Tratamiento previo** | Línea terapéutica recibida antes o fuera de OncoLens, extraída de documentos o registrada a mano. Es distinta de `Treatment`, que es la decisión registrada en OncoLens. |
| **Dato crítico** | Variable sin la cual el análisis de evidencia de un tipo de cáncer puede ser engañoso. Se define en un catálogo versionado y validado por el oncólogo (§18.3.4). |
| **Afirmación** | Unidad mínima de texto generado (resumen, síntesis, aplicabilidad, opción o limitación) que se verifica contra su fuente. |
| **Estado de aplicabilidad** | Valor por criterio: **Coincide**, **Parcial** (definición operativa por criterio en el catálogo), **No coincide** o **Desconocido**. Desconocido se divide en *falta en el paciente* y *no reportado por la fuente*. |
| **Análisis desactualizado** | Dos marcas (R-10): **"Desactualizado: datos del paciente"**, cuando después de ejecutarlo se agregó, corrigió o rechazó algún dato que usó, o quedó desactualizado un análisis que usó como memoria (cascada); y **"Evidencia o catálogo más reciente disponible"**, cuando cambió la versión del corpus o del catálogo. |
| **Evento derivado** | Evento del timeline calculado desde una tabla propia (diagnóstico, examen, tratamiento previo, decisión, análisis); no se guarda como `ClinicalEvent` (R-03). |
| **Opt-out** | Marca que registra el administrador cuando un paciente no acepta el análisis con IA o la investigación. Sin marca, se presume el consentimiento firmado en el sistema externo (R-11). |
| **Base del análisis** | Bloque con los datos usados, los faltantes, los supuestos, las fuentes consultadas y excluidas, la fecha de corte del corpus y las limitaciones. |
| **Set de referencia** | Conjunto sintético (en el repo) más uno anonimizado (fuera del repo), con verdad conocida, que se usa para medir los criterios cuantitativos (FR-20, OL-06). |

---

### 18.3 Criterios por capacidad

> Formato: historia → escenarios Gherkin (**AC-xx.y**) → criterios medibles (**M-xx.y**) → criterios heredados de FR y RN anteriores.

#### 18.3.1 CAP-01 · Ingesta de documentos

**Historia:** *Como oncólogo, quiero subir los documentos que recibo del paciente para que sus datos queden estructurados sin transcribirlos.*

**AC-01.1 Heredados.** Se cumplen HU-04 (escenarios 1–3), HU-05 (escenarios 1–3) y los bordes de FR-05, FR-06 y FR-07: magic bytes, máximo 20 MB, checksum → `409`, `cuarentena_pii`, `requiere_revision_identidad`, 3 reintentos, sin documentos colgados y reproceso idempotente.

**AC-01.2 Carga múltiple**
- **Dado que** el oncólogo está en la vista de caso de un paciente activo
- **Cuando** selecciona varios PDF en una sola acción (`POST …/documents/batch`)
- **Entonces** la respuesta es `207` y se crea un `Document` por archivo, cada uno con su propio estado (`pendiente → procesando → completado | error | cuarentena_pii | requiere_revision_identidad`)
- **Y** el fallo de un archivo no impide procesar los demás.

**AC-01.3 Extracción de eventos y tratamientos previos**
- **Dado que** un documento completado menciona eventos fechados o tratamientos recibidos
- **Cuando** termina la extracción
- **Entonces** esos eventos y tratamientos quedan como datos con `entry_method = ocr`, `extraction_confidence`, `review_status` y `source_span`, igual que los biomarcadores (FR-06).

| ID | Criterio medible | Meta |
|---|---|---|
| M-01.1 | Exactitud por campo crítico / no crítico (heredado de G-6) | ≥ 95% / ≥ 90% |
| M-01.2 | p95 de extracción por documento (heredado) | ≤ 60 s |
| M-01.3 | Exactitud de los datos `auto_aceptado` (heredado de G-7) | ≥ 98% |

#### 18.3.2 CAP-02 · Reconstrucción del caso

**Historia:** *Como oncólogo, cuando recibo un caso complejo, quiero ver una representación cronológica y verificable del paciente para entender rápidamente qué está pasando (JTBD 1 y 7).*

**AC-02.1 Timeline del paciente**
- **Dado que** el paciente tiene al menos un documento `completado` o datos manuales
- **Cuando** el oncólogo abre la **vista de caso**
- **Entonces** ve los eventos ordenados por fecha, cada uno con tipo, fecha, origen, confianza y estado de revisión, incluidos los **derivados** de diagnóstico, examen, tratamiento previo, decisión y análisis, sin duplicados (R-03)
- **Y** desde cada evento puede abrir el documento de origen en el fragmento resaltado (FR-07).

**AC-02.2 Fecha incierta**
- **Dado que** un evento no tiene fecha confiable
- **Cuando** se arma el timeline
- **Entonces** el evento aparece en una sección "Sin fecha confiable" y **no** se ubica en la línea temporal
- **Y** suma al contador de pendientes de revisión.

**AC-02.3 Tratamientos previos por línea**
- **Dado que** se extrajeron o registraron tratamientos previos
- **Cuando** el oncólogo abre la vista de caso
- **Entonces** los ve agrupados por línea, con fármaco o esquema, fecha de inicio, fecha de fin (o "en curso") y motivo de fin si está documentado (progresión, toxicidad, completado)
- **Y** se distinguen visualmente de las decisiones registradas en OncoLens.

**AC-02.4 Series de biomarcadores**
- **Dado que** un biomarcador tiene dos o más valores fechados
- **Cuando** el oncólogo abre la vista de caso
- **Entonces** ve todos los valores en orden cronológico (gráfico y tabla), con unidad, origen y estado de revisión de cada uno
- **Y** en próstata el **PSA siempre se muestra como serie**
- **Y** la ficha (FR-04) muestra el último valor **junto con** su tendencia respecto del valor anterior.

**AC-02.5 Resumen del caso verificable**
- **Dado que** el caso tiene datos estructurados
- **Cuando** el oncólogo pide el resumen del caso
- **Entonces** el sistema genera un resumen en el que **cada afirmación** enlaza al menos a un dato, evento o documento
- **Y** cada afirmación se verifica con NLI contra la **verbalización determinista** de los datos que referencia (ADR-34)
- **Y** las afirmaciones sin enlace o que no pasan el chequeo **no** se muestran y se cuentan como omitidas
- **Y** el resumen lleva el aviso de RN-19 **más** "Verifique contra las fuentes", y la fecha de los datos que usó (R-22)
- **Y** si el paciente tiene opt-out de análisis IA, responde `403`; si está egresado, `422`.

**AC-02.6 Datos excluidos**
- **Dado que** un dato está `rechazado` o `reemplazado`
- **Entonces** no aparece en el timeline, ni en las series, ni en el resumen, ni en el contexto enviado al RAG (RN-07).

**AC-02.7 Atributos clínicos (R-02)**
- **Dado que** un documento menciona el estado menopáusico, la histología, el grado o los sitios metastásicos
- **Cuando** termina la extracción
- **Entonces** el dato queda en su campo de destino (`Diagnosis.histology`, `Diagnosis.grade` o `ClinicalAttribute`) con su procedencia, y aparece en la vista de caso y en el checklist.

| ID | Criterio medible | Meta |
|---|---|---|
| M-02.1 | Eventos del set de referencia correctamente extraídos (tipo y fecha) | ≥ 95% *(propuesta, a calibrar)* |
| M-02.2 | Eventos y valores mostrados con origen resoluble | 100% |
| M-02.3 | Afirmaciones del resumen enlazadas y con soporte | 100% de las mostradas |
| M-02.4 | p95 de carga de la vista de caso (sin generar resumen) | ≤ 2 s *(propuesta)* |
| M-02.5 | Tiempo de reconstrucción del caso frente al baseline manual (VM-1) | ver §2.2 |

#### 18.3.3 CAP-03 · Reconciliación y normalización terminológica

**Historia:** *Como oncólogo, quiero saber si dos resultados son el mismo dato repetido o datos distintos, sin compararlos a mano.*

**AC-03.1 Duplicado entre documentos**
- **Dado que** dos documentos reportan el mismo biomarcador, con la misma fecha de muestra y el mismo valor (con la unidad normalizada)
- **Cuando** termina la extracción del segundo documento
- **Entonces** queda **un solo dato** con dos fuentes, y ambas se pueden abrir desde él.

**AC-03.2 Valores en conflicto**
- **Dado que** dos documentos reportan el mismo biomarcador con la misma fecha y valores distintos
- **Cuando** termina la extracción
- **Entonces** ambos valores quedan en `requiere_revision` con la marca "En conflicto", enlazados entre sí
- **Y** toda opción o criterio de aplicabilidad que dependa de ese dato muestra el aviso correspondiente hasta que el oncólogo lo resuelva.

**AC-03.3 Normalización terminológica (D-10)**
- **Dado que** un documento menciona un diagnóstico, un examen o biomarcador, un procedimiento o un medicamento
- **Cuando** termina la extracción
- **Entonces** el dato se guarda con su término canónico, su código del estándar correspondiente (**CIE-10** para diagnósticos, **LOINC** para laboratorios y biomarcadores, **CUPS** para procedimientos, **ATC** para medicamentos) y el texto original en su procedencia
- **Y** los sinónimos registrados en el catálogo se resuelven al mismo concepto (por ejemplo, "c-erbB-2" → HER2)
- **Y** un término no reconocido queda como "No mapeado", pendiente de revisión, sin descartarse y sin un código inventado
- **Y** el código lo **propone** Backend 2 y lo **decide** Backend 1; los datos ingresados a mano reciben la misma normalización (R-04, ADR-33)
- **Y** toda entidad con códigos tiene `mapping_status` (R-19).

**AC-03.5 Sin reporte CAC.** El MVP no genera, exporta ni envía el reporte a la Cuenta de Alto Costo (CAP-19, Futuro).

**AC-03.4 Heredados.** FR-08 (diagnóstico en conflicto resuelto por fecha), RN-08 (nunca se reemplaza en silencio un dato verificado) y checksum de archivo duplicado.

| ID | Criterio medible | Meta |
|---|---|---|
| M-03.1 | Duplicados sembrados en el set de referencia que se fusionan | ≥ 95% *(propuesta)* |
| M-03.2 | Conflictos sembrados que se detectan | 100% |
| M-03.3 | Fusiones incorrectas (datos distintos fusionados) | 0 |
| M-03.4 | Conceptos del set de referencia mapeados al código correcto (CIE-10, LOINC, CUPS, ATC) | ≥ 95% *(propuesta)* |
| M-03.5 | Códigos asignados que no existen en el catálogo | 0 |

#### 18.3.4 CAP-04 · Información faltante

**Historia:** *Como oncólogo, mientras analizo un caso, quiero saber qué información me falta para continuar con confianza (JTBD 2).*

**Catálogo inicial de datos críticos** *(propuesta, sujeta a la validación del oncólogo, D-05, TBD-12)*:

| Mama | Próstata |
|---|---|
| Tipo histológico · grado | PSA (serie con fechas) |
| Estadio TNM (clínico o patológico) | Gleason / grupo ISUP |
| Receptor de estrógeno · receptor de progesterona | Estadio TNM |
| HER2 (IHQ; ISH si IHQ 2+ → *condicional*) | Sitios de metástasis por imagen |
| Ki-67 | Estado de castración / testosterona (*condicional*: enfermedad avanzada) |
| Estado menopáusico | Tratamientos previos (ADT, ARPI, quimioterapia) |
| Estado funcional (ECOG) | Estado funcional (ECOG) |
| Tratamientos previos (si hay enfermedad avanzada o recurrente) | Alteraciones HRR/BRCA (*condicional*: enfermedad metastásica resistente a castración) |
| BRCA germinal (*condicional*, según el escenario) | |

**AC-04.1 Checklist visible**
- **Dado que** el paciente tiene un tipo de cáncer habilitado
- **Cuando** el oncólogo abre la vista de caso
- **Entonces** ve cada dato crítico con uno de estos estados: **Presente y verificado**, **Presente sin verificar**, **Faltante** o **No aplica** (condición no cumplida)
- **Y** desde un dato "Faltante" puede cargar un documento o registrarlo a mano.

**AC-04.2 Aviso previo al análisis**
- **Dado que** faltan uno o más datos críticos
- **Cuando** el oncólogo inicia un análisis de evidencia
- **Entonces** el sistema lista los faltantes y ofrece "Cargar información" o "Continuar con aviso"
- **Y** **no** bloquea el análisis (PP-6).

**AC-04.3 Propagación de los faltantes**
- **Dado que** el oncólogo eligió "Continuar con aviso"
- **Cuando** se ejecuta el análisis
- **Entonces** los faltantes viajan al servicio de IA como "desconocido"
- **Y** aparecen en la Base del análisis (T-2) y como **Desconocido: falta en el paciente** en la aplicabilidad (CAP-08).

**AC-04.4 Determinismo y configuración**
- **Dado** un mismo estado de los datos del paciente y una misma versión del catálogo
- **Entonces** el checklist da siempre el mismo resultado **sin invocar al LLM**
- **Y** las reglas, incluidas las condicionales, viven en un catálogo versionado: cambiarlas no requiere desplegar código.

**AC-04.5 Todo ítem tiene un campo de destino (R-02, RN-29)**
- **Dado** un catálogo con un ítem de datos críticos o de aplicabilidad sin campo de destino en la matriz "ítem → campo"
- **Cuando** se intenta publicar esa versión del catálogo
- **Entonces** la validación la rechaza.

| ID | Criterio medible | Meta |
|---|---|---|
| M-04.1 | Sensibilidad para detectar faltantes sembrados | ≥ 0,95 *(propuesta)* |
| M-04.2 | Especificidad (no marcar como faltante lo que está presente) | ≥ 0,90 *(propuesta)* |
| M-04.3 | Catálogo de mama y de próstata firmado por el oncólogo | Sí, antes del cierre del S3 |

#### 18.3.5 CAP-05 · Pregunta clínica

**AC-05.1 Heredado.** Pregunta libre en español o en inglés, de hasta 2000 caracteres, con fuentes y filtros (FR-09, HU-03).

**AC-05.2 Plantillas por escenario**
- **Dado que** el paciente tiene un tipo de cáncer habilitado
- **Cuando** el oncólogo abre el panel de análisis
- **Entonces** ve plantillas de preguntas para ese tipo de cáncer, prellenadas con el contexto del caso y editables antes de enviarlas
- **Y** las plantillas viven en configuración y las valida el oncólogo.

**AC-05.3 La pregunta no se limita a tratamiento**
- **Dado que** la pregunta trata de secuencia, toxicidad o del valor de un biomarcador, y no de "qué tratamiento"
- **Cuando** se ejecuta el análisis
- **Entonces** el resultado incluye síntesis, aplicabilidad y base del análisis
- **Y** la sección "Opciones descritas en la evidencia" aparece solo si la evidencia recuperada describe opciones terapéuticas.

| ID | Criterio medible | Meta |
|---|---|---|
| M-05.1 | Plantillas validadas por tipo de cáncer | ≥ 5 *(propuesta)* |

#### 18.3.6 CAP-06 · Recuperación contextual

**AC-06.1 Heredados.** FR-09 y FR-19: híbrida desde el S3, expansión bilingüe, *reranker*, umbral, filtros de vigencia, fuente, tipo de cáncer y población; "sin evidencia" sin invocar al LLM (RN-02); `tipo_no_habilitado`; códigos `403/429/503/504/500`; corpus solo con **fuentes públicas de acceso abierto** y licencia registrada (RN-21, D-09).

**AC-06.2 Contexto del caso en la recuperación**
- **Dado que** el paciente tiene tratamientos previos y trayectorias registradas
- **Cuando** se ejecuta el análisis
- **Entonces** el contexto desidentificado que se envía incluye la línea de tratamiento actual, los tratamientos previos y las tendencias relevantes, con fechas relativas (RN-11)
- **Y** ese contexto queda guardado en el registro del análisis.

| ID | Criterio medible | Meta |
|---|---|---|
| M-06.1 | Recall@10 total / de español a inglés; MRR (heredado de G-3) | ≥ 0,80 / ≥ 0,70; ≥ 0,60 *(iniciales)* |
| M-06.2 | p95 del análisis completo | ≤ 15 s *(heredado; se recalibra con síntesis y aplicabilidad)* |

#### 18.3.7 CAP-07 · Síntesis de evidencia

**Historia:** *Como oncólogo, cuando hay evidencia contradictoria, quiero entender las diferencias de contexto antes de sacar una conclusión (JTBD 5).*

**AC-07.1 Acuerdos y discrepancias**
- **Dado que** al menos dos fuentes superan el umbral de relevancia
- **Cuando** se completa el análisis
- **Entonces** se muestran las secciones **"Puntos de acuerdo"** y **"Discrepancias"**
- **Y** cada afirmación tiene al menos una cita y pasa el chequeo de soporte.

**AC-07.2 Discrepancia explicada**
- **Dado que** dos fuentes reportan resultados distintos sobre el mismo punto
- **Entonces** la discrepancia muestra la diferencia de contexto que la explica (población, endpoint, fecha o diseño) cuando existe en los metadatos
- **Y** si no existe, dice "Causa de la discrepancia no identificada".

**AC-07.3 Etiquetas factuales por fuente**
- **Dado que** se cita una fuente
- **Entonces** se muestran su tipo y diseño (guía, ensayo fase III, fase II, observacional, revisión), endpoint principal, tamaño de muestra y fecha
- **Y** estos datos **se copian del catálogo del corpus, nunca del texto generado** (igual que RN-04)
- **Y** un dato ausente se muestra como "No disponible".

**AC-07.4 Una sola fuente**
- **Dado que** solo una fuente supera el umbral
- **Entonces** no se muestra la sección de discrepancias y la Base del análisis declara "Síntesis basada en una sola fuente".

**AC-07.5 Sin puntaje de solidez.** No se muestra ningún puntaje de solidez clínica ni "nivel de evidencia" calculado mientras no se apruebe el ADR de TBD-09 (CAP-17).

| ID | Criterio medible | Meta |
|---|---|---|
| M-07.1 | Discrepancias sembradas en el set de evaluación que se reportan | ≥ 80% *(propuesta)* |
| M-07.2 | Fidelidad por afirmación; precisión de citas (heredado de G-4) | ≥ 0,90 cada una |
| M-07.3 | Etiquetas factuales que coinciden con el catálogo | 100% |

#### 18.3.8 CAP-08 · Aplicabilidad paciente ↔ evidencia

**Historia:** *Como oncólogo, cuando encuentro evidencia, quiero entender qué tan aplicable es a mi paciente (JTBD 4).*

**AC-08.1 Tabla de aplicabilidad**
- **Dado que** una fuente forma parte del análisis
- **Cuando** el oncólogo abre su detalle
- **Entonces** ve una tabla con los criterios de aplicabilidad del tipo de cáncer (subtipo, estadio o extensión, línea o tratamiento previo, biomarcadores clave, edad o estado menopáusico, estado funcional), con el valor del paciente, el de la población del estudio y el estado: **Coincide / Parcial / No coincide / Desconocido**.

**AC-08.2 Desconocido con causa**
- **Dado que** un criterio no se puede evaluar
- **Entonces** el estado indica la causa: **"Falta en el paciente"** (enlaza a CAP-04) o **"No reportado por la fuente"**.

**AC-08.3 Afirmaciones verificadas**
- **Dado que** el sistema afirma algo sobre la población del estudio
- **Entonces** esa afirmación tiene una cita y pasa el chequeo de soporte
- **Y** si no lo pasa, el criterio queda en **Desconocido: no reportado por la fuente**. Nunca se infiere.

**AC-08.4 Datos no verificados**
- **Dado que** el valor del paciente para un criterio está `requiere_revision` o "En conflicto"
- **Entonces** el criterio muestra el aviso de dato no verificado (FR-11).

**AC-08.5 Sin puntaje agregado**
- **Entonces** el resumen de aplicabilidad de cada fuente es un **conteo** (por ejemplo, "4 coinciden · 1 parcial · 1 desconocido") y **nunca** un número o porcentaje clínico.

**AC-08.6 Criterio excluyente**
- **Dado que** un criterio marcado como excluyente en el catálogo (por ejemplo, el estado de HER2 o de castración) queda en **No coincide**
- **Entonces** la fuente muestra la etiqueta **"Población no comparable"** de forma visible.

**AC-08.7 Búsqueda complementaria del agente acotado (FR-30, R-13)**
- **Dado que** después del primer borrador queda al menos un criterio en "Desconocido: no reportado por la fuente"
- **Cuando** se completa el análisis
- **Entonces** el sistema ejecutó como máximo 1 iteración adicional con hasta 3 sub-consultas sobre el corpus, dentro del *deadline*
- **Y** lo encontrado pasó por la misma validación de citas y soporte
- **Y** la Base del análisis lista cada sub-consulta, su objetivo y si encontró evidencia
- **Y** si el primer resultado fue "sin evidencia", el agente no se ejecutó.

**AC-08.8 Aplicabilidad de una opción (R-01, ADR-31)**
- **Dado que** una opción se sustenta en varias fuentes con aplicabilidad distinta
- **Entonces** el resumen de la opción es el de su fuente más aplicable, la opción muestra todas sus fuentes con su propio resumen
- **Y** queda marcada "Población no comparable" solo si todas sus fuentes lo están.

**AC-08.9 Origen de los valores**
- **Entonces** el valor del paciente se copia del contexto (nunca lo genera el LLM) y, cuando ambos valores son estructurados, el estado se calcula con la regla del catálogo (ADR-34).

| ID | Criterio medible | Meta |
|---|---|---|
| M-08.1 | Concordancia del oncólogo con el estado asignado, sobre una muestra revisada (VM-3) | ≥ 85% de los criterios *(propuesta)* |
| M-08.2 | Criterios en "Coincide" sin cita | 0 |
| M-08.3 | Fuentes con metadatos estructurados de población en el corpus | ≥ 90% *(propuesta; se revisa con el baseline del corpus, R-16)* |
| M-08.4 | Exactitud de los metadatos `extraido_verificado` sobre la muestra revisada por humanos | ≥ 95% *(propuesta)* |
| M-08.5 | Criterios resueltos por la búsqueda complementaria (G-16) | Se mide en el S4; meta tras el baseline *(propuesta: ≥ 20%)* |
| M-08.6 | Valores del paciente generados por el LLM (no copiados del contexto) | 0 |

#### 18.3.9 CAP-09 · Vigencia visible

**AC-09.1 Metadatos de vigencia en cada cita**
- **Dado que** se muestra una cita
- **Entonces** incluye la fecha de publicación o actualización, la versión (en guías), el tipo de fuente y el idioma original.

**AC-09.2 Corte del corpus**
- **Entonces** cada análisis muestra "Evidencia actualizada al <fecha de corte del corpus>".

**AC-09.3 Antigüedad**
- **Dado que** una fuente supera N años desde su última actualización (N configurable; *propuesta: 5*)
- **Entonces** se marca "Posiblemente desactualizada".

**AC-09.4 Versiones en el historial**
- **Dado que** el oncólogo abre un análisis previo cuya fuente tiene ahora una versión más nueva en el corpus
- **Entonces** la cita conserva su versión original (snapshot, FR-12) y muestra "Existe una versión más reciente".

| ID | Criterio medible | Meta |
|---|---|---|
| M-09.1 | Citas con fecha visible | 100% |
| M-09.2 | Citas de guías con versión visible | 100% |

#### 18.3.10 CAP-10 · Opciones descritas en la evidencia

**AC-10.1 Cantidad y orden**
- **Dado que** la evidencia describe opciones terapéuticas
- **Entonces** se muestran hasta 3 (1 en los Sprints 1–3), ordenadas de forma determinista por aplicabilidad (usando la fuente más aplicable de cada opción, AC-08.8): (1) menos criterios excluyentes en **No coincide**; (2) más criterios en **Coincide**; (3) mayor relevancia de la evidencia como desempate
- **Y** encima de las opciones se lee "Ordenadas por coincidencia con la población estudiada, no por eficacia" (R-17).

**AC-10.2 Contenido de la tarjeta**
- **Entonces** cada opción muestra su descripción, las fuentes citadas (con vigencia, CAP-09), el resumen de aplicabilidad (CAP-08), los avisos de datos no verificados o en conflicto y la "Relevancia de la evidencia" **como metadato secundario**, rotulado así (RN-03).

**AC-10.3 Lenguaje no prescriptivo**
- **Entonces** el encabezado es "Opciones descritas en la evidencia"
- **Y** ninguna salida generada ni texto de la UI usa formulaciones prescriptivas dirigidas al paciente ("recomendado para este paciente", "debe recibir", "el mejor tratamiento", "indicado para usted"). Se verifica con una lista de términos prohibidos en los tests de salida y de UI.

**AC-10.4 Heredados.** Descartadas por falta de soporte (FR-10, HU-03 escenario 3); "sin evidencia suficiente" (HU-03 escenario 2); RN-01 y RN-06.

| ID | Criterio medible | Meta |
|---|---|---|
| M-10.1 | Opciones mostradas con ≥1 cita y soporte (heredado de G-2) | 100% |
| M-10.2 | Salidas con términos prescriptivos prohibidos | 0 |

#### 18.3.11 CAP-11 · Análisis, decisión, evolución y memoria (D-11)

**AC-11.1 Heredados.** Historial de análisis con citas desde el snapshot, el contexto y los modelos (FR-12, HU-11); registro de la decisión con vínculo opcional y nunca a una descartada (FR-13, HU-12).

**AC-11.2 Análisis desactualizado**
- **Dado que** después de un análisis se agregó, corrigió o rechazó un dato que ese análisis usó
- **Cuando** el oncólogo abre el historial
- **Entonces** el análisis aparece como **"Desactualizado: datos del paciente"** con la lista de datos que cambiaron
- **Y** también quedan así los análisis que lo usaron como memoria (cascada).

**AC-11.2b Evidencia o catálogo más reciente (R-10)**
- **Dado que** después de un análisis se publicó una `CorpusRelease` o una versión del catálogo más nueva
- **Entonces** el análisis muestra "Evidencia o catálogo más reciente disponible", distinto de la marca anterior.

**AC-11.3 Re-ejecución y comparación**
- **Dado** un análisis desactualizado
- **Cuando** el oncólogo elige "Re-ejecutar con datos actuales"
- **Entonces** se crea un análisis nuevo (el anterior no cambia)
- **Y** se muestra una comparación: opciones nuevas, opciones eliminadas y criterios de aplicabilidad que cambiaron.

**AC-11.4 La decisión y el análisis entran a la historia del paciente**
- **Dado que** el oncólogo registra un tratamiento decidido, o se completa un análisis de evidencia o un resumen del caso
- **Entonces** aparece en el timeline del paciente dentro de OncoLens como evento **derivado** "Decisión registrada en OncoLens" o "Análisis de IA", distinto de los tratamientos previos, sin escribir un `ClinicalEvent` (R-03).

**AC-11.5 Registro de evolución (progreso y resultados)**
- **Dado que** el paciente tiene un tratamiento registrado
- **Cuando** el oncólogo registra una evolución (respuesta, toxicidad con su grado, progresión, recaída, cambio o suspensión)
- **Entonces** queda como evento clínico vinculado al tratamiento y, si aplica, al análisis que lo originó
- **Y** aparece en el timeline y marca como desactualizados los análisis que usaron datos ahora cambiados
- **Y** si el paciente está egresado, el registro se rechaza con `422` hasta su reactivación (R-11, RN-17).

**AC-11.6 Memoria para el agente IA**
- **Dado que** el paciente tiene análisis previos y evolución registrada (en cualquier episodio)
- **Cuando** se ejecuta un análisis nuevo
- **Entonces** el contexto incluye los últimos N análisis de evidencia del paciente (N configurable; propuesta 3), de todo el equipo tratante, **sin** los desactualizados ni los resúmenes del caso, resumidos y rotulados "análisis previo de IA", y la evolución registrada después de cada uno como dato clínico (R-09)
- **Y** la Base del análisis lista qué análisis previos se usaron
- **Y** ningún análisis previo aparece como cita, y una afirmación cuyo único soporte sea un análisis previo se descarta (RN-24).

| ID | Criterio medible | Meta |
|---|---|---|
| M-11.1 | Análisis cuyos datos cambiaron y quedan marcados como desactualizados | 100% |
| M-11.2 | Citas no resolubles en el historial (heredado del KR2 del S4) | 0 |
| M-11.3 | Afirmaciones mostradas cuyo único soporte es un análisis previo | 0 |
| M-11.4 | Contexto de memoria con PII (test de no-fuga) | 0 |

---

### 18.4 Criterios transversales

#### T-1 · Trazabilidad y procedencia

- **AC-T1.1** Todo dato del paciente mostrado (ficha, timeline, series, checklist, aplicabilidad) indica su origen (documento y página, manual, corrección o regla) y abre la fuente cuando es un documento.
- **AC-T1.2** Toda afirmación generada (resumen, síntesis, aplicabilidad, opción, supuesto o limitación) tiene al menos un enlace o cita y pasa el chequeo de soporte (ADR-34 para datos del paciente). Si no: una **opción** va a "Descartadas"; una **afirmación suelta** se omite y se cuenta en `omittedClaims` (R-21).
- **AC-T1.3** Los metadatos de citas y fuentes se copian del corpus, nunca del texto generado (RN-04).
- **AC-T1.4** Cada análisis guarda el contexto enviado, los faltantes, los modelos, la versión del prompt, los parámetros y la **versión o fecha de corte del corpus**, para que sea reproducible.
- **AC-T1.5** Auditoría heredada (FR-18), extendida a abrir la vista de caso, generar el resumen y re-ejecutar análisis. Siempre sin PHI.

#### T-2 · Incertidumbre explícita ("Base del análisis")

Detalle completo en FR-27 (D-08).

| Inciso | Contenido | Construcción |
|---|---|---|
| (a) Datos del paciente usados | Datos del contexto con su estado de revisión, conflicto y origen | Determinista |
| (b) Datos críticos faltantes | Faltantes del checklist y si se eligió "Continuar con aviso" | Determinista |
| (c) Supuestos | Por ejemplo: "se asume enfermedad no metastásica porque no hay estudios de extensión" | Reglas del catálogo; los propuestos por el LLM pasan el soporte contra el contexto |
| (d) Fuentes y filtros consultados | Fuentes seleccionadas, filtros, idioma, recuperadas y sobre el umbral | Determinista |
| (e) Fuentes no incluidas | Por ejemplo: "NCCN y ESMO no incluidas" | Determinista, desde `CorpusRelease` |
| (f) Fecha de corte del corpus | Fecha y versión | Determinista |
| (g) Limitaciones | Por ejemplo: "una sola fuente", "solo fase II", "población no comparable en X" | Estructurales deterministas; las redactadas por el LLM pasan el soporte |
| (h) Análisis previos usados | Memoria usada como contexto, con la marca "contexto, no evidencia" | Determinista |
| (i) Búsqueda complementaria | Sub-consultas del agente acotado, objetivo y resultado (FR-30) | Determinista |
| — Afirmaciones omitidas | Número de afirmaciones omitidas por falta de soporte (R-21) | Determinista |

**Sprint de cada inciso (R-06):** S1 → (a), (d), (e), (f) y omitidas · S3 → (b), (c), (g) · S4 → (h), (i).

- **AC-T2.1** Todo análisis, incluido el de "sin evidencia", muestra la Base del análisis con **los incisos disponibles en su sprint** (de (a) a (i) al final del S4). Su resumen (número de faltantes, supuestos, fuentes no incluidas y afirmaciones omitidas) es visible sin expandir.
- **AC-T2.2** Los incisos (a), (b), (d), (e), (f), (h), (i) y las omitidas se arman de forma **determinista**. Las limitaciones (g) del LLM pasan el chequeo de soporte. Los supuestos (c) del LLM se aceptan solo si **no son contradichos** por el contexto y están **anclados a un dato faltante** (ADR-34). Cada uno indica su origen (regla o LLM verificado) y los supuestos se rotulan "supuesto".
- **AC-T2.3** Si el resultado es "sin evidencia", la Base del análisis explica qué se buscó y con qué filtros.
- **AC-T2.4** La Base del análisis se persiste con el análisis y se muestra igual en el historial.

#### T-3 · Control humano

- **AC-T3.1** Toda salida generada lleva el aviso "**Análisis generado por IA: requiere validación clínica del oncólogo tratante**" y la etiqueta "Uso académico/investigación" (RN-19, con el texto actualizado).
- **AC-T3.2** El sistema **nunca** ejecuta acciones clínicas por su cuenta: no registra decisiones, no crea pacientes (RN-09), no reemplaza en silencio datos verificados (RN-08) ni resuelve conflictos sin el oncólogo.
- **AC-T3.3** Los avisos clínicos (faltantes, no verificados, conflicto, población no comparable, desactualizado) **no bloquean**. Solo bloquean las reglas legales y de acceso: **opt-out de análisis IA**, paciente egresado y equipo tratante.
- **AC-T3.4** Lenguaje no prescriptivo en todo el producto (AC-10.3).

#### T-4 · Privacidad, seguridad y acceso

- **AC-T4.1 Heredados completos:** FR-01, FR-15, FR-16 (v1.2: consentimiento externo con opt-out), FR-18, RN-10 a RN-17, §11 (1–13) y el gate G-piloto con `preflight` en verde.
- **AC-T4.2** Las entidades nuevas (eventos clínicos, tratamientos previos, series y resumen) **no guardan identidad**, y llegan al servicio de IA **desidentificadas**, con fechas relativas y texto libre enmascarado (RN-11).
- **AC-T4.3** Los tests de no-fuga de PII cubren el contexto ampliado (timeline, tratamientos previos, faltantes, memoria de análisis previos) y el resumen del caso.
- **AC-T4.5** Se mantiene la captura de menores: tarjeta de identidad con representante legal registrado (RN-16; la firma reposa en el sistema externo) y job de mayoría de edad en el S5 (D-14).
- **AC-T4.6 Opt-out (R-11)** Toda generación con IA (análisis, resumen, re-ejecución, agente) sobre un paciente con opt-out de `analisis_ia` vigente responde `403`; un opt-out de investigación borra el histórico; solo el rol `admin` registra o revoca marcas, con la referencia al sistema externo; cada marca queda auditada.
- **AC-T4.4** El servicio de IA sigue sin acceso a los datos clínicos: la síntesis y la aplicabilidad trabajan solo con el contexto desidentificado recibido.

#### T-5 · Evaluación de calidad y de valor

- **AC-T5.1** La suite de evaluación (FR-20, OL-06) se amplía con datasets sintéticos para: eventos y timeline (M-02.1), duplicados y conflictos (M-03.x), faltantes sembrados (M-04.x), discrepancias sembradas (M-07.1) y aplicabilidad con verdad conocida (M-08.x).
- **AC-T5.2** Antes de cerrar el S1 se mide el **baseline manual** de VM-1 y VM-2 con los oncólogos asesores, sobre casos sintéticos estandarizados (*propuesta: ≥ 6 casos, 3 de mama y 3 de próstata*).
- **AC-T5.3** Los reportes distinguen las métricas validadas por el oncólogo de las no validadas (heredado de §12).
- **AC-T5.4** Todo cambio de modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta el reporte al PR (DoD del README).

#### AC-P.1 · Preparación para Post-MVP (sin construir la funcionalidad)

- **AC-P.1a** El `EpisodeSnapshot` que se escribe al egresar (FR-14) guarda la **secuencia longitudinal** del caso (líneas, respuestas, progresiones y fechas relativas), no solo un estado puntual, y sigue sin identidad ni texto libre.
- **AC-P.1b** Queda documentado el criterio de "listo" de CAP-12: volumen mínimo de pacientes históricos, convenio con la entidad médica, consentimiento de investigación vigente y validación del oncólogo.

---

### 18.5 Trazabilidad AC ↔ CAP ↔ FR

| AC | Capacidad (To-Be) | Origen (D-xx, R-xx o v1.0) | Pain / JTBD (AS-IS) | Requisitos | Sprint |
|---|---|---|---|---|---|
| AC-01.x | CAP-01 | v1.0 (ya alineado) | Etapa 1 | FR-05, 06, 07 | S2 |
| AC-02.x | CAP-02 | D-02 | P1, P10 / JTBD 1, 7 | FR-21 (nuevo), FR-04 | S1–S2 |
| AC-03.x | CAP-03 | D-10 | P3 | FR-22 (nuevo; CIE-10, LOINC, CUPS, ATC), FR-08 | S2–S3 |
| AC-04.x | CAP-04 | D-05 | P4 / JTBD 2 | FR-23 (nuevo) | S3 |
| AC-05.x | CAP-05 | D-13, D-01 | Etapa 7 | FR-28 (nuevo), FR-09 | S1, S3 |
| AC-06.x | CAP-06 | v1.0 (ya alineado) | P5 / JTBD 3 | FR-09, FR-19 | S1, S3 |
| AC-07.x | CAP-07 | D-08 | P7 / JTBD 5 | FR-24 (nuevo) | S4 |
| AC-08.x | CAP-08 | D-03, R-01, R-13 | P6 / JTBD 4 | FR-25, FR-30 | S1, S4 |
| AC-09.x | CAP-09 | D-06 | P8 / JTBD 8 | FR-26 (nuevo) | S3 |
| AC-10.x | CAP-10 | D-01 | — | FR-09, FR-10, FR-11 | S1, S4 |
| AC-11.x | CAP-11 | D-11 | AS-IS §2 (loops), P10 | FR-12, FR-13, FR-29 | S4 |
| AC-T1.x | T-1 | v1.0 (ya alineado) | P12 / JTBD 8 | RN-01, RN-04, FR-18 | S1+ |
| AC-T2.x | T-2 | D-07, D-09, R-06 | P12 / JTBD 8 | FR-27 | S1 · S3 · S4 |
| AC-T3.x | T-3 | v1.0 (ya alineado), D-01 | P12 | RN-08, RN-09, RN-19 | S1+ |
| AC-T4.x | T-4 | — | — | §11, FR-15, 16, 18 | S1–S5 |
| AC-T5.x · VM-x | T-5 | D-04 | Objetivo del proyecto | FR-20 | S1+ |
| AC-P.1 | CAP-12/13 (preparación) | D-12 | JTBD 6, 7 | FR-14 | S4 |

---

### 18.6 Supuestos y preguntas abiertas

| ID | Supuesto o pregunta | Impacto si es falso |
|---|---|---|
| SUP-1 | La capacidad alcanza para CAP-02, 03, 04, 07, 08 (con el agente acotado), 09 y la parte nueva de CAP-11 dentro de los 6 sprints. La capacidad liberada es el job de retención (D-15) y la captura de consentimientos (R-11). Ingeniería estima antes del S1 (TBD-19). | Orden de recorte acordado (§14): CAP-07 a Post-MVP, luego los conflictos de CAP-03 |
| SUP-2 | El LLM local de 7–8B (ADR de modelos) produce una síntesis y una aplicabilidad que cumplen M-07.x y M-08.x dentro del presupuesto de latencia, también con la memoria de análisis en el contexto | Recalibrar M-06.2, bajar N de memoria, o evaluar un modelo de ~14B dentro del ADR |
| SUP-3 | Los documentos del corpus abierto permiten extraer población, diseño y endpoint de forma estructurada (M-08.3) | La aplicabilidad queda en "No reportado por la fuente" con más frecuencia y baja su valor |
| SUP-4 | Los oncólogos asesores pueden dar tiempo para medir el baseline (AC-T5.2) y validar catálogos (datos críticos, aplicabilidad, mapeos, plantillas) | Sin baseline, VM-1 y VM-2 no son comparables |
| SUP-5 | Los términos de uso de LOINC, CUPS y ATC permiten versionar subconjuntos en un repositorio público (TBD-17) | Los catálogos se mantienen fuera del repo y se cargan como configuración local |
| PREG-1 | ¿Qué fuentes abiertas fija el ADR de fuentes, y se gestiona NCCN/ESMO para el MVP o para una versión futura? (TBD-04) | No bloquea; afecta la cobertura percibida |
| PREG-2 | ¿Aprueba el área legal diferir el job de retención? (TBD-16) | Si no, se reincorpora al S5 y se ajusta SUP-1 |
