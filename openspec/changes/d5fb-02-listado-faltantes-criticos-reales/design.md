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
  menor: `info.version` pasa de `1.20.0` al siguiente menor libre (**tentativo `1.21.0`**). La cadena de versiones de
  `clinical-api` la fija el orden real de merges: al aplicar, rebasar sobre `main` y tomar el siguiente menor; otros
  changes abiertos que tocan `openapi.yaml` rebasan sobre este o viceversa (misma convención que `l1d-95`).
  `contracts:generate` regenera `packages/api-contracts`.
- **D4 Tipo no habilitado o sin diagnóstico activo → 0 con `completenessAvailable = true`.** No es un fallo: `cancerTypeEnabled`
  ya viaja en el ítem y el contador es 0 por definición (igual que la ficha). En el stack de demo
  (`ENABLED_CANCER_TYPES=mama`) los pacientes de próstata (l)–(m) seguirán en 0 y es lo correcto; la UI ya los distingue
  por `cancerTypeEnabled`.
- **D5 Administrador.** La vista `admin` (`conDatosClinicos = false`) **no invoca** `calcularVarios` ni lee tablas
  clínicas; `PatientAdminSummary` no cambia. La búsqueda comparte `paginar()` y por tanto hereda el cálculo en lote y la
  misma garantía; un test verifica que el fake de completitud no se invoca con sesión de `admin`.
- **D6 ¿Hace falta añadir pacientes al seed? (pregunta abierta, previsiblemente no).** El seed de 13 pacientes
  (`docs/demo/guia-demo-S5.md`) ya tiene faltantes calculados en (g) (4: HER2 por ISH, Ki-67, tratamientos previos,
  BRCA), (h) y (i) (BRCA germinal) en **mama**, que es el tipo habilitado en la demo; (l) los tiene pero es próstata
  (no habilitada, saldrá 0). El feedback del usuario («al menos 2 con faltantes») se cumple sin tocar el seed, siempre
  que el cálculo sea real. **A confirmar al aplicar:** contar con el catálogo real corriendo el seed (la prueba
  `pacientes-momentos.test.ts` ya imprime la lista) para los pacientes (a)–(f), que la guía no detalla. Si el conteo de
  mama con faltantes fuera < 2, se añade un paciente sintético con `ALTA` en el seed (decisión del usuario; no se asume).
  Para que no regrese la confusión, una prueba de integración fija el invariante: el listado del seed tiene ≥ 2
  pacientes de mama con `missingCriticalCount > 0`.
- **D7 Rendimiento.** Objetivo: el listado no degrada más allá de la suma de las consultas del lote; se **mide** antes y
  después (p95 con la página por defecto, seed de 13) y se compara en la tarea de verificación. El presupuesto numérico
  del listado no está en el PRD; se propone «sin regresión apreciable respecto de `main` y consultas por página acotadas
  e independientes de `PATIENTS_PAGE_SIZE`» y se confirma con el usuario (pregunta abierta). La garantía automática es
  el test que **cuenta consultas** (≤ K fija con página de 1 y de N pacientes), no un cronómetro.
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
