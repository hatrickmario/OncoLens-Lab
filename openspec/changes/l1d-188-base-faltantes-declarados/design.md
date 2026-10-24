# Design — l1d-188-base-faltantes-declarados

## Context

`crearBaseDelAnalisis()` (US-066, `analysis-basis.ts`) es una función pura de la petición interna, la respuesta
interna y `continueWithWarning`. Hoy fija `missingCriticalData: []` y antepone `SUPUESTO_FALTANTES_NO_CALCULADOS`.
l1d-98 (D3) deja la lista de faltantes en `request.clinicalContext.missingCriticalData` (claves del catálogo, orden
del catálogo) y la persiste tal cual en `missing_critical_data`; `continued_with_warning` sale de la petición. El
panel (US-067, l1d-187) resume con "Faltantes: [n] · Supuestos: [n] · …" y muestra el texto de los supuestos
`regla_catalogo`. `AnalysisBasis.missingCriticalData` del contrato es `string[]` (claves) y el navegador no tiene
el catálogo: no puede verbalizar las claves.

## Goals / Non-Goals

**Goals:** inciso (b) desde la lista calculada por `clinical-api`, en `con_evidencia` y `sin_evidencia`; retiro del
supuesto declarado; resumen "[n] datos críticos faltantes · continuó con aviso" sin expandir; etiquetas del catálogo
en el detalle.

**Non-Goals:** UI para continuar con aviso (US-005, S4); supuestos (c) y limitaciones (g) (US-129, US-130); cálculo
del checklist (l1d-94) y su persistencia (l1d-98).

## Decisions

### D1. Una sola fuente del inciso (b): el request interno

`construir(request, respuesta, continueWithWarning)` copia `request.clinicalContext.missingCriticalData` (copia del
arreglo, sin reordenar ni filtrar). Nunca lee la respuesta de Backend 2 para el inciso (b): `RagQueryInternalResponse`
no tiene campo de faltantes (`additionalProperties: false`) y lo que el LLM diga sobre faltantes en `assumptions` o
`limitations` no alimenta el inciso (AC-T2.2, AC-3). Lo respondido, lo persistido en `analysis_basis` y lo persistido
en `missing_critical_data` salen del mismo arreglo (AC-1, AC-T2.4). Descartada: releer el checklist en el builder
(rompe la pureza y podría divergir de lo enviado).

### D2. Retiro del supuesto declarado

Se borran `SUPUESTO_FALTANTES_NO_CALCULADOS` y su prefijo en `assumptions`; quedan solo `supuestosVerificados()`.
El requisito "Supuesto declarado mientras los faltantes no se calculan" se elimina (REMOVED), como preveía su texto
("US-128 lo retira").

### D3. Etiquetas del catálogo en la Base (**opción A aprobada**, contract-keeper, Gate 1 del S3, `[S3 resp. 18]`)

El AC-4 pide que el detalle liste las **etiquetas** del catálogo, pero el contrato solo trae claves y `web` no monta
el catálogo.

| Opción | Pros | Contras |
|---|---|---|
| **A (elegida) · campo aditivo requerido `missingCriticalDataLabels: string[]`** en `AnalysisBasis`, mismo orden y longitud que `missingCriticalData`, resuelto por `clinical-api` con `label.es` del catálogo cargado | Determinista y reproducible: la etiqueta queda persistida en `analysis_basis` con la `catalog_version` del análisis (AC-T2.4, historial US-174); `clinical-api` sigue siendo el único dueño del catálogo; `web` no gana dependencias | Cambio de contrato (aditivo, compatible con ADR-26; `oasdiff` sin incompatibles); dos arreglos paralelos |
| B · `web` lee `packages/clinical-catalogs` en un módulo `server-only` | Sin cambio de contrato | `web` pasa a depender del catálogo y de su versión; un análisis viejo se verbalizaría con un catálogo nuevo (no reproducible); otro montaje en Compose |
| C · mostrar las claves (`estado_menopausico`) | Trivial | Incumple el AC-4 y es ilegible para el oncólogo |

