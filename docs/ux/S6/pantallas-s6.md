# Pantallas del S6 · Asistente conversacional en el panel de análisis (3 variantes)

> **Refinamiento del S6, fase 3 (2026-11-06), `[S6 resp. 15]`.** Tres variantes del panel conversacional para que el usuario elija una. La elegida será la referencia del spike US-257 y de US-267/US-268. Coherentes con [`../sistema-de-diseno.md`](../sistema-de-diseno.md) (dirección C «Mesa de trabajo»), [`../flujo-e2e.md`](../flujo-e2e.md) (pantallas 07 y 09) y [`../S5/pantallas-s5.md`](../S5/pantallas-s5.md).
> **Maquetas estáticas** (HTML autocontenido; JS mínimo solo para plegar, desplegar y cambiar el lienzo): [`variante-a.html`](variante-a.html) · [`variante-b.html`](variante-b.html) · [`variante-c.html`](variante-c.html). Cada una lleva arriba una banda amarilla «Solo maqueta» con saltos a los escenarios, que no forma parte del producto. Se comprobaron en el navegador a 1280 y 375 px, sin *scroll* horizontal de página.
> **Fuentes:** [`S6-prompt-chatbot.md`](../../../backlog/sprints/S6-prompt-chatbot.md) §2–§3, [`S6-refinamiento.md`](../../../backlog/sprints/S6-refinamiento.md) §2 (`[S6 resp. 2]`, resp. 3, 6, 7 y 10) y [ADR-51](../../architecture/adr/ADR-51-chat-langgraph-estado-efimero.md).
> **Datos:** todos son sintéticos. La paciente es «Paciente sintética A», con documento `CC ••• 0101`, mama izquierda, HER2+ y RE+. Las fuentes E1–E3 son **fuentes de ejemplo** con metadatos inventados. NCCN y ESMO solo aparecen como «no incluidas».
> **Decisión:** **variante B «Hilo con tarjetas», elegida (usuario, 2026-11-06) `[S6 resp. 16]`**. A y C quedan descartadas (§2). Los hallazgos de `clinical-language-auditor` (modo Diseño) y de la revisión de accesibilidad (WCAG 2.1 AA) se aplicaron **solo a `variante-b.html`** (§7); `variante-a.html` y `variante-c.html` se conservan sin cambios como registro de las alternativas.

## 1. Lo común a las tres variantes

### Conversación de referencia (la misma en las tres)

| Turno | Pregunta del oncólogo | Intención | Escenario `[S6 resp. 2]` |
|---|---|---|---|
| 1 | «¿Cuál es la situación actual de esta paciente?» | Caso | 1 · Reconstruir el contexto |
| 2 | «¿Qué información importante falta?» | Faltantes | 2 · Información faltante |
| 3 | «¿Qué evidencia existe para pacientes con las características de esta paciente?» | Evidencia | 3 y 4 · Pregunta de evidencia y resultado estructurado |
| 4 | «¿Qué población estudió la fuente de la opción 1 y en qué se diferencia de esta paciente?» (sobre el turno 3) | Evidencia (seguimiento) | 3 · Seguimiento en el mismo hilo |
| — | Enlaces ◆, citas [E1], «Expandir todo», «Ver en el caso» | — | 5 · Interactuar sin perder el contexto |

### Reglas que cumplen las tres

- **Aviso en cada turno del asistente** (RN-19): una banda navy con «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación». El texto se lee de configuración, como ya hace `AiDisclaimer`. Los mensajes del sistema (error, LLM no disponible, `403`) no son salida generada: llevan el rótulo «Mensaje del sistema · no generado por IA» y no llevan la banda.
- **Sin lenguaje prescriptivo** (RN-23). El encabezado es exactamente «Opciones descritas en la evidencia». El sujeto es «las fuentes describen…» o «la población estudiada…», nunca la paciente como destinataria de una indicación. El texto visible de `variante-b.html` se comprobó contra los 93 términos de `nivelA` y `nivelB` de la lista versionada `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` (v1.6.0), normalizando sin diacríticos, en minúsculas y sin puntuación, con un *script* `python3 -I` que quita `<style>`, `<script>` y etiquetas: **0 coincidencias**. También se pasó `grep -oniE "recomend[a-z]*|debe recibir|indicad[oa]|mejor opci[oó]n|deber[ií]a|sugerid[oa]"` sobre las tres maquetas: 0 coincidencias. NCCN y ESMO solo aparecen como «no incluidas».
- **Sin *streaming* de tokens** (TBD-08). Mientras se responde se muestran los pasos («Contexto desidentificado», «Buscando evidencia…», «Verificando citas…», «Comprobando soporte…») con `aria-live="polite"`. La respuesta aparece completa.
- **Información clínica frente a evidencia científica**, siempre distinguible por **forma, símbolo y texto**, no solo por color:
  - Información clínica: rótulo «◆ Información clínica del paciente», chips ◆ en verde azulado y borde izquierdo verde azulado.
  - Evidencia científica: rótulo «▤ Evidencia científica (corpus)», citas `[E1]` en azul y borde izquierdo azul.
  - Se proponen **dos tokens nuevos**, `--color-clinical` (`#0E5A5F` sobre `#E1F1F1`, 6,8:1) y `--color-evidence` (`#1F4FB8` sobre `#E8EEFA`, 6,3:1). Hay que añadirlos al sistema de diseño si se aprueban.
