# Design — l1d-98-faltantes-al-analisis

## Context

El gateway (`crearEvidenceAnalysisService`, S1) lee el caso, corta si no hay tipo de cáncer o si el tipo no
está habilitado, construye el contexto por allowlist (`construirContextoPermitido`), lo desidentifica, consulta a
`rag-orchestrator` con plazo y cierra el análisis (`AnalysisCompletion`), que persiste el `AIAnalysisRecord`
antes de responder (RN-06). Hoy `construirContextoPermitido` fija `missingCriticalData: []` y `armarRegistro`
hereda `missingCriticalData: []` de `registroBase`. US-002 (L1D-94, change `l1d-94-checklist-determinista`) entrega en el S3 el
`CompletenessService` determinista del módulo `completeness`. Decisión de partida: `[S3 resp. 5]` (AC-8: si el
checklist falla, error).

## Goals / Non-Goals

**Goals:** faltantes calculados en el servidor en cada análisis; enviados como claves del catálogo en orden del
catálogo; persistidos con `continued_with_warning` y `catalog_version`; fallo cerrado si el checklist falla.

**Non-Goals:** inciso (b) de la Base (US-128, L1D-188, adelantada al S3, `[S3 resp. 18]`), uso en el prompt (US-116), aplicabilidad (US-124), UI (US-005).

## Decisions

### D1. Puerto `ChecklistDeFaltantes` en el módulo `evidence-analysis`

`ports.ts` añade:

```ts
/** Claves del catálogo en estado `faltante`, en el orden del catálogo (US-002). Lanza ChecklistNoDisponibleError. */
export interface ChecklistDeFaltantes {
  faltantes(patientId: string): Promise<readonly string[]>;
}
```

Un adaptador en `evidence-analysis.module.ts` lo implementa sobre `CompletenessService.calcular(patientId)` de L1D-94
(filtra `status === 'faltante'` y toma el campo `key` de cada ítem, sin reordenar). El service no conoce `CompletenessService` ni su
forma de ítem: si L1D-94 cambia su interfaz, solo cambia el adaptador. Cualquier excepción del adaptador se
envuelve en `ChecklistNoDisponibleError`. Descartadas: llamar al `CompletenessService` directo desde el service
(acopla dos módulos por su forma interna) y calcular los faltantes en `CasoRepository` (duplica la regla de
US-002).

### D2. Orden del flujo y punto de corte

`leerCaso → 404 / exigirTipoCancer → tipo_no_habilitado (sin checklist) → checklist.faltantes() →
construirContextoPermitido(caso, ahora, faltantes) → desidentificar → rag → cierre`. El checklist va **antes** de
desidentificar y de llamar a Backend 2: si falla (AC-8) no hay llamada saliente ni registro. Se calcula en cada
`POST`, nunca se toma del cliente ni de una caché, por eso un dato registrado entre la carga del panel y el
`POST` ya no figura (AC-4).

### D3. Una sola fuente de la lista: el request interno

`construirContextoPermitido` recibe `faltantes` como tercer parámetro y lo copia en `missingCriticalData` (copia
del arreglo, sin transformar). `armarRegistro` **sobrescribe** `missingCriticalData` con
`request.clinicalContext.missingCriticalData` después de `...registroBase(entrada)` (que lo deja en `[]`;
`armarRegistroTipoNoHabilitado` no lo sobrescribe y queda `[]`): lo persistido es exactamente lo enviado
(AC-1 = AC-2) sin un segundo campo en `EntradaDeCierre`. `continued_with_warning` ya viene de
`entrada.continueWithWarning` y `catalog_version` del `meta`/request (sin cambio). `AnalysisBasisBuilder` ya
recibe el request, así que US-128 leerá la lista de ahí sin cambiar la firma del puerto.

### D4. Fallo del checklist → `500 ERROR_INTERNO`

`rechazoDe()` mapea `ChecklistNoDisponibleError` a `ERROR_INTERNO` con `resultado = checklist_no_disponible` en
el log (sin mensaje del error original). Cuerpo `{ error, message, traceId }` del schema `ErrorInterno` ya
declarado. `[S3 resp. 5]`.

### D5. Versión de catálogo y cableado de `componerCompletitud`

`catalogVersion` del request sigue saliendo de `CatalogVersionProvider` (`manifest.json` de
`CLINICAL_CATALOG_PATH`), el mismo catálogo que carga `CompletenessService`. No se añade comparación entre ambas:
comparten fuente en el mismo proceso (AC-6 de US-002 lo cubre al cambiar `CLINICAL_CATALOG_PATH`).

`componerCompletitud` (`completeness.module.ts`) existe pero nadie lo cablea: L1D-94 (1.12b) trasladó el cableado a
L1D-95 y el change de seed de la O3 no lo hace. Este change lo **cablea en `composition.ts`/`server.ts`** con
`db: pool` y la misma `rutaDelCatalogo` (`CLINICAL_CATALOG_PATH`) y `leerArchivo` que `startup.ts` entrega a
`crearProveedorDeCatalogo`, de modo que `CatalogVersionProvider` y el checklist leen **el mismo catálogo**. El
servicio compuesto se inyecta (vía el adaptador del puerto) en `componerGatewayDeAnalisis`; si US-003 (L1D-95)
cablea después `/completeness`, reutiliza esa instancia.