Con A, la función pura `etiquetarFaltantes(claves, etiquetaDe)` va en el builder; `etiquetaDe(clave)` se inyecta en
la *factory* (`crearBaseDelAnalisis({ etiquetaDe })`) desde el catálogo cargado en el arranque (cargador de
l1d-93/l1d-94), así el builder sigue sin E/S. Una clave sin etiqueta en el catálogo es imposible (l1d-98 solo envía
claves del catálogo cargado); si ocurriera, el builder lanza y el análisis falla cerrado como un checklist no
disponible (`500 ERROR_INTERNO`, `[S3 resp. 5]`), nunca inventa una etiqueta. Se eligió `string[]` paralelo en lugar
de `[{ item, label }]` para no cambiar la forma de `missingCriticalData`, ya congelada y consumida (AC-1).
Gate 1: `oasdiff` da 0 cambios incompatibles y solo el informativo `response-required-property-added`; no requiere
excepción E-n (ADR-26). `missingCriticalData` sigue siendo el arreglo de claves, sin cambio de forma.

### D4. Literal del resumen

El primer segmento del resumen de l1d-187 ("Faltantes: [n]") pasa a "1 dato crítico faltante" con n = 1 y a
"{n} datos críticos faltantes" con n ≠ 1 (incluido 0) y, solo con `continuedWithWarning = true`, a
"{texto} · continuó con aviso" (literal de US-128 AC-4; textos de clinical-language-auditor, Gate 1 del S3,
`[S3 resp. 18]`). El resto no cambia: "{texto}[ · continuó con aviso] · Supuestos: [n] · Fuentes no incluidas:
[lista] · Afirmaciones omitidas: [n]". En `tipo_no_habilitado` (checklist no calculado) **no se muestra contador**:
el resumen dice "No se consultó el corpus: tipo fuera de alcance · Datos críticos faltantes: no evaluados en este
estado" y nunca "0 datos críticos faltantes". Textos en `lib/mensajes.ts`. Con `continuedWithWarning = false` (el único valor que la
UI envía en el S3) no se añade nada: no se afirma una elección que el oncólogo no hizo. `resumirBase()` deja de
exponer `supuestosDeReglaCatalogo` si queda sin uso (Inline Method en el refactor); los supuestos `regla_catalogo`
de US-129 volverán a mostrarse en el detalle rotulados por origen (requisito de l1d-187, sin cambio).

### D5. Detalle

`BasisDetail` añade el bloque "Datos críticos faltantes" con `missingCriticalDataLabels` como lista, en el orden
recibido, y la nota visible "Solo informa; no bloquea el análisis" (RN-26); con lista vacía no se muestra el bloque.

## Componentes y patrones

- Sin componentes nuevos: se modifican `molecules/basis-summary.tsx` y `molecules/basis-detail.tsx` (siguen bajo 100
  líneas; si `basis-detail` pasa el límite, se extrae la molécula `missing-data-list.tsx`, un concepto).
- Sin patrones nuevos (sin hooks, providers ni compound components). `AnalysisBasisPanel` sigue siendo el único
  `'use client'` (estado de expansión); las moléculas se renderizan dentro de él.

## Privacidad y ownership

- **web → clinical-api:** sin cambio; el cliente envía `continueWithWarning` (en el S3, siempre `false`), nunca
  faltantes.
- **clinical-api → rag-orchestrator:** sin cambio (l1d-98). `rag-orchestrator` no toca datos clínicos ni
  `clinical-minio` y no aporta el inciso (b).
- **clinical-api → web:** claves del catálogo y etiquetas del catálogo: texto de catálogo versionado, nunca valores,
  texto libre ni identidad del paciente (RN-10, RN-11). Se persisten igual en `analysis_basis`.
- **Logs:** el builder no registra la lista ni las etiquetas. El `500 ERROR_INTERNO` por clave sin etiqueta registra
  solo `traceId` y el código de error, nunca la clave ni el mensaje de la excepción (aserción en la tarea 2.2).
- **Seguridad web:** sin variables `NEXT_PUBLIC_` nuevas ni dependencias; tipos de `packages/api-contracts`
  generados; las etiquetas se renderizan como texto de React (sin HTML crudo); sin impacto en CSP ni cabeceras;
  sin cambios en Route Handlers (`app/api/evidence-analyses/route.ts` reenvía `analysisBasis` validado con el
  schema Zod generado).

## Contratos

- **Proveedor:** `clinical-api` (`POST /platform/evidence-analyses`, schema `AnalysisBasis`); **consumidor:** `web`
  (BFF y panel). `rag-orchestrator`: sin cambio.
- **Diff de `apps/clinical-api/openapi.yaml` (opción A aprobada, aditivo requerido):**

  ```yaml
  AnalysisBasis:
    required: [..., missingCriticalData, missingCriticalDataLabels, continuedWithWarning, ...]
    properties:
      missingCriticalDataLabels:
        type: array
        description: >-
          Etiqueta en español del catálogo (label.es) de cada clave de missingCriticalData, mismo orden y
          longitud, resuelta con la catalog_version del análisis (FR-27 b).
        items: { type: string, minLength: 1 }
        examples: [["Estado menopáusico", "Ki-67"]]
  ```