- **Avisos que nunca bloquean** (RN-26): los vacíos, los datos sin verificar y las contradicciones llevan un aviso ámbar o gris con una acción («Revisar», «Ver datos críticos»). Solo el `403` por opt-out deshabilita el campo de pregunta.
- **Estados**, con símbolo y texto (sección «Estados» de cada maqueta):

| Estado | Texto | Dato |
|---|---|---|
| Cargando | Pasos de progreso; «No se muestra texto parcial…» | Fase del turno en el cliente (como `fase-del-panel`) |
| Sin evidencia (RN-02) | «No se encontró evidencia suficientemente relacionada con esta pregunta en el corpus.» + qué se buscó (la pregunta y su reformulación) + «Relevancia máxima: no aplica» + «Reformular la pregunta» | `status = sin_evidencia`, `topRelevanceScore = null` (en el turno: **NUEVO**) |
| Error | «No se pudo completar la respuesta. Tu pregunta queda en la conversación.» + traza + «Reintentar» | `5xx`, `ErrorInterno.traceId` |
| LLM no disponible | «El modelo local no está disponible en este momento. No se usa ningún modelo en la nube con datos de pacientes.» + «Reintentar» | `503` `LlmLocalNoDisponible` (existe) |
| 403 opt-out | «Esta paciente tiene registrada la exclusión del análisis con IA (opt-out). No se generan respuestas con IA…» Deshabilita el campo de pregunta | `403` `PermisoDenegadoOOptOut` (existe; US-148 lo extiende al chat) |
| Aviso que no bloquea | «◌ 5 vacíos… Puedes preguntar igual: se tratan como «Desconocido».» | `GET …/completeness` |

### Escenarios: qué muestra cada uno y de dónde sale el dato

Las tres variantes muestran el mismo contenido; cambian el lugar y la forma.

**Escenario 1 · Resumen del caso (turno 1)**

| Elemento | Texto o ejemplo | Fuente del dato |
|---|---|---|
| Afirmaciones en orden temporal, con fecha relativa | «Hace 16 meses: carcinoma ductal infiltrante…» | `CaseView.timeline[].eventDate` + `datePrecision` (existe). El texto de la afirmación es **NUEVO**: `turn.claims[].text` (por definir en el contrato de US-258) |
| Tipo de afirmación: «Documentado» frente a «Interpretación» | rótulo por afirmación | **NUEVO**: `turn.claims[].kind = documentado \| interpretacion` (por definir en el contrato de US-258; US-261) |
| Chip ◆ con su procedencia (documento, fecha, método y verificación) y «Ver en el caso» | «◆ HER2 3+ (IHQ) · Informe de patología · ✓ Verificado» | `SupportedClaim.patientDataRefs` + `PatientDataLink` (existe en `EvidenceAnalysis`; en el turno, **NUEVO**: `turn.patientDataLinks`, por definir en el contrato de US-258). La procedencia sale de `Provenance` (`entryMethod`, `reviewStatus`, `sourceDocumentId`, existe). **NUEVO**: el **tipo de documento** («Informe de patología»), porque `Provenance` solo trae `sourceDocumentId` y el tipo está en `Document` (por definir en el contrato de US-258) |
| ⚑ Contradicción entre documentos, con los dos valores | «cT2 N1 (nota de consulta) frente a cT3 N1 (informe de imagen)» | `Provenance.conflict` + `requiere_revision` (existe). **NUEVO**: `turn.contradictions[]` con los dos `dataRef` enfrentados (por definir en el contrato de US-258; US-262) |
| «1 afirmación sin soporte… se omitió» | — | **NUEVO**: `turn.omittedClaims` (análogo a `analysisBasis.omittedClaims`; por definir en el contrato de US-258) |
| Aviso «◐ 1 dato usado está sin verificar» | — | `Provenance.reviewStatus` de los datos enlazados (existe) |

