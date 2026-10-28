# Proposal — l1d-141-estados-panel-criterio

## Trazabilidad

L1D-141 · US-062 · FEAT-10a (L1D-23) · Sprint 3 · Estimación **4** (3 → 4 por AC-7, `[S3 resp. 9]`) · HU-03 ·
Ticket OL-04 · FR-09 (bordes en la UI), RN-30 (UI del `429`), RN-20 (UI de `tipo_no_habilitado`), RN-28
(criterio visible), RN-02, RN-03, RN-26 · AC-10.4 ("sin evidencia"), AC-06.1 (códigos en la UI), AC-05.1
(validación de la pregunta), AC-08.8 (población no comparable) · US-062 AC-1…AC-7 · `[S3 resp. 6]` (texto
canónico de "sin evidencia"), `[S3 resp. 9]` (criterio de orden por aplicabilidad y línea de conteos),
`[S1 resp. 31]` (código de traza en el error) · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069 ·
DoR del S3: ✓ (`backlog/sprints/S3-refinamiento.md`; diseño `docs/ux/S3/pantallas-s3.md`, S3-01 y S3-02).

> **Decidido (usuario, 2026-10-23, `[S3 resp. 6]`):** el texto canónico de "sin evidencia" es el de
> `docs/ux/S1/pantallas-s1.md`, que ya usa la UI desde el S1; reemplaza al "No se encontró evidencia
> suficiente en las fuentes consultadas" de la versión anterior del AC.
>
> **Decidido (usuario, 2026-10-24, `[S3 resp. 9]`):** con US-125 en el S3, el rótulo "Ordenado por relevancia"
> dejaría de ser cierto; el panel muestra el criterio de orden por aplicabilidad, la línea de conteos de
> `applicabilitySummary` y el aviso de población no comparable (ya en el contrato). +1 pt.
>
> **Decidido (usuario, 2026-10-24):** `[S3 resp. 17]` el `AiDisclaimer` **se muestra** también con
> `tipo_no_habilitado` (spec vigente de `l1d-194`, RN-19; corrige S3-01 de `pantallas-s3.md`); se mantienen dos
> claves de `relevance.basis` (neutra del S1 y de aplicabilidad); texto del criterio (auditor de lenguaje,
> `maxOptions = 1`): "Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide;
> luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo
> desempata. Es un criterio de orden, no una valoración clínica."

## Why

El panel del S1 resuelve solo los estados mínimos (US-061): el doble clic puede emitir dos peticiones, una
pregunta de más de 2000 caracteres se trunca en silencio, el `429` cae en el mensaje genérico y "sin
evidencia" no dice su alcance ni qué se buscó. Además, con US-125 (L1D-130) la opción única del S3 se elige
por aplicabilidad, y el rótulo "Ordenado por relevancia de recuperación…" pasaría a ser falso (RN-28). El
oncólogo necesita distinguir una espera, una ausencia de evidencia y una falla, y leer el criterio de orden
real con los conteos que lo explican.

## What Changes

- **Espera (AC-1):** *skeleton* de la tarjeta, botón "Analizando…" deshabilitado y una sola petición aunque
  haya doble clic (guarda síncrona, no solo el estado de React).
- **Sin evidencia (AC-2):** se añade el alcance "La búsqueda se limita a las fuentes consultadas; no implica
  que no exista evidencia.", el bloque "Qué se buscó" (pregunta, idioma, fuentes consultadas) y la Base del
  análisis; nunca 0 como relevancia (RN-02).
- **Sesión expirada (AC-3):** E2E de la redirección a `/login?motivo=expirada` sin datos del paciente
  (comportamiento ya implementado en el S1; se cubre con test de aceptación).
- **Validación (AC-4):** la pregunta de 2001 caracteres ya no se trunca: error junto al campo
  (`aria-describedby`), contador "2001 / 2000" y sin petición; validación con el Zod generado de
  `EvidenceAnalysisRequest`.
- **Límite y fallos (AC-5):** `429` con `Retry-After` → "Se alcanzó el límite de análisis. Puedes reintentar
  en {s} segundos." con "Reintentar" activo al cumplirse el plazo; fallo de red → mensaje propio; `502/503/504`
  conservan sus mensajes del S1 con "Código de traza: [traceId]" y sin detalles internos.
- **Tipo no habilitado (AC-6):** se fija con test el texto "Tipo de cáncer fuera del alcance del piloto", la
  ausencia de tarjeta de opción y el aviso de IA visible (`[S3 resp. 17]`).
- **Criterio de orden por aplicabilidad (AC-7):** cuando la opción trae aplicabilidad calculada, el
  `OrderingCriterion` muestra el texto nuevo (clave `evidence.orderCriterion.applicability`), la tarjeta
  muestra la línea "Criterios del estudio frente a datos registrados:" con los cuatro conteos (símbolo +
  palabra, sin puntaje ni porcentaje) y, si `populationNotComparable = true`, el aviso no bloqueante;
  `evidence.relevance.basis` cambia a "Metadato de recuperación; solo desempata el orden por aplicabilidad.".
  Sin aplicabilidad calculada se conserva el criterio neutro del S1 y su texto de relevancia (clave
  `evidence.relevance.basisRelevancia`).
