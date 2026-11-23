# Design — l1d-126-criterios-aplicabilidad-catalogo

## Context

Ver `proposal.md` (Por qué). Estado observado en `main`:

- `packages/clinical-catalogs/{mama,prostata}/aplicabilidad.json` = `{ "version": "1.0.0", "items": [] }`;
  `schemas/aplicabilidad.schema.json` solo exige `version` e `items: array` ("lo llena FEAT-08b").
- `rag-orchestrator` lee solo `manifest.json` (`app/infrastructure/catalogo_clinico/manifiesto.py`,
  `CatalogoDelManifiesto`: versión y `cancerTypes`); no carga ningún archivo por tipo.
- `clinical-api` valida el manifiesto (`src/infrastructure/catalogo/manifiesto.schema.ts`) y compara versiones
  (`catalog-version.provider.ts`). El `409 CATALOG_VERSION_MISMATCH` existe desde US-041.
- `catalog:validate` **no existe todavía**: lo crea el change de L1D-93 (US-001) en este mismo sprint, con la regla
  de destino (allowlist generada del DMMF de Prisma), el bloque `validation` y `catalogHash`. Su Contexto técnico
  dice que "el mismo validador recorre los criterios de aplicabilidad".
- `app/domain/option_selection.py` recibe `applicability` vacío "hasta US-125": nadie consume aún los criterios.

## Goals / Non-Goals

**Goals:** contenido del S3 de los criterios en el catálogo; esquema JSON estricto del criterio; regla "sin
puntaje" en el validador; un lector tipado en `rag-orchestrator` que el motor de US-122 consuma por un puerto.

**Non-Goals:** evaluar criterios contra el paciente (US-122), interpretar texto de la población (US-123), avisos y
causas (US-124), agregación por opción (US-125). Ningún endpoint nuevo.

## Decisions

**D1 · Forma del criterio** (esquema en `schemas/aplicabilidad.schema.json`, `additionalProperties: false` en
todos los niveles):

```json
{ "key": "ecog", "cancerType": "mama", "studyKey": "ecog",
  "label": { "es": "Estado funcional (ECOG)", "en": "Performance status (ECOG)" },
  "destination": { "entity": "Diagnosis", "field": "performance_value", "match": { "performance_scale": "ECOG" } },
  "isExclusionary": false,
  "rule": { "operator": "rango", "partial": { "when": "solo_subgrupo" } },
  "estado": "propuesta" }
```

- `destination` usa **la misma forma que los datos críticos de US-001** (`entity`, `field` cuando la entidad tiene
  varios, `match`), para que una sola regla del validador (RN-29, allowlist DMMF) cubra ambos archivos.
- `rule.operator` ∈ {`igualdad`, `pertenencia`, `rango`}; `rule.equivalences` (opcional) mapea valores
  estructurados a un valor canónico (p. ej., HER2 "3+" o "2+ con ISH positivo" → `positivo`); `rule.partial.when`
  ∈ {`solo_subgrupo`, `rango_solapado`} declara cuándo el estado es "Parcial"; `rule.limits` (opcional, `min`/`max`)
  acota el criterio en el catálogo (lo usa la variante del AC-5). Todo declarativo, sin código ejecutable (ADR-29,
  RN-22). El significado operativo de cada operador lo implementa US-122 en `domain/applicability_rules.py`.
- `estado` del JSON (`propuesta` | `pendiente` | `revisado`) es el estado de revisión del criterio (`estado_de_revision` en
  `rag-orchestrator`); no es el `review_status` de un dato extraído (RN-07) ni el estado calculado de L1D-127.
- `studyKey` (obligatorio) = clave de `population_criteria` del estudio con la que se compara el criterio
  (decisión del usuario, 2026-10-24, `[S3 resp. 16]`; cierra Q1 de L1D-127). Admite subclave con punto
  (`biomarcadores.her2`). La consumen L1D-127 (valor del estudio) y L1D-117 (claves que la ingesta escribe).
- Alternativa descartada: reglas como expresiones (JSONLogic/CEL) → introduce un intérprete y código en datos, que
  ADR-29 excluye.

**D2 · Destinos del S3** (escenario `propuesta_revisada`, `[S3 resp. 1]`):

| Tipo | Criterio | `destination` | `studyKey` | Excluyente |
|---|---|---|---|---|
| mama | `estado_her2` | `Biomarker` `match.name = HER2` (IHQ/ISH por `Exam.exam_type`, `[S3 resp. 5]`) | `biomarcadores.her2` | sí |
| mama | `receptores_hormonales` | `Biomarker` `match.name ∈ {RE, RP}` | `biomarcadores.receptores_hormonales` | no |
| mama | `estadio` | `Diagnosis.stage_value` | `estadio` | no |
| ambos | `linea_tratamiento` | `PriorTreatment` | `linea` | no |
| mama | `estado_menopausico` | `ClinicalAttribute` `attribute_key = estado_menopausico` | `estado_menopausico` (asumido) | no |
| ambos | `ecog` | `Diagnosis.performance_value` (`performance_scale = ECOG`) | `ecog` | no |
| próstata | `estado_castracion` | `ClinicalAttribute` `attribute_key = estado_castracion` | `estado_castracion` (asumido) | sí |
| próstata | `extension` | `Diagnosis.stage_value` (asumido) | `estadio` | no |
| próstata | `isup` | `Diagnosis.grade` (PRD B-08) | `grado` (asumido) | no |
| próstata | `hrr_brca` | `Biomarker` `match.name = HRR/BRCA` | `biomarcadores.hrr_brca` | no |

