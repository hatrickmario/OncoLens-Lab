# Proposal — l1d-335-sinonimos-procedimientos-relacion

## Trazabilidad

L1D-335 · US-277 · FEAT-T5e · Sprint 7 · Estimación **5** (era 3, `[S7 resp. 6]`) · FR-09, IA-02 · M-06.1 ·
RN-02, RN-03, RN-22, RN-27 · ADR-33, ADR-39, ADR-45 (P6) · US-277 AC-1…AC-6 · `[S7 resp. 1]`, `[S7 resp. 2]`, `[S7 resp. 6]`,
`[S7 resp. 10]`, `[S7 resp. 11]` ·
SUP-4 · cierra D4-30; informa D6-61.
Fuente: `backlog/features/FEAT-T5e-mejora-recuperacion.md` §US-277; `backlog/sprints/S7-refinamiento.md` §2–§5;
`backlog/sprints/S7-revision-clinica.md` §2 (S-1…S-6 y lista del §2.2) y §6.

## Why

Una pregunta con el nombre coloquial de un procedimiento («cirugía radical de próstata») no recupera la evidencia que sí
recupera su término técnico. El segundo loop de reescritura (US-238) ya filtra términos con el catálogo, pero
`sinonimos.json` no tiene ningún procedimiento (3 entradas en próstata, 8 en mama), el validador del catálogo no lo
revisa y el archivo no distingue un sinónimo de un término más amplio o de un miembro de una clase (revisión clínica S-1):
ampliarlo sin esa distinción traería evidencia de otra intervención.

## What Changes

- **Esquema de `sinonimos.json`:** cada sinónimo declara `relacion: equivalente | mas_amplio | miembro_de_clase`
  (obligatorio) y cada término puede llevar `revision_provisional: {rol, fecha}`. Cambio de forma del catálogo:
  ambos backends lo leen en la misma versión (409 si difiere, sin cambio).
- **Validador del catálogo:** `sinonimos.json` entra en `catalog:validate` (hoy no lo valida): esquema, texto
  `equivalente` que apunta a dos términos del mismo tipo, y sigla nueva de dos letras (S-3). Se registra como archivo
  **por tipo de cáncer declarado por lista en el manifiesto** (clave nueva `sinonimos`, design D3): no hereda las reglas
  de destino (un sinónimo no tiene `destination`) y los fixtures que no lo declaran siguen válidos.
- **Arranque de `clinical-api`:** el mismo validador corre al arrancar con un mapa fijo de esquemas
  (`validar-catalogo.ts`). Ese mapa gana el esquema `sinonimos` en este change, con su test de arranque: sin él, el
  servicio no arranca con el catálogo nuevo.
- **Contenido:** procedimientos y tratamientos de próstata y mama de la lista del §2.2 de la revisión clínica, en
  español e inglés, marcados `revision_provisional: {rol: ia, fecha: 2026-11-21}`. **No es validación de un oncólogo**
  y nada pasa a «validada». Se corrige `pertuzumab ← doble bloqueo anti-HER2` (S-4) y se añade *leuprolide* (S-5).
  Un texto más estrecho que su canónico (una técnica, una vía, un fármaco) no entra como `equivalente`: se declara
  `miembro_de_clase` (design D1, regla S-1). `manifest.version` sube a **1.10.0** (orden del catálogo en Dependencias).
- **Solo `equivalente` expande la consulta:** el segundo loop de reescritura admite un término canónico o un sinónimo
  `equivalente`; lo demás se descarta. La pregunta original sigue puntuando en el *reranker*.
- **Solo `equivalente` equipara conceptos** en los demás consumidores del archivo: normalización terminológica de
  `clinical-api` (ADR-33) y deduplicación de valores de población en `rag-orchestrator`.
- **Medición (corrida final del S7):** pares de paráfrasis de US-276 con `QUERY_REWRITE_ENABLED = true`, no regresión
  frente a la corrida base y brazo de 30 pares del *reranker*. Los valores por defecto de `QUERY_REWRITE_ENABLED` y
  `RERANKER_MAX_PAIRS` **no cambian en este change**: los decide el usuario sobre el reporte (refinamiento §4).
  Corpus: el del dataset `s5-corpus-ampliado` en memoria, el mismo en la base y en la final y registrado en el reporte
  (`[S7 resp. 10]`). Umbrales: los actuales en ambas corridas (`[S7 resp. 11]`).
- **Suite `evaluate`:** `Brazo` gana `RERANKER_MAX_PAIRS` y `QUERY_REWRITE_ENABLED` (hoy no los soporta), y
  `QUERY_REWRITE_ENABLED` entra en `scripts/ci/eval-trigger-paths.yaml`.
- Sin cambio de contrato OpenAPI, de prompt, de umbral ni de modelo.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `clinical-catalogs`: relación por sinónimo, validación de `sinonimos.json`, contenido de procedimientos y
  tratamientos con revisión provisional, y corrección del doble bloqueo anti-HER2.
- `evidence-analysis`: la reescritura solo admite términos canónicos y sinónimos `equivalente`; la regla de «sin
  evidencia» no cambia con el catálogo ampliado.
- `terminology-reconciliation`: solo un sinónimo `equivalente` resuelve un texto a su término canónico.
- `ai-evaluation`: medición de los pares de paráfrasis con la reescritura activa, no regresión y brazo de 30 pares.

