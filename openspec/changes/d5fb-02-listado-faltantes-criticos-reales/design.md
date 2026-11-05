# Design — d5fb-02-listado-faltantes-criticos-reales

## Context

`patients.service.ts` arma cada `PatientListItem` con `missingCriticalCount: FALTANTES_CRITICOS_POR_AHORA` (0). El
servicio recibe ya `completitud: CompletenessService` (lo usa solo la ficha). `paginar()` es el único camino del listado
y de la búsqueda; ya agrupa en lote la identidad (`descifrarVarios`) y los pendientes de revisión
(`contarPendientesDeRevision`), así que el patrón «una consulta para toda la página» existe. `calcular(patientId)` hace
por paciente: lectura de `Diagnosis`, comprobación de existencia y una lectura por entidad de destino del catálogo
(`registrosSinFiltrarPorRevision`), y aplica el motor puro `calcularChecklist`. La ficha degrada con
`completenessAvailable = false` si falla (D7 de `l1d-95`).

## Decisions

- **D1 Cálculo en lote por página (elegida).** Se añade `calcularVarios(patientIds)` al puerto `CompletenessService` y
  `registrosSinFiltrarPorRevisionVarios(ids, entidades)` al repositorio: una consulta por entidad para todos los
  pacientes de la página (≈ 3–5 consultas por página, **independientes** del tamaño de página), agrupadas por paciente en
  memoria; luego el mismo `calcularChecklist` puro por paciente. Una sola regla: `calcular(id)` se reimplementa como
  `calcularVarios([id])` para que ficha, endpoint, análisis y listado no puedan divergir.
  Alternativas descartadas:
  - *A. `Promise.all(calcular)` por fila:* N × ~4 consultas por página (N = `PATIENTS_PAGE_SIZE`), agota el pool de
    conexiones con varios doctores y el p95 del listado crece linealmente con la página. Con un límite de concurrencia
    mitiga pero no elimina el N+1.
  - *B. Columna desnormalizada `missing_critical_count` actualizada al escribir:* listado instantáneo, pero un segundo
    origen de verdad que se desactualiza (cambio de catálogo, de `ENABLED_CANCER_TYPES`, escritura por la vía que
    olvide actualizarla) y exige migración; viola la regla «un solo servicio» de `l1d-95` D2.
  - *C. Contar en SQL con una consulta ad hoc:* duplica las reglas de los cinco pasos y el catálogo en SQL.
  - *D. Calcular solo para la fila abierta/bajo demanda desde la UI:* una petición por fila desde el navegador; peor
    N+1 y expone más rutas.
- **D2 Fallo = «no disponible», nunca un 0 inventado (RN-26).** `calcularVarios` devuelve por paciente
  `{ estado: 'ok', checklist } | { estado: 'no_disponible' }`. Un error al calcular un paciente (p. ej. fila corrupta) no
  tumba la página: esa fila sale con `missingCriticalCount = 0` y `completenessAvailable = false`. Si falla la consulta
  del lote, **todas** las filas salen así; el listado responde `200`, nunca `5xx` por esta causa. Se registra
  `checklist_no_disponible` con UUID del paciente (o conteo), `traceId` y clase de error; sin identidad, sin valores
  clínicos ni el error de `pg`. El resto de fallos del listado (identidad alterada → `500` genérico, `401`, `403`) no cambia.
- **D3 Contrato aditivo.** `PatientListItem.completenessAvailable` es propiedad **opcional** (ausente = `true`), como en
  `PatientSummary`: volver `missingCriticalCount` nulable sería un ERR de oasdiff (ADR-26). Se envía siempre explícito
  `false` en degradación y se omite cuando es `true`, de modo que las respuestas sanas no cambian de forma. Es un cambio
  menor: `info.version` pasa de `1.20.0` al siguiente menor libre (**`1.21.0`**, aprobado 2026-11-05). d5fb-04 tomará `1.22.0` y d5fb-05 `1.23.0` al rebasar.
  `contracts:generate` regenera `packages/api-contracts`.