Todos los `destination` están en las entidades clínicas permitidas por L1D-93 (D1, `[S3 resp. 16]`).

**D3 · Regla "sin puntaje" (RN-28)**: método con nombre `rechazarCamposDePuntaje()` en el validador de US-001;
recorre el criterio a cualquier profundidad y nombra criterio y campo (`peso`, `score`, `weight`, sin distinguir
mayúsculas). El esquema ya lo impide con `additionalProperties: false`, pero el método da un mensaje explícito y
no depende de que nadie relaje el esquema.

**D3b · `studyKey` existe y es única** (`[S3 resp. 16]`): archivo de raíz `packages/clinical-catalogs/poblacion.json`
(`{ version, keys: [{ key, cancerTypes }] }`, con su esquema) declara las claves de `population_criteria`: las del
modelo v1.1 (`subtipo`, `estadio`, `linea`, `biomarcadores.<nombre>`, `edad`, `ecog`) más `estado_menopausico`,
`estado_castracion` y `grado` (asumidas; ver Pendientes). Método con nombre `exigirStudyKey()` en el registro de
reglas de L1D-93: `study_key_ausente` (falta), `study_key_inexistente` (no declarada en `poblacion.json` para ese
tipo de cáncer), `study_key_duplicada` (dos criterios del mismo archivo con la misma clave, nombra ambos). Va en la
raíz, como `atributos.json`, para no alterar los seis archivos por tipo de US-041; L1D-117 lee de él las claves que
escribe la ingesta.

**D3c · Bloque `validation`** en el formato de L1D-93 (D4 de ese change, `[S3 resp. 16]`): `scope =
["aplicabilidad"]`, `status`, `reviewerRole`, `date` y `catalogHash` calculado con `catalog:hash`; L1D-93 añade el
valor `aplicabilidad` al `scope` y su escenario de hash distinto.

**D3d · Destino obligatorio sin duplicar** (`[S3 resp. 16]`): el requisito "Todo ítem del catálogo con destino lo
declara" es de L1D-93; aquí se reescribe como `MODIFIED`, con sus escenarios intactos más el de US-121 AC-2 sobre
`test-apl-1.0.0`. Por eso este change se archiva después de L1D-93 (antes, el archivo rechaza el delta).

**D4 · Lector en `rag-orchestrator`**: puerto `CriteriosDeAplicabilidad` en `app/domain/` (`criterios(cancer_type)
→ tuple[CriterioDeAplicabilidad, ...]`, dataclasses inmutables) y adapter en
`app/infrastructure/catalogo_clinico/aplicabilidad.py` que lee `<CLINICAL_CATALOG_PATH>/<tipo>/aplicabilidad.json`
**una vez al arrancar** (igual que el manifiesto), validado con un modelo Pydantic escrito a mano (es un archivo de
datos, no un schema del OpenAPI). Si falla, lanza `CatalogoNoDisponible` y el arranque emite
`configuracion_invalida` con `motivo = catalogo_no_disponible` (comportamiento ya especificado por US-041 AC-5).
El *wiring* va en `app/bootstrap.py`. Así el AC-5 se cumple por construcción: la regla vive en el directorio
montado, no en la imagen. Aquí se prueba la carga (escenario de soporte); el estado calculado lo prueba L1D-127.

**D5 · Versión**: el contenido nuevo va en la versión de catálogo del S3 que fije el change de L1D-93 (una sola
subida de `manifest.json.version` para FEAT-04 y FEAT-08b en el S3), no en una propia.

## Dependencias y colaboradores

- Crea: `packages/clinical-catalogs/poblacion.json` y su esquema (D3b), `app/domain/criterios_aplicabilidad.py` (puerto + tipos), `app/infrastructure/catalogo_clinico/aplicabilidad.py`
  (adapter), fixtures `test-apl-1.0.0` y `test-apl-1.0.1` (FX-08b-a) en ambos backends.
- Modifica: `packages/clinical-catalogs/{mama,prostata}/aplicabilidad.json`, `schemas/aplicabilidad.schema.json`,
  el validador de US-001 (reglas `rechazarCamposDePuntaje()` y `exigirStudyKey()`), `app/bootstrap.py`.
- El motor de US-122 depende del **puerto**, nunca del adapter ni de `json`/`Path`.

## Privacidad y ownership

- Solo datos de catálogo (versionados, públicos, sin PHI). Ninguna frontera nueva: el catálogo se monta de solo
  lectura en ambos backends (ADR-38); no cruza datos de `web` → `clinical-api` → `rag-orchestrator`.