- Claves nuevas en `apps/web/messages/es.json` (`evidence.resultado.sinEvidenciaAlcance`,
  `evidence.resultado.queSeBusco`, `evidence.formulario.maximo`, `evidence.error.limite`, `evidence.error.red`,
  `evidence.orderCriterion.applicability` y las de la línea de conteos y del aviso de población), recorridas
  por `lint:lenguaje` (US-068).
- **Sin cambio de contrato ni del BFF**: `applicabilitySummary`, `populationNotComparable`, `warnings` y el
  `429` con `Retry-After` ya están en `apps/clinical-api/openapi.yaml`; el Route Handler ya retransmite
  `Retry-After` (`web-bff`, "Errores de clinical-api retransmitidos sin reinterpretar").

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-panel`: capacidad introducida por `l1d-140-panel-opcion-citas` (US-061), aún sin archivar. Se
  modifican "Relevancia como metadato secundario" (nuevo `relevance-basis`), "Criterio de selección visible
  elegido por la respuesta" (texto por aplicabilidad, activa la regresión [RN-28] que el S1 anotó) y
  "Estados mínimos del resultado en el S1" (alcance de "sin evidencia" y "Qué se buscó"); se añaden los
  requisitos de espera, validación, límite, fallo de red, tipo no habilitado, línea de conteos y aviso de
  población no comparable.

## Bounded contexts

- **frontend** (`apps/web`: componentes, reglas puras de `lib/evidence/`, `messages/es.json`, tests de
  componente y E2E).
- `clinical-platform` (Route Handlers, `clinical-api`) y `ai-services`: no se tocan.
- `contratos`: sin diff; solo se reutilizan ejemplos de `contracts/examples/` y, si no está ya en `main`, el
  ejemplo con aplicabilidad que crea `l1d-130-herencia-aplicabilidad-recorte`.

## Dependencias

- ↪ `l1d-140-panel-opcion-citas` (US-061): panel, componentes y capacidad `evidence-panel`; **debe archivarse
  antes** que este change para que los MODIFIED apliquen sobre `openspec/specs/evidence-panel/spec.md`. Hasta entonces `openspec validate --strict` de este change puede
  fallar solo por esa dependencia.
- ↪ `l1d-139-bff-route-handler-analisis` (US-060, archivado): Route Handler y retransmisión de `Retry-After`.
- ↪ `l1d-130-herencia-aplicabilidad-recorte` (US-125): **solo AC-7**; produce `applicabilitySummary`,
  `perSource` y `populationNotComparable` reales y el ejemplo `con-evidencia-s3-aplicabilidad.json` (o la
  ampliación de `rag-query-aplicabilidad-a-m1.json`). Los AC-1…AC-6 no dependen de él.
- ↪ `l1d-187-panel-base-analisis` (US-067): Base del análisis y "Qué se buscó" visibles (AC-2).
- ↪ `l1d-194-aviso-ia-etiqueta-academica` (US-069) y `l1d-193` (US-068, archivado): `AiDisclaimer` y
  `lint:lenguaje` sobre las claves nuevas.
- ↪ `l1d-197-sesion-login-guard` (US-211): redirección por `401` (AC-3).
- ↪ `l1d-173-tipos-cancer-habilitados` (US-043): `status = tipo_no_habilitado` y `ScopeNotice` (AC-6).
- Comparte archivos con **US-237 (L1D-288)**, mismo panel (S3-03, "Motivos:" en solo descartadas): coordinar
  la oleada; sin solape de requisitos.

## Fuera de alcance

- Progreso por pasos y botón Cancelar: ADR-42 (S4); en el S3, indicador indeterminado.
- Tabla de aplicabilidad por criterio, `perSource` visible y causa del Desconocido: US-126 (S4).
- Hasta 3 opciones ordenadas (`ANALYSIS_MAX_OPTIONS = 3`): US-134 (S4).
- Emisión real del `429` con `Retry-After` por `clinical-api`: US-056/US-234 (Regresión [RN-30] activa desde
  S4); aquí se prueba con MSW desde el contrato.
- Resumen por motivo cuando todo se descarta: US-237 (L1D-288).
- `warnings` de la opción distintos de `poblacion_no_comparable`.

## Impact

- `apps/web/components/organisms/` (`evidence-panel.tsx`, `evidence-query-form.tsx`, `analysis-result.tsx`,
  `evidence-option-card.tsx`, `ordering-criterion.tsx`), `apps/web/components/molecules/` (`analysis-failure.tsx`,
  `relevance-meta.tsx` y moléculas nuevas de la línea de conteos y del aviso no bloqueante),
  `apps/web/lib/evidence/` (`criterio-de-orden.ts`, `fase-del-panel.ts`, `solicitar-analisis.ts`,
  `clasificar-fallo.ts` y reglas nuevas), `apps/web/messages/es.json`.
- Tests: `apps/web/tests/ui/` y `apps/web/tests/lib/` (Vitest + Testing Library + MSW) y
  `apps/web/e2e/panel-analisis.spec.ts` (Playwright).
- Sin dependencias nuevas, sin cambio de API ni de CSP.
