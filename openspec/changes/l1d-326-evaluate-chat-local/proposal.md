# Proposal — l1d-326-evaluate-chat-local

## Trazabilidad

L1D-326 · US-269 · FEAT-12 (L1D-312, bloque 12-C Interfaz y evaluación) · Sprint 7 · **alcance residual** de una historia
de arrastre (3 pts nominales; el trabajo restante lo fija `/sprint-start S7`) · técnica (OL-06) · FR-20 · RN-01, RN-10,
RN-11, RN-12, RN-13, RN-14, RN-22, RN-23 · AC-T5.1 · M-02.1, M-02.2, M-02.3 · ADR-39, ADR-41, ADR-51 ·
**US-269 AC-3 y AC-7** (con modelos locales) y la parte de **AC-6** que cubre las peticiones preparadas · deudas
**D6-50, D6-52 y D6-59** (`backlog/sprints/S6-deuda.md`) · `[S7 resp. 2]` (corrida base y corrida final) · `[S7 resp. 3]`
(solo `evaluate:chat` y su medición con modelos reales) · regla del S7 «ninguna cifra sin reporte versionado en
`reports/eval/` producido por `run-ai-eval`» (`backlog/sprints/S7-refinamiento.md` §4) · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-269 (notas `Decidido (usuario, 2026-11-21)`).