- **D4 Tipo no habilitado o sin diagnóstico activo → 0 con `completenessAvailable = true`.** No es un fallo: `cancerTypeEnabled`
  ya viaja en el ítem y el contador es 0 por definición (igual que la ficha), sin cambio de contrato extra. La UI
  (otro agente) muestra «—» cuando `cancerTypeEnabled = false`. El stack de la demo tiene
  `ENABLED_CANCER_TYPES=mama,prostata`: los escenarios y tests cubren **ambas** configuraciones (con `mama,prostata`
  los pacientes de próstata tienen contadores reales; con solo `mama` salen con `cancerTypeEnabled=false` y 0).
- **D5 Administrador.** La vista `admin` (`conDatosClinicos = false`) **no invoca** `calcularVarios` ni lee tablas
  clínicas; `PatientAdminSummary` no cambia. La búsqueda comparte `paginar()` y por tanto hereda el cálculo en lote y la
  misma garantía; un test verifica que el fake de completitud no se invoca con sesión de `admin`.
- **D6 Seed: no se añaden pacientes (decisión aprobada 2026-11-05).** 10 de los 13 pacientes ya tienen faltantes con
  el catálogo real; el feedback («al menos 2») se cumple con solo calcular de verdad. La invariante de prueba es «≥ 2
  pacientes con `missingCriticalCount > 0`» y «el contador de cada fila iguala al de su ficha», sin atarla a un tipo.
- **D7 Rendimiento (decisión aprobada 2026-11-05).** Se usa el NFR existente del PRD: listado p95 ≤ 1 s. Se añade el
  criterio estructural «el número de consultas no crece con el tamaño de página», verificado por un test que cuenta
  consultas con página de 1 y de N. Sustituye a «sin regresión apreciable».
- **D8 Web.** La celda muestra el número cuando `completenessAvailable !== false` y «No disponible» (texto, no icono
  solo) cuando es `false`; sin mensaje de bloqueo (RN-26). La cadena va en `messages/es.json`. Lenguaje no prescriptivo
  (RN-23): «Faltantes críticos», sin «debe/urgente».
- **D9 Retiro del marcador.** `FALTANTES_CRITICOS_POR_AHORA` y su comentario se eliminan; el requisito «El listado y la
  búsqueda no calculan el checklist en el S4» se renombra y se modifica (delta de `patients-identity`).

## Privacidad y ownership

El cálculo ocurre en `clinical-api` (dueño del dato); no hay `rag-orchestrator` ni LLM (RN-12). El listado sigue sin
identidad en claro (RN-10); el contador es un entero. Logs: UUID del paciente, `traceId`, conteos y latencia; nunca
identidad, valores clínicos ni el error de `pg`. El `admin` no recibe contadores clínicos (PRD v1.4 §11).

## Contratos

Contract-first (`sync-contracts`), commit `contract(<id>)`; cambio aditivo (oasdiff sin ERR).

```yaml
components:
  schemas:
    PatientListItem:
      properties:
        completenessAvailable:
          type: boolean
          description: >-
            false si el checklist no pudo calcularse para este paciente; entonces missingCriticalCount = 0
            y no debe mostrarse como contador (RN-26). Ausente equivale a true.
```

Ejemplo nuevo en `contracts/examples/`: `patient-list-checklist-no-disponible.json` (`PatientPage` con una fila
`completenessAvailable = false` y otra con `missingCriticalCount > 0`), registrado en `index.json`.

## Risks / Trade-offs

- La consulta en lote debe respetar el filtro «sin filtrar por revisión» de `registrosSinFiltrarPorRevision` (un dato
  `requiere_revision` cuenta como presente sin verificar): la equivalencia con `calcular` se prueba para todos los
  pacientes del seed, no por muestra.
- `calcular` reimplementado sobre `calcularVarios` toca el camino de la ficha y del análisis: la suite existente de
  completitud actúa de red de seguridad (no se modifican sus aserciones).
- Latencia: el lote añade ≈ 4 consultas al listado; aceptable frente a N×4 (D1-A).