**Escenario 2 · Información faltante (turno 2)**

| Elemento | Texto o ejemplo | Fuente del dato |
|---|---|---|
| Indicador por dato: ◌ No encontrado · ◐ Incompleto · ⚑ Por conciliar · ◇ No buscado | Ki-67 «◌ No encontrado» · Estado menopáusico «◇ No buscado» | **NUEVO**: `CompletenessItem.gapKind = no_encontrado \| incompleto \| por_conciliar \| no_buscado` (por definir en el contrato de US-258 y en el catálogo de US-263, `[S6 resp. 10]`). Hoy `status` solo tiene `presente_verificado`, `presente_sin_verificar`, `faltante` y `no_aplica` |
| Motivo: qué documento se procesó o cuál falta | «Se procesó el informe de patología… y no reporta Ki-67» | **NUEVO**: tipos de documento fuente por dato crítico en el catálogo (US-263) + `Document` procesados del paciente |
| Estado de verificación | «Verificación: ◐ Presente sin verificar» | `CompletenessItem.status` + `CompletenessProvenance.reviewStatus` (existe) |
| «¿Por qué importa?» con su cita, o «Sin explicación: no se encontró soporte en el corpus para este dato» | plegable | **NUEVO**: `turn.gaps[].whyItMatters` (`SupportedClaim` con `citedSources`, o `null` si se omitió; por definir en el contrato de US-258; US-264, `[S6 resp. 7]`) |
| Leyenda de los cuatro indicadores y aviso «no bloquean» | — | Texto fijo |
| Preguntas que podrían profundizar | chips | **NUEVO** y opcional (*Should*): `turn.suggestedQuestions[]` (por definir en el contrato de US-258). Se recorta primero |

**Escenarios 3 y 4 · Evidencia y resultado estructurado (turnos 3 y 4)**

| Elemento | Fuente del dato |
|---|---|
| Síntesis con acuerdos y discrepancias | `EvidenceAnalysis.synthesis` (`Synthesis`, `agreements`, `discrepancies`) — existe |
| «Relación con la paciente»: ✓ Coincide / ◐ Parcial / ? Desconocido | Resumen derivado de `ApplicabilityCriterion` (existe). La lista resumida en tres líneas es **NUEVA** como texto: `turn.patientRelation[]` (por definir en el contrato de US-258; US-265) |
| Encabezado «Opciones descritas en la evidencia» | Texto fijo (RN-23) |
| Criterio de orden visible | Texto fijo de `OrderingCriterion` (RN-28) |
| Tabla de aplicabilidad (criterio con el valor de la paciente, columna por opción, fila Resumen) | `EvidenceOption.perSource[].criteria[]` (`criterion`, `patientValue`, `status`, `partialReason`, `unknownReason`) y `applicabilitySummary` — existe |
| Tarjeta de opción: título numerado, `rationale`, detalle plegable, avisos y relevancia al final como metadato | `EvidenceOption.option`, `rationale`, `details`, `warnings`, `relevanceScore` — existe |
| Descartadas, plegadas: «para revisión; no son opciones» | `discardedOptions` — existe |
| Fuentes: título, fuente, autores («No disponible»), diseño, n, fecha, idioma, licencia, «⚑ Posiblemente desactualizada», fragmento original sin traducir y «Fuente original» | `CitedSource` (`title`, `sourceName`, `authors`, `studyDesign`, `sampleSize`, `publishedAt`, `language`, `licenseClass`, `possiblyOutdated`, `chunkTextSnapshot`, `sourceUrl`) — existe |
| Limitaciones (de la evidencia y de la recuperación; NCCN y ESMO no incluidas) | `analysisBasis.limitations`, `sourcesNotIncluded`, `corpusCutoffDate` — existe. El conteo «5 de 10 fragmentos superaron el umbral» es **NUEVO** (por definir en el contrato de US-258; US-266) |
| Base del análisis | `AnalysisBasisPanel` sobre `analysisBasis` — existe |
| Seguimiento (turno 4): «↪ Sobre el turno 3», afirmaciones con citas recuperadas de nuevo y «Memoria del hilo: el turno 3 se usó como contexto y no se cita (RN-24)» | **NUEVO**: `turn.aboutTurnId` y `turn.memoryUsed` (por definir en el contrato de US-258). Las afirmaciones son `SupportedClaim` (existe). Sustituye a `FollowUpTurn`, sin límite de 10 |

