# Design — l1d-171-catalogo-montaje-version

## Contexto

- Compose ya monta `packages/clinical-catalogs` con `read_only: true` en ambos backends y pasa `CLINICAL_CATALOG_PATH`
  (requisito "Catálogo clínico montado de solo lectura en ambos backends", US-034).
- `clinical-api`: `catalog-version.provider.ts` lee una vez `manifest.json` y falla el arranque sin él; el gateway ya
  envía `catalogVersion` en `RagQueryInternalRequest` y persiste `catalog_version` en `ai_analysis_record`.
- `rag-orchestrator`: lee `CLINICAL_CATALOG_PATH` solo para `lenguaje/terminos-prohibidos.json`; no compara versiones.
- Contratos: `rag-orchestrator` ya declara `409 CatalogVersionMismatch` (+ `rag-catalog-version-mismatch.json`);
  `clinical-api` **no** declara `409` en `createEvidenceAnalysis` ni `catalogVersion` en `HealthStatus`.

## Decisiones

**D1 · Fuente de la versión = `manifest.json`.** La versión efectiva es la del manifiesto montado (AC-4: cambiar
de catálogo sin reconstruir la imagen). `CLINICAL_CATALOG_VERSION`, si está declarada, es una **expectativa**: si
difiere del manifiesto, el servicio no queda listo y registra `configuracion_invalida` con
`variable = CLINICAL_CATALOG_VERSION` y `motivo = version_catalogo_distinta` (asumido; pendiente de confirmar
en el Gate 1). Descartada: tomar la versión de la variable (dos fuentes de verdad).

**D2 · El `409` se decide en el borde de la aplicación de B2, antes de todo trabajo.** `RAGOrchestratorService`
compara `solicitud.catalogVersion` con `CatalogoClinico.version()` como **primer** paso (regla extraída
`exigirMismaVersionDeCatalogo()`, dominio puro); con versión distinta lanza `CatalogVersionMismatch` que el `api/`
mapea a `409` con `message` fijo. Cero llamadas a embeddings, Milvus, LLM y NLI.

**D3 · Traducción en B1.** `mapearFalloRag()` gana una fila: `409` cuyo `error` es `CATALOG_VERSION_MISMATCH`
→ `409` público con `message` fijo del ejemplo nuevo y el `traceId` generado; sin persistir registro. Cualquier
otro `409` sigue en `502`. Una sola tabla (requisito vigente).

**D4 · Catálogo ausente.** Ambos backends: sin `manifest.json` legible en `CLINICAL_CATALOG_PATH` → no quedan
listos; log con el evento único de `l1d-167`:
`{"event":"configuracion_invalida","variable":"CLINICAL_CATALOG_PATH","regla":"manifest.json legible","motivo":"catalogo_no_disponible"}`,
sin ruta ni contenido.
`clinical-api` ya lo hace (L1D-104); `rag-orchestrator` lo añade en `bootstrap.py`.

**D5 · Estructura del paquete.** Esquemas JSON por archivo en `packages/clinical-catalogs/schemas/`; archivos
vacíos válidos (`{"version":"1.0.0","items":[]}`); `tendencias.json` con `estado: "propuesta"`. Ningún archivo
introduce códigos de estándares no permitidos (Q-07 / DEC-04: lo vigila US-042).

## Privacidad y ownership

- `catalogVersion` es un metadato sin datos de paciente; viaja como hoy en el request interno. El catálogo es de
  solo lectura y no contiene datos de pacientes. `rag-orchestrator` lee solo el catálogo montado (sin datos
  clínicos ni `clinical-minio`); el `409` no reenvía cuerpo ni `message` de B2 al navegador.

## Contratos

Proveedor `clinical-api` (consumidor `web`) — diff aditivo:

```yaml
  /platform/evidence-analyses:
    post:
      responses:
+       "409":
+         description: CATALOG_VERSION_MISMATCH — la versión del catálogo clínico difiere entre backends (NFR-14).
+         content:
+           application/json:
+             schema: { $ref: '#/components/schemas/ErrorCatalogVersionMismatch' }
  components:
    schemas:
+     ErrorCatalogVersionMismatch:
+       type: object
+       additionalProperties: false
+       required: [error, message, traceId]
+       properties:
+         error: { type: string, const: CATALOG_VERSION_MISMATCH }
+         message: { type: string }
+         traceId: { type: string }
      HealthStatus:
        properties:
+         catalogVersion: { type: string, minLength: 1 }
```

Proveedor `rag-orchestrator` (consumidor `clinical-api`): `HealthStatus.catalogVersion` opcional (aditivo); el `409`
ya existe. Ejemplos: `contracts/examples/error-catalog-version-mismatch.json` (nuevo, `message` fijo "La versión del
catálogo clínico difiere entre servicios." y `traceId` sintético, en `index.json`) y el **único** `health-ok.json` de
`l1d-167` ampliado con `catalogVersion` (queda con `status`, `configKeys`, `serviceVersion` y `catalogVersion` y valida
contra `HealthStatus` de ambos specs; sin ejemplo de health propio de `rag-orchestrator`). `info.version`:
`clinical-api` 1.6.0 → **1.7.0**, `rag-orchestrator` 1.4.0 → **1.5.0** (este change mergea después de `l1d-167`). `oasdiff`: añadir un código de respuesta
es aditivo para el proveedor; `web` debe manejarlo (lo muestra como fallo genérico con `traceId` hasta que la UI tenga
texto propio). Compatible con ADR-26. Zod, cliente TS y Pydantic se regeneran.

## Dependencias y colaboradores

- `rag-orchestrator`: `app/infrastructure/catalogo_clinico/manifiesto.py` (adapter que lee el manifiesto) tras el puerto
  `CatalogoClinico` en `application/ports.py`; `domain/catalogo.py` con `exigir_misma_version_de_catalogo()`;
  `api/errors.py` (mapeo a `409`); `api/health.py` (`catalogVersion`).
- `clinical-api`: `rag-failure.ts` (`mapearFalloRag()`, fila nueva), `routes/health.ts` (lee `CatalogVersionProvider`).
- `packages/clinical-catalogs/`: archivos y esquemas (sin código).

## Tests

AC-1/AC-2: Supertest con MSW hacia `rag-orchestrator` (desde los ejemplos) + Pytest del endpoint con adapters falsos
contando invocaciones; AC-3…AC-5: tests de arranque (Vitest/Pytest con ruta inyectada) y humo en contenedor para el RO
real (con *timeout* explícito).

## Riesgos

- `CLINICAL_CATALOG_VERSION` como expectativa (D1) puede chocar con la demo si el `.env` y el manifiesto divergen: el
  log lo nombra, falla rápido.

## Pendiente de definir

- D1 (semántica de `CLINICAL_CATALOG_VERSION`): asumida; confirmar en el Gate 1.