- **Ejemplos (regla):** **todo** ejemplo de `contracts/examples/` con `analysisBasis` lleva
  `missingCriticalDataLabels` (`con-evidencia-s1.json`, `con-evidencia-s4.json`, `con-evidencia-sin-opciones.json`,
  `con-evidencia-solo-descartadas.json`, `sin-evidencia.json` y `tipo-no-habilitado.json` con `[]`), con etiquetas
  del catálogo sintético; el supuesto declarado sale de los ejemplos que lo traigan. Incluye
  `con-evidencia-s3-aplicabilidad.json` de `l1d-129`: si ya está en `main` al rebasar, lo actualiza este change; si
  `l1d-129` llega después, lo añade `l1d-129` (su tarea condicional).
- **`info.version` (minor, propiedad requerida nueva en una respuesta):** `l1d-285` sube la patch a `1.9.1` y se
  archiva antes; este change sube `1.9.1` → **`1.10.0`**. Si este change se mergeara primero, sube `1.9.0` →
  `1.10.0` y `l1d-285` rebasa a `1.10.1`. Quien mergea segundo rebasa.
- **Compatibilidad:** propiedad nueva requerida en una respuesta → `oasdiff` con 0 incompatibles y solo el
  informativo `response-required-property-added`; ADR-26 permite cambios aditivos, sin excepción E-n. Zod y tipos de `packages/api-contracts` se **regeneran** del spec (skill
  `sync-contracts`), nunca se editan a mano. Verificación del proveedor (US-214) sobre `200` con y sin evidencia.
- Registros persistidos antes de este change (solo sintéticos) no traen el campo; el historial (US-174, S6) lo
  tratará.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `analysis-basis.ts` | inciso (b) desde el request (D1); sin supuesto declarado (D2); `etiquetarFaltantes()` (D3) | `etiquetaDe` inyectada (función, no cliente) |
| `ports.ts` | `EtiquetaDeDatoCritico` (`(clave) => string`) | — |
| `evidence-analysis.module.ts` | cableado de `etiquetaDe` desde el catálogo cargado | cargador del catálogo (l1d-93/l1d-94) |
| `web/lib/evidence/resumen-base.ts` | `resumirBase()` con `continuoConAviso`; sin `supuestosDeReglaCatalogo` si queda sin uso | tipos generados |
| `web/components/molecules/basis-summary.tsx`, `basis-detail.tsx` | literal D4, bloque D5 | `lib/mensajes.ts` |

Reglas con nombre propio: `faltantesDeLaBase()` (inciso (b) solo desde el request, AC-T2.2) y `etiquetarFaltantes()`.

## Risks / Trade-offs

- **[Orden de archivo]** → el MODIFIED de "Resumen de la Base visible sin expandir" requiere que
  `l1d-187-panel-base-analisis` esté archivado antes; si no, el archivo de este change falla. Mitigación: archivar
  l1d-187 primero en el bulk-archive del S3.
- **[E2E de «continuó con aviso»]** → la UI del S3 no envía `true`; ese literal se prueba en componente con MSW y en
  integración (Supertest con `continueWithWarning = true`). Regresión [US-128 AC-4] en E2E activa desde S4 (US-005).
- **[Cambio de contrato en S3]** → aditivo, aprobado en el Gate 1 (D3); minor de `info.version` coordinada con
  `l1d-285` (Contratos).

## Open Questions

Cerradas en el Gate 1 del S3 (`[S3 resp. 18]`):

- **Q1 · cerrada (contract-keeper):** opción A de D3, campo aditivo requerido `missingCriticalDataLabels`; `oasdiff`
  0 incompatibles (solo `response-required-property-added`), sin excepción E-n; minor de `info.version`.
- **Q2 · cerrada (clinical-language-auditor):** en `tipo_no_habilitado` no se muestra contador; el resumen dice
  "No se consultó el corpus: tipo fuera de alcance · Datos críticos faltantes: no evaluados en este estado" (D4).
- **Q3 · cerrada (clinical-language-auditor):** n = 1 "1 dato crítico faltante"; n ≠ 1 "{n} datos críticos
  faltantes" (incluido 0); con aviso "{texto} · continuó con aviso"; el detalle lleva "Solo informa; no bloquea el
  análisis" (D4, D5).
