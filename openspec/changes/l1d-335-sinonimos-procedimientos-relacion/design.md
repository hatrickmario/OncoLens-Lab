# Design — l1d-335-sinonimos-procedimientos-relacion

## Context

Motivación en `proposal.md`. Estado observado en `main` (502978a9):

- `packages/clinical-catalogs/<tipo>/sinonimos.json`: `items[] = { terminoCanonico, sinonimos[{ texto, idioma }] }`;
  3 términos en próstata y 8 en mama, ningún procedimiento. `manifest.version = 1.9.0` gobierna su versión
  (`scripts/catalog/version-guard.mjs` ya vigila `sinonimos`).
- `catalog:validate` **no valida** `sinonimos.json`: no está en el registro `validator/archivos.mjs`. Solo existe el
  esquema `schemas/sinonimos.schema.json` y el Zod estricto de `clinical-api`.
- El mismo validador corre al arrancar `clinical-api`: `exigirCatalogoValido`
  (`apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts`) le pasa un mapa **fijo** `ESQUEMAS` con los
  esquemas importados uno a uno, y `validator/validar-catalogo.mjs` hace `ajv.compile(esquemas[<esquema>])` por cada
  entrada de los registros de `archivos.mjs`. Un archivo registrado sin su esquema en ese mapa compila `undefined` y
  el servicio no arranca (`esquema_invalido`). El script de CI no tiene ese problema: `leerEsquemas` deriva los
  nombres de los registros.
- `validator/archivos.mjs` tiene cinco registros: `ARCHIVOS_DEL_CATALOGO` (por tipo, obligatorios en todo catálogo,
  con `REGLAS_DE_DESTINO` por ítem), `ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO` (por tipo, objeto con `catalogHash`),
  `ARCHIVOS_POR_TIPO_DECLARADOS_POR_LISTA` (por tipo, solo en los tipos que el manifiesto lista; reglas propias del
  archivo antes del esquema; hoy `plantillas`), `ARCHIVOS_DE_RAIZ_DECLARADOS_POR_EL_MANIFIESTO` y `ARCHIVOS_DE_RAIZ`.
  De los fixtures de `test/fixtures/`, solo `test-1.0.0` y `test-normalizacion-1.0.0` traen `sinonimos.json`.
- Consumidores del archivo:
  - `rag-orchestrator`, `app/infrastructure/catalogo_clinico/sinonimos.py`: `cargar_sinonimos` (texto → canónico; lo
    usan la deduplicación de población de US-242 en `ingest_poblacion.py` y `corrida_poblacion.py`, y
    `cargar_datos_de_relevancia` de `catalogo_clinico/relevancia.py`, que alimenta la regla «la pregunta nombra el
    dato crítico» de `domain/chat/relevancia.py`), `cargar_terminos_del_catalogo` (conjunto que admite la reescritura,
    vía `filtrar_terminos_del_catalogo` de `domain/reescritura.py`) y `cargar_terminos_por_tipo` (pertinencia del
    seguimiento por tipo de cáncer; lo usan `bootstrap.py`, `evaluation/chat.py` y `evaluation/seguimiento.py`). Hoy
    las dos últimas se derivan de `cargar_sinonimos`.
  - `clinical-api`, `src/infrastructure/catalogo/catalogo-terminologico.ts` (`z.strictObject`: un campo nuevo impide
    arrancar) y `modules/reconciliation/reconciliation.reglas.ts` (`resolverPorTexto`).
- El segundo loop (US-238) no deriva términos del catálogo: el LLM local propone y el catálogo filtra. El *reranker*
  puntúa siempre contra la pregunta original (RN-03).

## Goals / Non-Goals

**Goals:** un solo significado de «sinónimo equivalente» para los tres consumidores; contenido del §2.2 con marca
provisional; validación del archivo en `catalog:validate`; medición de AC-2, AC-5 y AC-6 en la corrida final.

**Non-Goals:** cambiar el mecanismo de reescritura, su prompt o sus valores por defecto; expansión determinista sin
LLM; cambiar el contrato OpenAPI; criterios de aplicabilidad; léxico de marcos de pregunta.

## Decisions

### D1. `relacion` vive en cada sinónimo, no en el término

Decisión de esquema del catálogo (cara de revertir: la leen dos backends y fixtures). Opciones:

| Opción | Descripción | Resultado |
|---|---|---|
| A. Por término (`items[].relacion`) | Lectura literal de la tabla del §2.2 | **Descartada**: `antraciclinas` necesita a la vez `anthracyclines` (equivalente, exigido por el requisito de US-271 AC-9) y `doxorrubicina` (miembro de clase); obligaría a duplicar términos canónicos. `pertuzumab` quedaría sin sinónimos y el esquema exige ≥ 1 |
| **B. Por sinónimo (`sinonimos[].relacion`)** | Cada texto declara su relación con el canónico | **Elegida**: expresa las tres relaciones en un término, conserva las equivalencias vigentes y hace trivial la regla «solo `equivalente`» |
| C. Archivo aparte de relaciones (`relaciones.json`) | `sinonimos.json` queda solo con equivalentes | Descartada: archivo, esquema y montaje nuevos para el mismo dato; contradice `[S7 resp. 6]` («en `sinonimos.json`») |

Forma resultante:

```json
{ "terminoCanonico": "inhibidores de aromatasa",
  "revision_provisional": { "rol": "ia", "fecha": "2026-11-21" },
  "sinonimos": [
    { "texto": "aromatase inhibitor", "idioma": "en", "relacion": "equivalente" },
    { "texto": "letrozol", "idioma": "es", "relacion": "miembro_de_clase" } ] }
```

- `relacion` es **obligatorio** (sin valor por defecto: un sinónimo sin relación es un error del catálogo, no un
  `equivalente` presunto). Las entradas existentes se migran a `equivalente`, salvo las de S-4.
- Semántica (dirección fija): `mas_amplio` = el texto nombra un concepto más amplio que el canónico;
  `miembro_de_clase` = el texto es un miembro de la clase que nombra el canónico.
- `revision_provisional` es opcional, por término; `rol` es un enum de un valor (`ia`) y `fecha` una fecha ISO. Se
  conserva la grafía `revision_provisional` de `[S7 resp. 1]` (es la misma de los datasets, `revision_oncologo`).
- **Una sola definición de la marca.** La forma `{rol, fecha}` es un `$defs` único en `schemas/comun.schema.json`
  (`revisionProvisional`), que `sinonimos.schema.json` referencia con `$ref`; es el mismo que usan
  `aplicabilidad.schema.json` y `poblacion-reglas.schema.json` de `l1d-126`. Lo crea el primero de los dos changes
  que llegue a `main` (por el orden del catálogo, este); el otro lo reutiliza. No se copia el enum del rol en cada
  esquema. Los datasets de `evaluate` (`l1d-246`, `l1d-299`, `l1d-334`) validan la misma forma con una única regla
  pura en `app/evaluation/`, que no es de este change.
- Las filas del §2.2 marcadas `miembro_de_clase` (ARPI, inhibidores de aromatasa, CDK4/6, antraciclinas): el nombre
  de la clase en el otro idioma es `equivalente`; los fármacos son `miembro_de_clase`.
- **Criterio de relación para toda la lista (S-1).** Un texto es `equivalente` solo si nombra la misma intervención o
  el mismo concepto que el canónico, sin restringir técnica, vía de acceso, fármaco ni modalidad. Si es más estrecho
  que el canónico es `miembro_de_clase`; si es más amplio, `mas_amplio`. Ante la duda no es `equivalente`. El §2.2
  rotula su lista «todas `equivalente`, salvo nota»; aplicar S-1 a esa misma lista obliga a corregir estos textos:

  | Canónico | Textos que **no** son `equivalente` | Relación | Motivo |
  |---|---|---|---|
  | prostatectomía radical | prostatectomía radical robótica, prostatectomía radical laparoscópica, robot-assisted radical prostatectomy | `miembro_de_clase` | vía de acceso |
  | radioterapia externa | radioterapia de intensidad modulada, IMRT | `miembro_de_clase` | técnica |
  | braquiterapia | implante de semillas, seed implant | `miembro_de_clase` | modalidad |
  | terapia de privación androgénica | castración médica, medical castration, análogos de LHRH, LHRH agonist, GnRH agonist | `miembro_de_clase` | la privación androgénica incluye también la castración quirúrgica (S-2); los análogos son una clase de fármacos dentro de ella |
  | mastectomía | mastectomía total, total mastectomy, mastectomía radical modificada | `miembro_de_clase` | tipo de mastectomía |
  | cirugía conservadora de mama | cuadrantectomía | `miembro_de_clase` | extensión de la resección |
  | cirugía conservadora de mama | tumorectomía, lumpectomía, lumpectomy | `miembro_de_clase` | tipo de resección, como la cuadrantectomía (Gate 1, vuelta 2) |
  | terapia de privación androgénica | bloqueo androgénico | `miembro_de_clase` | el bloqueo androgénico completo es un esquema concreto dentro de ella (Gate 1, vuelta 2) |
  | espera vigilante | observación, observation | `mas_amplio` | «observación» abarca también otras conductas de seguimiento (Gate 1, vuelta 2) |
  | resistencia a la castración | hormonorrefractario | `mas_amplio` | término en desuso con alcance distinto (Gate 1, vuelta 2) |
  | pertuzumab | doble bloqueo anti-HER2, dual HER2 blockade | `mas_amplio` | S-4 |

  El resto de la lista queda `equivalente`. Cada canónico conserva al menos un `equivalente` (p. ej. `mastectomy`,
  `brachytherapy`, `EBRT`), así que el mínimo de seis procedimientos del requisito se sigue cumpliendo.
