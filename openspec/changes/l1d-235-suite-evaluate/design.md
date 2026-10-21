# Design — l1d-235-suite-evaluate

## Context

Base: `app/evaluation/` (`retrieval_metrics.py` con recall@10, MRR e IC *bootstrap*, `reporte.py`,
`dataset_loader.py`), tests en `tests/evaluation/`, datasets `data/eval/adr39-mini/`,
`data/eval/ol06-particion-v1/` (ADR-45), `scripts/ci/dataset-class-check.mjs` en la CI. Framework
según ADR-41 (encuadre decidido, P-3, `[S2 resp. 3]`): propio con Pytest, NLI principal, juez G secundario. Partición en dos
PR decidida (P-1, `[S2 resp. 1]`): **072a** (5) y **072b** (3).

## Goals / Non-Goals

**Goals:** runner reproducible, métricas de recuperación, citas, "sin evidencia", privacidad,
fidelidad, prescriptivas e inyección; reporte de agregados; `baseline.json`.
**Non-Goals:** calibración (US-073), job de CI (US-074), datasets de FEAT-T5b.

## Decisions

- **D1 · Un runner, familias por `--suite`** (`retrieval`, `generation`, `pii`, `all`, como en
  `run-ai-eval`). `npm run evaluate` (raíz) llama al módulo Python; `--report json` escribe además
  el JSON que lee `ai-eval-runner`. Alternativa descartada: dos runners (Node y Python) → dos
  formatos de reporte.
- **D2 · Reutilizar, no duplicar:** recall/MRR desde `retrieval_metrics.py`; la validación de citas
  y el NLI desde el dominio de `rag-orchestrator` (las mismas reglas que RN-01/RN-04, no una copia);
  la lista de RN-23 desde `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`.
- **D3 · Puertos:** `FuenteDataset` (valida `clase: sintetico`), `JuezFidelidad` (adapters NLI y
  LLM local), `ProveedorPii` (lee el JSON de `eval:pii`), `EscritorReporte`. Reloj y semilla
  inyectados.
- **D4 · Guarda de proveedores locales (RN-12):** `es_proveedor_local(url)` compara el host contra una
  **lista local cerrada en código** (`HOSTS_LOCALES`: loopback `127.0.0.0/8`, `::1`, `localhost` y
  `host.docker.internal`), **no configurable** (ni variable de entorno ni YAML pueden ampliarla), antes
  de crear cualquier cliente (falla cerrada; URL sin host o no parseable → no local). Se aplica al juez
  (`EVAL_JUDGE_BASE_URL`) y a **todos** los adapters con URL (LLM, embeddings, reranker, NLI, OCR). Si la
  clase del dataset cargado **no es `sintetico`** (calibración local con `real_anonimizado`), todos los
  adapters deben ser locales o la suite **aborta** con código ≠ 0 antes de enviar ningún request; con
  `sintetico` la regla del juez sigue rigiendo igual (D4 de ADR-41).
- **D4b · Métrica de prescriptivas (RN-23):** usa el verificador de `rag-orchestrator`
  (`VerificadorDeTerminosProhibidos`, la misma lista que `packages/clinical-language`) sobre los campos
  de `CAMPOS_GENERADOS` (`app.domain.support`) y nunca sobre los copiados del corpus, con **niveles A+B**
  y `permitirFrases: false` (más estricto que el filtro de producción, que usa solo A). Se mide en dos
  puntos: (1) la **propuesta cruda del generador** antes del filtro de soporte/lenguaje (cuántas
  salidas del LLM traían términos prohibidos) y (2) la **salida mostrada** tras el filtro, cuya meta es
  `= 0`. El reporte trae ambas cifras, sin textos.
- **D5 · `baseline.json`:** lo escribe 072a con la configuración de CI (FX-T5a-a) para que US-074
  compare; el baseline con modelos reales lo registra US-073.

## Decisiones de implementación 072a

- **D6 · Una ruta por función.** Los **datasets de entrada** viven en `data/eval/` (donde ya están `adr39-mini`,
  `ocr-mini` y `ol06-particion-v1`, citados por ADR-39 y ADR-45); el FX-T5a-a es `data/eval/fx-t5a-a/`. En
  `data/evaluation/` solo quedan las **salidas versionadas** (`baseline.json`) y el histórico `vm-baseline/`.
  Respuesta a la pregunta abierta 1 de ADR-41: no se mueve ningún dataset. **Pendiente fuera de este change:** la
  skill `run-ai-eval` y OL-06 dicen «datasets de `data/evaluation/`»; deben decir `data/eval/`.
- **D7 · Configuración y resultados.** Las configuraciones viven donde ya están las de ADR-39:
  `apps/rag-orchestrator/eval/configs/` (la CI usa `test-fake.yaml`); el resultado va a
  `apps/rag-orchestrator/eval/results/<fecha>-<hashConfig>.json` (`--salida` lo cambia). `hashConfig` es el SHA-256
  del YAML cargado, serializado de forma canónica; la `<fecha>` sale del reloj inyectado, nunca de las métricas.
- **D8 · Adaptadores falsos como código de `app/evaluation/`.** `adaptadores_falsos.py` implementa los puertos de
  `app/application/ports.py` (mismo contrato que los reales: un puntaje por candidato y en [0, 1], `null` ≠ `0.0`) y
  se compone con `adaptadores.proveedor: fake`. Con `proveedor: local` el runner solo valida las URL con
  `es_proveedor_local()`; los adapters reales con URL se cablean en US-073 (calibración).
- **D9 · Reloj de medición.** `medicion.reloj: simulado` (1 ms por lectura) hace reproducible también el p95 por
  etapa en la CI; `real` usa `time.perf_counter` y su p95 **no** es una métrica determinista (AC-2).
