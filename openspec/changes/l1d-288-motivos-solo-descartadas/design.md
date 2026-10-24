# Design — l1d-288-motivos-solo-descartadas

## Context

Pantalla de referencia: `docs/ux/S3/pantallas-s3.md` **S3-03** ("Solo descartadas con resumen por motivo"),
que extiende el estado "Solo descartadas" de `docs/ux/S1/pantallas-s1.md` (tabla de estados, S1-08/09), con
`docs/ux/sistema-de-diseno.md` como base. Sin desviaciones del diseño.

Estado observado:

- `apps/web/components/organisms/analysis-result.tsx` (70 líneas) pinta `<p>{resultado.soloDescartadas}</p>`
  cuando `clasificarResultado()` devuelve `solo_descartadas`, y después `DiscardedOptions` (64 líneas), que ya
  muestra `evidence.discardReason[descartada.discardReason]` por opción.
- `apps/web/messages/es.json` tiene `evidence.resultado.soloDescartadas` y `evidence.discardReason.*` con las
  cuatro etiquetas. (La historia nombra la clave `analysis.soloDescartadas`; la clave real es
  `evidence.resultado.soloDescartadas`, la misma que cita el diseño S3-03. Se sigue el código y el diseño.)
- Contrato: `discardReason` enum `[cita_invalida, afirmacion_sin_soporte, sin_citas,
  solo_soportada_por_analisis_previo]` en `contracts/schemas/evidence.yaml`; ese orden es el del resumen.
- `apps/rag-orchestrator/app/application/rag_orchestrator_service.py`, `_validar_citas_y_ensamblar`, registra
  `event=rag_query_citas traceId=%s opcionesAceptadas=%d opcionesDescartadas=%d` tras `validar_citas()`;
  `MotivoDeDescarte` (`app/domain/citations.py`) solo tiene `sin_citas` y `cita_invalida` (los otros dos
  motivos los produce la etapa de soporte, con su propio evento `rag_query_soporte`).
- El ejemplo `contracts/examples/con-evidencia-solo-descartadas.json` solo tiene una descartada
  `afirmacion_sin_soporte`; lo usan los tests de US-061, así que no se modifica.

## Goals / Non-Goals

**Goals:** resumen por motivo bajo el titular del estado "Solo descartadas"; recuento por motivo de citas en
el log; ningún cambio de `openapi.yaml`.

**Non-Goals:** cambiar titular o etiquetas; resumen cuando hay aceptadas; métricas o persistencia del
recuento; cualquier estado de `L1D-141 (US-062)`.

## Decisions

### D1 · Regla pura `resumirMotivos()` en `lib/evidence/`

`resumirMotivos(descartadas) → Array<{ motivo, n }>`: agrupa por `discardReason`, omite los motivos sin
descartadas y ordena por el índice del enum del contrato. El orden se toma de la constante generada del enum
(`packages/api-contracts`, si el generador la emite) o, si no, de una tupla `ORDEN_DE_MOTIVOS` tipada contra el
tipo generado `DiscardReason` (el compilador rompe si el contrato añade un motivo). Unitarios uno a uno: un
motivo, dos motivos en orden inverso al de llegada, motivo repetido.

### D2 · Molécula `DiscardReasonsSummary`