- `rag-orchestrator` lee únicamente `CLINICAL_CATALOG_PATH`; no toca datos clínicos ni `clinical-minio`. Los
  `destination` nombran entidades del modelo de Backend 1 como **metadatos**; Backend 2 recibe los valores ya
  desidentificados en el `clinicalContext` (RN-11) cuando US-122 los use.
- Los errores del validador y del lector nombran el criterio y el campo, nunca la ruta ni el contenido del archivo.
- Fixtures 100 % sintéticos (A-M1, `doc-a*`).

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml` ni `contracts/examples/`:
`ApplicabilityCriterion.criterion` ya es `string` "del catálogo del tipo de cáncer" y el `409
CATALOG_VERSION_MISMATCH` con `rag-catalog-version-mismatch.json` existe desde US-041. Proveedor: ninguno nuevo.
Compatible con ADR-26 (oasdiff sin diferencias).

## Evaluación

Toca el **catálogo**: el PR corre `run-ai-eval` (OL-06, AC-T5.4). Métricas afectadas: ninguna de las actuales de
forma directa (los criterios aún no se usan en la recuperación ni en la generación); se registra el baseline para
M-08.2/M-08.6, que mide US-132.

## Risks / Trade-offs

- [Choque con L1D-93 en el validador y en la versión] → este change va después de L1D-93 y solo añade una regla y
  fixtures; si L1D-93 se retrasa, las tareas del validador esperan, el contenido y el lector no.
- [AC-5 necesita el cálculo de US-122, que a su vez lee este catálogo] → dependencia circular rota por decisión
  del usuario (`[S3 resp. 16]`): aquí se prueba que la misma build carga la regla de cada versión del catálogo
  montado; el test de aceptación del AC-5 con el estado `coincide` → `no_coincide` se escribe y se pone en verde
  en **L1D-127**, que reutiliza los fixtures `test-apl-1.0.0`/`test-apl-1.0.1` de este change.
- [Destinos de `extension` y `hrr_brca` inciertos] → son JSON; la sesión de oncólogos del S4 puede cambiarlos sin
  código.

## Decisiones del Gate 1 (usuario, 2026-10-24, `[S3 resp. 16]`)

- **Formato de `validation`**: el de L1D-93, `scope = ["aplicabilidad"]` + `catalogHash` (D3c).
- **Destino obligatorio**: sin requisito propio; escenario `MODIFIED` del requisito de L1D-93 y archivo después
  de L1D-93 (D3d).
- **`studyKey`** en cada criterio, existente y única (D1, D2, D3b); la consumen L1D-127 y L1D-117.
- **AC-5**: su test con el estado calculado se difiere a L1D-127 (tarea 2.4); aquí solo el soporte de carga.

## Pendientes de definir

- **Claves de población fuera del modelo v1.1** (`estado_menopausico`, `estado_castracion`, `grado`; dueño:
  L1D-117 / sesión de oncólogos del S4; afecta: `poblacion.json` y `data-model.md`). Se asumen; si L1D-117 no las
  escribe, el criterio queda `desconocido` por `no_reportado_por_fuente`, sin romper nada.
- **Tarea del AC-5 en L1D-127** (dueño: orquestador; afecta: `l1d-127/tasks.md`). Este change no la edita; hay que
  añadirla allí con `[US-121 AC-5]`.
- **Variante del AC-5 (dueño: humano; afecta: fixture).** Se asume `test-apl-1.0.1` = `rule.limits.max = 0` en
  `ecog`, con lo que A-M1 (ECOG 1) pasa de `coincide` a `no_coincide`.
- **Destino de `extension` (próstata)** asumido `Diagnosis.stage_value`; alternativa
  `ClinicalAttribute.sitios_metastasicos`. Se revisa en la sesión de oncólogos del S4.
- **Discrepancia Linear ↔ Markdown:** L1D-126 no tiene relaciones en Linear (Markdown: ⛔ DEC-11, ↪ US-041, US-001).
  Manda el Markdown.

## Decisiones del Gate 2, vuelta 1 (orquestador, 2026-10-24)

- **`destination.match` con lista solo en aplicabilidad.** `comun.schema.json#/$defs/destino` queda escalar (el Zod de
  completitud de L1D-94 solo admite cadenas); `aplicabilidad.schema.json` define `destinoConLista`. `attribute_key`
  lista se normaliza con `[clave].flat()` en `exigirAtributoDeclarado` (todas declaradas); en datos críticos la lista
  la rechaza el esquema.
- **Allowlist (adición de seguridad, decisión del usuario 2026-10-24 b).** Excluye `id`, `Biomarker.original_name`,
  `Biomarker.reference_range` y `Exam.source_lab`; ningún destino real ni de fixture las usa.
- **Contexto por entrada del registro.** Cada entrada de `ARCHIVOS_DEL_CATALOGO` puede declarar `contexto(items)`; el
  recorrido solo lo mezcla. `ARCHIVOS_DE_RAIZ` (`atributos`, `poblacion`) deriva lectura, compilación y validación.