**Escenario 5 · Interactuar sin perder el contexto**

- **◆ dato del paciente:** se despliega en línea su procedencia y el enlace «Ver en el caso». Cada variante lo resuelve de un modo distinto (ver §2).
- **[E1]:** abre la referencia del mismo turno y despliega el fragmento original. El hilo no se mueve de turno.
- **«Expandir todo» / «Plegar todo»** por turno, con `aria-pressed`.
- **«Preguntar sobre este turno»** fija el turno como contexto de la siguiente pregunta, lo que da el `aboutTurnId`.
- **«Copiar referencias».**

### Datos del encabezado del turno y de la conversación

| Elemento | Fuente |
|---|---|
| Número de turno, hora e intención (Caso / Faltantes / Evidencia) | **NUEVO**: `ConversationTurn.id`, `index`, `createdAt` e `intent` (por definir en el contrato de US-258; ADR-51 §3) |
| «Nueva conversación» | **NUEVO**: `POST …/patients/{id}/conversations` (por definir en el contrato de US-258) |
| Enviar una pregunta | **NUEVO**: `POST …/conversations/{conversationId}/turns` (por definir en el contrato de US-258; la orquesta US-259) |
| Turno de evidencia → `AIAnalysisRecord` | **NUEVO**: `turn.analysisId` para leer `GET …/evidence-analyses/{id}` (`[S6 resp. 6]`) |
| Nota de memoria: «…Se guarda un registro, que no se muestra como historial en esta versión.» | Texto fijo (aclaración del usuario: se guarda y no se usa) |

## 2. Las tres variantes

### Variante A · «Chat lateral» — **descartada** `[S6 resp. 16]`

> Descartada: el chat en columna estrecha comprime la tabla de aplicabilidad y duplica la vista de caso; B cubre su ventaja (ver el dato de origen) con el panel lateral.

La vista de caso queda **a la izquierda** como columna fija («Contexto del caso»: diagnóstico, estadio ⚑, biomarcadores, tratamientos, datos críticos). El chat ocupa la columna del análisis: cabecera «Asistente conversacional» y «Nueva conversación», el hilo con *scroll* propio y el campo de pregunta fijo abajo.

```
┌ Contexto del caso ───────┐┌ Asistente conversacional ··· [Nueva conversación] ─┐
│ ◆ Diagnóstico ✓          ││ ⚠ 5 vacíos · 1 sin verificar — no bloquean          │
│ ⚑ Estadio por conciliar  ││                    [Oncólogo] ¿Situación actual?   │
│ ◆ HER2 3+ ✓  RE 90 %     ││ ┌◆ Caso · Situación actual ───────── Turno 1┐       │
│ ◆ Línea 1 neoadyuvante   ││ │ ⚑ Contradicción … ◆cT2 ◆cT3               │       │
│ ◐ Cirugía (sin verificar)││ │ DOCUMENTADO … ◆HER2  INTERPRETACIÓN …     │       │
│ ◌ Ki-67 · Faltante       ││ │ [Generado por IA…] [Uso académico]        │       │
│ (resaltado al pulsar ◆)  ││ └───────────────────────────────────────────┘       │
└──────────────────────────┘│ [Pregunta sobre esta paciente……] (Preguntar)      │
                            └───────────────────────────────────────────────────┘
```

- **Escenario 5:** «Ver en el caso» resalta el dato en la columna izquierda (`:target`). El hilo, con *scroll* propio, no se mueve.
- **A 375 px:** el contexto se apila arriba, plegado («▸ Contexto del caso»); el campo de pregunta queda fijo abajo.
- **A favor:** el caso y la conversación se ven a la vez, y es la respuesta literal al §3 del prompt («Paciente seleccionado» + «Asistente conversacional»). Es la que menos cambia el *split* actual (`PatientWorkspace`). La relación entre los ◆ y los datos de origen es inmediata.
- **En contra:** la columna del chat (≈ 560–900 px) estrecha la tabla de aplicabilidad, que en 2 opciones aún cabe pero con 3 obliga a desplazarse dentro de la tabla. Los turnos de evidencia son largos y empujan el hilo. Duplica en parte la vista de caso.
- **Encaje con assistant-ui:** **bueno.** `ExternalStoreRuntime` con `Thread` y `Composer` dentro de la columna derecha. Cada turno estructurado es una *data part* (`caso`, `faltantes`, `evidencia`) con su componente propio (`AnalysisResult`, `CriticalDataChecklist`…). La columna izquierda queda fuera de assistant-ui. A mano con shadcn: `FollowUpThread` generalizado + `ScrollArea`; coste parecido.

