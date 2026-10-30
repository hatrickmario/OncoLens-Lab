## MODIFIED Requirements

### Requirement: Relevancia como metadato secundario
La tarjeta MUST mostrar `relevanceScore` con el rótulo `relevance-label` "Relevancia de recuperación de evidencia" `[S1 resp. 28]`, coma decimal y dos decimales, **después** de las citas, en estilo secundario y sin barra, estrella ni porcentaje (RN-03). Ningún rótulo MUST ser "Evidencia" a secas ni afirmar eficacia; la nota y la ayuda negadas SHALL permitirse. La presentación `relevance-basis` MUST tener un solo literal por modo, reutilizando las claves existentes: con el criterio de orden por aplicabilidad, `evidence.relevance.basis` = "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."; con el criterio de relevancia (sin aplicabilidad), `evidence.relevance.basisRelevancia` = "Metadato de recuperación; no mide solidez clínica ni probabilidad." `relevance-label`, la nota y `relevance-help` no cambian (Gate 1 del S4, lenguaje #14).

#### Scenario: La relevancia aparece con su rótulo exacto, después de las citas y en estilo secundario [US-061 AC-2] [RN-03] [AC-10.2] [ADR-8] [S1 resp. 28]
- **GIVEN** la tarjeta del escenario del AC-1, con `relevanceScore = 0.87` y sin aplicabilidad calculada
- **WHEN** se inspecciona
- **THEN** el elemento `relevance-label` tiene exactamente el texto "Relevancia de recuperación de evidencia" y el valor es "0,87"
- **AND** `relevance-basis` es exactamente "Metadato de recuperación; no mide solidez clínica ni probabilidad." y `relevance-help` es exactamente "No resume la aplicabilidad, la eficacia ni la calidad global de la opción.", referenciada por el `aria-describedby` del valor
- **AND** el bloque incluye la nota "Metadato secundario: no mide eficacia ni solidez clínica"
- **AND** el bloque de relevancia sigue en el orden del documento a la lista de citas y usa el estilo secundario
- **AND** ningún rótulo de la tarjeta es "Evidencia" a secas ni "Relevancia de la evidencia"
- **AND** no aparece "Orden basado en la cita recuperada más relevante asociada a cada opción" (texto anterior de `basisRelevancia`)

#### Scenario: Con orden por aplicabilidad la presentación de la relevancia dice que solo desempata [US-062 AC-7] [RN-03] [RN-28] [S3 resp. 9]
- **GIVEN** una respuesta `con_evidencia` cuya opción trae aplicabilidad calculada (`perSource` no vacío, `l1d-130-herencia-aplicabilidad-recorte`)
- **WHEN** se renderiza la tarjeta
- **THEN** `relevance-basis` es exactamente "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."
- **AND** no aparece "Metadato de recuperación; no mide solidez clínica ni probabilidad." como texto completo de `relevance-basis`, ni "Orden basado en la cita recuperada más relevante asociada a cada opción"
- **AND** el bloque de relevancia sigue después de las citas, en estilo secundario, con el mismo rótulo, la misma nota y la misma ayuda

#### Scenario: Nota, base y ayuda de la relevancia [RN-03] [S3 resp. 9] [S1 resp. 28]
- **GIVEN** la tarjeta con `relevanceScore`
- **WHEN** se inspecciona el bloque de relevancia
- **THEN** incluye la nota, la presentación `relevance-basis` y la ayuda `relevance-help` de los escenarios de esta capacidad
- **AND** con el criterio de orden por aplicabilidad, `relevance-basis` dice que la relevancia solo desempata
- **AND** en ningún modo `relevance-basis` usa otro literal que el de su clave (`evidence.relevance.basis` o `evidence.relevance.basisRelevancia`)

### Requirement: Criterio de selección visible elegido por la respuesta
Encima de las opciones, el panel MUST mostrar una sola vez el texto del criterio de selección de la clave i18n `evidence.orderCriterion.relevance` cuando las opciones no traen aplicabilidad calculada, y el de `evidence.orderCriterion.applicability` cuando la traen `[S3 resp. 9]`; con el de aplicabilidad MUST añadir «La numeración indica la posición en el orden por aplicabilidad, no una preferencia.» El panel MUST NOT afirmar un orden que la respuesta no construyó. El texto es un criterio de orden, nunca una valoración clínica (RN-28, RN-23).

#### Scenario: Se lee el criterio neutro y no el de aplicabilidad [US-061 AC-3] [RN-28] [AC-10.1] [RN-23] [S1 resp. 28]
- **GIVEN** la respuesta del AC-1, con una opción sin aplicabilidad calculada (`perSource = []`)
- **WHEN** se renderiza
- **THEN** encima de la opción se lee exactamente "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica." `[S1 resp. 28]`
- **AND** no aparece "Ordenadas por coincidencia con la población estudiada, no por eficacia" ni el texto anterior "Seleccionada por relevancia de la búsqueda, no por eficacia…"

#### Scenario: Con la opción elegida por aplicabilidad se lee el criterio de orden por aplicabilidad [US-062 AC-7] [RN-28] [RN-03] [AC-08.8] [S3 resp. 9]
- **GIVEN** una respuesta `con_evidencia` cuya opción se eligió por aplicabilidad (US-125, `maxOptions = 1`) y trae aplicabilidad calculada
- **WHEN** se renderiza
- **THEN** encima de la opción se lee exactamente "Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de orden, no una valoración clínica."
- **AND** no aparece "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica."
- **AND** el texto no contiene "elegida", "recomendada" ni ningún término de la lista prohibida (US-068)

#### Scenario: El criterio de aplicabilidad se lee una sola vez con la frase de numeración sobre las tres tarjetas [US-135 AC-2] [RN-28] [AC-10.1] [docs/ux/S4 S4-01]
- **GIVEN** el panel de la respuesta de tres opciones del AC-1 de US-134 (FX-10c-a), todas con aplicabilidad calculada
- **WHEN** se inspecciona
- **THEN** encima de las tarjetas hay exactamente una aparición del texto de `evidence.orderCriterion.applicability`
- **AND** le sigue "La numeración indica la posición en el orden por aplicabilidad, no una preferencia."
- **AND** esa frase no aparece cuando el criterio mostrado es el de relevancia

## ADDED Requirements

### Requirement: Lista ordenada de hasta tres opciones en el orden recibido
El panel MUST mostrar `evidenceOptions[]` como una lista ordenada (`<ol>`) en el mismo orden del arreglo recibido, una tarjeta por opción con encabezado `h3` y el rótulo «Opción descrita {n} de {total}». El panel MUST NOT reordenar por `relevanceScore` ni por ningún otro campo (RN-28, RN-03). Cada tarjeta MUST conservar sus citas y cerrar con el bloque de relevancia.

#### Scenario: Tres tarjetas en el orden recibido con conteos, citas y relevancia al final [US-135 AC-1] [AC-10.1] [AC-10.2] [HU-10]
- **GIVEN** la respuesta del AC-1 de US-134 en Playwright contra Compose (perfil de test, FX-10c-a, `LLM-CUATRO`, `ANALYSIS_MAX_OPTIONS`=3)
- **WHEN** se renderiza el panel
- **THEN** bajo "Opciones descritas en la evidencia" hay 3 tarjetas en el orden O-B, O-D, O-C
- **AND** cada una muestra su línea de conteos con símbolo (`aria-hidden`) y palabra ("✓ Coincide 3 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 2" para O-B), compuesta por `ApplicabilityCounts` desde las claves `evidence.aplicabilidad.{coincide,parcial,noCoincide,desconocido}`, sus citas y, al final, el bloque de relevancia cuyo `relevance-basis` es "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."

#### Scenario: La UI no reordena por relevancia [US-135 AC-4] [RN-28] [RN-03]
- **GIVEN** una respuesta simulada en la que la segunda opción tiene mayor `relevanceScore` que la primera
- **WHEN** se renderiza
- **THEN** el orden visible es el del arreglo recibido

#### Scenario: Cada tarjeta es un elemento de lista con encabezado y rótulo de posición [US-135 AC-6] [NFR-12] [RN-23] [docs/ux/S4 S4-01]
- **GIVEN** el panel del AC-1
- **WHEN** se navega con teclado y se inspecciona el árbol de accesibilidad
- **THEN** las tarjetas son elementos de una `<ol>` y cada una tiene un `h3` propio
- **AND** se rotulan "Opción descrita 1 de 3", "Opción descrita 2 de 3" y "Opción descrita 3 de 3"
- **AND** ningún rótulo dice "mejor", "primera elección" ni "preferida"

### Requirement: Sin rótulos de jerarquía clínica en las tarjetas
Ninguna tarjeta MUST llevar rótulos, medallas, insignias ni números de ranking que indiquen jerarquía clínica ("Mejor opción", "Primera elección", "Preferida"); el único número permitido es la posición en la lista (RN-23).

#### Scenario: La lista de términos prohibidos no encuentra coincidencias en el panel de tres opciones [US-135 AC-3] [RN-23] [AC-10.3] (asumido en los rótulos no listados por RN-23)
- **GIVEN** el panel del AC-1
- **WHEN** se pasa la lista de términos prohibidos de US-068 sobre el DOM
- **THEN** no hay coincidencias
- **AND** ninguna tarjeta lleva "Mejor opción", "Primera elección", medallas ni números de ranking distintos de la posición en la lista

### Requirement: Opción de población no comparable visible en la lista
Una tarjeta con `populationNotComparable = true` MUST mostrar la etiqueta «Población no comparable» y MUST mostrarse completa, sin ocultarse ni plegarse (RN-26).

#### Scenario: La tercera tarjeta no comparable lleva la etiqueta y se muestra completa [US-135 AC-5] [AC-08.6] [RN-26]
- **GIVEN** la respuesta de `LLM-TRES` (orden O-B, O-C, O-A; O-A con `populationNotComparable = true`)
- **WHEN** se renderiza
- **THEN** la tercera tarjeta (O-A) lleva la etiqueta "Población no comparable"
- **AND** se muestran completas su justificación, su línea de conteos, sus citas y su relevancia

### Requirement: Opciones con soporte no mostradas por el límite se declaran sin su contenido
Cuando `analysisBasis.optionsNotShown` sea mayor que 0, el panel MUST mostrar bajo la última tarjeta un texto que declare cuántas opciones con soporte no se muestran por el límite, sin ningún dato de ellas ni otro acceso a ellas, y el anuncio de «Análisis listo» MUST añadir «{n} más con soporte no mostrada». Con `optionsNotShown` en 0 o ausente (análisis antiguo) el texto MUST NOT aparecer.

#### Scenario: Con una opción no mostrada se lee el texto y se anuncia [US-135 AC-7] [S4 resp. 7] [S4 resp. 11] [FR-09] [docs/ux/S4 S4-01]
- **GIVEN** la respuesta del AC-3 de US-134 con `analysisBasis.optionsNotShown = 1`
- **WHEN** se renderiza el panel
- **THEN** bajo la última tarjeta se lee "La evidencia describe 1 opción(es) más con soporte que no se muestran por el límite de 3, aplicado según el orden por aplicabilidad; el límite no es una valoración clínica de ellas. Una pregunta más específica puede mostrarlas."
- **AND** no aparece ningún dato de esa opción ni un enlace o control para abrirla
- **AND** el anuncio `role="status"` de «Análisis listo» añade "1 más con soporte no mostrada"

#### Scenario: Con cero o sin el campo no aparece el texto [US-135 AC-7] [S4 resp. 7] [FR-09]
- **GIVEN** una respuesta con `optionsNotShown = 0` y otra de un análisis antiguo sin el campo
- **WHEN** se renderizan
- **THEN** el texto de opciones no mostradas no aparece
- **AND** el anuncio no menciona opciones no mostradas

### Requirement: Regresión activa del aviso de IA en el panel de tres opciones
Con hasta tres tarjetas, la región `role="note"` del `AiDisclaimer` MUST seguir visible aunque las tres tarjetas estén desplegadas y contener la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» (el `disclaimer` de la respuesta, que por defecto termina en punto), y la cabecera MUST mostrar «Uso académico/investigación» (`es.app.academicUseLabel`) (RN-19, regresión US-069).

#### Scenario: El aviso de IA sigue visible con tres tarjetas desplegadas [RN-19] [US-069] [docs/ux/S4 S4-01]
- **GIVEN** el panel del AC-1 con las tres tarjetas desplegadas
- **WHEN** se recorre con `aviso-ia.spec.ts`
- **THEN** la región `role="note"` contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante»
- **AND** la cabecera muestra «Uso académico/investigación»