- **Versión de los esquemas** en `comun.schema.json#/$defs/version`.
- **Puntaje (RN-28):** `peso`, `puntaje`, `ponderacion`, `puntos`, `score`, `weight`, solo en claves propias del
  criterio (no en `equivalences` ni `match`).
- **Decidido (usuario, 2026-10-24): `poblacion.json` obligatorio desde 1.1.0.** `clinical-api` no arranca sin él;
  `rag-orchestrator` no lo lee hasta US-122 (lee `aplicabilidad.json`). Asimetría intencional y confirmada.
- **Decidido (usuario, 2026-10-24): `rag-orchestrator` mantiene el arranque estricto** con un `aplicabilidad.json`
  inválido (`configuracion_invalida`, `motivo = catalogo_no_disponible`).
- **La versión del catálogo NO sube pese al contenido nuevo (D5).** Regla de versionado: cualquier cambio posterior de
  contenido (`datos-criticos`, `aplicabilidad`, `poblacion`, `atributos`) exige subir `manifest.version` (1.2.0 o
  superior).

## D8 · Guardián de versión del catálogo (`catalog:version-guard`)

**Decidido (usuario, 2026-10-24), asignado a L1D-126; alcance y endurecimiento tras el privacy-guardian (Gate 2).**
`scripts/catalog/version-guard.mjs` (`npm run catalog:version-guard -- --base <ref>`) compara la huella del ARCHIVO
ENTERO (sha256 del JSON canónico sin `version` ni `validation`: entra cualquier campo de primer nivel, como
`verifiedReviewStatuses`) del árbol actual con la de la base (`git show <base>:./archivo`).

- **Registro explícito de archivos vigilados** (no derivado del validador): `manifest`, `atributos`, `poblacion` y,
  por tipo (unión de los tipos del manifiesto actual y del de la base), `datos-criticos`, `aplicabilidad`, `codigos`,
  `tendencias`, `plantillas` y `sinonimos`. `lenguaje/terminos-prohibidos` lleva su versión propia (1.5.0) y se compara
  con ella, no con `manifest.version`.
- **Cambió y la versión es igual:** `contenido_cambiado_sin_subir_version <tipo>/<archivo>`. **Cambió y la versión no
  es estrictamente mayor** (semver, ignorando el prefijo `test-…`): `version_no_sube`. Quitar un tipo y su carpeta
  cuenta como cambio.
- **Excepción documentada:** archivo ausente en la base, o con todas sus listas de contenido (`items`, `keys`,
  `entradas`) vacías = primera publicación; es lo que deja pasar a este PR (aplicabilidad vacía en `main`, versión
  1.1.0 por D5).
- **Base ilegible:** «la ruta no existe en la base» (`git ls-tree`) se distingue de cualquier otro fallo (error de git,
  JSON ilegible, lectura mayor de 16 MiB): `base_ilegible <archivo>`; con `CI=true` falla cerrado, en local avisa.
- **Sin base** (primera vez, rama sin `origin/main`): `base_no_disponible`, con el mismo criterio CI/local.
- **CI:** paso del job `build-test` junto a `catalog:validate`, precedido de un fetch superficial del commit base
  (`--no-tags --depth=1 origin "$BASE_REF"`), sin `fetch-depth: 0` en todo el job. Deuda m-4 en tasks.md.
- La salida nombra tipo y archivo, nunca la ruta ni valores del catálogo.
- **Primera publicación solo de listas:** la excepción de «base vacía» solo permite cambios en las listas (`items`,
  `keys`, `entradas`); si difiere cualquier otro campo (p. ej. `estado`) se aplica la regla normal.
- **Riesgo aceptado: vaciar una lista publicada exige revisión humana explícita.** El guardián no distingue una lista
  vaciada y rellenada en dos PR (tasks.md G2.4).
- **Pregunta para el usuario (Gate 2, privacy-guardian P5):** `validation.status` queda fuera de la huella. ¿Cambiar el
  estado de revisión de DEC-11 (`propuesta_revisada` → revisado) exige subir la versión del catálogo? Hoy no la exige.


## Sprint 7 · Revisión clínica provisional y deudas (movido-S7, 2026-11-22)

Fuente: `backlog/sprints/S7-refinamiento.md` (§1, `[S7 resp. 1]`, `[S7 resp. 2]`) y `backlog/sprints/S7-revision-clinica.md`
(§1 y §6). Lo decidido en D1…D8 sigue vigente; estas decisiones lo amplían. Estado observado en `main` (2026-11-22):
`manifest.version = 1.9.0`; `<tipo>/aplicabilidad.json` en `1.1.0` con `validation.status = "propuesta_revisada"`;
`mama/poblacion-reglas.json` trae sinónimos de `estado_menopausico`, `estado_her2` (`positivo`, `negativo`) y
`receptores_hormonales` (`triple_negativo`); `prostata/poblacion-reglas.json` tiene `criteria: {}`.

