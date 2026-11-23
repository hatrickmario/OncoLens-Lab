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

## Alcance del Sprint 7 (movido-S7, 2026-11-22)

> L1D-126 pasa al S7 (decisión del usuario, 2026-11-21; `backlog/sprints/S7-refinamiento.md` §1). Lo hecho en el S3 no se
> reescribe. Lo que falta es la revisión clínica **provisional** hecha por IA (`[S7 resp. 1]`,
> `backlog/sprints/S7-revision-clinica.md` §1 y §6) y cuatro deudas del Gate 2.

- **C-1 (Alta) · próstata:** `extension` pasa a ser excluyente, solo entre enfermedad no metastásica (localizada o
  localmente avanzada) y metastásica, y solo con restricción explícita en la fuente (misma condición que F-21).
- **C-2 (Alta) · mama:** `estado_her2` gana la categoría `bajo` (IHC 1+, o 2+ con ISH negativo) como subconjunto de
  `negativo`; un IHC 2+ sin ISH es equívoco y queda «Desconocido», nunca `negativo`.
- **C-4 (Media) · mama:** «triple negativo» deja de ser un valor de `receptores_hormonales` y se proyecta en dos
  criterios: receptores hormonales = negativo y HER2 = negativo.
- **C-5 (Media) · próstata:** `hrr_brca` separa `BRCA1/2 mutado`, `otro gen HRR`, `sin mutación` y `no evaluado`.
- **C-3 no entra:** es la pregunta Q-1 para la sesión con expertos. C-6…C-10 quedan en Post-MVP o como preguntas.
- **Nada pasa a «validada».** Cada criterio tocado lleva `revision_provisional: {rol: ia, fecha: 2026-11-21}` y sigue en
  `estado = "propuesta"`. DEC-11 (L1D-125) sigue sin firma de oncólogo: **la regla F-20…F-24 no cambia**; cambian los datos
  del catálogo. Los reportes siguen diciendo `no_validada`.
- **Bloque `validation` (`[S7 resp. 9]`).** Cuando la IA edita un `aplicabilidad.json`, su `validation` pasa a
  `status = "revision_provisional"`, `reviewerRole = "ia"`, `date = "2026-11-21"`, con el `catalogHash` del contenido
  nuevo. La revisión del asesor del S3 (`reviewerRole = "oncologo_asesor"`, `2026-10-24`) se conserva aparte, como
  historial, con el hash del contenido que sí cubrió. **El hash nuevo nunca queda atribuido a un oncólogo**; el
  validador lo comprueba (`design.md` D14).
- **Deudas del Gate 2 que vuelven de US-232:** G1.6 (registro de archivos de raíz en `clinical-api`), G2.3 (base del
  guardián de versión), G2.4 (evasión en dos pasos) y G2.6 (`version` propia de cada archivo). G2.5 ya está hecha.
- **Dos PR (Gate 1 del S7, 2026-11-22):**
  - **Parte A** (S7.1–S7.4c): las deudas G1.6, G2.3, G2.4 y G2.6, la definición única de `revision_provisional` en los
    esquemas y los tests que leen la versión del manifiesto. **No cambia contenido ni `manifest.version`**. Va **antes de
    la corrida base**.
  - **Parte B** (S7.5–S7.14): C-1, C-2, C-4 y C-5 y el bloque `validation` de `[S7 resp. 9]`. Va después de `l1d-335`,
    que sube el catálogo a `1.10.0`; la parte B lo sube a **`1.11.0`**. Evaluación obligatoria: `eval-required` con
    adaptadores falsos en el PR y medición con modelos locales en la **corrida final** del S7 (`[S7 resp. 2]`).
- La corrida base usa el catálogo vigente (`1.9.0`) y es la referencia del A/B. Base y final corren con los umbrales
  actuales (`[S7 resp. 11]`) y cada familia mide sobre su corpus fijo, declarado en el reporte (`[S7 resp. 10]`).

### Dependencias del S7

- **Orden de merge (único, el mismo en `l1d-246` y `l1d-299`):** `l1d-126` parte A → corrida base → `l1d-335`
  (catálogo `1.10.0`) → `l1d-126` parte B (catálogo `1.11.0`) → las partes de `l1d-299` y `l1d-246` que dependen de la
  parte B → corrida final.
- ↪ `l1d-335-sinonimos-procedimientos-relacion` (US-277): sube `manifest.version` y actualiza los mismos
  `contracts/examples/` (unos 20) y fixtures que citan la versión. Nunca en paralelo con la parte B: `l1d-335` primero.
  `l1d-335` añadirá `sinonimos` al mapa `ESQUEMAS` de `validar-catalogo.ts`; la parte A (S7.1) no lo impide.
- **`revision_provisional` tiene una sola definición** en el catálogo: `comun.schema.json#/$defs/revisionProvisional`,
  dueño `l1d-126` parte A. `l1d-335` y la parte B la referencian con `$ref`; nadie la redefine (`design.md` D9).
- ↪ `l1d-246-suite-hasta-3-opciones`: su dataset lee el catálogo real de próstata. El efecto de C-1 y C-5 sobre el orden
  de OP-07…OP-12 se rige por el **supuesto compartido SC-1** (`design.md` D10) y se comprueba con su test de coherencia
  después de la parte B.
- ↪ `l1d-299-poblacion-dorado-suite`: su extracción lee `packages/clinical-catalogs`; los casos del dorado que usan C-1,
  C-2, C-4 y C-5 van después de la parte B y siguen el mismo SC-1.
- ⛔ DEC-11 (L1D-125): sin firma. Este change cierra sobre el escenario aceptado; se le adjuntan Q-1…Q-4.

### Fuera de alcance en el S7

- Cambiar F-20…F-24 o la palabra «solo» de F-21 (C-3, Q-1).
- Criterios nuevos (C-6, C-7), tabla ECOG↔Karnofsky (C-8), edad y sexo como contexto (C-9).
- Comparar criterios compuestos componente a componente (`receptores_hormonales`, `hrr_brca`): ver `design.md` D12 y D13.
- Marcar un IHC 2+ sin ISH como dato crítico faltante en `datos-criticos.json` (DEC-01 está en Post-MVP): pregunta abierta.

## Fuera de alcance

- El cálculo del estado por criterio (US-122), la población solo en texto (US-123), la causa de "Desconocido" y
  la población no comparable (US-124), la herencia por opción (US-125) y la tabla de la UI (US-126, S4).
- El validador genérico, la allowlist del modelo y `catalogHash` (US-001); el `409` entre backends (US-041), que
  aquí solo se comprueba como regresión con el contenido nuevo.
- La validación clínica formal de los criterios: sesión de oncólogos del S4 (DEC-11); un cambio que salga de ella
  solo toca el JSON.
- Pesos o ponderaciones clínicas: prohibidos (RN-28); `clinical_evidence_score` sigue reservado (TBD-09).
