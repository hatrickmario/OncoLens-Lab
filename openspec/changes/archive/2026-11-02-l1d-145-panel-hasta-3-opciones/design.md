## Contexto

`AnalysisResult` ya itera `evidenceOptions` con `EvidenceOptionCard` y muestra `OrderingCriterion`. Esta historia añade la plantilla de lista, la numeración por posición, el texto de opciones no mostradas y los literales de `docs/ux/S4/pantallas-s4.md` (variante A, elegida por el usuario el 2026-10-29). Referencia de UI: `docs/ux/sistema-de-diseno.md` (Mesa de trabajo), `docs/ux/S3/pantallas-s3.md` y `docs/ux/S4/pantallas-s4.md` S4-01; sin desviaciones.

## Decisiones

- **D1 · Lista ordenada.** Nuevo `EvidenceOptionsList` (un concepto: la `<ol>` y la numeración) que mapea `analisis.evidenceOptions` en el orden recibido; `<li>` por tarjeta con `h3` (el `option`) y rótulo «Opción descrita {n} de {total}» generado desde `es.json` con interpolación. Sin `sort`, sin `reverse`: un test fija que el orden del DOM es el del arreglo (AC-4, RN-28).
- **D2 · Criterio una sola vez.** `OrderingCriterion` se renderiza una vez encima de la lista; con aplicabilidad calculada añade la clave nueva `evidence.orderCriterion.numeracion`. La elección de clave sigue en `elegirCriterioDeOrden` (todas las opciones con aplicabilidad → aplicabilidad; si no, relevancia). La frase de numeración se muestra solo si el orden es por aplicabilidad (el panel no afirma un orden que la respuesta no construyó).
- **D3 · Sin jerarquía.** Ningún texto, clase ni `aria-label` con "mejor", "primera elección", "preferida"; la numeración es posición, no ranking. Se recorre el DOM con la lista de US-068 (`lint:lenguaje` y E2E `lenguaje-no-prescriptivo`).
- **D4 · Opciones no mostradas.** Regla pura `textoOpcionesNoMostradas(basis)` → `null` si `optionsNotShown` es `0`, ausente o no entero positivo; si no, la clave `evidence.resultado.noMostradas` con `{n}`. Se muestra bajo la última tarjeta, sin ningún dato de esas opciones. `anuncio-de-estado.ts` añade «{n} más con soporte no mostrada» al anuncio `role="status"` (NFR-12). El campo es decisión de diseño de la sesión principal, a confirmar en la revisión del PR (`[S4 resp. 11]`).
- **D5 · Población no comparable.** Reutiliza `NonBlockingNotice` de l1d-141; la etiqueta visible «Población no comparable» se añade a la tarjeta (AC-5) sin ocultar ni compactar la tarjeta.
- **D6 · Relevancia al cierre, un literal por modo.** La tarjeta termina con el bloque de relevancia (RN-03), después de las citas. Q1 resuelta (Gate 1, lenguaje #14): convive con `relevance-label`, la nota y `relevance-help` vigentes, y **reutiliza las claves existentes** de `relevance-basis` (`CLAVE_BASE_APLICABILIDAD` / `CLAVE_BASE_RELEVANCIA` de `lib/evidence/criterio-de-orden.ts`), cambiando solo su valor en `es.json`: `evidence.relevance.basis` = «Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad.» y `evidence.relevance.basisRelevancia` = «Metadato de recuperación; no mide solidez clínica ni probabilidad.» No se crea clave nueva; el texto «Metadato de la búsqueda; …» de `pantallas-s4.md` queda sustituido por estos dos. Se refleja como MODIFIED de «Relevancia como metadato secundario».
- **D7 · Un solo formato del resumen por conteos.** Tarjeta (este change) y tabla (L1D-131) usan el mismo formato «✓ Coincide 3 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 2»: símbolo `aria-hidden` + palabra + número, compuesto por la molécula existente `ApplicabilityCounts` desde la única familia de claves `evidence.aplicabilidad.{coincide,parcial,noCoincide,desconocido}`; ninguna otra clave ni plural («coinciden», «desconocidos»).
- **D8 · Regresión activa [RN-19].** Con tres tarjetas, la región `role="note"` del `AiDisclaimer` (muestra tal cual el `disclaimer` de la respuesta) sigue visible y contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante», y la cabecera muestra «Uso académico/investigación» (`es.app.academicUseLabel`); `aviso-ia.spec.ts` recorre la lista.
- **Alternativas:** decisión barata de revertir (solo UI); se descartan en una línea las variantes B y C de S4-01 (la A fue elegida por el usuario).

## Privacidad y ownership

`web` solo recibe `EvidenceAnalysis` desde `/api/evidence-analyses` (mismo origen); no se envían ni almacenan datos nuevos, no cruza ninguna frontera nueva. Sin identidad ni PHI en el panel (solo «Paciente · ID» de 8 caracteres). `rag-orchestrator` no interviene ni toca datos clínicos ni `clinical-minio`.

**Seguridad web:** sin schema Zod nuevo (la respuesta ya se valida con el generado de `EvidenceAnalysis`; `optionsNotShown` llega por US-134 al contrato); sin variables `NEXT_PUBLIC_` nuevas; sin módulos `server-only` nuevos; el texto del LLM y del corpus se renderiza como texto, nunca como HTML (sin `dangerouslySetInnerHTML`); sin cambios de CSP ni cabeceras; sin dependencias nuevas (no aplica auditoría).

## Componentes y patrones

- Nuevo: `EvidenceOptionsList` (organismo, ≤100 líneas). Modificados: `AnalysisResult` (usa la lista), `EvidenceOptionCard` (rótulo de posición y etiqueta no comparable), `OrderingCriterion` (frase de numeración). Nueva función pura en `lib/evidence/` para D4.
- Sin patrones nuevos (sin hooks, providers ni render props): YAGNI. Todo permanece RSC-agnóstico dentro del `'use client'` existente de `AnalysisResult`; no se monta ningún `'use client'` ni provider nuevo.

## Dependencias y colaboradores

`EvidenceOptionsList` depende solo de los tipos generados (`EvidenceOption`) y de `mensajes()`; ningún cliente concreto. Reglas con nombre propio: `textoOpcionesNoMostradas()` (FR-09, `[S4 resp. 7]`), `etiquetaDePosicion(n, total)` (RN-23). `elegirCriterioDeOrden` sin cambios.

## Contratos

Sin diff de `openapi.yaml`: `web` es consumidor. El proveedor es `clinical-api`; `analysisBasis.optionsNotShown` (aditivo, no incompatible, compatible con ADR-26) y los ejemplos de 3 opciones los añade US-134 (L1D-144). Los tests de componente y los handlers MSW usan `contracts/examples/`: `con-evidencia-s4.json` y, de L1D-144, `con-evidencia-s4-tres-opciones.json` (`optionsNotShown = 1`) y `con-evidencia-s4-tres-opciones-no-comparable.json` (`LLM-TRES`, O-A no comparable tercera, `optionsNotShown = 0`); el E2E con el LLM fake usa sus pares `rag-query-tres-opciones.json` y `rag-query-tres-opciones-no-comparable.json`. `LLM-TRES` / `LLM-CUATRO` de FX-10c-a se fijan en el perfil de test de los backends.

## Riesgos

- Q1 (texto de relevancia) resuelta en D6; el valor de `relevance.basisRelevancia` cambia también para las respuestas sin aplicabilidad del S1–S3 (regresión de US-061 AC-2 actualizada en el MODIFIED).
- `EvidenceOptionCard` lo tocan también US-126 (L1D-131) y US-101/136: merges por oleada.