- **Dudas que quedan `equivalente` y van a Q-5** (uso intercambiable en la práctica, pero discutible): «radioterapia
  intersticial» (braquiterapia; en el catálogo de próstata), *partial mastectomy* (cirugía conservadora de mama),
  «impotencia» y «ganglio centinela» (nombra el ganglio y no el procedimiento: es el caso límite). Ante la duda, S-1
  manda no usar `equivalente`: por eso «observación», las tumorectomías, «bloqueo androgénico» y «hormonorrefractario»
  salieron de esta lista en la vuelta 2 del Gate 1. El canónico de «hormonorrefractario» es el término del catálogo
  para la resistencia a la castración; si el catálogo lo nombra de otro modo, se usa ese nombre.
- Toda la lista, con estas relaciones, sigue marcada `revision_provisional`: no es validación de un oncólogo.
- S-4: término nuevo `doble bloqueo anti-HER2` con `dual HER2 blockade` (`equivalente`); en `pertuzumab` esos dos
  textos pasan a `mas_amplio` (el término conserva ≥ 1 sinónimo y deja de equipararse).
- Términos con la misma grafía en los dos idiomas (`HER2` con `ERBB2`): una entrada por texto e idioma, como hoy.

### D2. Una sola regla «solo `equivalente` equipara», con un dueño por runtime

- **Python (`rag-orchestrator`):** regla pura `es_equivalente(relacion)` y el enum `RelacionDeSinonimo` en
  `app/domain/` (módulo nuevo `sinonimos.py`). Dos cargadores con nombre, cada uno con su significado:

  | Cargador | Devuelve | Consumidores |
  |---|---|---|
  | `cargar_sinonimos` (existe; cambia) | texto → canónico, **solo canónicos y `equivalente`** | deduplicación de población (`ingest_poblacion.py`, `corrida_poblacion.py`); `cargar_terminos_del_catalogo` (reescritura); `cargar_datos_de_relevancia` (relevancia del chat) |
  | `cargar_formas_por_termino` (nuevo) | canónico → **todos** sus textos, con cualquier relación | `cargar_terminos_por_tipo` (pertinencia del seguimiento); la regla de la causa de la familia `contextual` de `l1d-329` |

  - La reescritura hereda la regla sin tocar `filtrar_terminos_del_catalogo`.
  - **Relevancia del chat (`domain/chat/relevancia.py`): solo `equivalente`.** La regla decide si la pregunta *nombra*
    un dato crítico; un miembro de una clase o un término más amplio no lo nombra. Sigue leyendo `cargar_sinonimos`
    y su código no cambia. Las entradas vigentes pasan todas a `equivalente` salvo los dos textos de S-4, que no son
    de ningún dato crítico: lo fija un test de no regresión.
  - **Pertinencia (`cargar_terminos_por_tipo`): todos los textos.** Reconocer que un término es de próstata no es
    expandir una consulta. Deja de derivarse de `cargar_sinonimos` y pasa a `cargar_formas_por_termino`.
  - **Familia `contextual` (`l1d-329`, que llega antes a `main`):** su regla de la causa busca en el corpus todas las
    formas del término. Hoy las lee de `cargar_sinonimos`; este change la repunta a `cargar_formas_por_termino`. Su
    test «cuenta como forma cada texto de `sinonimos[]` del término» queda en rojo si no se repunta.
- **TypeScript (`clinical-api`):** el lector filtra al construir `SinonimosDeTermino.textos` (solo equivalentes), de
  modo que `resolverPorTexto` no cambia; el nombre de la regla (`esSinonimoEquivalente`) vive junto al lector.
