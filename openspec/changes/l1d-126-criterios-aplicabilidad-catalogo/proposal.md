# Proposal — l1d-126-criterios-aplicabilidad-catalogo

## Trazabilidad

L1D-126 · US-121 · FEAT-08b (L1D-20) · Sprint 3 · Estimación **3** · HU-22 · FR-25 (criterios en el catálogo) ·
RN-29 · RN-28 · RN-22 · NFR-14 · ADR-29 · ADR-38 · AC-08.1 (criterios del catálogo) · AC-08.6 (excluyentes) ·
AC-04.5 (destino de cada ítem) · US-121 AC-1…AC-5 · DEC-11 (US-021) sobre `propuesta_revisada` `[S3 resp. 1]` ·
🔗 Regresión [RN-29] → US-001 · 🔗 Regresión [NFR-14] → US-041

## Por qué

El oncólogo necesita que la comparación entre su paciente y la población de cada estudio use siempre los mismos
criterios, cada uno ligado a un dato real del caso, y que pueda revisarse y cambiarse sin desplegar código. Hoy
`packages/clinical-catalogs/<tipo>/aplicabilidad.json` existe con `items: []` y un esquema que no restringe nada:
el motor de aplicabilidad del S3 (US-122…US-125) no tiene criterios sobre los que trabajar.

## Qué cambia

- **Contenido** (datos, no código, ADR-29): `mama/aplicabilidad.json` con `estado_her2`, `receptores_hormonales`,
  `estadio`, `linea_tratamiento`, `estado_menopausico`, `ecog`; `prostata/aplicabilidad.json` con
  `estado_castracion`, `extension`, `isup`, `linea_tratamiento`, `ecog`, `hrr_brca`. Cada criterio con
  `destination` (entidad y campo del modelo), `studyKey` (clave de `population_criteria` del estudio con la que se
  compara, la consumen L1D-127 y L1D-117, `[S3 resp. 16]`), `isExclusionary` y `rule` declarativa (igualdad, pertenencia a una
  lista, rango) con su regla de "Parcial". `estado_her2` y `estado_castracion` son excluyentes (escenario
  `propuesta_revisada` de DEC-11, `[S3 resp. 1]`). Cada archivo lleva el bloque `validation`
  en el formato de L1D-93 (`scope = ["aplicabilidad"]`, `status = "propuesta_revisada"`, rol del revisor, fecha y
  `catalogHash`) de US-021 AC-1 `[S3 resp. 16]`.
- **Claves de población** `packages/clinical-catalogs/poblacion.json` (raíz, como `atributos.json` de L1D-93): las
  claves de `population_criteria` que un `studyKey` puede nombrar.
- **Esquema** `schemas/aplicabilidad.schema.json`: deja de aceptar cualquier `items`; un criterio sin
  `destination`, `studyKey`, `isExclusionary` o `rule`, o con campos de puntaje (`peso`, `score`, `weight`) no es válido.
- **Validador** `catalog:validate` (lo construye L1D-93 · US-001): este change le añade las reglas con nombre
  "sin puntaje en criterios de aplicabilidad" (RN-28) y "`studyKey` existe y es única", y fixtures de aplicabilidad.
  La regla de destino (RN-29) es la de US-001: su requisito no se duplica, este change le añade el escenario de
  US-121 AC-2 como `MODIFIED` `[S3 resp. 16]`.
- **Carga en `rag-orchestrator`**: lector tipado de `aplicabilidad.json` desde `CLINICAL_CATALOG_PATH` (puerto de
  dominio + adapter de infraestructura), para que el motor de US-122 lea la regla del catálogo montado y no de
  código (RN-22).
- **Fixture FX-08b-a**: catálogo `test-apl-1.0.0` y una variante con la regla de `ecog` distinta, en ambos backends.
- Sin cambio de contrato: `ApplicabilityCriterion.criterion` ya es un `string` "del catálogo del tipo de cáncer".

## Capacidades

- `clinical-catalogs` (ADDED: criterios de aplicabilidad con destino, `studyKey`, excluyente y regla; `studyKey`
  existente y única; sin puntaje; regla leída del catálogo montado. MODIFIED: "Todo ítem del catálogo con destino
  lo declara" de L1D-93 gana el escenario de US-121 AC-2; el 409 por versión distinta se mantiene con el catálogo
  de aplicabilidad).

## Bounded contexts

- **clinical-platform**: `packages/clinical-catalogs` (contenido y esquema), `catalog:validate` (regla nueva y
  fixtures), arranque de `clinical-api` con la versión nueva.
- **ai-services**: carga y tipado del catálogo de aplicabilidad en `apps/rag-orchestrator`; fixtures Pytest.
- **frontend**: no se toca.

## Dependencias

- ⛔ L1D-125 · US-021 · DEC-11 — contenido sobre `propuesta_revisada` (aceptado en el refinamiento, `[S3 resp. 1]`).
- ↪ change de L1D-93 · US-001 (`catalog:validate`, regla de destino con allowlist DMMF, `catalogHash`, bloque
  `validation`). Este change va **después**: se mergea y **se archiva** después de L1D-93, porque su delta
  `MODIFIED` parte del requisito que L1D-93 añade `[S3 resp. 16]`.
- ↪ US-041 (`l1d-*` archivado: montaje del catálogo, `409 CATALOG_VERSION_MISMATCH`) — ya en `main`.
- Sin dependencia de L1D-127: el test del AC-5 con el estado calculado **se difiere a L1D-127** (dependencia
  circular rota, `[S3 resp. 16]`); aquí solo se prueba que la regla se carga del catálogo montado.
- 🔗 Produce para: L1D-127 · US-122 (forma del criterio, `studyKey`, test del AC-5), L1D-117 · US-118
  (`studyKey` y `poblacion.json`), L1D-128 · US-123, L1D-129 · US-124, L1D-130 · US-125.

## Fuera de alcance

- El cálculo del estado por criterio (US-122), la población solo en texto (US-123), la causa de "Desconocido" y
  la población no comparable (US-124), la herencia por opción (US-125) y la tabla de la UI (US-126, S4).
- El validador genérico, la allowlist del modelo y `catalogHash` (US-001); el `409` entre backends (US-041), que
  aquí solo se comprueba como regresión con el contenido nuevo.
- La validación clínica formal de los criterios: sesión de oncólogos del S4 (DEC-11); un cambio que salga de ella
  solo toca el JSON.
- Pesos o ponderaciones clínicas: prohibidos (RN-28); `clinical_evidence_score` sigue reservado (TBD-09).
