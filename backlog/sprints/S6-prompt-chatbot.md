# S6 · Prompt del alcance funcional del chatbot MVP

> **Origen:** prompt redactado por el usuario tras la Demo 5 (2026-11-06). Sustituye a la «Ficha de análisis (Análisis de evidencia)» como foco del S6, junto con las mejoras del RAG y más textos científicos para el Knowledge RAG (ver [`S5-cierre.md`](S5-cierre.md) §9).
> **Estado:** insumo para `/sprint-refine S6`. **Aún no está planificado, estimado ni publicado en Linear.**
> **Qué es cada parte:** las secciones 1 a 6 son el texto del usuario, sin cambios de contenido (las tablas que venían separadas por tabuladores se maquetaron como tablas Markdown). Lo que añade el asistente está únicamente en la sección «Notas del asistente para el refinamiento», al final, y no forma parte del prompt.
> **Contexto del S6 (usuario, 2026-11-06):** solo hay un sprint; priorización despiadada («ruthless prioritization»). Lo que no sea RAG o chatbot pasa a Post-MVP en Linear, **solo con aprobación explícita** del usuario.

---

# OncoLens — Alcance funcional del chatbot MVP

## 1. Objetivo

Construir un asistente conversacional para oncólogos que permita analizar un paciente con cáncer de mama o próstata, interactuando con la información clínica disponible y consultando evidencia científica relevante para su caso.

El MVP debe demostrar tres capacidades fundamentales:

1. ¿Puede reconstruir correctamente el caso del paciente?
2. ¿Puede identificar qué información falta?
3. ¿Puede encontrar y explicar evidencia científica relevante para ese paciente?

No se busca construir una plataforma clínica completa ni desarrollar nuevas capacidades de backend o RAG. Se asume que la información clínica del paciente está disponible mediante una API y que el RAG está implementado y accesible mediante otra API.

El alcance se concentra en el comportamiento del chatbot y la experiencia de interacción del oncólogo.

## 2. Las tres capacidades del MVP

### A. Comprensión e interacción con el caso clínico

**Must Have**

Pregunta que debe responder: ¿Puede reconstruir correctamente el caso de un paciente?

El chatbot debe comprender la información clínica disponible y utilizarla como contexto de la conversación.

Actualmente, el sistema ya muestra información del paciente. El siguiente paso es permitir que el oncólogo pueda interactuar conversacionalmente con esa información desde el panel de análisis.

El oncólogo debe poder:

- Preguntar por diagnósticos, antecedentes, exámenes y tratamientos.
- Consultar resultados específicos.
- Preguntar por la evolución del paciente.
- Solicitar explicaciones sobre acontecimientos clínicos.
- Explorar relaciones entre diferentes documentos y resultados.
- Solicitar resúmenes de situaciones o periodos específicos.

El chatbot debe:

- Responder utilizando la información clínica disponible.
- Referenciar los documentos y datos que respaldan sus respuestas.
- Considerar fechas y secuencia temporal.
- Diferenciar información documentada de interpretaciones.
- Identificar contradicciones cuando existan.
- Mantener el contexto del paciente durante la conversación.

**Resultado esperado:** el oncólogo puede explorar y comprender el expediente mediante conversación, sin tener que buscar manualmente cada dato en las diferentes secciones del panel.

### B. Identificación de información faltante

**Must Have**

Pregunta que debe responder: ¿Puede identificar qué información falta y, opcionalmente, explicar por qué importa?

El chatbot debe analizar la información clínica disponible e identificar vacíos relevantes para comprender el caso o responder una pregunta clínica.

Debe poder:

- Identificar información no encontrada en el expediente.
- Reconocer datos incompletos.
- Identificar inconsistencias entre documentos.
- Diferenciar información ausente de información no buscada.
- Explicar qué información adicional podría ser necesaria.

Opcionalmente, debe explicar:

- Por qué ese dato puede ser relevante.
- Qué aspecto del análisis clínico limita su ausencia.
- Qué preguntas podría realizar el oncólogo para profundizar.

