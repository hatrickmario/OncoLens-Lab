# Proposal — l1d-246-suite-hasta-3-opciones

## Trazabilidad

L1D-246 · US-140 · FEAT-T5b (L1D-47) · Sprint 5 (S4 → S5, `[S4 resp. 1]`; comprometida `[S5 resp. 3]`, O3) · Estimación **5** ·
FR-20 (OL-06) · AC-T5.1 (opciones), AC-T5.3 · M-10.1, M-10.2, M-07.2 (con hasta 3 opciones) · RN-28, RN-01, RN-23, RN-22,
RN-14 · AC-08.8 · G-2, G-14 · readme §5.0 S4 KR1 · US-140 AC-1…AC-6 · DEC-07 → S6: metas y tolerancias = metas iniciales de
`CLAUDE.md` (escenario más probable) y configuración en `eval/configs/s5.yaml` (`S5-refinamiento.md`, decidido 2026-11-03) ·
🔗 Mide a: FEAT-10c (US-134), FEAT-10b · 🔗 Produce para: US-142 (L1D-248, G-Demo D-5/AC-2).

## Por qué

FR-09 pasó en el S4 de 1 a hasta 3 opciones ordenadas por aplicabilidad (US-134), pero la suite `evaluate` solo mide la
generación con una opción por pregunta y no verifica el orden de RN-28. Sin una familia que mida, con verdad conocida, que
cada opción mostrada sigue citada y soportada, que ninguna salida usa términos prescriptivos y que el orden respeta siempre
la regla de aplicabilidad, G-Demo (US-142) no tiene números para la hipótesis 3 y un cambio de prompt, umbral o corpus
podría degradar el análisis de evidencia con varias opciones sin que la CI lo detecte.

## Qué cambia

- **Dataset sintético `data/evaluation/opciones/`** (manifiesto `clase: sintetico`): 12 casos (6 de mama, 6 de próstata)
  con pregunta terapéutica, corpus de test, opciones que describe el corpus y orden esperado por RN-28; 4 casos
  `revisada_por_oncologo` y 2 con una opción cuya única fuente es no comparable. Extiende FX-10c-a (guiones `LLM-CUATRO`,
  `LLM-TRES`, `APL-FIJA`) para la configuración falsa.
- **Familia nueva `opciones` del runner** (`evaluate --suite opciones --config eval/configs/s5.yaml`): ejecuta el análisis en
  proceso con `maxOptions = 3` y reporta M-10.1 (opciones mostradas con ≥ 1 cita y soporte), M-10.2 (salidas mostradas con
  términos prohibidos, niveles A y B de la lista de US-068), fidelidad y precisión de citas (M-07.2), número medio de
  opciones por análisis, porcentaje de análisis cuyo orden respeta RN-28 **sobre sus propios resúmenes** (comparador
  `applicability_order` de US-125, no un orden fijo) y porcentaje de opciones esperadas presentes entre las mostradas.
- **Bloqueos** (código de salida 3, con los ids de caso): M-10.1 < 100 %, M-10.2 > 0, un análisis con orden que viola
  RN-28 o una opción no comparable mostrada antes de una comparable; y retroceso de fidelidad o precisión de citas frente
  al reporte de referencia en más de `FAITHFULNESS_REGRESSION_TOLERANCE`.
- **Metas sin DEC-07**: el reporte compara con las metas iniciales de `metas-iniciales.yaml` (fidelidad ≥ 0,90, precisión
  de citas ≥ 0,90) y marca «fuera de meta» sin bloquear; M-10.1 = 100 % y M-10.2 = 0 son invariantes, no metas.
- **Configuraciones**: `eval/configs/s5.yaml` (`proveedor: local`, para la corrida nocturna del día 2) y
  `eval/configs/opciones-fake.yaml` (adapters falsos, FX-T5a-a + FX-10c-a, para la CI y AC-6). Ni `test-fake.yaml` ni
  `data/evaluation/baseline.json` cambian; `--suite all` no incluye la familia.