- **Validador (`.mjs`):** el literal del enum vive en el esquema JSON; las reglas lo leen del esquema, no lo repiten.
- Antes del PR se busca el literal `equivalente` en todo el árbol (regla de dueño único del `config.yaml`).

Alternativa descartada: una función compartida entre runtimes (no hay paquete común Python/TS; el contrato compartido
es el esquema JSON).

### D3. `sinonimos.json` entra al validador

**Registro: `ARCHIVOS_POR_TIPO_DECLARADOS_POR_LISTA`**, con la clave nueva del manifiesto `sinonimos: [<tipos>]`
(`schemas/manifest.schema.json`, que tiene `additionalProperties: false`). Motivos, por descarte:

| Registro | Resultado |
|---|---|
| `ARCHIVOS_DEL_CATALOGO` | Descartado: aplica `REGLAS_DE_DESTINO` a cada ítem (un sinónimo no tiene `destination`) y hace el archivo obligatorio en todo catálogo; `test-1.1.0`, `test-apl-*` y `fx-04-a` no lo traen y dejarían de validar |
| `ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO` | Descartado: su declaración es un objeto por tipo con `catalogHash`, y no admite reglas propias del archivo |
| **`ARCHIVOS_POR_TIPO_DECLARADOS_POR_LISTA`** | **Elegido**: por tipo de cáncer, con reglas propias del archivo antes del esquema, y un catálogo sin la declaración no lo tiene: los fixtures anteriores siguen válidos |
| Registros de raíz | Descartados: `sinonimos.json` es por tipo |

- El catálogo real declara `sinonimos: ["mama", "prostata"]`; un test de contenido lo fija, para que la validación no
  se apague por omisión.
- `cargar.mjs` lee hoy `lenguaje/terminos-prohibidos` en cuanto **cualquier** archivo de ese registro está declarado
  (`declaraPlantillas`). Se acota a las entradas que lo necesitan, para que un fixture que solo declara `sinonimos`
  no exija ese archivo. Las reglas de `sinonimos` ignoran el segundo argumento (`terminosProhibidos`).
- **Arranque de `clinical-api`:** el mapa `ESQUEMAS` de `validar-catalogo.ts` gana `sinonimos` (importa
  `schemas/sinonimos.schema.json`). `l1d-126` S7.1 reescribe antes ese mapa para derivarlo de los registros de
  `archivos.mjs`; este change rebasa sobre lo que deje y añade el esquema en esa misma fuente, sin volver a una lista
  a mano. Si S7.1 solo deriva `ARCHIVOS_DE_RAIZ`, este change añade la entrada `sinonimos` y lo anota como deuda de
  S7.1 en el PR. Test de arranque en los dos sentidos: arranca con el catálogo real de la versión nueva, y no arranca
  con un catálogo que declara `sinonimos` y trae un equivalente ambiguo.

Entrada `sinonimos` (esquema `sinonimos`) y módulo `validator/sinonimos.mjs` con reglas puras:
`sinonimo_equivalente_ambiguo` (texto normalizado `equivalente` de dos canónicos del mismo tipo, o canónico de uno y
equivalente de otro), `termino_canonico_repetido` y `sinonimo_igual_al_canonico`. La normalización de la comparación
reutiliza la del validador si existe; si no, minúsculas y sin tildes, alineada con `normalizar_texto` y `clave()`.
La regla de S-3 (sin siglas nuevas de dos letras) se comprueba con un test de contenido sobre el diff contra la lista
de siglas ya publicadas, no como regla general del validador (las vigentes `RE`, `RP`, `ER`, `PR` son válidas).

### D4. La medición no cambia valores por defecto

AC-2, AC-5 y AC-6 son salidas de la corrida final del S7 (`[S7 resp. 2]`), ejecutada por `ai-eval-runner` vía
`run-ai-eval`. Este change aporta la configuración de los brazos (catálogo ampliado + `QUERY_REWRITE_ENABLED=true`;
`RERANKER_MAX_PAIRS` vigente y 30) y la meta `paraphrase_evidence_min_ratio` en `eval/configs/metas-iniciales.yaml`.
`Brazo` (`app/evaluation/brazos_recuperacion.py`) hoy solo conoce el modo de recuperación y su fusión; tras `l1d-336`
conoce además los campos del *reranker* de ese change. Este change le añade `reranker_max_pairs` y
`query_rewrite_enabled`, con el mismo patrón: opcionales, `None` = «el de la configuración de la suite», y no se
serializan en la huella cuando son `None` (la huella de los brazos existentes no cambia). `composicion_suite.py`
compone el servicio de cada brazo con esos dos valores.