Ejemplo:

**Oncólogo:** ¿Qué información falta para comprender mejor este caso?

**OncoLens:**

- Información no encontrada: resultado de un estudio de extensión.
- Información incompleta: documentación de la evaluación posterior al tratamiento.
- Información por reconciliar: diferencias entre dos registros del diagnóstico.

¿Por qué importa?

La ausencia del estudio de extensión limita la reconstrucción completa de la situación documentada del paciente.

**Resultado esperado:** el oncólogo conoce qué información tiene, qué no tiene y qué vacíos pueden limitar su análisis.

### C. Consulta y contextualización de evidencia científica

**Must Have**

Pregunta que debe responder: ¿Puede encontrar y explicar evidencia científica relevante para ese paciente, mostrando sus fuentes y limitaciones?

El chatbot debe aprovechar el RAG existente para responder preguntas científicas en lenguaje natural, utilizando las características del paciente como contexto.

El oncólogo debe poder preguntar:

- ¿Qué evidencia existe sobre esta condición?
- ¿Qué estudios han investigado este tratamiento?
- ¿Qué resultados científicos existen para pacientes con estas características?
- ¿Qué evidencia es relevante para este paciente?
- ¿Qué similitudes y diferencias existen entre el paciente y la población estudiada?

El chatbot debe:

1. Comprender la pregunta científica.
2. Utilizar las características documentadas del paciente cuando sean relevantes.
3. Recuperar evidencia mediante el RAG.
4. Explicar los principales hallazgos.
5. Relacionar la evidencia con el contexto del paciente.
6. Identificar coincidencias, diferencias y datos desconocidos.
7. Mostrar las fuentes utilizadas.
8. Comunicar limitaciones de la evidencia y de la recuperación.

Ejemplo:

**Oncólogo:** ¿Qué evidencia existe para pacientes con las características de este paciente?

**OncoLens:**

*Hallazgos relevantes*

Se encontraron publicaciones que estudian pacientes con características similares.

*Relación con el paciente*

- Coincidencias: características tumorales documentadas.
- Diferencias: tratamientos previos diferentes.
- Información insuficiente: no se dispone de todos los criterios necesarios para establecer una comparación completa.

*Fuentes*

Referencias bibliográficas, publicaciones y fragmentos relevantes.

*Limitaciones*

La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente.

**Resultado esperado:** el oncólogo puede consultar y comprender evidencia científica contextualizada, verificar sus fuentes y reconocer sus limitaciones.

## 3. Experiencia conversacional del MVP

Las tres capacidades deben funcionar dentro de una misma conversación, contextualizada por el paciente seleccionado.

**OncoLens — Panel de análisis**

**Paciente seleccionado**

*Contexto clínico:* información del paciente, diagnóstico, exámenes, tratamientos y evolución disponibles en el panel.

**Asistente conversacional**

- **Oncólogo:** ¿Cuál es la situación actual de este paciente?
  **OncoLens:** presenta el resumen clínico, acontecimientos relevantes y referencias a los documentos utilizados.
- **Oncólogo:** ¿Qué información importante falta?
  **OncoLens:** identifica información faltante y explica opcionalmente por qué puede ser relevante.
- **Oncólogo:** ¿Qué evidencia científica existe para este paciente?
  **OncoLens:** presenta publicaciones, hallazgos, relación con el paciente, fuentes y limitaciones.

*Representación conceptual de la experiencia, no diseño definitivo de interfaz.*

**Reglas esenciales**

- Mantener el contexto del paciente durante la sesión.
- Permitir preguntas de seguimiento sobre respuestas anteriores.
- Utilizar la información clínica disponible como contexto, no inventar datos.
- Diferenciar información clínica de evidencia científica.
- Mostrar fuentes y trazabilidad.
- Reconocer cuándo no tiene información suficiente.
- No emitir diagnósticos ni prescribir tratamientos.
- No modificar la historia clínica.

## 4. Priorización del MVP