**Bounded contexts:** ai-services (reescritura, carga de sinónimos, evaluación) y clinical-platform (lector del
catálogo terminológico y normalización). El paquete `packages/clinical-catalogs` (datos y validador) es compartido.
Frontend: no.

## Dependencias

- ↪ `l1d-334-diagnostico-etapas-recuperacion` (US-276): produce los pares de paráfrasis y la atribución por etapa que
  usa AC-2. Bloquea solo la tarea de medición, no el catálogo ni el código.
- ↪ L1D-300 (US-238, segundo loop de reescritura): en `main` (archivado).
- ↪ `l1d-331-cobertura-prostata-segundo-loop` (US-273): arrastre del S7. **No toca el catálogo** salvo que el usuario
  elija su opción C (más términos por tipo en `lenguaje/marcos-de-pregunta.json`); solo en ese caso sube la versión, y
  va el último de la cadena.
- ↪ `l1d-126-criterios-aplicabilidad-catalogo` (US-121, C-1…C-5): sube la misma `manifest.version` y su tarea S7.1
  reescribe el mismo mapa `ESQUEMAS` de `validar-catalogo.ts`.
- **Orden del catálogo** (propuesta de planificación, se aprueba con el plan): `l1d-126` parte A (deudas del Gate 2,
  sin versión; incluye S7.1) → **este change sube `manifest.version` a 1.10.0** → `l1d-126` parte B a 1.11.0 →
  `l1d-331` solo si se elige su opción C. En secuencia, nunca en paralelo.
- ↪ `l1d-119-corpus-ampliado-calibracion`: la corrida base del S7 (`[S7 resp. 2]`) es la referencia de AC-5. Aporta
  además, en la corrida final, el brazo de los umbrales calibrados (`[S7 resp. 11]`); este change no lo mide.
- ↪ `l1d-336-reranker-ventanas-chunk` (US-278): comparte la corrida final, los pares de US-276 y **archivos de la
  suite**: `app/evaluation/brazos_recuperacion.py`, `config_suite.py`, `esquema_suite.py`, `composicion_suite.py` y
  `scripts/ci/eval-trigger-paths.yaml`. Este change va **después** y extiende el `Brazo` que deje `l1d-336`.
- **Orden de los archivos de la suite** (propuesta de planificación): `l1d-334` → `l1d-329` → `l1d-331` (parte de
  código) → `l1d-336` → **este change** → `l1d-337`. Cada uno rebasa sobre el anterior.
- ⛔ Validación del oncólogo (SUP-4): **resuelta** con el escenario aceptado de `[S7 resp. 1]` (revisión provisional
  de IA). La revisión por expertos queda como pregunta Q-5 de la revisión clínica, fuera del sprint.

## Fuera de alcance

- Traducción con modelo dedicado (brazo A4 de US-230), BM25 o multivector, y cambiar `RELEVANCE_THRESHOLD`.
- Cambiar el prompt `reescritura-consulta` o añadir una expansión determinista por sinónimos sin LLM.
- Cambiar los valores por defecto de `QUERY_REWRITE_ENABLED` o `RERANKER_MAX_PAIRS` (decisión posterior del usuario).
- Normalizar tildes o erratas (S-6: lo resuelve la normalización de texto, no el catálogo).
- Criterios de aplicabilidad (C-1…C-10 son de `l1d-126`) y el léxico de marcos de pregunta (L1D-331).
- Pasar cualquier entrada a «validada» o a `revision_oncologo`.

## Impact

- `packages/clinical-catalogs/`: `schemas/sinonimos.schema.json`, `schemas/manifest.schema.json` (clave `sinonimos`),
  `mama/sinonimos.json`, `prostata/sinonimos.json`, `manifest.json` (versión y declaración), `validator/` (registro y
  reglas de sinónimos), fixtures de `test/fixtures/`.
- `scripts/catalog/__tests__/`: tests del validador de sinónimos.
- `apps/rag-orchestrator`: `app/infrastructure/catalogo_clinico/sinonimos.py`, `app/domain/` (regla de relación),
  `app/bootstrap.py`, tests; `app/evaluation/` (`brazos_recuperacion.py`, `config_suite.py`, `esquema_suite.py`,
  `composicion_suite.py`) y configuraciones de `eval/configs/` para la corrida final.
- `scripts/ci/eval-trigger-paths.yaml`: clave `QUERY_REWRITE_ENABLED`.
- `apps/clinical-api`: `src/infrastructure/catalogo/catalogo-terminologico.ts` (esquema Zod estricto: hoy rechazaría
  el campo nuevo y el servicio no arrancaría), `src/infrastructure/catalogo/validar-catalogo.ts` (mapa `ESQUEMAS` del
  validador al arrancar) y `src/modules/reconciliation/`. Los lectores del manifiesto de ambos backends
  (`manifiesto.schema.ts`, `manifiesto.py`) toleran claves nuevas y no cambian.
- `contracts/examples/*.json` y fixtures que citan la versión del catálogo (hoy `1.9.0`): se actualizan con la subida.
- Dispara `eval-required` (cambia `packages/clinical-catalogs/**/*.json`): `evaluate` con modelos locales obligatoria.