Corpus y umbrales de la medición: el dataset `s5-corpus-ampliado` en memoria, el mismo en la corrida base y en la
final, con su identificación en el reporte (`[S7 resp. 10]`); los dos brazos corren con los umbrales actuales, y los
calibrados entran en la final como un brazo más que aporta `l1d-119` (`[S7 resp. 11]`).
Los valores por defecto de `QUERY_REWRITE_ENABLED` y `RERANKER_MAX_PAIRS` los decide el usuario sobre el reporte
(refinamiento §4); si decide cambiarlos, va en la sección `## humano` (`.env.example`, Compose, ADR-39).

## Privacidad y ownership

- Ningún dato cruza una frontera nueva. El catálogo es **dato versionado**, montado de solo lectura en ambos backends;
  no contiene datos de pacientes. La lista del §2.2 es terminología pública redactada en el proyecto: nada de contenido
  de NCCN ni ESMO (RN-21).
- `rag-orchestrator` sigue sin acceso a datos clínicos ni a `clinical-minio`; la reescritura recibe exactamente la
  pregunta ya enmascarada por `clinical-api` (RN-11) y solo usa el LLM local (RN-12). Sin cambios en el prompt.
- Los logs del validador y de los lectores nombran código, tipo y archivo; nunca valores del catálogo ni la pregunta.
- Repo público: los pares de paráfrasis y los fixtures son sintéticos (RN-14).
- Seguridad web: no aplica, el change no toca `apps/web` ni los Route Handlers.

## Contratos