| Capacidad | Alcance |
|---|---|
| Interacción con información clínica | Must Have |
| Consultas sobre exámenes y tratamientos | Must Have |
| Resumen y evolución del paciente | Must Have |
| Referencias a documentos clínicos | Must Have |
| Identificación de información faltante | Must Have |
| Explicación de relevancia de los faltantes | Should Have |
| Identificación de contradicciones | Must Have |
| Consulta de evidencia científica | Must Have |
| Explicación de hallazgos científicos | Must Have |
| Comparación evidencia-paciente | Must Have |
| Referencias y limitaciones científicas | Must Have |
| Continuidad conversacional | Must Have |
| Historial conversacional persistente | Out of Scope |
| Escritura automática en historia clínica | Out of Scope |
| Recomendaciones terapéuticas autónomas | Out of Scope |

## 5. Criterios de aceptación del MVP

El MVP estará funcionalmente validado cuando pueda demostrar estos seis comportamientos:

| ID | Prueba | Resultado esperado |
|---|---|---|
| AC01 | Preguntar por la situación clínica del paciente | Reconstruye correctamente el caso con información respaldada. |
| AC02 | Preguntar por un examen o tratamiento específico | Encuentra y explica la información documentada. |
| AC03 | Preguntar qué información falta | Identifica vacíos y distingue información no encontrada de información no buscada. |
| AC04 | Preguntar por qué importa un dato faltante | Explica su relevancia sin inventar requisitos clínicos. |
| AC05 | Consultar evidencia científica para el paciente | Recupera y explica evidencia contextualizada. |
| AC06 | Preguntar por las fuentes y limitaciones | Presenta referencias verificables y reconoce incertidumbres. |

La validación debe realizarse con casos sintéticos de cáncer de mama y próstata, revisados por oncólogos.

## 6. Supuestos y límites del alcance técnico

Para esta especificación asumimos que:

| Componente | Estado asumido |
|---|---|
| Información clínica | Disponible y accesible mediante API. |
| Datos del paciente | Preparados para su consulta. |
| RAG | Implementado y accesible mediante API. |
| Recuperación científica | Capacidad existente del RAG. |
| Backend 1 | Administra la información clínica y el contexto del paciente. |
| Backend 2 | Expone las capacidades RAG mediante API. |

Se debe revisar si los supuestos se satisfacen con los endpoints existentes en el backend 1 y 2, si hace falta algo se debe priorizar y hacer la funcionalidad necesaria para que pueda funcionar, para el MVP se tratará de utilizar las capacidades existentes.

Considera un ADR y 1 Spike para validar:

### assistant-ui

Bajo el supuesto teórico que es el mejor candidato para la interfaz conversacional especializada de OncoLens.

Proporciona componentes React composables, gestión de mensajes y conversaciones, adaptadores para backends personalizados y mecanismos para representar componentes interactivos dentro de los mensajes.

**Limitaciones y riesgos**

No resuelve automáticamente el contrato clínico de OncoLens ni la persistencia del análisis. Hay que implementar la transformación entre el JSON de Backend 1 y la representación visual.

Además, algunas características avanzadas están marcadas como experimentales. Conviene limitar el PoC a APIs estables.

Capacidad para extender su funcionalidad con LangGraph dado que puede complementar o absorber algunas de las funcionalidades existentes.

**Hipótesis:** OncoLens no necesita necesariamente un chatbot tradicional ni una arquitectura de streaming de tokens. Necesita una interfaz conversacional capaz de presentar, explicar y permitir la interacción con resultados clínicos estructurados.

### Arquitectura que debe respetarse

Deben respetar y ser compatibles con lo ya existente:

Doctor → Navegador / React 19 → **Frontend — Next.js 16** (React · Route Handlers · BFF; único punto de entrada del navegador) → HTTP interno → **Backend 1 — clinical-api** (Node.js · Express 5 · TypeScript; responsable de autenticación, autorización, información clínica, APIs y PostgreSQL) → JWT de servicio · contexto desidentificado → **Backend 2 — rag-orchestrator** (Python · FastAPI · LangChain · LangGraph; responsable de recuperación, generación, orquestación y validación de evidencia).

