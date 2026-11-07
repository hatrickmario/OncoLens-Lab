# Design — l1d-320-faltantes-tipo-vacio

## Context

US-263 (capacidad B del chat): clasificar cada dato crítico faltante en cuatro tipos de vacío. Ya existe en `main` el
checklist de FEAT-04: `CompletenessService` calcula `status` ∈ {`presente_verificado`, `presente_sin_verificar`,
`faltante`, `no_aplica`} con reglas del catálogo (`minValues`, `verifiedReviewStatuses`, condiciones), y
`GET /platform/patients/{id}/completeness` lo expone (`CompletenessItem` con `additionalProperties: false`). El grafo
(`l1d-316`) define el nodo `faltantes` como esqueleto y `completeness[]` en `ChatTurnRequest`; la conversación persistida
la trae `l1d-315` (con `catalogVersion`, el `409` sin persistir y el seed `P-CHAT`). `Document` tiene `document_type`
(`historia_clinica`, `examen`) y `ocr_status`. Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md`.

## Goals / Non-Goals

**Goals:** `sourceDocumentTypes` en el catálogo 1.6.0; `gapType` determinista en Backend 1 (`clinical-api` 1.28.0);
nodo `faltantes` sin LLM y exento de cita; verificar el `409` de catálogo con 1.6.0.

**Non-Goals:** por qué importa un faltante (US-264); UI (US-267); subtipos de documento; cambiar `status`.

## Decisions

1. **`gapType` es un segundo eje sobre `status`, no un estado nuevo.** `status` no cambia (la vista de caso y sus tests
   siguen iguales); `gapType` es nullable y aditivo. Tabla:

   | `status` | condición | `gapType` |
   |---|---|---|
   | `no_aplica` | — | `null` |
   | `presente_verificado` | sin conflicto pendiente | `null` |
   | `presente_verificado` | algún registro en `requiere_revision` con `conflicts_with_id` que contradice el dato (RN-08) | `por_conciliar` |
   | `presente_sin_verificar` | algún registro vigente del destino en `requiere_revision` con `conflicts_with_id` | `por_conciliar` |
   | `presente_sin_verificar` | sin conflicto vigente | `incompleto` |
   | `faltante` | 0 < registros vigentes < `minValues` | `incompleto` |
   | `faltante` | 0 registros y ≥ 1 documento del paciente con `document_type ∈ sourceDocumentTypes` y `ocr_status = completado` | `no_encontrado` |
   | `faltante` | 0 registros y ningún documento así | `no_buscado` |

   Prioridad cuando aplican varias: `por_conciliar` > `incompleto` > `no_buscado` > `no_encontrado` (glosario §3).
   Regla pura `clasificarVacio(item, estado, documentosProcesados)` en `completeness.rules.ts`; el repository añade una
   consulta de tipos de documento procesados del paciente (`SELECT DISTINCT document_type … WHERE ocr_status =
   'completado'`). Alternativa descartada: calcularlo en Backend 2 (rompe el ownership: Backend 2 no ve documentos).
2. **AC-5 alineado con `[S6 resp. 17]` y el glosario §3** (resuelve la discrepancia de la vuelta anterior):
   «incompleto» = `presente_sin_verificar` **sin conflicto vigente**, o `faltante` con menos registros vigentes que
   `minValues`; un `presente_sin_verificar` con conflicto vigente es `por_conciliar`; un `faltante` sin registros es
   `no_buscado` o `no_encontrado`. AC-5 se especifica con esa regla sobre los pacientes semilla FX-12-a y `P-CHAT`, más la
   propiedad «cada ítem con `gapType` no nulo aparece exactamente una vez y ningún `no_aplica` tiene `gapType`».
3. **`sourceDocumentTypes` del catálogo real** (asumido; el mapeo queda `estado = "propuesta"` hasta DEC-01): biomarcadores y series
   (`re`, `rp`, `her2_ihq`, `her2_ish`, `ki67`, `brca_germinal`, `psa_serie`, `hrr_brca`) → `["examen"]`; `histologia`,
   `grado`, `gleason_isup`, `tnm`, `sitios_metastasicos` → `["historia_clinica", "examen"]`; `ecog`,
   `estado_menopausico`, `tratamientos_previos`, `estado_castracion` → `["historia_clinica"]`. Coincide con FX-12-c en
   `re`, `tnm`, `ki67` y `estado_menopausico`; FX-12-c es el catálogo de test y el real puede diferir sin romper los AC.
   Si `datos-criticos.json` declara `validation.catalogHash`, se recalcula con la versión nueva.
4. **Nodo `faltantes` determinista**: `domain/chat/faltantes.py` con `verbalizar_faltantes(completeness, catalogo)
   -> list[ChatBlock]` (plantilla fija por `gapType` + `label` + `sourceDocumentTypes` leídos de la copia montada del
   catálogo por `item`, orden del catálogo, un bloque `kind = faltante` por ítem con `gapType` no nulo); sin ítems → un
   bloque «No faltan datos críticos según el catálogo <versión>». No invoca LLM, NLI ni recuperación (AC-4). Los bloques
   `faltante` no llevan `citations` ni `factRefs` y el validador de citas los trata como exentos (glosario §3, RN-01:
   son deterministas, del catálogo). Las plantillas viven en el módulo de plantillas del chat, versionadas, y describen
   el vacío respecto de lo procesado: `no_encontrado` → «<label>: no se halló en los documentos procesados (<tipos>)»;
   `no_buscado` → «<label>: aún no se ha procesado ningún documento de tipo <tipos>»; `incompleto` → «<label>: el dato
   está incompleto o sin verificar»; `por_conciliar` → «<label>: hay registros en conflicto por conciliar». **Nunca**
   «ausente en el paciente» ni otra afirmación sobre el paciente; un test recorre las cuatro plantillas.
   Alternativa descartada: enviar `sourceDocumentTypes` en `ChatCompletenessItem` (el glosario §2 lo cierra y obligaría a
   subir la versión de `rag-orchestrator`); el catálogo ya está montado en ambos backends con la misma versión (`409`).
5. **`409` en `/chat/turn`**: lo declaran l1d-316 (contrato `rag-orchestrator` 1.12.0) y l1d-315 (traducción a
   `409 ErrorCatalogVersionMismatch` sin persistir). l1d-316 implementa y prueba la comparación como primer paso del
   endpoint. Este change solo la verifica con el salto 1.5.0 → 1.6.0 (US-263 AC-7), reutilizando el ejemplo existente
   `contracts/examples/rag-catalog-version-mismatch.json`.

## Privacidad y ownership

- **web → clinical-api**: sin cambios (sesión opaca; `/completeness` ya existe y exige `clinical:read`).
- **clinical-api → rag-orchestrator** (JWT de servicio): `completeness[]` (`ChatCompletenessItem`) lleva solo `item`,
  `label`, `status`, `gapType` y `destination`, más `catalogVersion` en la petición; **nunca** ids de documento, nombres de fichero, valores del
  paciente, identidad ni fechas (RN-10, RN-11). `documentosProcesados` se resuelve y se queda en Backend 1.
- **rag-orchestrator**: no accede a documentos ni a schemas clínicos; procesa en memoria dentro del hilo efímero (ADR-51)
  y no persiste nada del paciente. Sin LLM en este turno, así que RN-12 no entra en juego, pero ningún adapter de nube
  existe en el camino.
- **Logs**: solo `traceId`, `intent` y conteos por `gapType`; nunca el texto de la pregunta.

## Contratos

Proveedor: `clinical-api` (`/completeness`). Consumidores: `web` (generado) y los tests de verificación del proveedor.
Cambio aditivo (ADR-26), **1.27.0 → 1.28.0** (glosario §1; si colisiona, renumera el segundo en mergear):

```yaml
# apps/clinical-api/openapi.yaml 1.28.0
CompletenessItem.properties:
  gapType:
    oneOf: [ { type: string, enum: [no_encontrado, incompleto, por_conciliar, no_buscado] }, { type: "null" } ]
    description: >-
      null si el ítem no tiene vacío. por_conciliar puede acompañar a presente_verificado cuando hay un
      conflicto pendiente (RN-08). Texto final igual al del spec.
