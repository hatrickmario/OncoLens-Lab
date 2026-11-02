## Trazabilidad

L1D-145 · US-135 · FEAT-10c · Sprint 4 · HU-10 · FR-09 (UI del S4; opciones no mostradas, `[S4 resp. 7]`) · RN-28 (texto del criterio) · RN-03 · RN-23 · RN-19 (regresión) · RN-26 · NFR-12 · AC-10.1 (UI) · AC-10.2 (varias tarjetas) · AC-08.6 · `docs/ux/S4` S4-01 (variante A) · `[S4 resp. 6a]` `[S4 resp. 7]` `[S4 resp. 11]`

## Por qué

Hasta el S3 el panel muestra una sola opción. Con US-134 (L1D-144) `clinical-api` devuelve hasta `maxOptions` (3) opciones ya ordenadas por aplicabilidad y `analysisBasis.optionsNotShown`. El oncólogo compara (P6, JTBD 4): necesita ver hasta tres tarjetas en **el orden recibido**, con el criterio de orden explicado y sin que el primer lugar parezca "la mejor opción" (RN-23, RN-28).

## Qué cambia

- `web` renderiza `evidenceOptions[]` como lista ordenada (`<ol>`), una tarjeta por opción con `h3` y rótulo «Opción descrita {n} de {total}».
- Encima de la lista, una sola vez, el criterio de orden de aplicabilidad (`evidence.orderCriterion.applicability`, sin cambios) seguido de «La numeración indica la posición en el orden por aplicabilidad, no una preferencia.»
- Sin lógica de orden en `web`: el orden visible es el del arreglo recibido, aunque la segunda opción tenga más `relevanceScore`.
- Sin rótulos de jerarquía clínica ("Mejor opción", "Primera elección", medallas, ranking).
- Con `analysisBasis.optionsNotShown > 0`, bajo la última tarjeta, el texto de opciones no mostradas por el límite (sin contenido de esas opciones); el anuncio de «Análisis listo» añade «{n} más con soporte no mostrada». Con 0 o ausente (análisis antiguo) no aparece.
- Tarjeta con población no comparable (`populationNotComparable`) se muestra completa con la etiqueta «Población no comparable».
- Un literal de `relevance-basis` por modo, reutilizando las claves existentes `evidence.relevance.basis` (aplicabilidad) y `evidence.relevance.basisRelevancia` (relevancia) con valores nuevos.
- Un solo formato del resumen por conteos (símbolo `aria-hidden` + palabra + número) en tarjeta y tabla (L1D-131), desde `evidence.aplicabilidad.*`.
- Regresión activa [RN-19]: con tres tarjetas, la región `role="note"` (`AiDisclaimer`) contiene «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» (subcadena del `disclaimer`) y la cabecera muestra «Uso académico/investigación».
- Literales en `apps/web/messages/es.json` (variante A de `docs/ux/S4/pantallas-s4.md`), recorridos por US-068.

## Capacidades afectadas

- `evidence-panel` (MODIFIED: relevancia como metadato secundario, criterio de selección visible; ADDED: lista ordenada de hasta 3 opciones, orden recibido sin reordenar, sin jerarquía clínica, opciones no mostradas, etiqueta de población no comparable en la lista, regresión activa del aviso de IA).
- Bounded contexts: **frontend** (único). Sin cambio de API: no hay sección de contrato con diff (el campo `optionsNotShown` y los ejemplos los aporta L1D-144).

## Dependencias

- ↪ `l1d-144-hasta-3-opciones-orden-aplicabilidad` (US-134: respuesta con 3 opciones en orden, `analysisBasis.optionsNotShown`, ejemplos `contracts/examples/`). Los tests de componente pueden arrancar con ejemplos propios, pero el E2E AC-1 y AC-7 necesitan US-134 en `main`.
- ↪ `l1d-140-panel-opcion-citas` (US-061, archivado: `EvidenceOptionCard`, relevancia, citas).
- ↪ `l1d-141-estados-panel-criterio` (archivado: línea de conteos, aviso no comparable, criterio de orden).
- ↪ `l1d-131` (US-126: tabla/resumen de aplicabilidad desplegable por opción y texto de criterio; la tarjeta compone `OptionApplicability`). ⛔ no bloquea los AC de esta historia (la tabla no es parte de ella), pero comparten `EvidenceOptionCard`: coordinar el orden de merge.
- 🔗 Consume: US-136 y US-101 (avisos de conflicto, faltantes y sin verificar, S5; no se renderizan aquí). 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069.
- ⛔ ADR-39 no aplica (LLM fingido en E2E).

## Fuera de alcance

- Tabla de aplicabilidad por criterio y lista de población (US-126, ADR-47).
- Motivo de descarte separado (US-246); avisos sin verificar/conflicto (US-101, US-136, S5); preguntas de seguimiento (S5).
- Cualquier acceso a las opciones no mostradas distinto del texto; cualquier lógica de orden, puntaje combinado o "nivel de evidencia" (RN-28).
- Streaming de progreso (US-015 · ADR-42).

## Impacto

`apps/web/components/organisms/{analysis-result,evidence-option-card,ordering-criterion}.tsx`, nuevo `evidence-options-list.tsx` (plantilla/organismo), `lib/evidence/anuncio-de-estado.ts`, `messages/es.json`, tests en `apps/web/tests/ui/` y `apps/web/e2e/`.