**D9 · Marca `revision_provisional`, nunca «validada»** (`[S7 resp. 1]`). Cada criterio de `aplicabilidad.json` y cada
bloque de criterio de `poblacion-reglas.json` que cambie por C-1, C-2, C-4 o C-5 lleva
`"revision_provisional": { "rol": "ia", "fecha": "2026-11-21" }`: campo opcional, `rol` con un solo valor admitido (`ia`),
`fecha` ISO; misma forma que `l1d-335` (design D1). Se añade a `schemas/aplicabilidad.schema.json` y a
`schemas/poblacion-reglas.schema.json` (ambos con `additionalProperties: false`) y al modelo Pydantic `_Estricto` de
`app/infrastructure/catalogo_clinico/` (`extra="forbid"`). El criterio sigue en `estado = "propuesta"`; ningún archivo pasa
a `revisado` ni gana un rótulo «validada». Es un rótulo de procedencia: no entra en ninguna regla de cálculo ni llega a
la respuesta del análisis (sin cambio de contrato).
- **Una sola definición, compartida (Gate 1 del S7).** La forma vive en `schemas/comun.schema.json#/$defs/revisionProvisional`
  y la crea la **parte A** de este change (S7.4b). `aplicabilidad.schema.json`, `poblacion-reglas.schema.json` y
  `sinonimos.schema.json` (`l1d-335`) la usan con `$ref`: ningún esquema repite `rol` ni `fecha`. Añadir el `$defs` no
  cambia contenido ni versión (asumido: los esquemas no están en el registro del guardián, D8).
- Fuera del catálogo, los datasets de evaluación (`l1d-246`, `l1d-299`, `l1d-334`) validan la misma forma con **una**
  regla pura compartida en `apps/rag-orchestrator/app/evaluation/`; su dueño es el change que la implemente primero y
  los demás la reutilizan. Este change no la crea.

**D10 · C-1: `extension` excluyente en próstata, en dos códigos.** `prostata/aplicabilidad.json`: `extension` pasa a
`isExclusionary = true`. Para que solo excluya entre enfermedad no metastásica y metastásica, el criterio compara dos
códigos (asumido el modelado): `no_metastasica` (localizada, localmente avanzada, M0) y `metastasica` (M1), con sinónimos
es/en en `prostata/poblacion-reglas.json`. «No coincide» sigue exigiendo un marcador de restricción explícito en la
fuente (F-21, sin cambio): sin él, «Desconocido». Localizada frente a localmente avanzada comparten código y nunca dan
«No coincide».
- *Obstáculo conocido:* el valor del paciente es `Diagnosis.stage_value` en TNM (el seed trae `T2cN0M0`, `T3aN1M1b`) y
  `categoria_del_paciente()` compara por **prefijo**: con los datos de hoy no se puede leer M0/M1. Hace falta una forma
  declarativa de derivar la categoría (asumido: lista de marcas `M0`/`M1` en la regla, leída por una función pura con
  TDD estricto).
- **Supuesto compartido SC-1 (único para `l1d-126`, `l1d-246` y `l1d-299`; Gate 1 del S7).** Con el catálogo de la
  parte B, `extension` da `no_coincide` **solo si** se cumplen las dos condiciones: (i) la fuente trae un marcador de
  restricción explícito (F-21) y (ii) el M0/M1 del paciente se puede leer de `stage_value` con la regla declarativa.
  **Repliegue:** si (ii) falla, el estado es `desconocido`, nunca `no_coincide`, y la población no queda marcada como
  no comparable. La causa es del enum vigente de `unknownReason` (`contracts/schemas/evidence.yaml`):
  - `stage_value` presente pero sin M legible → **`sin_regla_de_comparacion`** (motivo interno `valor_fuera_de_tabla`,
    el que ya da `categoria_del_paciente()` cuando el valor no cae en ninguna categoría);
  - `stage_value` ausente → **`falta_en_paciente`** (regla vigente de `openspec/specs/applicability`).
  Sin causa nueva ni cambio de contrato. Si la lectura declarativa no cabe como dato del catálogo (S7.8 se detiene y
  pregunta), la parte B entrega `isExclusionary = true` y los dos códigos, todos los pacientes caen en el repliegue y
  C-1 no produce `no_coincide`: se reporta, no se fuerza. `l1d-246` y `l1d-299` no dan por hecho ninguno de los dos
  resultados: sus esperados salen de la regla con el catálogo mergeado.
- *Coste aceptado del modelado en dos códigos:* una fuente «solo localmente avanzada» y un paciente con enfermedad
  localizada comparten código. Alternativa descartada por ahora: tres códigos con exclusión condicional (exige una
  regla nueva, no solo datos). Pregunta Q-4 para expertos.