```

`gapType` entra en `required` de la **respuesta** de `/completeness` (añadir un campo requerido a una respuesta no rompe a
los consumidores; oasdiff lo confirma). **`rag-orchestrator` no sube versión**: `ChatCompletenessItem.gapType` ya existe
en la 1.12.0 (l1d-316) y `sourceDocumentTypes` no viaja. Ejemplos nuevos: `completeness-gap-type-p-chat.json`,
`chat-turn-faltantes.json`, `chat-turn-faltantes-ninguno.json` (estos dos
validan contra `rag-orchestrator` 1.12.0; el `409` reutiliza `rag-catalog-version-mismatch.json`); los ejemplos existentes de `/completeness` se actualizan con `gapType`. Tipos
TS y Zod se generan (skill `sync-contracts`).

## Dependencias y colaboradores

- `completeness.rules.ts`: `clasificarVacio()` pura (TDD estricto, unitarios uno a uno, tabla de la decisión 1).
- `completeness.repository.ts`: `tiposDeDocumentoProcesados(patientId)`; `completeness.service.ts` lo recibe por
  *factory* y compone `status` + `gapType`; `completeness.vista.ts` serializa.
- `conversation.request.ts` (de `l1d-315`): rellena `gapType` en cada `ChatCompletenessItem` desde el mismo
  `CompletenessService` que sirve `/completeness` (una regla, un dueño).
- `rag-orchestrator`: `application/chat/nodo_faltantes.py` sin puertos de IA; `domain/chat/faltantes.py`; lectura de
  `sourceDocumentTypes` desde el catálogo montado (`CLINICAL_CATALOG_PATH`).
- Catálogo: `schemas/datos-criticos.schema.json` (`sourceDocumentTypes` en `required`), `validator/` (mensaje que nombra el
  ítem), fixture FX-12-c.

## Evaluación

Cambia el catálogo: suite `evaluate` en el PR (OL-06) para comprobar que `datos-criticos` 1.6.0 no altera recuperación ni
aplicabilidad (métricas sin regresión frente al baseline). El turno `faltantes` no usa LLM; su determinismo se prueba con
Pytest (AC-4) y se mide en US-269.

## Risks / Trade-offs

- [Versión de catálogo compartida por varios changes del S6] → 1.6.0 lo toma este change; si otro sube antes, se toma la
  siguiente menor y se ajustan AC-1 y AC-7 en el PR.
- [Pacientes sin documentos] → todo faltante sale `no_buscado`; es correcto según `[S6 resp. 10]` y útil («pida el
  examen»).
- [Supuestos del oncólogo] → `[S6 resp. 17]` y el mapeo `sourceDocumentTypes` (`estado = "propuesta"`) se revisan con
  DEC-01; la regla vive en una sola función pura.

## Decisiones del Gate 2

- `por_conciliar` sobre `presente_verificado` es deliberado (RN-08): un dato verificado con un conflicto pendiente sigue
  necesitando conciliación; el `status` no cambia. P-CHAT (TNM: IIA verificado frente al IIB en conflicto) lo fija.
- Renumerado: `clinical-api` pasa a **1.28.0** (main trae 1.27.0 de L1D-213; L1D-322 pasará a 1.29.0).
- `faltantesSenalados` del estado estructurado queda `[]` por decisión; lo cubren L1D-321/323 si lo necesitan.
- El listado y el contador de la ficha no clasifican el vacío: solo `calcular` (endpoint y chat).