Recibe la lista de D1 y pinta "Motivos:" (`evidence.discarded.motivos`) y un `<ul>` con una línea por motivo:
"{n} × {etiqueta}" si hay ≥ 2 motivos distintos; con un solo motivo distinto, solo la etiqueta (AC-1: "aparece
una vez el motivo", sin "1 ×"; S3-03). Etiqueta = `evidence.discardReason[motivo]`, nunca texto nuevo (AC-3).
Solo texto: sin `chunkId`, `option` ni `unsupportedClaims`. `AnalysisResult` la monta justo bajo el titular,
solo con `clase === 'solo_descartadas'`.

*Alternativa descartada:* resumir dentro de `DiscardedOptions` — quedaría plegado y no "bajo el titular".

### D3 · Log con recuento por motivo

Tras `validar_citas()`, el mismo `logger.info` añade `sinCitas=%d citaInvalida=%d`, calculados con una
función pura de dominio `contar_por_motivo(descartadas) → Mapping[MotivoDeDescarte, int]` (cero si no hay).
Solo enteros y `traceId`; ningún campo de la opción. La redacción de logs (`platform-observability`) no cambia.
El test de AC-5 lee la salida con `parsear_lineas_json()` (`tests/support/logs.py`) y comprueba que el registro
`rag_query_citas` es una línea JSON válida del `FormateadorJson` (`app/config/logging.py`) con el `traceId` de la
consulta (hallazgo menor de `privacy-guardian`), además de `exigir_sin_valores_prohibidos()` para `chunkId`,
texto de opción y pregunta.

*Alternativa descartada:* un evento nuevo `rag_query_descartes` — AC-5 pide el campo en `rag_query_citas`.

### D4 · Ejemplos del contrato para AC-1…AC-3

Tres `EvidenceAnalysis` nuevos en `contracts/examples/`, derivados de `con-evidencia-solo-descartadas.json`
(mismo `disclaimer` literal, `evidenceOptions = []`, datos sintéticos, NCCN/ESMO solo en `sourcesNotIncluded`):
`con-evidencia-solo-descartadas-cita-invalida.json` (dos `cita_invalida`), `…-motivos-mixtos.json` (una
`sin_citas` y dos `cita_invalida`, en ese orden de llegada para probar el reordenamiento) y
`…-otros-motivos.json` (`afirmacion_sin_soporte` y `solo_soportada_por_analisis_previo`). Registrados en
`index.json` con target `#/components/schemas/EvidenceAnalysis`.

## Componentes y patrones

| Componente | Nivel | Cambio | `'use client'` |
|---|---|---|---|
| `AnalysisResult` | organismo | monta `DiscardReasonsSummary` bajo el titular (≈ +3 líneas, < 100) | hereda de `EvidencePanel` |
| `DiscardReasonsSummary` | molécula **nueva** | D2 (≈ 25 líneas) | hereda |
| `DiscardedOptions` | organismo | sin cambios | hereda |

Sin hooks, *providers*, *compound components* ni *render props* (un solo consumidor; YAGNI). La página sigue
siendo RSC; la única frontera cliente sigue siendo `EvidencePanel`.

## Dependencias y colaboradores

- `resumirMotivos()` (D1) — pura, sin E/S; depende solo del tipo generado `DiscardReason`.
- `DiscardReasonsSummary` depende de `lib/mensajes` y de la salida de D1; no de `fetch`.
- `contar_por_motivo()` (D3) en `app/domain/citations.py` — pura; el service la llama, no la reimplementa.
- Ningún puerto ni adapter nuevo; ningún cliente concreto en services o domain.

## Privacidad y ownership

- Fronteras sin cambio: navegador → `web` (`/api/evidence-analyses`) → `clinical-api` → `rag-orchestrator`. El
  panel solo lee `discardedOptions[].discardReason`, ya presente en la respuesta. La desidentificación (RN-11)
  no cambia; `rag-orchestrator` sigue sin tocar datos clínicos ni `clinical-minio`.
- **Log (RN-14):** `rag_query_citas` solo añade dos enteros; nunca `chunkId`, texto de opción, de pregunta ni
  de cita. Lo verifica el escenario de AC-5.
- **Seguridad web:** sin validación nueva (la respuesta ya se valida con el Zod generado de `EvidenceAnalysis`
  en `solicitar-analisis.ts`); sin variables `NEXT_PUBLIC_` nuevas; sin módulos `server-only` nuevos; las
  etiquetas vienen de `messages/es.json` y se renderizan como texto de React (sin `dangerouslySetInnerHTML`);
  sin impacto en CSP ni cabeceras; sin dependencias nuevas (`npm audit` no cambia).

## Contratos

- Proveedores `clinical-api` y `rag-orchestrator`; consumidores `web` y `clinical-api`. **Sin diff** de
  `apps/clinical-api/openapi.yaml` ni de `apps/rag-orchestrator/openapi.yaml`; `contracts:breaking` (oasdiff)
  vacío; compatible con ADR-26 (AC-6).
- Ejemplos nuevos (D4) en `contracts/examples/` + `index.json`, validados por `contracts:check`; commit
  `contract(L1D-288)`. No se modifica `con-evidencia-solo-descartadas.json`.

## Risks / Trade-offs

- [Archivos compartidos con `L1D-141 (US-062)`: `analysis-result.tsx` y `es.json`] → conflicto de merge.
  Mitigación: L1D-141 primero y *rebase* de este change; claves distintas y bloques distintos del componente.
- [Archivo compartido con `l1d-287-alias-chunks-cita` en `_validar_citas_y_ensamblar`] → orden fijado
  `[S3 resp. 15]`: l1d-287 primero; este change hace *rebase* (conflicto trivial: el log va tras `validar_citas`).
- [El enum del contrato gana un motivo] → D1 tipa el orden contra el tipo generado: rompe el build en vez de
  omitir el motivo en silencio.

## Migration Plan

Sin migración. Rollback: revertir el PR; el contrato no cambia. El archivo de este change exige
`l1d-140-panel-opcion-citas` archivado antes (capacidad `evidence-panel`).

## Open Questions

- **Q1 · "1 ×" con un solo motivo — resuelta** (`docs/ux/S3/pantallas-s3.md` S3-03): un solo motivo distinto ⇒
  solo la etiqueta, sin "1 ×" ni recuento aunque haya varias descartadas (p. ej., dos `cita_invalida` ⇒ «La cita
  no corresponde a un fragmento recuperado»). Es la regla de D2.
- **Q2 · Ejemplos nuevos frente a AC-6.** AC-6 dice "contracts:check … no hay cambios"; este change añade
  ejemplos (no `openapi.yaml`). Se interpreta AC-6 como "sin diff de los `openapi.yaml`". Confirmar.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-23] → US-068 (`lint:lenguaje` y E2E de términos prohibidos recorren el estado nuevo).
- Regresión [RN-19] → US-069 (aviso de IA en los estados con salida).
- Regresión [RN-01] → `evidence-analysis` "Una opción sin citas se descarta" y "Solo son citables los chunks
  recuperados en esta consulta" (el log no cambia la regla).