- **DoD (US-074)**: `eval-required` corre también `--suite opciones` con la configuración falsa cuando el diff toca un
  disparador de la IA; un bloqueo rompe el job.
- **Medición real**: en la corrida nocturna única del cierre del día 2 (`S5-refinamiento.md` §5), junto con
  `l1d-119-corpus-ampliado-calibracion` y `l1d-305-rn23-voz-propia-nivel-b`; reporte en `reports/eval/l1d-246-*`.
- Sin cambio de contrato HTTP, de esquema ni de Milvus.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `ai-evaluation` (ADDED: familia `opciones` con verdad conocida; invariantes de opciones con bloqueo; opción no comparable
  al final; retroceso de fidelidad y precisión de citas con tolerancia en configuración; rótulo validado/no validado en la
  familia; reproducibilidad; metas iniciales sin DEC-07; la familia en `eval-required`). Los requisitos existentes del
  runner (solo sintéticos, solo agregados, proveedores locales por lista cerrada) se aplican a la familia como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/app/evaluation/` (familia, métricas, configuración), `apps/rag-orchestrator/eval/configs/`
  (`s5.yaml`, `opciones-fake.yaml`), `data/evaluation/opciones/`, `scripts/ci/eval-required.mjs` (invocación de la familia) y
  tests Pytest/Vitest.
- **clinical-platform**: no se toca. **frontend**: no se toca.

## Dependencias

- ↪ Archivados, se reutilizan sin rehacer: `l1d-235-suite-evaluate` (US-072, runner y reporte), `l1d-237-eval-required-ci`
  (US-074, DoD), `l1d-130-herencia-aplicabilidad-recorte` (US-125, comparador `applicability_order` y agregación por
  opción), `l1d-144-hasta-3-opciones-orden-aplicabilidad` (US-134, hasta 3 opciones y `maxOptions`), `l1d-193-terminos-prohibidos-rn23`
  (US-068, lista de términos), `l1d-298-evaluate-modelos-locales` (US-233a, `proveedor: local`), `l1d-244-eval-aplicabilidad-metadatos`
  (patrón de familia con configuración y reporte propios).
- ↪ `arr-11-ci-rapida` (ARR-11, O1): reorganiza el job `eval-required`; esta historia añade su invocación **después** para no
  chocar en `scripts/ci/eval-required.mjs` ni en el workflow.
- 🔗 `l1d-305-rn23-voz-propia-nivel-b` (US-249): si amplía la lista de nivel B, M-10.2 la usa tal cual (no se duplica la lista);
  comparte la corrida nocturna del día 2.
- 🔗 `l1d-119-corpus-ampliado-calibracion` (US-120): comparte la corrida nocturna (una sola carga de modelos); si fija
  `NLI_ENTAILMENT_THRESHOLD`/`RETRIEVAL_TOP_K` antes de la medición, `s5.yaml` usa esos valores. No se crea `s5-calibracion.yaml`
  aquí ni se toca.
- ⛔ ADR-39 (decidido en fase B): LLM y NLI reales solo para la medición nocturna; los AC corren con adapters falsos.
- ⛔ DEC-07 → **S6**: no bloquea; escenario más probable = metas iniciales de `CLAUDE.md`.
- US-136 (conflictos entre documentos) está en Post-MVP y **no** es dependencia.

## Fuera de alcance

- p95 del análisis con hasta 3 opciones (M-06.2, US-141, `si-hay-capacidad`; se integra en US-142 AC-7).
- Recalibración de metas y tolerancias: DEC-07 (S6).
- Discrepancias sembradas (M-07.1) y búsqueda complementaria (M-08.5): FEAT-07 y FEAT-08c.
- Verificación de G-Demo: US-142 (consume este reporte).

## Impact

- Código nuevo solo en `apps/rag-orchestrator/app/evaluation/`, sus configuraciones y el dataset; sin dependencias nuevas.
- CI: `eval-required` ejecuta una familia más (adapters falsos, segundos); un bloqueo rompe el job.
- Toca la configuración de la evaluación: el PR dispara `eval-required` y adjunta `run-ai-eval`.