## Privacidad y ownership

- **Frontera web → clinical-api:** sin cambio; el cliente no envía faltantes (solo `continueWithWarning`).
- **Frontera clinical-api → rag-orchestrator:** `missingCriticalData` viaja con claves del catálogo
  (`^[a-z0-9_]+$`), nunca etiquetas, valores, texto libre ni identificadores (RN-10, RN-11). El tipo
  `TextoEnmascarado` del contrato admite términos de catálogo sin cambio; el desidentificador no los altera.
  AC-6 lo verifica con la PII sintética de F-M2 generada en tiempo de test (no versionada).
- **Persistencia:** `missing_critical_data` y `clinical_context_snapshot` (sin `pseudoPatientId`) solo llevan
  claves del catálogo.
- **Logs:** el gateway no registra la lista; solo `traceId`, UUID del paciente y `resultado`.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`: recibe solo las claves dentro del contexto ya
  desidentificado. El checklist corre en Backend 1 (ADR-29).

## Contratos

- **Proveedor:** `clinical-api` (`POST /platform/evidence-analyses`) y `rag-orchestrator` (`POST /rag/query`);
  **consumidor:** `clinical-api` del contrato de `rag-orchestrator`.
- **Diff propuesto de `openapi.yaml`: ninguno.** `ClinicalContext.missingCriticalData` (`TextoEnmascarado[]`),
  `EvidenceAnalysisRequest.continueWithWarning`, `AnalysisBasis.missingCriticalData`/`continuedWithWarning` y la
  respuesta `500 ErrorInterno` existen desde US-033. Sin ejemplos nuevos en `contracts/examples/`: los mocks de
  MSW se construyen de los existentes y los tests comparan el request capturado con la lista esperada.
- Compatible con ADR-26 (contrato estable entre sprints); `oasdiff` no aplica. Respuestas validadas contra el
  spec del proveedor (US-214), incluido el `500`.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `ports.ts` | + `ChecklistDeFaltantes`, `ChecklistNoDisponibleError` | — |
| `evidence-analysis.service.ts` | + `checklist` en `DependenciasDelService`; paso del checklist (D2) | puerto `ChecklistDeFaltantes` |
| `clinical-context.builder.ts` | `construirContextoPermitido(caso, ahora, faltantes)` | — (función pura) |
| `analysis-record.ts` | `missingCriticalData` desde el request (D3) | — (función pura) |
| `evidence-analysis.controller.ts` | mapeo de `ChecklistNoDisponibleError` (D4) | — |
| `evidence-analysis.module.ts` | adaptador sobre `CompletenessService` (L1D-94) | módulo `completeness` |

Regla con nombre propio: ninguna nueva en dominio (la regla del checklist es de US-002); el filtrado
`faltante → clave` vive en el adaptador como `clavesFaltantes()`.

## Risks / Trade-offs

- **[Desfase con la Base dentro del S3]** → `missing_critical_data` lleva las claves mientras
  `analysisBasis.missingCriticalData = []` y el supuesto "Los faltantes críticos aún no se calculan en esta
  versión" sigue hasta que entre US-128 (L1D-188), adelantada al S3 (`[S3 resp. 18]`). Mitigación: **L1D-98 y
  L1D-188 deben mergear seguidos** (entre ambos merges la Base es incoherente con el registro); L1D-188 va en la
  oleada inmediata posterior y no se despliega una build intermedia.
- **[Faltantes falsos `re`/`rp` con el catálogo real]** → hasta que el change de seed de la O3 (renombra a `RE`/`RP`)
  mergee, el seed no satisface esas claves. Mitigación: L1D-98 va **después** del seed.
- **[`[]` no es «completo»]** → la lista vacía solo significa «ningún faltante» con diagnóstico y tipo habilitado;
  sin ellos el análisis se corta antes de calcular (D2) y `tipo_no_habilitado` persiste `[]` sin evaluar.
- **[Latencia]** → una lectura más por análisis; el p95 del análisis (15 s) lo domina Backend 2.
- **[Cambio futuro en la interfaz de L1D-94]** → aislado en el adaptador (D1).

## Open Questions

- **Q1 · cerrada (usuario, 2026-10-24, `[S3 resp. 18]`):** US-128 (L1D-188) se adelanta al S3 y es quien
  declara los faltantes en la Base (inciso (b) y retiro del supuesto "Los faltantes críticos aún no se calculan
  en esta versión"). Este change **no** toca el texto de la Base; L1D-188 depende de él (↪ L1D-98).
- **Q2 (dueño: Ingeniería · afecta: AC-4):** `GET …/completeness` (US-003) es del S4; el test del AC-4 calcula el
  checklist con `CompletenessService` antes de registrar `estado_menopausico` en lugar de llamar al endpoint.
- **Q3 (dueño: Ingeniería · afecta: AC-8):** el fallo del checklist se provoca inyectando por la *factory* un
  `ChecklistDeFaltantes` que lanza (borde del módulo, no `vi.mock` de módulos propios).