**Regla arquitectónica fundamental:** el frontend nunca se comunica directamente con Backend 2. Backend 1 es el único propietario de PostgreSQL y administra el acceso al servicio RAG.

### Stack real identificado

| Componente | Tecnología |
|---|---|
| Frontend | React 19.3.1 |
| Framework | Next.js 16.4.2 |
| Lenguaje | TypeScript 6.0.3 |
| UI | Tailwind CSS 4.3.3 |
| Componentes | shadcn/ui + componentes propios |
| Backend 1 | Node.js + Express 5 + TypeScript |
| Validación | Zod 4.6.7 |
| Persistencia clínica | PostgreSQL + Prisma |
| Backend 2 | Python + FastAPI + Pydantic |
| Orquestación AI | LangChain + LangGraph |
| LLM | Ollama o vLLM, API compatible con OpenAI |

---

# Aclaraciones del usuario posteriores al prompt (2026-11-06)

> Son decisiones del usuario, no notas del asistente. Donde contradicen al prompt, prevalecen.

## Memoria conversacional (resuelve la tensión 1 de las notas)

- **Ya no existirán las preguntas de seguimiento limitadas a 10** (US-218 · L1D-268, `analysis_follow_up`, `POST …/follow-ups`, `POST /rag/follow-up`): las sustituye el chatbot.
- **Memoria a largo plazo:** el historial de cada conversación **se guarda** como registro de conversaciones, pero **por ahora NO se utiliza** (ni se muestra al oncólogo ni alimenta análisis o conversaciones nuevas). Su uso queda para Post-MVP. Esto matiza la fila «Historial conversacional persistente: Out of Scope» del §4: *se almacena; no se usa ni se muestra*.
- **Memoria a corto plazo:** durante una conversación debe persistir todo lo que se hable: datos del paciente, comentarios y preguntas del oncólogo, evidencia encontrada, etc.

---

# Notas del asistente para el refinamiento

> No forman parte del prompt del usuario. Son verificaciones contra el código de `main` (7f803747, 2026-11-06) y tensiones con decisiones vigentes, para resolver en `/sprint-refine S6`. Nada de esto está decidido.

## Lo que ya existe (punto de partida del §6, «revisar si los supuestos se satisfacen»)

| Supuesto del prompt | Qué hay hoy en `main` | Qué falta por verificar |
|---|---|---|
| Información clínica accesible por API (Backend 1) | `GET /platform/patients/{id}/case` (vista de caso), `GET …/completeness` (faltantes), exámenes, tratamientos, atributos y notas con histórico | Si basta para responder «consultas por periodo», «evolución» y «relaciones entre documentos» sin un endpoint nuevo |
| RAG accesible por API (Backend 2) | `POST /rag/query`, `POST /rag/follow-up`, `POST /case/summary`, `POST /documents/extract` (internos); Backend 1 los expone como `POST /platform/evidence-analyses` y `…/{analysisId}/follow-ups` | Cómo un turno de chat elige entre «pregunta sobre el caso», «faltantes» y «evidencia» (hoy cada uno es un camino distinto) |
| Backend 2 con **LangChain · LangGraph** | **No hay LangChain ni LangGraph** en `apps/rag-orchestrator` (ni en sus requisitos ni en su código). El «agente acotado» (FR-30) vive dentro de `RAGOrchestratorService`, con arquitectura hexagonal | Si LangGraph se adopta (ADR) o el supuesto se corrige; hoy es una dependencia nueva, no una capacidad existente |
| `assistant-ui` | No está en `apps/web` | El ADR y el spike (§6) |

## Tensiones con decisiones vigentes