**D11 · C-2: HER2 bajo como subconjunto de negativo.** `mama/aplicabilidad.json`, `estado_her2.rule.equivalences`:
`positivo` (3+, 2+ con ISH positivo), `bajo` (1+, 2+ con ISH negativo) y `negativo` (0). Un paciente `bajo` pertenece
también a `negativo`: coincide con fuentes de HER2 negativo y con las de HER2 bajo. `mama/poblacion-reglas.json` gana los
sinónimos es/en del código `bajo`. Un IHC 2+ **sin** ISH no entra en ninguna categoría: «Desconocido» con
`unknownReason = sin_regla_de_comparacion` (motivo interno `valor_fuera_de_tabla`; asumido: el valor del paciente existe
pero no cae en ninguna categoría), sin cambio de contrato, nunca `negativo`.
- *Mecanismo:* hoy el paciente tiene un único código (`_codigo_del_paciente`). La jerarquía se declara en el catálogo
  (asumido: `rule.subsetOf = { "bajo": "negativo" }`, opcional, en el esquema) y la aplica una regla pura con nombre
  (`codigos_del_paciente()`: el código propio más sus ascendientes), con TDD estricto. La semántica F-20…F-24 no cambia.
- La parte «y dato faltante» de C-2 toca `mama/datos-criticos.json` y la completitud de `clinical-api` (FEAT-04; DEC-01
  está en Post-MVP): **no entra aquí**; pregunta abierta.

**D12 · C-4: triple negativo proyectado en dos criterios.** `mama/poblacion-reglas.json`: se retira el código
`triple_negativo` de `receptores_hormonales`; los textos que nombran triple negativo (es/en) pasan a ser sinónimos del
código `negativo` de `estado_her2` y del código `negativo` de `receptores_hormonales`. Solo datos.
- *Límite conocido:* `receptores_hormonales` es un criterio compuesto (`match.name = [RE, RP]`) y
  `es_criterio_compuesto()` lo deja en «Desconocido» (`forma_no_comparable`). El efecto de C-4 se ve en `estado_her2` y
  en la extracción medida por criterio (`l1d-299`); el estado de receptores hormonales no cambia. Comparar componente a
  componente queda fuera (pregunta abierta).

**D13 · C-5: HRR/BRCA con cuatro valores.** `prostata/aplicabilidad.json`, `hrr_brca.rule.equivalences`, y
`prostata/poblacion-reglas.json`, sinónimos es/en: `brca12_mutado`, `otro_gen_hrr`, `sin_mutacion`, `no_evaluado` (claves
asumidas, patrón `^[a-z0-9_]+$`). BRCA1/2 y los otros genes HRR nunca comparten código. Línea germinal frente a somática
no se modela en el S7 (no hay campo de destino, RN-29). Mismo límite de criterio compuesto que D12
(`match.name = [HRR, BRCA]`): en el S7 mejora la extracción y la lectura de la fuente, no el estado calculado.

**D14 · Versión, huellas y bloque `validation`.** Una sola subida de `manifest.version` para C-1, C-2, C-4 y C-5 (regla
de D5 y D8: cualquier cambio de contenido la exige), en la **parte B**: de `1.10.0` (la que deja `l1d-335`) a
**`1.11.0`**. La parte A no cambia la versión. Cada archivo tocado sube su `version` propia; se recalculan con
`catalog:hash` el `validation.catalogHash` de cada `aplicabilidad.json` y `manifest.poblacionReglas.<tipo>.catalogHash`.
Los `contracts/examples/*.json` y fixtures que citan la versión vigente se actualizan con la subida, sin editar lo
generado. Los fixtures `test-apl-*` no cambian (llevan su propia versión).
- **Los tests no fijan el literal de la versión.** Los tests que hoy comparan con `1.9.0` deberían leer
  `manifest.version` (parte A, S7.4c): así las subidas de `l1d-335` y de la parte B no los tocan. Los
  `contracts/examples/` son datos y sí se actualizan en cada subida.
- **Bloque `validation` cuando la IA edita el archivo (`[S7 resp. 9]`).** Los dos `aplicabilidad.json` cambian en la
  parte B, así que su bloque pasa a:

  ```json
  "validation": {
    "scope": ["aplicabilidad"],
    "status": "revision_provisional",
    "reviewerRole": "ia",
    "date": "2026-11-21",
    "catalogHash": "<huella del contenido nuevo>",
    "history": [
      { "status": "propuesta_revisada", "reviewerRole": "oncologo_asesor", "date": "2026-10-24",
        "catalogHash": "<huella del contenido que revisó el asesor: la del archivo en 1.9.0>" }
    ]
  }
  ```

  - `history` (asumido el nombre) es opcional en `schemas/validation.schema.json`: lista de entradas con `status`,
    `reviewerRole`, `date` y `catalogHash`, con `additionalProperties: false`. La entrada del S3 se copia tal cual del
    bloque vigente; su huella **no se recalcula**: es la del contenido que el asesor sí cubrió.
  - `status` ya admite el valor nuevo (patrón `^[a-z_]+$`). El validador gana dos reglas con nombre (asumidos los
    códigos), con TDD estricto: `validacion_provisional_incoherente` (`status = "revision_provisional"` exige
    `reviewerRole = "ia"`, y `reviewerRole = "ia"` exige ese `status`) y `historial_con_huella_vigente` (ninguna entrada de
    `history` puede llevar el `catalogHash` vigente del archivo). La regla `hash_distinto` de L1D-93 sigue comprobando
    el `catalogHash` del bloque principal contra el contenido actual.
  - **Invariante:** la huella del contenido editado por la IA solo aparece junto a `reviewerRole = "ia"`. Ningún
    artefacto, reporte ni test puede atribuirla a un oncólogo.
  - El modelo Pydantic del bloque en `app/infrastructure/catalogo_clinico/aplicabilidad.py` (`extra="forbid"`) acepta
    `history`; el dominio no la recibe. `validation` sigue fuera de la huella del guardián (D8).
  - `poblacion-reglas.json` no lleva revisor: su huella vive en `manifest.poblacionReglas` y no atribuye nada.
  - La pregunta P5 de D8 no cambia: aquí la versión sube igualmente porque cambia el contenido.

