# Proposal — l1d-171-catalogo-montaje-version

## Trazabilidad

L1D-171 · US-041 · FEAT-PL3 (L1D-32) · Sprint 2 · Estimación **5** · NFR-14 · RN-27 · RN-22 · ADR-29 · ADR-38 ·
AC-T1.4 · OL-02 (AC del `409`) · US-041 AC-1…AC-5

## Por qué

Las reglas y los códigos clínicos deben vivir en un catálogo versionado que ambos backends leen de la misma
fuente, para que cada análisis quede ligado a una versión conocida y un desajuste nunca produzca un resultado
silenciosamente inconsistente. Hoy el catálogo ya se monta de solo lectura (US-034) y `clinical-api` lee la
`version` de `manifest.json` (L1D-104), pero `rag-orchestrator` no compara versiones y `clinical-api` traduce
cualquier `409` a `502` (S1).

## Qué cambia

- `packages/clinical-catalogs`: estructura v1 (datos, no código, ADR-29): `manifest.json` (`version`,
  `cancerTypes`, `standards`), por tipo `codigos.json`, `sinonimos.json`, `tendencias.json` (estado `propuesta`
  hasta DEC-08) y archivos vacíos con su esquema para `datos-criticos.json`, `aplicabilidad.json`, `plantillas.json`.
- `rag-orchestrator`: carga el manifiesto al arrancar (sin él no queda listo) y responde
  `409 CATALOG_VERSION_MISMATCH` si `catalogVersion` del request difiere, **antes** de recuperar o invocar al LLM.
- `clinical-api`: traduce el `409` de catálogo a `409` público (no `502`) sin persistir `AIAnalysisRecord`;
  `/health` de ambos informa `catalogVersion`; catálogo ausente → no listo, con el evento único de `l1d-167`
  (`configuracion_invalida`, `motivo = catalogo_no_disponible`).
- Contratos: `info.version` `clinical-api` **1.7.0** y `rag-orchestrator` **1.5.0** (después de 1.6.0 / 1.4.0 de
  `l1d-167`); `catalogVersion` se añade al único `health-ok.json`.

## Capacidades

- `clinical-catalogs` (nueva, prevista en `openspec/config.yaml`): estructura, carga, versión y `409`.
- `evidence-analysis-gateway` (MODIFIED "Una sola tabla de mapeo de fallos de rag-orchestrator": el `409` de catálogo deja de ser `502`).
- `platform-observability` (MODIFIED "Health check de clinical-api independiente de la IA": `catalogVersion`, sobre el texto de `l1d-167`).
- `api-contracts` (MODIFIED "Health check declarado en ambos specs": `catalogVersion` y versiones 1.7.0 / 1.5.0).

## Bounded contexts

clinical-platform · ai-services · contratos (los dos `openapi.yaml`).

## Dependencias

- ↪ `l1d-167-config-validada-logs-json` (US-037): el módulo de configuración tipada donde entran
  `CLINICAL_CATALOG_PATH`/`CLINICAL_CATALOG_VERSION`, y el `HealthStatus` ya extendido (este change añade `catalogVersion`).
- ↪ US-033 (archivado, contrato congelado). Archivados: L1D-164 (montaje RO), L1D-104 (`catalog_version` en el registro).
- 🔗 Produce para `l1d-173-tipos-cancer-habilitados` (US-043: `cancerTypes` del manifiesto) y para US-039, US-052, US-055, FEAT-04 US-001.

## Fuera de alcance

Validación del contenido del catálogo (US-042, `si-hay-capacidad`); contenido de datos críticos (FEAT-04),
aplicabilidad (FEAT-08b) y plantillas (FEAT-05); umbrales de tendencia definitivos (DEC-08, S4).