### Variante B · «Hilo con tarjetas» — **elegida (usuario, 2026-11-06) `[S6 resp. 16]`**

> Referencia del spike US-257 y de US-267/US-268. La maqueta ya incorpora la revisión (§7): «Ver en el caso» y «Ver caso clínico» abren la vista de caso en un **panel lateral** (`Sheet`, `<dialog>` modal con foco atrapado, `Esc` y retorno del foco) sin mover el hilo; cada cita apunta a su fragmento (`[E1 · frag. 5]`); cada turno lleva la línea fija «Datos usados · Ausentes».

Hilo a **ancho completo** (máx. 1040 px), sin columna de caso. Arriba, una tira «Contexto de la paciente» con chips (◆ CDI, ◆ HER2 3+, ⚑ estadio, ◌ 5 vacíos, ◐ 1 sin verificar) y «Ver caso clínico ↗». Cada turno del asistente es una **tarjeta rica**: chip de intención (◆ Caso / ◌ Faltantes / ▤ Evidencia) con «Intención detectada», un borde izquierdo según el tipo de información y una barra de acciones. El campo de pregunta queda fijo abajo y muestra «↪ Preguntando sobre el turno 3 ✕» cuando hay un turno fijado.

```
Contexto de la paciente: ◆CDI ◆HER2 3+ ◆RE 90 % ⚑Estadio ◌5 vacíos  Ver caso clínico ↗
Asistente conversacional                                         [Nueva conversación]
                                       [Oncólogo] ¿Qué evidencia existe…?
┃ ▤ Evidencia · Intención detectada · Evidencia para esta paciente ··· Turno 3
┃ Síntesis …[E1][E2]   Relación con la paciente ✓ ◐ ?
┃ Opciones descritas en la evidencia  (orden: coincidencia, no eficacia)
┃ ┌ tabla de aplicabilidad a ancho completo ┐  1 · …  2 · …  Fuentes  Limitaciones
┃ (Expandir todo) (Preguntar sobre este turno) (Copiar referencias)
┃ [Generado por IA…] [Uso académico]
[↪ Preguntando sobre el turno 3 ✕] [Pregunta……] (Preguntar)
```

- **Escenario 5:** todo se despliega dentro de la tarjeta. Una cita `[E1 · frag. n]` abre la referencia y lleva el foco al fragmento exacto. «Ver en el caso» abre la vista de caso en el **panel lateral** con el dato resaltado; al cerrarlo, el hilo sigue donde estaba. Solo «Abrir la vista de caso completa» abre otra pestaña (anunciado: «abre en nueva pestaña»).
- **A 375 px:** las tarjetas ocupan todo el ancho; la tabla se desplaza dentro de su contenedor; el panel lateral ocupa toda la pantalla; el campo de pregunta deja de ser fijo por debajo de 480 px (no tapa el contenido ni el foco) y oculta los chips de preguntas frecuentes.
- **A favor:** la tabla de aplicabilidad y las fuentes tienen todo el ancho. **Reutiliza casi tal cual `AnalysisResult`** (síntesis, `OrderingCriterion`, `ApplicabilityTable`, `EvidenceOptionsList`, `DiscardedOptions`, `AnalysisBasisPanel`) como cuerpo de tarjeta. El chip de intención hace visible el enrutado de LangGraph y permite al evaluador comprobar AC01–AC06. Es la más barata de implementar.
- **En contra:** sin el caso a la vista, para consultar el origen de un dato hay que desplegar el chip ◆ o abrir otra pestaña. Con 3–4 turnos de evidencia, el hilo se vuelve muy largo y obliga a desplazarse para comparar turnos.
- **Encaje con assistant-ui:** **el mejor.** Es el modelo nativo de assistant-ui: `Thread` + `MessagePrimitive.Parts` con un componente por *data part* (`intent`, `claims`, `gaps`, `evidence`), `ActionBar` para las acciones del turno y `ComposerPrimitive` con un adjunto de contexto (`aboutTurnId`). `ExternalStoreRuntime` adapta `ConversationTurn` → `ThreadMessage` sin *streaming*. A mano: `FollowUpThread` + `AnalysisResult` como cuerpo; también es sencillo.

### Variante C · «Lienzo + conversación» — **descartada para el MVP** `[S6 resp. 16]`

> Descartada para el S6 por coste (estado del lienzo, foco, capa móvil) frente al plazo; queda como **evolución Post-MVP** de B, que comparte el mismo componente de tarjeta.