Sin diff en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`: `queryRewrite`,
`catalogVersion` y el `409 ErrorCatalogVersionMismatch` no cambian de forma (compatible con ADR-26; `oasdiff` sin
diferencias). Los tests de integración de `/rag/query` de este change validan cada respuesta contra
`apps/rag-orchestrator/openapi.yaml`, para que «sin diff» sea una comprobación y no una afirmación. Cambia el **valor** de `catalogVersion` en los ejemplos de `contracts/examples/` que citan la versión
vigente (`1.9.0`): se actualizan con la subida, sin editar lo generado. El «contrato» que sí cambia es el esquema JSON
del catálogo (`schemas/sinonimos.schema.json`), cuyo proveedor es `packages/clinical-catalogs` y cuyos consumidores
son los dos backends; es incompatible hacia atrás (campo obligatorio nuevo), por eso exige versión nueva y el 409
protege un desfase entre backends. `schemas/manifest.schema.json` gana la clave opcional `sinonimos` (compatible: los
manifiestos sin ella siguen válidos).

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `packages/clinical-catalogs/schemas/sinonimos.schema.json` | `relacion` obligatorio; `revision_provisional` opcional | — |
| `packages/clinical-catalogs/{mama,prostata}/sinonimos.json`, `manifest.json` | Contenido del §2.2, S-4, S-5; versión | esquema |
| `packages/clinical-catalogs/validator/{archivos,sinonimos,cargar}.mjs`, `schemas/manifest.schema.json` | Registro por lista (clave `sinonimos`), reglas puras y lectura acotada de `terminos-prohibidos` | esquema (enum) |
| `packages/clinical-catalogs/schemas/comun.schema.json` | `$defs/revisionProvisional`, único y compartido con `l1d-126` | — |
| `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts` | `ESQUEMAS` con `sinonimos`, sobre lo que deje `l1d-126` S7.1 | registros de `archivos.mjs` |
| `apps/rag-orchestrator/app/domain/sinonimos.py` (nuevo) | `RelacionDeSinonimo`, `es_equivalente()` | — |
| `app/infrastructure/catalogo_clinico/sinonimos.py` | Lee `relacion`; `cargar_sinonimos` solo equivalentes; `cargar_formas_por_termino` (nuevo) y `cargar_terminos_por_tipo` con todos los textos | dominio |
| `app/evaluation/corrida_contextual.py` (de `l1d-329`) | Las formas del término salen de `cargar_formas_por_termino` | `l1d-329` en `main` |
| `app/evaluation/{brazos_recuperacion,config_suite,esquema_suite,composicion_suite}.py` | `Brazo` con `reranker_max_pairs` y `query_rewrite_enabled` | `Brazo` de `l1d-336` |
| `scripts/ci/eval-trigger-paths.yaml` | Clave `QUERY_REWRITE_ENABLED` | — |
| `app/domain/reescritura.py`, `app/application/rag_orchestrator_service.py` | Sin cambio de código esperado (reciben el conjunto ya filtrado) | puerto del catálogo |
| `apps/clinical-api/src/infrastructure/catalogo/catalogo-terminologico.ts` | Zod con `relacion` y `revision_provisional`; `esSinonimoEquivalente()` | puerto `CatalogoTerminologico` |
| `apps/rag-orchestrator/eval/configs/` y `metas-iniciales.yaml` | Brazos y meta de la corrida final | runner de variantes (US-226), pares de `l1d-334` |

Reglas de dominio con nombre propio: `es_equivalente()` / `esSinonimoEquivalente()` (S-1) y las tres reglas del
validador. Fakes tocados: ninguno nuevo; el `QueryRewriter` falso de los tests de integración ya pasa el test de
contrato de `tests/unit/test_reescritor_de_consulta.py`, y este change no altera ese puerto.

## Evaluación

Cambia el catálogo: `eval-required` se dispara y la suite con modelos locales es obligatoria (OL-06). Métricas
afectadas: recall@10 y MRR (también es→en), exactitud de «sin evidencia», preguntas adversarias, p95 de consulta
completa (`p95_evidence_analyses_s`, 20 s) y p95 de recuperación, más la métrica nueva de paráfrasis con evidencia.
Brazos: base del S7 · catálogo ampliado con reescritura apagada · catálogo ampliado con `QUERY_REWRITE_ENABLED=true` ·
ídem con `RERANKER_MAX_PAIRS=30`. Todos sobre el mismo corpus (`[S7 resp. 10]`) y con los umbrales actuales
(`[S7 resp. 11]`). La deduplicación de población usa el mismo archivo: la suite `poblacion`
(`eval/configs/test-poblacion.yaml`) corre como no regresión. Ninguna cifra se escribe en este change ni en el PR sin
su reporte versionado en `reports/eval/` producido por `run-ai-eval` (regla del sprint); los reportes se rotulan
`no_validada`.

## Risks / Trade-offs

- [El LLM de reescritura no propone el término técnico, o lo propone y el *reranker*, que puntúa contra la pregunta
  coloquial original, deja los chunks bajo el umbral] → AC-2 puede no alcanzar la meta aun con el catálogo correcto. El
  reporte lo separa por etapa con el diagnóstico de US-276; la decisión (expansión determinista, otro brazo) es del
  usuario y sería otra historia.
- [Conflicto de versión del catálogo con `l1d-126` y `l1d-331` en el mismo sprint] → orden fijo: `l1d-126` parte A
  (sin versión) → este change a 1.10.0 → `l1d-126` parte B a 1.11.0 → `l1d-331` solo con su opción C. Quien sube la
  versión actualiza `contracts/examples/`. Si el plan cambia el orden, el número se corrige al rebasar.
- [Tres changes extienden `Brazo` y `eval-trigger-paths.yaml`] → orden fijo de los archivos de la suite: `l1d-334` →
  `l1d-329` → `l1d-331` (código) → `l1d-336` → este change → `l1d-337`.
- [La causa de CTX-C13 del reporte de `l1d-329` puede cambiar entre la base y la final] → por S-4, «doble bloqueo
  anti-HER2» deja de equivaler a `pertuzumab`; es un efecto del catálogo, no de la recuperación. El reporte final lo
  anota (limitación declarada en `l1d-329`).
- [Desfase entre backends durante el despliegue] → lo cubre el 409 existente; ambos lectores se mergean en el mismo PR.
- [Un `equivalente` clínicamente discutible en la lista provisional] → marca `revision_provisional`, reportes
  `no_validada` y pregunta Q-5 para la sesión con expertos; revertir es editar el JSON y subir versión.
- [Textos ya resueltos por `clinical-api` que dejen de mapear] → solo cambian los dos textos de S-4, que no tienen
  código en `codigos.json`; lo fija un test de no regresión sobre el catálogo real.

## Open Questions

- Q-5 de la revisión clínica (revisión de la lista por expertos) queda fuera del sprint; no cambia specs ni tareas.
- Si tras el reporte el usuario activa `QUERY_REWRITE_ENABLED` o sube `RERANKER_MAX_PAIRS`, el cambio de valores por
  defecto se aplica por la sección `## humano` de `tasks.md`.

## Decisiones de la implementación (catálogo y clinical-platform)

Casos que el diseño no cubría, con la alternativa elegida y por qué se descartaron las otras.