**D15 · Deudas del Gate 2 que vuelven de US-232** (`S7-refinamiento.md` §1; **parte A**, antes de la corrida base, sin
cambio de versión del catálogo). G1.6: el mapa `ESQUEMAS` de `validar-catalogo.ts` deriva de `ARCHIVOS_DE_RAIZ` solo
las entradas de raíz (`atributos`, `poblacion`); el resto del mapa sigue abierto a entradas nuevas. `l1d-335` añadirá
`sinonimos` a ese mapa después: S7.1 no lo cierra con una lista exacta de claves ni con un test que falle al añadir
una. G2.3: el guardián compara contra el primer padre del merge (`HEAD^1`,
`fetch-depth: 2`) en lugar de `pull_request.base.sha`. G2.4: el guardián falla con un código propio cuando una lista con
contenido en la base queda vacía (asumido; alternativa: dejar el riesgo aceptado y cerrarla como no accionable). G2.6:
`catalog:validate` comprueba la `version` propia de cada archivo frente a `manifest.version` (asumido: no mayor que la
del manifiesto, y un archivo cuyo contenido cambia la sube; hoy conviven `1.1.0`, `1.2.0` y `1.9.0`, así que exigir
igualdad rompería el catálogo vigente). No cambian contenido clínico ni disparan `evaluate`.

**D16 · Ventanas del S7, partición y evaluación.** Dos PR. **Parte A** (S7.1–S7.4c: G1.6, G2.3, G2.4, G2.6, el
`$defs` de `revision_provisional` y los tests que leen la versión del manifiesto): antes de la corrida base, sin cambio
de contenido ni de `manifest.version`. La corrida base (`[S7 resp. 2]`) usa el catálogo vigente (`1.9.0`): es la
referencia. Después `l1d-335` sube el catálogo a `1.10.0`. **Parte B** (S7.5–S7.14: C-1, C-2, C-4, C-5 y el bloque
`validation`) va después de `l1d-335`, entre la base y la final (`S7-refinamiento.md` §5, paso 4), y lo sube a
`1.11.0`. Después de la parte B van las partes de `l1d-299` y `l1d-246` que dependen de ella. La parte B se mide en la
**corrida final** con modelos locales: suites `aplicabilidad`, `poblacion` (`l1d-299`) y `opciones` (`l1d-246`) frente a la
base. Cada familia mide sobre su corpus fijo, el mismo en base y final y declarado en el reporte (`[S7 resp. 10]`); base
y final corren con los umbrales actuales, y los calibrados de `l1d-119` entran en la final como un brazo más
(`[S7 resp. 11]`). En el PR, `eval-required` con adaptadores falsos (cambia `packages/clinical-catalogs/**/*.json`). Regla del sprint:
ninguna cifra sin reporte versionado en `reports/eval/` producido por `run-ai-eval`.

**D17 · Mecanismos de la parte A (implementador, 2026-11-22).** Decisiones que ni la spec ni un ADR fijaban:
- **S7.1 (G1.6): `leerEsquemas` en el arranque (revisado tras el Gate 2).** `validar-catalogo.ts` obtiene TODOS los esquemas con
  `leerEsquemas(DIRECTORIO_DE_ESQUEMAS, leerArchivo)`, derivados de los registros del validador (raíz, declarados, por tipo,
  por lista): sin mapa propio ni `import` JSON de esquemas, y un archivo nuevo de cualquier registro (p. ej. `sinonimos` de
  `l1d-335`) llega al arranque sin editar `clinical-api`. `tsconfig.build.json` emite `packages/clinical-catalogs/schemas/*.json`
  a `dist/` (comprobado: build y arranque del módulo compilado contra el catálogo real). Primera versión (solo raíz derivada y
  el resto por importación estática) descartada por duplicar `leerEsquemas` (Replace Duplicate with Call). Otras descartadas:
  lista a mano (un archivo nuevo tumba el arranque sin aviso) y codegen de imports (paso de build nuevo). El `leerArchivo`
  inyectado también sirve los esquemas: el test usa entradas ficticias de raíz y declaradas por el manifiesto.
