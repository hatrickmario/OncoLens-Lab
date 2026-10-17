# ADR-26 — El contrato se cambia solo de forma aditiva; todo ERR de oasdiff que se acepte se declara aquí, uno por uno

> Linear: L1D-106 (aplicación de la excepción E-1) · Historia: US-055 · Feature: FEAT-06a
> Plantilla: MADR 4 (variante mínima, en español).
> **Origen del número:** ADR-26 es una decisión previa al backlog (`readme.md` §3.3 #26: contrato `EvidenceAnalysis` congelado) que hasta ahora solo se citaba en historias y en `readme.md` §4. Este archivo la formaliza y registra el único mecanismo de excepción. **Amplía su alcance**: la regla aditiva se extiende a todo `openapi.yaml` de proveedor y se define cómo se declara una excepción; no cambia la decisión original.

- **Estado:** aceptado
- **Fecha:** 2026-10-17
- **Decisores:** usuario (propietario del producto), 2026-10-17 (E-1)
- **Consultados / informados:** ai-services-dev (implementación), contract-keeper (Gate 2)
- **Requisitos:** FR-25, RN-02, RN-22; US-036 AC-2 (`contracts:breaking`), US-214

## Contexto y problema

Los `openapi.yaml` de los proveedores son la fuente única de los contratos (US-033) y solo cambian de forma **aditiva** (ADR-26). La CI lo comprueba con `scripts/ci/contracts-breaking.sh` (`oasdiff breaking --fail-on ERR`, US-036 AC-2); no hay *bypass* hasta US-214.

L1D-106 añade al `422` de `POST /rag/query` la alternativa `ErrorTipoCancerNoRegistrado` (`error: TIPO_CANCER_NO_REGISTRADO`, decisión del usuario `[S1 resp. 35]`: sin tipo de cáncer no hay filtro de recuperación, y eso **no** es un `sin_evidencia`). `oasdiff` clasifica la alternativa nueva de un `oneOf` de respuesta como `response-body-one-of-added` de nivel **ERR** (verificado 2026-10-17 con `oasdiff` sobre `origin/main`), y además emite el aviso `response-body-wrapped-in-one-of-original-preserved` (WARN, no rompe). El design.md del change preveía a lo sumo WARN/INFO; la medición lo desmintió.

El cambio es compatible en la práctica: el consumidor (`clinical-api`, cliente generado) ya trata todo `422` como error de la IA y el código nuevo es un valor más del campo `error`. Pero `oasdiff` no lo sabe, y la CI no distingue.

## Factores de decisión

- No reabrir el contrato ya decidido `[S1 resp. 35]`: el `422 TIPO_CANCER_NO_REGISTRADO` queda como está.
- No debilitar el control: el resto de los ERR debe seguir rompiendo la CI.
- Trazabilidad: toda excepción nombra el hallazgo exacto, el change que la causa y la decisión que la acepta.
- Reversibilidad barata: borrar la entrada restaura el control completo.

## Opciones consideradas

1. **Excepción declarada y acotada** a ese hallazgo exacto, registrada en este ADR y en `scripts/ci/contracts-breaking-excepciones.json`.
2. Estado propio para el error (`400` o `424`) en lugar de un `422` con `oneOf` ampliado (`oasdiff` reportó 0 ERR y 1 WARN).
3. Convertir `error` del `422` en un enum común (cambio de forma del schema; 6 ERR medidos).

## Decisión

Opción elegida: **1**, por decisión del usuario del 2026-10-17. No se usa un código HTTP propio (`400`/`424`: el `422` ya expresa "la petición es sintácticamente válida pero no procesable") ni la opción 3 (rompe más de lo que arregla).

### Mecanismo

`contracts-breaking.sh` sigue ejecutando `oasdiff breaking --fail-on ERR`. Si falla, repite la comparación con `--format json` y descarta **solo** los ERR que coinciden en **todos** los campos (proveedor, regla, operación, ruta y texto del hallazgo) con una entrada de `scripts/ci/contracts-breaking-excepciones.json`. Cualquier otro ERR del mismo proveedor, incluida otra alternativa añadida al mismo `oneOf`, rompe la CI. Los hallazgos declarados se siguen imprimiendo.

### Fallo cerrado del filtro

El filtro nunca perdona por omisión. (1) Se identifica a sí mismo comparando rutas **reales** (`realpathSync`): lanzado por una ruta con enlace simbólico (en macOS `/var` es `/private/var`) sigue ejecutándose, en lugar de salir 0 sin hacer nada. (2) Un hallazgo con `level` ausente o no numérico cuenta como ERR; solo 0, 1 y 2 no rompen. (3) Solo perdona, imprimiendo la decisión explícita `excepciones-declaradas-aplicadas`, si **al menos un** ERR coincide con una excepción y **ninguno** queda sin declarar; entrada vacía, JSON inválido o ERR sin declarar dan exit 1. (4) `contracts-breaking.sh` exige esa línea exacta: si el filtro no corre, falla o no la emite, el ERR sigue rompiendo. Los tests de CLI (`scripts/ci/__tests__/excepcionesDeContrato.test.mjs`, grupo «CLI … falla cerrado») lanzan el filtro por un enlace simbólico y cubren cada caso; `contractsBreaking.test.mjs` comprueba que el script contiene la decisión.

### Excepciones declaradas

| Id | Proveedor | Hallazgo de oasdiff | Change | Motivo |
|---|---|---|---|---|
| E-1 | rag-orchestrator | `response-body-one-of-added` en `POST /rag/query`: `ErrorTipoCancerNoRegistrado` añadido al `oneOf` del `422` | l1d-106-retrieval-threshold-sin-evidencia | Alternativa aditiva del `422`; el consumidor no depende de la lista cerrada de alternativas `[S1 resp. 35]` |

### Consecuencias

- **Positivas:** el contrato decidido se publica sin tocar el control del resto de cambios; la excepción es auditable y de una sola línea.
- **Negativas:** `contracts-breaking.sh` deja de ser "cero ERR" literal; el aviso WARN `response-body-wrapped-in-one-of-original-preserved` sigue apareciendo y se declara en el PR.
- **Reglas para añadir otra excepción:** un ADR (o una nueva fila aquí) con la decisión del humano, la entrada exacta en el JSON y un test; nunca un patrón genérico.
- **Retirada:** cuando US-214 (`contracts:breaking`) sustituya al script, E-1 se migra a su mecanismo o se retira si el cambio ya es la base de la comparación (tras el merge de L1D-106 a `main`, la comparación contra `main` ya no reporta el hallazgo y la entrada puede borrarse).

### Confirmación

`scripts/ci/__tests__/excepcionesDeContrato.test.mjs`: la excepción solo perdona el hallazgo exacto (otro proveedor, otro schema, otra regla, otra ruta o un ERR distinto siguen rompiendo) y `contracts-breaking-excepciones.json` declara solo E-1, enlazada a este archivo. Revisión del Gate 2 (`contract-keeper`).

## Pros y contras de las opciones

### 1. Excepción declarada y acotada

- A favor: respeta la decisión del contrato; control intacto para todo lo demás; trazable.
- En contra: añade un mecanismo a la CI hasta que US-214 lo absorba.

### 2. Código de estado propio (400/424)

- A favor: 0 ERR sin mecanismo nuevo.
- En contra: un `422` ya cubre el caso; fragmenta la semántica de errores del endpoint.

### 3. Enum común de `error`

- A favor: un solo schema de error de validación.
- En contra: 6 ERR; cambia la forma de los errores existentes.

## Más información

- `openspec/changes/l1d-106-retrieval-threshold-sin-evidencia/design.md` (`## Contratos`) y `tasks.md` 1.3.
- `scripts/ci/contracts-breaking.sh`, `scripts/ci/contracts-breaking-excepciones.json`, `scripts/ci/lib/excepcionesDeContrato.mjs`.
- Revisión prevista: con US-214.