- **D5. Dónde vive el literal `equivalente` en el validador.** D2 pedía que las reglas lo leyeran del esquema. Opciones:
  (a) leerlo de `sinonimos.schema.json` por la ruta `properties.items.items.properties.sinonimos.items.properties.relacion`
  (frágil: un cambio de forma del esquema lo rompe sin aviso); (b) una palabra clave propia en el esquema (Ajv `strict`
  la rechaza); (c) **constante `RELACION_EQUIVALENTE` en `validator/sinonimos.mjs`**, único dueño en el runtime del
  validador, más un test que fija que el enum del esquema la contiene. Elegida (c): el esquema sigue siendo el dueño del
  conjunto cerrado y la regla nombra solo la relación que equipara.
- **D6. `sinonimo_igual_al_canonico` compara la grafía, no la forma normalizada.** La lista del §2.2 trae `trastuzumab
  deruxtecan` (en) bajo `trastuzumab deruxtecán`: normalizado (sin tildes) es idéntico al canónico y la regla lo rechazaba.
  Opciones: (a) quitarlo de la lista (la normalización de texto ya lo resuelve, S-6; pierde la entrada en inglés del
  §2.2); (b) **comparar solo mayúsculas y espacios**, de modo que la grafía de otro idioma no sea una repetición;
  (c) excluir el caso por una lista fija (rompe P1). Elegida (b). La ambigüedad entre términos (`sinonimo_equivalente_ambiguo`)
  sí compara sin tildes, para no admitir dos términos que se normalizan igual.
- **D7. Marca provisional en todas las entradas.** Los 20 términos de próstata y los 24 de mama llevan
  `revision_provisional` (rol `ia`, 2026-11-21), también los que no cambiaron de sinónimos (`PSA`, `bicalutamida`, `Ki-67`…):
  a todos se les asignó una `relacion` en esta revisión. Alternativa descartada: marcar solo el diff (obliga a un test
  contra la versión anterior en git y deja entradas con relación asignada sin marca).
- **D8. Registro por lista con `usaTerminosProhibidos`.** La lectura de `terminos-prohibidos` en `cargar.mjs` se acota con
  un indicador de la entrada del registro (`plantillas`), no con una lista de claves en `cargar.mjs`; las reglas de
  `sinonimos` ignoran ese segundo argumento.
- **D9. `l1d-126` parte A ya derivó los esquemas del arranque.** `validar-catalogo.ts` usa `leerEsquemas`, así que la tarea 3.4
  se reduce a la entrada `sinonimos` de `archivos.mjs` (tarea 1.3): no hay mapa `ESQUEMAS` que editar y los tests 3.3 del
  arranque con equivalente ambiguo ya salían del validador compartido.
- **D10. Fixtures.** `test-1.0.0` trae `items: []` en `sinonimos.json` (nada que migrar); el único con entradas es
  `test-normalizacion-1.0.0`. Los casos del validador usan el fixture nuevo `test-sinonimos-1.0.0`, que declara `sinonimos`
  en su manifiesto y no trae `lenguaje/` (así se prueba que no exige `terminos-prohibidos`).
- **Duda de la lista del §2.2 sin resolver (a Q-5):** `hormonosensible` / `hormone-sensitive` quedan `equivalente` de
  `sensible a la castración` (uso intercambiable en la práctica, discutible), además de las que ya anotaba D1.

## Decisiones de la implementación (ai-services)

- **D11. Un solo parser del catálogo en Python.** `cargar_sinonimos` y `cargar_formas_por_termino` leen el archivo con el mismo
  `_terminos_de` (canónico y `(texto, RelacionDeSinonimo)` normalizados); la regla S-1 vive solo en
  `app/domain/sinonimos.py::es_equivalente`. Alternativas: (a) que cada cargador abra el JSON y compare el literal
  `equivalente` (duplica la regla, descartada por P1); (b) un cargador que devuelva ya los dos mapas (obliga a todos los
  consumidores a conocer ambos; descartada). `RelacionDeSinonimo(valor)` lanza `ValueError` ante una relación ausente o
  desconocida y el cargador lo traduce a `CatalogoNoDisponible` sin ruta ni contenido, como el resto de errores de forma.
- **D12. `formas_del_termino` (familia `contextual`) devuelve las formas ordenadas.** El cargador devuelve `frozenset` (sin
  orden), así que la función las entrega `sorted`, determinista. El orden anterior era el de inserción del catálogo; ninguna
  aserción ni reporte lo usa como dato (los reportes comparan conjuntos). Alternativa descartada: devolver tuplas en el orden
  del archivo (el contrato «canónico → todos sus textos» no necesita orden y complica la derivación de pertinencia).