- **S7.2 (G2.3): `--base HEAD^1` en el job, sin tocar el script.** El guardián ya acepta cualquier ref; en `refs/pull/N/merge` el
  primer padre es la punta actual de la base. El job `build-test-node` hace `fetch-depth: 2` y se retira el `git fetch` de
  `BASE_REF`. Descartado: (a) exigir rama al día en la protección de `main` (no es verificable desde el repo); (b) que el script
  derive `HEAD^1` solo cuando `CI=true` (acopla un default a un entorno y rompe `push` a `main`, donde `BASE_REF` es `event.before`).
  El rojo del commit `test` es el test del workflow; los repos temporales de la base desfasada documentan la semántica.
  Re-run sin padre (commit sin `HEAD^1`): `baseDisponible` falla y el guardián da `base_no_disponible`, que con `CI=true` falla
  cerrado: aceptable (no pasa en silencio). Un `HEAD^1` ilegible da `base_ilegible`, también cerrado en CI.
- **S7.3 (G2.4): `lista_vaciada`, con o sin subir la versión.** Se comprueba antes de la regla de versión (una lista publicada que
  queda vacía exige revisión humana aunque la versión suba, porque el segundo paso, rellenarla, cuenta como primera publicación).
  Descartado: (a) exigir además que `manifest.version` suba (no cierra la evasión: el atacante sube la versión); (b) cerrar la
  tarea como riesgo aceptado (el humano no lo pidió).
- **S7.4 (G2.6): una sola comparación de versiones.** `validator/versiones.mjs` aloja `compararVersiones` y
  `violacionesDeVersionPropia`, y `ARCHIVOS_CON_VERSION_PROPIA` (en `archivos.mjs`) es la única lista de archivos con versión propia
  para el validador y el guardián; el guardián la importa (antes la tenía copiada). Los archivos con versión propia (`lenguaje/…`,
  `terminos-prohibidos`) se excluyen; los nombres de archivo salen de los registros de `archivos.mjs`, sin lista fija.
  Código `version_mayor_que_manifiesto`.
- **S7.4c:** `scripts/catalog/__tests__/apoyo.mjs` exporta `VERSION_DEL_CATALOGO`; `clinical-api` usa `versionDelCatalogo()` y
  `VERSION_DEL_MANIFIESTO`; `rag-orchestrator`, `VERSION_DEL_CATALOGO_MONTADO`. Los `contracts/examples/` siguen siendo datos.

**Ficheros que toca el S7.** `packages/clinical-catalogs/`: `manifest.json`, `mama/aplicabilidad.json`,
`mama/poblacion-reglas.json`, `prostata/aplicabilidad.json`, `prostata/poblacion-reglas.json`,
`schemas/comun.schema.json` (`$defs/revisionProvisional`), `schemas/validation.schema.json` (`history`),
`schemas/aplicabilidad.schema.json`, `schemas/poblacion-reglas.schema.json`, `validator/` (reglas y tests),
`test/` (tests de contenido). **No toca** `<tipo>/sinonimos.json` ni `schemas/sinonimos.schema.json` (son de `l1d-335`).
`apps/rag-orchestrator/app/domain/clasificacion_de_poblacion.py`, `app/infrastructure/catalogo_clinico/aplicabilidad.py` y
`poblacion_reglas.py`. `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts` (G1.6).
`scripts/catalog/version-guard.mjs` y `.github/workflows/ci.yml` (G2.3, G2.4). `contracts/examples/` (solo la versión).

**Privacidad, contratos y lenguaje.** Solo datos de catálogo, sin PHI. Sin cambio de `openapi.yaml`: no hay causa nueva
de «Desconocido» ni estado nuevo; los repliegues usan `sin_regla_de_comparacion` y `falta_en_paciente`, que ya están en
`unknownReason`. `history` no lleva nombres de persona, solo el rol (RN-10). Las etiquetas nuevas son descriptivas (RN-23) y ningún criterio lleva puntaje (RN-28).
Ningún contenido de NCCN ni de ESMO: los valores y sinónimos salen de la revisión provisional y de terminología general.

### Pendientes del S7 (para el humano)

- **AC-1 de US-121 en el backlog** dice que solo `estado_her2` y `estado_castracion` son excluyentes. C-1 añade
  `extension`. El delta lo recoge como `(asumido)`; el Markdown de la historia lo actualiza la sesión principal.
- **Bloque `validation`:** **Decidido (usuario, 2026-11-22, `[S7 resp. 9]`):** refleja la revisión provisional y conserva
  la del S3 como historial (D14). Quedan asumidos el nombre `history` y los dos códigos de regla.
- **IHC 2+ sin ISH como dato faltante** (C-2): ¿entra en `datos-criticos.json` en el S7 o espera a DEC-01?
- **Criterios compuestos** (D12, D13): ¿se aborda la comparación por componente o se acepta el límite en el MVP?
- **Dos o tres códigos en `extension`** (D10) y **G2.4 y G2.6** (D15): mecanismos asumidos.
- **Lectura de M0/M1** (D10, SC-1): si no cabe como dato del catálogo, C-1 queda en el repliegue y no produce
  `no_coincide` en el S7.