- **D10 · Esquema cerrado del reporte.** `escribir_reporte_cerrado` valida contra `ESQUEMA_SUITE` (lista blanca
  de claves; hojas numéricas, booleanas, de cadenas enumeradas o identificadores sin espacios bajo
  `configuracion`). `escribir_reporte` (ADR-39) no cambia. Cada familia de métricas se calcula sobre la muestra
  completa y sobre la revisada por el oncólogo; el rótulo lo decide `rotular_validada()`.
- **D11 · Familias.** `--suite retrieval|generation|all`; `pii` y las demás familias de `run-ai-eval` terminan con
  código 2 («familia no disponible») hasta su bloque. `--prueba-final` es obligatoria si `dataset.subconjunto` es
  `prueba` (ADR-45 P3); el registro de accesos y la huella previa de P3 no se implementan en 072a.
- **D12 · Envoltorio y baseline.** `scripts/eval/evaluate.mjs` (`npm run evaluate`) llama a Python dentro de
  `apps/rag-orchestrator`, resuelve `--config` y `--salida` contra el directorio de quien lo invoca y usa la
  configuración de la CI si no hay `--config`; variables `EVAL_PYTHON` y `EVAL_TIMEOUT_S`. **Paso previo:** `EVAL_PYTHON`
  debe apuntar a un Python con `pip install -r apps/rag-orchestrator/requirements.txt -r requirements-dev.txt` (sin
  eso, `python3` del sistema no tiene las dependencias).
  `data/evaluation/baseline.json` es la salida de `test-fake.yaml`; un test falla si deja de coincidir byte a byte.
- **D13 · Guardas RN-12 y red.** `exigir_adapters_locales(clase, urls)` corre antes de cargar preguntas; un dataset
  del repo solo puede ser `sintetico`, uno fuera del repo puede ser `real_anonimizado` solo con adapters locales. Un
  fixture autouse de `tests/evaluation/` bloquea `connect`, `connect_ex` y `getaddrinfo` fuera de loopback y falla el
  test que lo intente.

## Adiciones aceptadas por el orquestador del sprint (sprint-S2) y deuda

Aceptadas para 072a: (1) datasets en `data/eval/` y salidas en `data/evaluation/` (D6); (2) configs en
`apps/rag-orchestrator/eval/configs/` y resultados en `eval/results/` (D7); (3) `adaptadores_falsos.py` con el contrato
de los adapters reales (D8); (4) `medicion.reloj: simulado` (D9); (5) `--suite` con `retrieval|generation|all` y código
2 para las demás familias (D11); (6) flags `--config`, `--salida`, `--nombre-archivo`, `--prueba-final` (D11, D12).

**Gate 2 (design-principles-reviewer, Mayores 1 y 2):** `HOSTS_LOCALES` es la única lista de hosts locales
(`Settings.llm_allowed_hosts` la toma como valor por defecto), las fuentes excluidas salen de
`PISO_DE_FUENTES_EXCLUIDAS` y los vocabularios cerrados del esquema (suites, proveedores, relojes, clases, rótulos) se
derivan de sus fuentes. El resultado de una familia parcial se llama `<fecha>-<hashConfig>-<suite>.json` para no pisar
el de `all`.

**Deuda:** actualizar `run-ai-eval` y OL-06 a `data/eval/` y a la ruta de resultados vigente
(`apps/rag-orchestrator/eval/results/`, no `reports/eval/`). `.claude/skills/run-ai-eval/SKILL.md` y OL-06 (`readme.md` §6) apuntan a `data/evaluation/` para los datasets
y deben apuntar a `data/eval/`; `.gitignore` debe ignorar `apps/rag-orchestrator/eval/results/` (fuera de las rutas de
este change). Con `proveedor: local` la composición de adapters reales queda para US-073.

## Privacidad y ownership

Solo sintéticos; los reales anonimizados se pasan por ruta local y nunca a la CI (RN-13, RN-14).
El runner corre en `rag-orchestrator` sin acceso a datos clínicos; la sensibilidad de PII se
calcula en `clinical-api` y solo su JSON de agregados cruza (sin valores). Juez y NLI locales
(RN-12). Logs sin textos.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`: el runner usa el servicio en proceso.

## Evaluación

Métricas OL-06 afectadas: recall@10 (≥ 0,80; es→en ≥ 0,70, provisionales hasta US-229), MRR
(≥ 0,60), fidelidad (≥ 0,90), precisión de citas (≥ 0,90), "sin evidencia" (≥ 0,90), PII (≥ 0,95),
prescriptivas = 0. Este change no las cambia: las mide.

## Dependencias y colaboradores

- **Crea:** `app/evaluation/evaluate.py` (CLI), `app/evaluation/metricas/` (citas, sin evidencia,
  fidelidad, privacidad, inyección), `eval/configs/test-fake.yaml`, `data/evaluation/baseline.json`.
- **Modifica:** `reporte.py` (rótulo validada), `package.json` raíz (`evaluate`).
- Reglas extraídas: `es_proveedor_local()` y `HOSTS_LOCALES` (RN-12), `rotular_validada()` (AC-T5.3),
  `es_inyeccion_efectiva()` (SEG-13).

## Risks / Trade-offs

- 072b depende de ADR-41 y ADR-40 → 072a no depende de ninguno y abre la DoD antes. `es_proveedor_local()`
  y el test sin red (ADR-41 D6) van en **072a**: la guarda RN-12 existe desde la primera corrida.
- Metas de recuperación por debajo (0,71) → hecho conocido, no bloquea (nota ADR-45).

## Open Questions

- P-1 (partición 072a/072b) y P-3 (juez) decididos (`[S2 resp. 1]`, `[S2 resp. 3]`).