- **D13. La meta de paráfrasis no entra en los informes que no la miden.** El esquema del baseline es cerrado y
  `marcar_frente_a_meta` marcaba una fila por meta, así que `paraphrase_evidence_min_ratio` rompía el informe (`$.metricas[7]
  fuera del conjunto`). Ahora omite las metas cuya clave el informe no declara (`None` sigue siendo «sin medir»). Alternativas:
  (a) ampliar el esquema del baseline con la métrica (cambia un contrato de informe por una métrica que otra suite mide);
  (b) meta en un archivo aparte (contradice `[S7 resp. 6]`/RN-22: una sola configuración de metas). Elegida la regla de
  marcado: no cambia ningún informe existente.
- **D14. Los casos AC-2/AC-3/AC-4 sobre el catálogo real nacen en verde.** El mecanismo de US-238 ya filtraba contra el
  catálogo y el catálogo 1.10.0 (misma rama) ya trae los textos; solo es rojo el caso que distingue la relación (tarea 2.2).
  Se registran así, sin debilitar aserciones (la propia tarea 2.3 lo prevé para RN-02).
- **D13 (revisado en el Gate 2).** La omisión de metas sin clave salió de `marcar_frente_a_meta` (vuelve a marcar una por
  meta; una meta sin clave en las métricas es «sin medir») y pasó al informe que tiene el esquema cerrado:
  `DatosDelInforme.metas_medidas` (Move Method), con las claves de `_METRICAS_DE_META` y el p95. `corrida_opciones` ya
  filtraba sus metas del mismo modo.
- **D15. La pertinencia por tipo no incluye los textos `mas_amplio`.** `cargar_terminos_por_tipo` (contexto del seguimiento y
  enrutado del chat) devuelve el código del tipo, los canónicos, los `equivalente` y los `miembro_de_clase`, no los
  `mas_amplio`: por definición no son exclusivos del término («observación» en una pregunta de mama la clasificaría
  `fuera_de_contexto`). Se implementa con el parámetro `relaciones` de `cargar_formas_por_termino` (por defecto todas;
  la regla de la causa de contextual, `formas_del_termino`, sigue usando todas). Alternativas descartadas: mantener
  «todos» (falsos `fuera_de_contexto` en mama) y excluir también `miembro_de_clase` (las clases sí son específicas de un tipo).
  Si el producto prefiere otra semántica, es la deuda D7-24.
- **D16. Normalización del validador.** `validator/normalizar.mjs` (la de `plantillas.mjs`, igual a `normalizar_texto` de
  Python) la usan `plantillas.mjs` y `sinonimos.mjs`; «HER-2» y «HER 2» son el mismo texto, «HER2» y «HER-2» no (Python tampoco
  los une). `marcos.mjs` conserva la suya (solo `a-z0-9`, otra regla). Regla nueva `sinonimo_con_relaciones_contradictorias`
  (el mismo texto como `equivalente` y con otra relación dentro de un término).
- **Paridad del enum.** pytest compara `RelacionDeSinonimo` con el enum del esquema y Vitest compara `RELACIONES_DE_SINONIMO`
  (ahora exportado). El patrón de fecha de `revision_provisional` lo comprueba el esquema al arrancar y en `catalog:validate`;
  no se duplicó en zod.
- **Deuda:** D7-23 (paridad automática esquema JSON ↔ zod ↔ Pydantic del catálogo, más allá de `relacion`) y D7-24
  (decisión de producto sobre la semántica de pertinencia si no se acepta D15).
- **Entrega 2 (4.1b y 4.2):** necesitan `Brazo` de `l1d-336` y los pares de `l1d-334`, aún sin mergear; no se apilan.
- **D17. Versión de `plantillas.json` y el AC-8 de US-267.** Al subir el manifiesto a 1.10.0, `plantillas.json` conserva su
  versión propia 1.9.0 (regla de versión propia de 126 A: ≤ manifiesto) y el test de web exigía `== manifiesto`. Opciones:
  (a) subir `plantillas.json` a 1.10.0 sin cambio de contenido (versión falsa: el guardián la tomaría por contenido nuevo);
  (b) **quitar la igualdad y conservar «ningún archivo importado supera al manifiesto»**, que es la intención del AC-8
  (el build no importa contenido más nuevo que el catálogo declarado); la igualdad solo valía mientras las plantillas eran
  el contenido recién añadido (1.8.0). Elegida (b), con `Test-Removal` por la aserción retirada.