Es el **residual** del change archivado `openspec/changes/archive/2026-11-13-l1d-326-chat-e2e-evaluate/` (PR #389 y
#390). Ese change dejó en `main` el dataset `chat-v1`, la familia `chat` de `evaluate` con adapters falsos
(`app/evaluation/chat.py`, `dataset_chat.py`), `eval/configs/chat-fake.yaml` y `chat-local.yaml`, el E2E de mama y la no
fuga en los cuerpos hacia Backend 2. Sus requisitos ya están en `openspec/specs/ai-evaluation/spec.md` y **no se
reescriben** aquí.

Decisiones que se respetan (no se reabren):

- **`[S7 resp. 3]`**: del residual de US-269 solo entra el chat con modelos reales. El E2E de próstata (AC-1, D6-49) y las
  métricas de faltantes (AC-4, D6-51) son Post-MVP.
- **`[S7 resp. 2]` y `S7-refinamiento.md` §5**: `evaluate:chat` se prepara **antes** de la corrida base y se mide **en**
  ella.
- **RN-12 y ADR-39**: la medición usa solo los modelos locales; lista cerrada de proveedores locales, sin *fallback* a la
  nube.
- **ADR-51**: el p95 por turno e intención es informativo, sin umbral bloqueante.
- **`[S7 resp. 1]`**: la revisión clínica de los casos sigue pendiente; el reporte sale `no_validada` (D6-53, sin cambio).
- **D-01**: análisis de evidencia y opciones descritas en la evidencia; 0 salidas prescriptivas (RN-23).

## Why

El chat no se ha medido con modelos reales (D6-59). `eval/configs/chat-local.yaml` existe, pero la familia `chat` termina
con código 2 con `proveedor: local` porque exige las peticiones que prepara `clinical-api` (`eval:chat-preparar`), y ese
paso nunca se construyó (D6-52). Tampoco existe el comando `evaluate:chat`, y los directorios del chat no disparan
`eval-required` en la CI. Mientras tanto, el soporte NLI, la precisión de los enlaces y la latencia del chat solo se
conocen con adapters falsos (D6-50), y DEC-07 (L1D-234) y la revisión de ADR-51 no tienen insumo.

## What Changes

- **`eval:chat-preparar` (`clinical-api`), reducido a la preparación de peticiones.** Sobre la BD de **test** con el seed
  sintético, arma con el pipeline de producción (desidentificación incluida) el `ChatTurnRequest` de cada caso y control de
  `data/eval/chat-v1/`, traduce las claves del seed de `hechos_esperados` a los `factRefs` de la petición, resuelve el
  marcador `{identidad_sintetica:P-CHAT}` desde el seed y escribe una `<id-del-caso>.json` por caso (`peticion`,
  `hechosPorClave`, `identidad`) en `apps/clinical-api/eval/results/tmp/`. `hechosPorClave` solo lleva claves
  semánticas y `factRefs`: ningún UUID de recurso, y el mapa `factRef → recurso` no sale de Backend 1. Se niega con
  `REAL_*_ENABLED`, entorno `piloto` o una base que no sea la de test sintética, y limpia al arrancar el residuo de una
  corrida interrumpida. **No** calcula M-04.1, M-04.2 ni `gapType` (D6-51, Post-MVP).
- **Comando raíz `npm run evaluate:chat`.** Encadena la preparación y `python -m app.evaluation.chat --peticiones …`,
  deja el JSON de la familia en `--salida` y borra las peticiones temporales al terminar. Con `--sin-preparar` y
  `chat-fake.yaml` corre como hoy, con los ejemplos del contrato (CI, sin base de datos).
- **Ajustes mínimos de la familia `chat` para la corrida real:** `chat-local.yaml` sin umbrales duplicados (se leen de
  `Settings`, RN-22; son los actuales, `[S7 resp. 11]`) y con el corpus de la medición, que es la ingesta de `l1d-119`
  (`[S7 resp. 10]`); el reporte declara `proveedor`, el reloj usado y las métricas
  **no medidas** (faltantes, D6-51); si el LLM local no responde, la corrida termina sin escribir cifras.
- **Higiene:** `apps/clinical-api/eval/results/tmp/` en el `.gitignore` raíz, en la primera tarea, antes de generar
  ninguna petición; `data/eval/chat-v1/**`, los nodos y prompts
  del chat y `app/evaluation/chat.py` en los disparadores de `eval-required`; la CI corre `evaluate:chat --sin-preparar`
  con `chat-fake.yaml` cuando se dispara.
- **Medición (no es código):** en la **corrida base** del S7, `ai-eval-runner` (skill `run-ai-eval`) corre
  `evaluate:chat` con `chat-local.yaml` y versiona `reports/eval/l1d-326-chat-v1.{json,md}` (el `.json` es el
  `chat.json` de la familia sin modificar; el `.md` lo escribe `ai-eval-runner` como resumen de esos agregados): soporte
  NLI y precisión de enlaces por tipo de cáncer (AC-3), p95 por turno e intención (AC-7), y los conteos de salidas
  prescriptivas y de apariciones de identidad, que deben ser 0 (si alguno no lo es, el comando sale con código
  distinto de 0).
  **Ninguna cifra del chat se cita antes de ese reporte.**

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `ai-evaluation`: **añade** (ADDED) la preparación de peticiones del chat en `clinical-api`, el comando `evaluate:chat`
  y el reporte versionado del chat con modelos locales; **modifica** (MODIFIED) «Latencia por turno e intención para la
  revisión de ADR-51» (deja de atarse al cierre del S6 y exige declarar el reloj).

Reutiliza sin cambiar: `patient-chat`, `deidentification`, `ci-pipeline` (solo se amplía la lista de rutas de
`scripts/ci/eval-trigger-paths.yaml`, que es configuración).

## Bounded contexts

`clinical-platform` (preparación de peticiones, comando raíz, `.gitignore`, disparadores y job de la CI) · `ai-services`
(ajustes de la familia `chat` y de `chat-local.yaml`). Sin `frontend`.

## Dependencias

- ↪ `l1d-316-langgraph-upgrade` (hora 0 del S7): la medición corre sobre el grafo con la versión de `langgraph` que quede
  en `main`. No bloquea el código de este change.
- ↪ `l1d-119-corpus-ampliado-calibracion`: la ingesta del corpus ampliado abre la corrida base; los turnos de evidencia
  (AC05, AC06) se miden sobre ese corpus, el mismo en la base y en la final y declarado en el reporte
  (`[S7 resp. 10]`). Bloquea solo las tareas de medición.
- 🔗 Comparten la corrida base (una sola carga de modelos, `[S7 resp. 2]`): `l1d-334-diagnostico-etapas-recuperacion`,
  `l1d-299-poblacion-dorado-suite`, `l1d-113-faltantes-desconocido-prompt`, `l1d-246-suite-hasta-3-opciones`, L1D-329 y
  L1D-333.
- **Desbloquea:** DEC-07 (L1D-234, metas definitivas de OL-06) con cifras del chat; la revisión de la latencia de ADR-51;
  el cierre de D6-50, D6-52 y D6-59; el paso L1D-326 → Done en lo que entra al S7.
- ↪ ya en `main`: familia `chat` y `chat-v1` (change archivado), seed `P-CHAT` (L1D-315), `proveedor: local` de la suite
  (L1D-298, ADR-39), `scripts/test-integration.sh` (US-038).

## Fuera de alcance

- **E2E de próstata** de AC-1 y ampliación de E2E (D6-49) → Post-MVP.
- **AC-4**: sensibilidad y especificidad de los faltantes y exactitud de `gapType` (D6-51, tareas 3.2 y 3.3 del change
  archivado en su parte de métricas) → Post-MVP. El requisito «Sensibilidad y especificidad de los faltantes sembrados»
  sigue en `openspec/specs/` sin implementar; este change no lo toca.
- Revisión clínica de los 13 casos (D6-53), menores de diseño del fake (D6-54), suite propia del loop contextual (D6-33).
- Cambios de nodos, prompts, umbrales o UI del chat: si la medición revela un fallo, se abre un bug en la historia dueña.
- Metas bloqueantes nuevas: las fija DEC-07. Calibración del NLI (D6-46, D6-58).
- Datos reales o anonimizados (RN-13).

## Impact

- `apps/clinical-api/src/cli/eval-chat-preparar.ts` y `apps/clinical-api/src/evaluacion/chat/` (nuevos, patrón de
  `medir-pii.ts`); script `eval:chat-preparar` en su `package.json`; test de integración en
  `apps/clinical-api/tests/integration/evidence-analysis/`.
- `scripts/eval/evaluate-chat.mjs` (nuevo) y `package.json` raíz (`evaluate:chat`); su test en `scripts/eval/__tests__/`.
- `.gitignore`; `scripts/ci/eval-trigger-paths.yaml`; el workflow que ejecuta `eval-required`.
- `apps/rag-orchestrator/app/evaluation/chat.py`, `eval/configs/chat-local.yaml`; tests en
  `apps/rag-orchestrator/tests/evaluation/`.
- `reports/eval/l1d-326-chat-v1.{json,md}` (ruta protegida; lo escribe `ai-eval-runner` en la corrida base).
- Sin cambios en `openapi.yaml`, `contracts/examples/`, esquema de datos, catálogo ni `data/eval/chat-v1/`.