Chat **a la izquierda** (≈ 340–420 px) con turnos **compactos**: el chip de intención, un resumen de una o dos líneas con conteos («2 opciones descritas en la evidencia, tabla de aplicabilidad (6 criterios), 2 fuentes y limitaciones»), «Ver en el lienzo ▸» y el aviso RN-19. A la **derecha, el lienzo** muestra el artefacto completo del turno seleccionado (resumen, checklist de faltantes o tabla de evidencia), con ◀ ▶ para pasar de un turno a otro y «Datos del paciente». Al pulsar un turno se actualiza el lienzo; el turno activo lleva `aria-current` y un borde primario.

```
┌ Asistente conversacional ─┐┌ Lienzo · Turno 3 · Evidencia ······ ◀ ▶ [Datos del paciente]┐
│ [Oncólogo] ¿Situación?    ││ (Expandir todo) (Preguntar sobre este turno) (Copiar ref.)    │
│ ┌◆ Caso · Turno 1 ───────┐││ ▤ Evidencia científica  ◆ Contexto del paciente               │
│ │ Resumen … 1 ⚑          │││ Síntesis …                                                    │
│ │ Ver en el lienzo ▸     │││ Opciones descritas en la evidencia                             │
│ │ [Generado por IA…]     │││ ┌ tabla de aplicabilidad ┐ 1 · …  2 · …                         │
│ └────────────────────────┘││ Fuentes [E1] [E2] · Limitaciones · Base del análisis           │
│ ┏▤ Evidencia · Turno 3 ━━┓││ [Generado por IA…] [Uso académico]                             │
│ ┃ 2 opciones, 6 criterios┃│└──────────────────────────────────────────────────────────────┘
│ ⟳ Turno 5 · Verificando… │
│ [Pregunta……] (Preguntar) │
└──────────────────────────┘
```

- **Escenario 5:** «Ver en el caso» abre «Datos del paciente» en el lienzo con el dato resaltado y «← Volver al turno». La conversación no se mueve. ◀ ▶ recorre los artefactos.
- **A 375 px:** el lienzo se abre a pantalla completa sobre la conversación, con «← Volver a la conversación», que devuelve el foco al botón del turno.
- **A favor:** separa **conversar** de **leer resultados**. La conversación se mantiene corta y navegable, y el artefacto grande tiene espacio. Es la que mejor cumple el escenario 5 y la hipótesis del prompt («no necesita un chatbot tradicional… presentar, explicar e interactuar con resultados estructurados»). Además permite comparar turnos con ◀ ▶.
- **En contra:** es la más cara: hay que gestionar el estado del turno seleccionado, el foco al cambiar el lienzo y la capa a pantalla completa en móvil. El aviso RN-19 aparece dos veces (en el turno compacto y en el lienzo). Exige más pruebas de accesibilidad: foco, `aria-current` y anuncio del cambio de lienzo. Además, el resumen compacto del turno es un texto nuevo que hay que generar de forma determinista a partir de los conteos, nunca con el LLM.
- **Encaje con assistant-ui:** **parcial.** El hilo compacto encaja (`Thread` + una *data part* que pinta solo el resumen). El lienzo queda **fuera** de assistant-ui, como estado propio (turno seleccionado) leído del *store* externo. Las «Tool UI» y «Artifacts» de assistant-ui son las piezas que menos estables y más experimentales; el ADR-51 limita el spike a APIs estables, así que el lienzo se haría a mano. A mano con shadcn: `ResizablePanelGroup` + `Sheet` en móvil; coste mayor que A y B.

## 3. Comparación

| Criterio | A · Chat lateral | B · Hilo con tarjetas | C · Lienzo + conversación |
|---|---|---|---|
| Caso visible junto a la conversación | **Sí, siempre** | No (chip ◆ o pestaña nueva) | A demanda (pestaña «Datos» del lienzo) |
| Espacio para la tabla de aplicabilidad | Medio | **Ancho completo** | Amplio |
| Escenario 5 (sin perder el contexto) | Bien | Bien dentro de la tarjeta; débil hacia el caso | **El mejor** |
| Hilo largo con varios turnos de evidencia | Largo | **El más largo** | **Corto** |
| Reutiliza `AnalysisResult` y compañía | Sí | **Casi tal cual** | Sí, en el lienzo |
| Encaje con assistant-ui (APIs estables) | Bueno | **El mejor** | Parcial (el lienzo, a mano) |
| Coste estimado de UI (US-267 + US-268, 8 pts) | Cabe | **Cabe con holgura** | Justo; riesgo para el ≥ 80 % |
| Móvil (375 px) | Contexto plegado arriba | Natural | Lienzo a pantalla completa |

