# Spec Delta — evidence-panel (l1d-325-chat-fuentes-sin-perder-contexto)

## ADDED Requirements

### Requirement: Una cita del chat abre su fragmento en un panel lateral sin perder la conversación
Al pulsar una cita de un turno del chat, el panel SHALL abrir un panel lateral modal con el texto del fragmento y los metadatos de la fuente copiados del corpus (RN-04, RN-25). Al cerrarlo (botón o `Esc`) MUST conservar la posición de *scroll* del hilo y el texto del campo de pregunta, y devolver el foco a la cita. Abrirlo MUST NOT cambiar la URL ni desmontar la conversación.

#### Scenario: Cita abierta y cerrada con el hilo intacto
- **GIVEN** Compose con seed sintético y `LLM_PROVIDER=fake`, el paciente semilla (a) (FX-12-a) y un turno de evidencia con citas en el panel conversacional, el hilo desplazado y «¿Qué población…» escrito sin enviar en el campo de pregunta
- **WHEN** `doc1@test.local` pulsa la cita `[E1 · frag. 5]`
- **THEN** se abre un panel lateral con el `chunkTextSnapshot` del fragmento y sus metadatos (`title`, `sourceName`, `authors`, `publishedAt`, `licenseClass`) iguales a los del corpus
- **AND** al cerrarlo con `Esc` la posición de *scroll* del hilo y el texto del campo de pregunta son los mismos que antes de abrirlo
- **AND** el foco vuelve a la cita pulsada [US-268 AC-1] [AC-T1.3] [RN-04]

### Requirement: «Ver en el caso» abre el dato del paciente con su origen sin salir de la página
Al pulsar «Ver en el caso» de un `ConversationDataLink`, el panel SHALL abrir en el panel lateral el dato con su origen y, si fue corregido, su histórico (ADR-50), leídos por `/api/*` de `web`. La ruta del histórico MUST derivarse con `rutaDeHistorico(resourceType, resourceId)` (sin `historyPath`); un recurso sin histórico MUST NOT pedirlo. La página del paciente y la conversación MUST seguir montadas; solo «Abrir la vista de caso completa» abre otra pestaña.

#### Scenario: Dato corregido abierto desde un turno de caso
- **GIVEN** el paciente `P-CHAT` (FX-12-b) y un turno de caso con un `dataLink` al biomarcador HER2 `3+` que corrige al `2+` con `supersedes_id`
- **WHEN** `doc1@test.local` pulsa «Ver en el caso» en ese enlace
- **THEN** se abre el panel lateral con HER2 `3+`, su origen y el histórico con el valor `2+` reemplazado
- **AND** la URL no cambia y los turnos de la conversación siguen en el DOM [US-268 AC-2] [AC-T1.1]

#### Scenario: Diagnóstico sin histórico muestra solo su origen
- **GIVEN** un turno de caso con un `dataLink` a un diagnóstico, recurso sin ruta de histórico
- **WHEN** pulsa «Ver en el caso»
- **THEN** el panel lateral muestra el diagnóstico con su origen y ninguna petición va a `…/history` (asumido) [US-268 AC-2]

#### Scenario: Fallo al leer el dato sin cerrar la conversación
- **GIVEN** `GET /api/patients/{id}/case` respondiendo `503`
- **WHEN** pulsa «Ver en el caso»
- **THEN** el panel lateral muestra «No se pudo cargar el dato» con «Reintentar», sin detalle técnico
- **AND** los turnos y el texto del campo de pregunta siguen visibles al cerrarlo (asumido) [US-268 AC-2]

### Requirement: Expandir y plegar un turno no altera los demás
Cada turno del asistente SHALL ofrecer «Expandir todo» / «Plegar todo» con `aria-pressed`. Expandido, MUST mostrar la tabla de aplicabilidad con los estados por criterio en texto y, si `omittedClaims > 0`, el aviso «{n} afirmaciones omitidas por falta de soporte» (RN-01). Plegar o expandir un turno MUST NOT cambiar el contenido ni el estado de plegado de los demás.

#### Scenario: Tabla y afirmaciones omitidas al expandir
- **GIVEN** un panel con tres turnos y uno de evidencia con la tabla de aplicabilidad plegada y `omittedClaims = 2`
- **WHEN** pulsa «Expandir todo» en ese turno y después «Plegar todo»
- **THEN** expandido ve los estados por criterio (Coincide, Parcial, No coincide, Desconocido) y el aviso «2 afirmaciones omitidas por falta de soporte»
- **AND** el botón alterna `aria-pressed` y los otros dos turnos no cambian en ningún momento [US-268 AC-3] [RN-01]

#### Scenario: Sin afirmaciones omitidas no hay aviso
- **GIVEN** un turno de evidencia expandido con `omittedClaims = 0`
- **WHEN** se renderiza
- **THEN** no aparece ningún aviso de afirmaciones omitidas (asumido) [US-268 AC-3]

### Requirement: Referencias del turno con metadatos y enlaces externos seguros
«Ver referencias» SHALL listar todas las citas del turno con sus metadatos de la fuente única de `citation-details` y «No disponible» en cada metadato ausente (RN-25). Sus enlaces y los del panel lateral de la cita SHALL aplicar el requisito «Enlaces de cita solo con esquemas seguros» que define L1D-266 (`esUrlHttpSegura()`, SEG-12), sin una regla propia.

#### Scenario: Tres citas con metadatos y enlaces en otra pestaña
- **GIVEN** un turno con tres citas, una de ellas sin `authors`
- **WHEN** pulsa «Ver referencias»
- **THEN** ve las tres referencias con sus metadatos y «No disponible» en los autores ausentes
- **AND** cada enlace externo tiene `target="_blank"` y `rel="noopener noreferrer"` [US-268 AC-4] [RN-25]

#### Scenario: URL javascript sin enlace activo
- **GIVEN** una referencia del corpus con `sourceUrl = "javascript:alert(1)"`
- **WHEN** se renderiza en «Ver referencias» o en el panel lateral de la cita
- **THEN** no existe ningún elemento con `href` para esa referencia y su título se muestra como texto [US-268 AC-5] [SEG-12]

### Requirement: Texto del fragmento y del dato sin HTML crudo
El panel lateral y «Ver referencias» MUST pintar el texto del fragmento (`chunkTextSnapshot`) y del dato como texto React; si algún texto se pinta como Markdown, MUST usarse `react-markdown` sin `rehype-raw`, con `rehype-sanitize` y con un `urlTransform` que devuelve `''` cuando `esUrlHttpSegura()` (L1D-266) es falso. MUST NOT usarse `dangerouslySetInnerHTML`.

#### Scenario: Fragmento con img onerror abierto en el panel lateral
- **GIVEN** un turno de evidencia servido por MSW cuya cita tiene `chunkTextSnapshot = "Resultado <img src=x onerror=\"window.__xss=1\"> y [enlace](javascript:alert(1))"`
- **WHEN** `doc1@test.local` pulsa la cita y se abre el panel lateral
- **THEN** el panel lateral no contiene ningún elemento `img` ni `script` nuevo y `window.__xss` sigue indefinido
- **AND** ningún elemento del panel lateral tiene un `href` que no pase `esUrlHttpSegura()` (asumido en el vector) [US-268 AC-5] [SEG-12] [glosario §3]
