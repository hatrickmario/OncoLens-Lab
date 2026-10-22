# Design — l1d-232-adr41-framework-evaluacion

## Context

Base existente: `apps/rag-orchestrator/app/evaluation/` (`retrieval_metrics.py`, `reporte.py`,
`dataset_loader.py`, `model_selection.py`), tests en `apps/rag-orchestrator/tests/evaluation/`,
datasets `data/eval/adr39-mini/`, `data/eval/ocr-mini/` y partición `data/eval/ol06-particion-v1/`
(ADR-45, P2–P3: la prueba se toca una vez con `--prueba-final`). LLM G aceptado en ADR-39 fase B.

> **Encuadre decidido por el usuario el 2026-10-21 (P-3, `[S2 resp. 3]`).**

## Goals / Non-Goals

**Goals:** decidir framework, juez y protocolo; tabla de métricas; reproducibilidad; RN-12 por
construcción; formato del reporte; cómo entra en la DoD.

**Non-Goals:** implementar el *runner* (US-072); metas (DEC-07).

## Decisions

### D1 · Framework (caro de revertir: toda la DoD de IA)

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **A · Propio con Pytest** (+ NLI mDeBERTa + juez local G por Ollama `/v1`) | Base ya escrita; sin red ni telemetría; las métricas propias (citas, "sin evidencia", prescriptivas = 0, PII) hay que escribirlas igual | Más código propio | **Elegida** |
| B · ragas 0.4.3 fijado, solo fidelidad | Métricas conocidas | Telemetría por defecto (`RAGAS_DO_NOT_TRACK`), juez OpenAI por defecto (RN-12), langchain, sin release desde 2026-01 | Descartada |
| C · DeepEval 4.3.1 | Integración con Pytest | Telemetría PostHog/OTel, juez OpenAI por defecto, *churn* semanal | Descartada |

### D2 · Juez de fidelidad (AC-3)

Principal: NLI mDeBERTa (determinista, el mismo de RN-01) por afirmación. Secundario: juez LLM G
local, `EVAL_JUDGE_TEMPERATURE=0`, `EVAL_JUDGE_SEED`, `EVAL_JUDGE_MODEL`, `EVAL_JUDGE_BASE_URL`;
sesgo declarado (mismo modelo que genera) → su cifra se reporta aparte y nunca decide un umbral
sola. Un juez con URL fuera de la lista local → error antes de enviar nada.

**Lista local cerrada en código:** `es_proveedor_local()` decide con `HOSTS_LOCALES` definida en código
(loopback `127.0.0.0/8`, `::1`, `localhost`, `host.docker.internal`), **no configurable**: ninguna
variable ni YAML la amplía. Rige para el juez y para todo adapter con URL (LLM, embeddings, reranker,
NLI, OCR). Si la clase del dataset no es `sintetico`, todos los adapters deben ser locales o la suite
aborta con código ≠ 0 sin enviar ningún request.

### D3 · Tabla de métricas (AC-1)

Determinista: recall@10 (total, es→en), MRR, precisión de citas, exactitud "sin evidencia",
prescriptivas (verificador de RN-23 sobre los campos de `CAMPOS_GENERADOS`, nunca los copiados del
corpus; niveles A+B; `permitirFrases: false`; medida en la propuesta cruda del generador antes del
filtro y en la salida mostrada, meta = 0 en la mostrada), inyección efectiva, PII (sensibilidad), OCR crítico, eventos, mapeo, faltantes,
discrepancias, aplicabilidad (estados), metadatos del corpus, p95 por etapa. Con NLI: fidelidad y %
de opciones con soporte. Con juez LLM (secundario): fidelidad por afirmación. Agente: iteraciones y
sub-consultas deterministas; calidad con NLI.

### D4 · Reproducibilidad (AC-2)

Misma configuración → métricas deterministas idénticas (huella SHA-256 de la configuración en el
nombre del resultado); IC *bootstrap* con semilla en configuración; ninguna métrica depende del
reloj.

### D5 · Reporte y DoD (AC-4, AC-5)

JSON de agregados + configuración + conteo validadas / no validadas por métrica; sin textos de
preguntas ni salidas. En la CI corre la configuración de prueba (FX-T5a-a, adapters falsos) y el
comparador de regresión; el reporte con modelos reales se genera en la máquina de referencia con
`npm run evaluate` y se adjunta al PR (comentario + artefacto en `reports/eval/`). Disparadores:
modelo, prompt, umbral, **catálogo** y corpus (C-10).

### D6 · Sin red en la CI (RN-12)

Test de Pytest que bloquea sockets salientes (salvo loopback) durante la suite y falla si se
intenta una conexión. Entra con el primer bloque del *runner* (**US-072a**), junto con
`es_proveedor_local()`, no con 072b.

## Criterios de verificación por AC

| AC | Se verifica en |
|---|---|
| AC-1 | ADR §Métricas: tabla completa D3 |
| AC-2 | ADR §Reproducibilidad: claves de semilla y temperatura; descarte de lo no reproducible |
| AC-3 | ADR §Juez: local + NLI; B y C descartadas por juez de nube por defecto |
| AC-4 | ADR §Reporte: validadas / no validadas, solo agregados y configuración |
| AC-5 | ADR §DoD: adjunto al PR, CI vs. máquina de referencia, catálogo incluido |

## Privacidad y ownership

Solo datasets sintéticos en el repo; la calibración con reales anonimizados corre fuera del repo,
por ruta local, nunca en la CI (RN-13, RN-14). El juez y el NLI son locales (RN-12).
`rag-orchestrator` no toca datos clínicos.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`.

## Evaluación

Define el marco de todas las métricas OL-06; no cambia modelo, prompt, umbral, catálogo ni corpus.

## Dependencias y colaboradores

Solo documento. Fija para US-072 los puertos: `JuezFidelidad` (NLI y LLM como adapters),
`FuenteDataset` (valida `clase: sintetico`), `Reporte`.

## Risks / Trade-offs

- Más código propio → mitigado por la base existente y tests del *runner* con FX-T5a-a.
- Juez = generador (sesgo) → secundario y declarado.

## Migration Plan

Sin migraciones; estado `propuesto` hasta la aprobación.

## Open Questions

- **P-3** (usuario): confirmar A, NLI principal y juez G secundario. **Decidido (usuario, 2026-10-21, `[S2 resp. 3]`).**