## 4. Variante elegida y por qué

**Elegida: B «Hilo con tarjetas» (usuario, 2026-11-06, `[S6 resp. 16]`), con un elemento de A:** el chip ◆ despliega en línea su procedencia y «Ver en el caso» abre la vista de caso en un **panel lateral (`Sheet`)** en lugar de otra pestaña. Ya está aplicado en `variante-b.html`.

Por qué (propuesta del diseño, aceptada):
1. **Plazo y meta de cierre.** El S6 tiene un solo sprint de 3–4 días y una meta ≥ 80 %. B reutiliza casi sin cambios `AnalysisResult`, `ApplicabilityTable`, `EvidenceOptionsList`, `DiscardedOptions`, `AnalysisBasisPanel`, `CitedFragment` y `AiDisclaimer` como cuerpo de tarjeta, y deja US-267 y US-268 dentro de sus 8 pts.
2. **Es el mejor encaje con assistant-ui usando solo APIs estables** (`ExternalStoreRuntime`, `MessagePrimitive.Parts` con *data parts*, `ActionBar`). Así el spike US-257 tiene más probabilidad de salir con un «sí» claro. Si no sale, se construye a mano con shadcn sin rehacer el diseño.
3. **El chip de intención hace auditable el enrutado de LangGraph** (ADR-51) en la demo y en la suite `evaluate` (AC01–AC06).
4. **La tabla de aplicabilidad, que es el corazón de RN-28, conserva todo el ancho.**

C es la mejor experiencia a medio plazo (escenario 5, hilos largos) y conviene dejarla como **evolución Post-MVP**: la decisión de B no la impide, porque la tarjeta de B es el mismo componente que el lienzo de C. A es la más conservadora; conviene elegirla si el usuario prioriza ver el caso siempre junto a la conversación por encima del espacio para la evidencia.

## 5. Datos que se muestran y no existen en el contrato actual

Todos están marcados **NUEVO** arriba. Se definen en el contrato de US-258 (`Conversation` y `ConversationTurn`), salvo donde se indica otra historia:

- `ConversationTurn`: `id`, `index`, `createdAt`, `intent` (`caso`, `faltantes`, `evidencia`), `aboutTurnId`, `analysisId`, `status` (incluye `sin_evidencia`), `topRelevanceScore`, `omittedClaims`, `memoryUsed`.
- `turn.claims[]` con `kind` (`documentado` o `interpretacion`) sobre `SupportedClaim`, y `turn.patientDataLinks` (US-260, US-261).
- `turn.contradictions[]` con los dos `dataRef` (US-262).
- `CompletenessItem.gapKind` (`no_encontrado`, `incompleto`, `por_conciliar`, `no_buscado`) y los tipos de documento fuente por dato crítico en el catálogo (US-263, `[S6 resp. 10]`).
- `turn.gaps[].whyItMatters` (`SupportedClaim` o `null`) (US-264).
- El tipo de documento de la procedencia («Informe de patología»): hoy solo viaja `sourceDocumentId`.
- `turn.patientRelation[]` (resumen ✓ ◐ ? en lenguaje natural) y el conteo de fragmentos sobre el umbral (US-265, US-266).
- Solo en C: el resumen compacto del turno, que se deriva de forma determinista de los conteos y no requiere un campo nuevo.
- Opcional (*Should*): `turn.suggestedQuestions[]`.
- Línea fija «Datos usados · Ausentes» en cada turno (PP-5, FR-27): en los turnos de evidencia sale de `analysisBasis.patientDataUsed` y `missingCriticalDataLabels` (existe); en los de caso y faltantes es **NUEVO**: `turn.dataUsed[]` y `turn.dataMissing[]` (por definir en el contrato de US-258).
- Cita por fragmento (`[E1 · frag. 5]`): cada `CitedSource` ya es un chunk (`chunkId`, `chunkTextSnapshot`), así que agrupar varios fragmentos bajo una misma fuente es solo presentación. El ordinal «Fragmento 5 de 41» es **NUEVO** (`chunkOrdinal` y `chunkCount` en el catálogo del corpus; por definir en el contrato de US-258 o se omite).
- Endpoints: `POST …/patients/{id}/conversations` y `POST …/conversations/{conversationId}/turns` (US-258).

Tokens de diseño nuevos (no son del contrato): `--color-clinical` y `--color-evidence`.