1. **«Historial conversacional persistente: Out of Scope»** frente a lo ya construido (`AIAnalysisRecord`, el seguimiento de hasta 10 preguntas, la memoria de análisis previos FR-29). **Resuelta por el usuario** (ver «Aclaraciones del usuario»): el historial se guarda y no se usa en el MVP; la memoria a corto plazo cubre todo lo de la conversación. Lo que esa decisión implica, para el refinamiento:
   - **Contexto del LLM local:** `OLLAMA_CONTEXT_LENGTH=8192` (ADR-39). «Persistir todo lo que se hable» en la memoria a corto plazo no cabe indefinidamente en 8192 tokens: hace falta una estrategia (ventana deslizante, resumen o estado estructurado de la conversación) y decidirla en el ADR. Es el riesgo técnico mayor de esta decisión.
   - **Citas (RN-04) y soporte (RN-24):** hoy cada afirmación cita un chunk *recuperado en esa consulta*. Si la «evidencia encontrada» de turnos anteriores forma parte de la memoria a corto plazo, hay que decidir si puede citarse sin recuperar de nuevo (cambio de regla) o se recupera otra vez; y las respuestas previas del propio asistente nunca cuentan como soporte NLI.
   - **Almacenamiento:** es trabajo nuevo de Backend 1 (dueño de PostgreSQL): conversación y mensajes, persistidos antes de responder (RN-06). El texto libre del oncólogo puede traer identidad: enmascararlo (ADR-40) antes de guardarlo o enviarlo a IA (RN-10/RN-11), con retención (RN-18) y sin contenido en los logs.
   - **«Se guarda, no se usa»:** la memoria de análisis previos (FR-29: L1D-157 a 160) y las conversaciones como historial visible (L1D-311) siguen en Post-MVP; lo que entra al MVP es la **escritura** del registro, no su lectura.
   - **Código existente de seguimiento** (`analysis_follow_up`, `/rag/follow-up`, `…/follow-ups` y la interfaz de 10 preguntas): decidir si se reutiliza como base del turno del chat o se retira. En Linear, L1D-268 (US-218) figura `KEEP-CHATBOT` en la propuesta de repriorización; con esta decisión pasa a «sustituida por el chatbot» (propuesta: cerrarla sin sus tareas humanas y la corrida nocturna pendientes, a confirmar por el usuario).
2. **«No necesita streaming de tokens»** coincide con la regla vigente (TBD-08, `CLAUDE.md`): nunca se emiten tokens del LLM sin validar; si hay streaming, es de progreso y no de contenido.
3. **Las respuestas científicas siguen sujetas a RN-01, RN-04, RN-24, RN-23 y RN-19**: cada afirmación con cita del corpus y soporte NLI, citas copiadas del corpus (no del texto generado), análisis previos no citables, lenguaje no prescriptivo y avisos «Generado por IA…». El prompt dice «no emitir diagnósticos ni prescribir» pero no menciona citas ni NLI: decidir si cada turno científico pasa por el mismo pipeline de validación (recomendado, para no abrir una vía sin validar).
4. **Responder sobre el caso (capacidad A) es un camino nuevo:** hoy el RAG recupera del corpus científico; las preguntas sobre los datos del paciente no pasan por Backend 2 (`/case/summary` es una capacidad «si hay capacidad»). Si esas respuestas las genera un LLM, aplican RN-10 y RN-11 (desidentificar siempre, sin identidad hacia IA), RN-12 (solo modelos locales con datos reales) y la verificación determinista de afirmaciones sobre datos del paciente (ADR-34).
5. **«No modificar la historia clínica»** es coherente con el chatbot de solo lectura; el registro manual y las correcciones (d5fb-03 a d5fb-05) quedan fuera del chat.
6. **Un solo sprint:** el orden de recorte ya registrado en `S5-cierre.md` §9 (RAG primero) debe convivir con este alcance; el refinamiento debe fijar qué Must Have de la sección 4 entra y cuál se recorta primero.

## Qué ya está listo en `main` y conviene aprovechar

Contrato `clinical-api` 1.23.0; catálogo 1.5.0; prompt `rag-query@0.9.0`; faltantes críticos reales en el listado y en la ficha; vista de caso con histórico y correcciones; análisis con citas, aplicabilidad y hasta 3 opciones; seguimiento de preguntas.
