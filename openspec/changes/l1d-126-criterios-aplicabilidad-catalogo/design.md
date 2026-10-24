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
- **`poblacion.json` obligatorio desde 1.1.0.** `clinical-api` no arranca sin él; `rag-orchestrator` no lo lee (lee
  `aplicabilidad.json`). Asimetría intencional. **Pregunta para el usuario:** confirmarla.
- **La versión del catálogo NO sube pese al contenido nuevo (D5).** Regla: cualquier cambio posterior a
  `aplicabilidad.json` (o `poblacion.json`) exige 1.2.0 o superior. **Pregunta para el usuario:** ¿se añade un control
  en CI que falle si cambia el contenido de una versión ya publicada?