## 6. Accesibilidad (aplicada en las maquetas)

- Puntos de referencia: `header`, `nav` con `aria-label`, `main`, `aside` (A) y `section` con nombre. Hay un solo `h1` por página (oculto visualmente: «Asistente conversacional · Paciente sintética A»).
- El hilo usa `role="log"` + `aria-live="polite"`; el progreso, `aria-live` + `aria-busy`. Los errores usan `role="alert"` y los avisos, `role="status"` o `note`.
- Foco visible de 3 px con el primario; blanco sobre navy. Objetivos de ≥ 44 px en botones y resúmenes plegables (en B los chips en línea ◆ y [E1 · frag. n] miden ≥ 24 px tras la revisión; en A y C, sin cambios, 22–24 px).
- La tabla tiene `<caption>`, `th scope` y el valor de la paciente en la cabecera de fila; va en un contenedor con desplazamiento propio y `tabindex="0"`.
- Los estados llevan símbolo y texto (✓ ◐ ✕ ? ◌ ◇ ⚑ ⟳); un dato faltante usa gris, nunca rojo.
- En C, al cambiar el lienzo el foco pasa a su título (`tabindex="-1"`); «Volver a la conversación» devuelve el foco al turno.
- **`role="alert"` solo se anuncia si el nodo se inserta dinámicamente** en el DOM; en la maqueta estática los estados ya están presentes y no se anuncian. En la implementación (US-267) el mensaje de error, LLM no disponible o `403` debe montarse al llegar la respuesta, no alternarse con `hidden`.

## 7. Revisión aplicada a la variante B (2026-11-06)

Solo en `variante-b.html`; A y C sin cambios.

**Lenguaje clínico (`clinical-language-auditor`):**
1. *Mayor RN-01/RN-04.* Cada afirmación cita el fragmento que la sustenta (`[E1 · frag. 2]`, `[E1 · frag. 5]`, `[E1 · frag. 9]`, `[E2 · frag. 3]`, `[E2 · frag. 7]`). «14 ciclos» y el desenlace primario citan el fragmento 5; «una minoría con un segundo anti-HER2», el 9. La síntesis se reescribió para decir solo lo que dicen los fragmentos 2 de E1 y 3 de E2 (se quitó «coinciden en RE+ y RE−», sin soporte). La referencia muestra únicamente los fragmentos citados en ese turno.
2. *Mayor RN-01.* «Estudio de extensión» (turno 2) y el turno 4 citan un fragmento de criterios de exclusión: «E1 excluyó a pacientes con enfermedad metastásica clínicamente evidente [E1 · frag. 11]».
3. *Mayor.* Ki-67: «E3 reporta Ki-67 como variable de estratificación en 9 de los 12 ensayos incluidos [E3 · frag. 4]».
4. *Menor.* Singular cuando hay una sola fuente: «La población de E1…», «E1 excluyó…», «La fuente E1 describe…».
5. *Menor.* Línea fija «◆ Datos usados: … · Ausentes: …» en cada turno, también en «sin evidencia» (PP-5, FR-27).
7. *Menor.* §1 cita la lista y el comando usados.

**Accesibilidad (WCAG 2.1 AA):**
- *4.1.3:* la región de progreso ya no lleva `aria-busy`; los pasos van en un `role="status"` propio.
- *1.4.1/1.4.11:* los bordes de `.block-clin`, `.block-evid`, de las tarjetas por tipo, de los chips ◆ y de las citas usan `--color-clinical` (`#0E5A5F`) y `--color-evidence` (`#1F4FB8`), ≥ 3:1 sobre blanco; los bordes de las referencias, `--color-control-border`. El color sigue sin ser la única señal: ◆ y [En] van con su rótulo `.src-label`.
- *1.4.10/2.4.7:* por debajo de 480 px el campo de pregunta deja de ser fijo y oculta los chips frecuentes: no tapa contenido ni foco.
- *Menores:* `.cite` con `min-height: 24px`; ◆ con `aria-hidden` y nombre accesible «Dato del paciente: …» en cada chip; el único enlace `target="_blank"` añade «(abre en nueva pestaña)» oculto visualmente; nota sobre `role="alert"` en §6.

**Verificación:** servida en `127.0.0.1`, comprobada con Playwright a 1280 y 375 px: sin *scroll* horizontal de página (`scrollWidth = clientWidth`), panel lateral dentro del viewport en 375 px, cita → fragmento abierto y enfocado, «Ver en el caso» → panel abierto con el dato resaltado. 0 ids duplicados y 0 anclas rotas.
