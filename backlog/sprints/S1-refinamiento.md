# S1 · Refinamiento: DoR, decisiones, stack y diseño

> `/sprint-refine S1` · 2026-10-13 · Milestone **Sprint 1** del proyecto OncoLens-1 · Fuente: `backlog/features/` (Linear es el espejo).
> **Demo del S1:** login → análisis *dense* con una opción citada sobre el paciente semilla, por ruta directa. `ai-eval-runner` la evalúa a mano; la suite automatizada llega en el S2 (`[Pre-S1 resp. 9]`).
> Respuestas citables como `[S1 resp. n]`.

## 1. Definition of Ready

Alcance: 22 historias (96 pts) cruzadas entre Linear y el Markdown, sin diferencias. Tras las divisiones aprobadas (resp. 6) son **24 historias y 96 pts**.

**Fallos encontrados antes de refinar:**

| L1D | US | Criterio que fallaba | Qué faltaba | Resuelto |
|---|---|---|---|---|
| L1D-102 | US-012 · ADR-39 | Tamaño (8 pts), Decisiones, Refinamiento | Partirla; fijar hipótesis y candidatos; dataset de medición (US-072 está en el S2) | resp. 5, 6, 10: fase A (5) + **US-224** fase B (3); mini-dataset en AC-9 |
| L1D-106 | US-055 | Tamaño (8 pts), Dependencias (⛔ ADR-39) | Partirla | resp. 6: recuperación (5) + **US-225** generación (3); ⛔ apunta a la fase A |
| L1D-168 | US-038 | Dependencias (⛔ DEC-05, validación clínica pendiente) | Validación del Oncólogo asesor A; AC-3 al día con `diagnosis_grading` | resp. 1 |
| L1D-169 | US-039 | Dependencias (⛔ DEC-05, ⛔ DEC-04 con el *workaround* Q-07) | AC-4 al día con DEC-04 (Q-07 sin efecto) | resp. 1 y DEC-04 (2026-10-09) |
| L1D-238 | US-075 | Dependencias (⛔ DEC-02), Independiente (agenda, SUP-4) | Agenda de los oncólogos en el S1 | resp. 2 |
| L1D-203 | US-049 | Dependencias (⛔ ADR-40, escenario sin aceptar) | Aceptar la opción A de ADR-40 | resp. 3 |
| L1D-140 | US-061 | Decisiones (`Pendiente de definir`: traducción de citas) | Decisión de alcance | resp. 8 |
| L1D-140, L1D-197 | US-061, US-211 | Diseño (rutas en inglés frente al diseño aprobado en español) | Alinear | resp. 4 |
| L1D-194 | US-069 | AC verificable (el literal del AC-1 contradice el contrato) | Decidir el literal | resp. 9 |
| 13 historias | US-012, US-035, US-036, US-049, US-054, US-055, US-058, US-059, US-064, US-068, US-069, US-075, US-215 | Refinamiento (supuestos "(asumido)" sin aceptar) | Aceptación escrita | resp. 3 |
| L1D-164 | US-034 | Decisiones (pendiente de planning en CLAUDE.md: dónde vive `LLM_PROVIDER=fake`) | Ubicarlo | resp. 7 (AC-6 nuevo) |

**Estado final (todas ✓):**

| L1D | US | Pts | AC | Sin refinar | AC verificables | Dependencias | Decisiones | Tamaño | Diseño |
|---|---|---|---|---|---|---|---|---|---|
| L1D-102 | US-012 · ADR-39 fase A | 5 | 6 | ✓ | ✓ (sobre el ADR, el dataset y la configuración) | ✓ | ✓ | ✓ | n/a |
| L1D-274 | US-224 · ADR-39 fase B | 3 | 6 | ✓ | ✓ | ✓ ↪ US-012, US-225 | ✓ | ✓ | n/a |
| L1D-103 | US-052 | 5 | 6 | ✓ | ✓ integración | ✓ (*workaround* de US-041 escrito) | ✓ | ✓ | n/a |
| L1D-104 | US-053 | 5 | 6 | ✓ | ✓ integración | ✓ (*workaround* de US-066 escrito) | ✓ | ✓ | n/a |
| L1D-105 | US-054 | 3 | 5 | ✓ | ✓ integración | ✓ | ✓ | ✓ | n/a |
| L1D-106 | US-055 | 5 | 5 | ✓ | ✓ Pytest + Milvus de test | ✓ (falsos hasta la fase A) | ✓ | ✓ | n/a |
| L1D-275 | US-225 | 3 | 3 | ✓ | ✓ Pytest | ✓ (falsos hasta la fase B) | ✓ | ✓ | n/a |
| L1D-114 | US-058 | 5 | 5 | ✓ | ✓ | ✓ (dimensión desde la fase A; US-040 con *workaround*) | ✓ | ✓ | n/a |
| L1D-115 | US-059 | 5 | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-139 | US-060 | 3 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `docs/ux/S1/` |
| L1D-140 | US-061 | 5 | 6 | ✓ | ✓ Testing Library + Playwright | ✓ (ruta directa; US-051 en el S2) | ✓ | ✓ | ✓ `docs/ux/S1/` |
| L1D-164 | US-034 | 5 | 6 | ✓ | ✓ humo + estáticos | ✓ | ✓ | ✓ | n/a |
| L1D-165 | US-035 | 3 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-166 | US-036 | 5 | 7 | ✓ | ✓ fixtures de PR | ✓ | ✓ | ✓ | n/a |
| L1D-265 | US-215 | 2 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-168 | US-038 | 5 | 7 | ✓ | ✓ integración con BD real | ✓ | ✓ | ✓ | n/a |
| L1D-169 | US-039 | 3 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| L1D-179 | US-063 | 5 | 6 | ✓ | ✓ Pytest | ✓ | ✓ | ✓ | n/a |
| L1D-180 | US-064 | 5 | 8 | ✓ | ✓ Pytest (NLI falso) | ✓ | ✓ | ✓ (8 AC, en el límite) | n/a |
| L1D-193 | US-068 | 3 | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `docs/ux/S1/` |
| L1D-194 | US-069 | 2 | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `docs/ux/S1/` |
| L1D-197 | US-211 | 3 | 6 | ✓ | ✓ integración + Playwright | ✓ | ✓ | ✓ | ✓ `docs/ux/S1/` |
| L1D-203 | US-049 | 5 | 7 | ✓ | ✓ (identidad falsa en el test hasta US-046) | ✓ | ✓ | ✓ | n/a |
| L1D-238 | US-075 | 3 | 5 | ✓ | ✓ cálculo reproducible | ✓ | ✓ | ✓ | n/a |

**Sin excepciones de tamaño.** Las dependencias hacia sprints posteriores (US-041, US-040, US-046, US-051, US-066, US-062) tienen su *workaround* escrito en la historia desde el slicing v2.

## 2. Decisiones y ADRs del sprint

| Decisión | Tipo | Registro |
|---|---|---|
| ADR-39: hipótesis A, con B y C como respaldos medidos | ADR, caro de revertir (los *embeddings* fuerzan reindexar): 3 propuestas | US-012 y US-224 (FEAT-06a); `backlog/02-adrs.md`. El documento `docs/architecture/adr/ADR-39-modelos-locales.md` (MADR) lo escribe la ejecución, con las cifras |
| DEC-05: validación clínica hecha | DEC | `docs/decisions/DEC-05-tnm-isup.md`; US-038 y US-039 |
| ADR-40: escenario más probable (opción A) en el S1 | ADR del S2 | US-049 |
| Aviso de IA con el literal de B-06 | Barato de revertir: una recomendación | US-069 (supera C-14) |
| Traducción de citas fuera del MVP | Alcance | US-061 y FEAT-10a, `## Conflictos de fuentes` |

### ADR-39 · las 3 propuestas presentadas

Insumo: investigación externa del 2026-10-13. Fuentes: model cards y licencias de Hugging Face, ai.google.dev (Gemma 4), las *releases* de Ollama y PyPI. **Sin latencias medidas en CPU**; la única cifra medida es la del LLM, en §4.

| Combinación | LLM | *Embeddings* | *Reranker* | NLI | OCR | Memoria estimada | p95 ≤ 15 s |
|---|---|---|---|---|---|---|---|
| **A · elegida** | Gemma 4 26B A4B (MoE) | BGE-M3 · 1024 · sparse propio | bge-reranker-v2-m3 | mDeBERTa-2mil7 | OCRmyPDF + Tesseract `spa` | ~22–23 GB | El único estimado dentro |
| B | Gemma 4 12B | Qwen3-Embedding-0.6B (MRL a 1024) | Qwen3-Reranker-0.6B | mDeBERTa | PaddleOCR | ~14–15 GB | Riesgo: un denso de 12B tarda ~23–27 s para 800 tokens |
| C | Qwen3.5-9B sin *thinking* | multilingual-e5-large-instruct | gte-multilingual-reranker | mDeBERTa | docTR | ~13 GB | Al límite (~18 s) |

- **Por qué A:** es la única que entra en el p95 según la estimación (MoE con ~4B activos), y BGE-M3 es el *embedding* más estable y el que trae sparse propio, que es lo caro de reindexar.
- **B se descarta como hipótesis principal:** cumpliría el p95 solo recortando la salida o con decodificación especulativa.
- **C se descarta como hipótesis principal:** tiene la peor calidad multilingüe esperada y no aporta sparse.
- **Descartados por licencia:** jina v3/v4 y jina-reranker (NC o licencia de investigación), HHEM-2.3 (propietario) y Surya (GPL + OpenRAIL-M con umbral comercial).
- **Datos de la investigación que resultaron falsos:**
  - vllm-metal no está en Homebrew; en PyPI está la 0.1.0, no la 0.28.
  - `gemma4:26b-mlx` pesa 18 GB, no ~16.

## 3. Respuestas del humano

| # | Pregunta | Respuesta | Dónde queda |
|---|---|---|---|
| 1 | Validación clínica de DEC-05 antes de US-038 | **Ya está validada** | DEC-05, US-038, US-039 |
| 2 | ¿Hay agenda con los oncólogos para US-075 en el S1? | **Sí**: se mantiene en el S1 | US-075 |
| 3 | ~16 supuestos "(asumido)" de los AC del S1 | **Aceptados en bloque**, incluido el escenario A de ADR-40 en US-049. El de 7–8B se trata en la resp. 5 | 13 historias |
| 4 | Rutas y campo del login | **Español del diseño**: `/login` y `/pacientes/[id]/analisis`; campo "Correo electrónico" | US-211, US-061, `docs/ux/flujo-e2e.md` |
| 5 | Hipótesis de ADR-39 | **A**: el supuesto "solo 7–8B" se reemplaza por "hasta 26B MoE o 12B denso dentro de 24 GB" | US-012, US-224, `02-adrs.md` |
| 6 | Partir US-012 y US-055 (P-5) | **Aprobado**: US-012 (5) + US-224 (3), US-055 (5) + US-225 (3). Mismos 96 pts | FEAT-06a, README, `## Conflictos de fuentes` |
| 7 | ¿Dónde vive `LLM_PROVIDER=fake`? | **US-034**, como AC-6 nuevo; lo usan la CI (US-036) y los E2E | US-034, CLAUDE.md |
| 8 | Traducción opcional de las citas (V-10) | **Fuera del MVP comprometido** (Post-MVP, sin historia) | US-061, FEAT-10a |
| 9 | Literal del aviso de IA (dos puntos frente a raya) | **Dos puntos (PRD B-06)**, y `disclaimer` solo con esa frase. El change de US-069 corrige la descripción del `openapi.yaml` y los ejemplos vía `sync-contracts` (cambio compatible) | US-069, `docs/ux/flujo-e2e.md`, `docs/ux/S1/` |
| 10 | Memoria del LLM (instrucción del usuario: "approx 16 GB") | **`gemma4:26b-a4b-it-qat`** en lugar de `gemma4:26b-mlx` (18 GB); `num_ctx = 8192` | US-224, `02-adrs.md` |

> **Nota (usuario, 2026-10-20):** las resp. 5 (límite de 24 GB) y 10 (~16 GB para el LLM) quedan superadas por el tope de 21 GB para el LLM y ~30 GB para el stack; ver `S1-plan.md` §9, decisión 40. Este registro conserva lo decidido el 2026-10-13.

## 4. Slicing

**Cambio aprobado** (resp. 6): dos divisiones por superficie, sin cambio de puntos ni de demo.

| Antes | Después | Puntos |
|---|---|---|
| US-012 · ADR-39 (8) | US-012 · ADR-39 fase A (5, inicio del sprint) + **US-224** · ADR-39 fase B (3, cierre del sprint) | 8 → 5 + 3 |
| US-055 (8) | US-055, recuperación (5) + **US-225**, generación y recorte (3) | 8 → 5 + 3 |

- **Totales:** el S1 sigue en **96**, el MVP en **525** y el backlog en **815**; las historias pasan de 224 a 226.
- **Referencias:** las que apuntaban a US-055 AC-1, AC-7 y AC-8 ahora apuntan a US-225, con la nota "ex US-055" (README, FEAT-08b, FEAT-10c).
- **Camino crítico:** no se mueve ninguna historia del de G-Piloto, y ninguna dueña de RN-01, RN-06, RN-10…RN-14 o RN-23 sale del S1.
- **Capacidad:** 96 pts frente a la capacidad supuesta de 80–90 (DEC-03), un exceso ya aceptado en el Pre-S1. Si la velocidad real resulta menor, rige la contingencia preaprobada de DEC-03 (AC-2).

**Publicado en Linear** (confirmado por el usuario, 2026-10-13):
- US-224 = **L1D-274** y US-225 = **L1D-275**, sub-issues de L1D-16 en el milestone Sprint 1 (3 pts cada una), bloqueadas por L1D-102 y L1D-106;
- L1D-102 y L1D-106 re-estimadas de 8 a 5 y L1D-102 retitulada. Su descripción conserva el texto original con una nota de la partida al principio; la fuente vigente es el Markdown;
- etiqueta `needs-refinement` retirada de las 10 historias del S1 que la tenían. Las descripciones de Linear de las historias editadas aquí (US-034, US-038, US-039, US-049, US-061, US-069, US-075, US-211) siguen con el texto previo: el espejo se resincroniza en `/sprint-start`.

## 5. Stack

**En la máquina** (Apple M5 Pro con 48 GB, macOS 27.0.1):

| Ítem | Estado |
|---|---|
| Docker 29.8 + Compose v5.5, Node 26.7 / npm 12, Python 3.13 + uv 0.12.5, gh, openspec 1.14.1, oasdiff 1.33 | Listo |
| Ollama 0.34.4 (Ollama.app) | Listo para el S1. Actualizarlo a ≥ 0.40 es opcional: lo hace el usuario desde el menú de la app. La hipótesis A usa GGUF y no depende de MLX |
| `gemma4:26b-a4b-it-qat` | **Descargado.** Medido con `num_ctx=8192`: **15 GB residentes, 100 % GPU, ~79 tok/s** (~10 s para 800 tokens) y JSON con esquema correcto en una prueba |
| `qwen3.5:9b-mlx` (respaldo C) | **Descargado** (8,9 GB) |
| `gemma4:12b-mlx` (respaldo B), `bge-m3`, `qwen3-embedding:8b` | Ya estaban |
| vllm-metal 0.1.0 en `~/.venvs/vllm-metal` | Instalado, pero **sin el paquete `vllm`**, que el plugin necesita y no trae como dependencia. Queda pendiente de US-224 AC-1: instalar `vllm` según el README de vllm-metal o descartar el runtime con ese motivo |
| `tesseract`, `gitleaks`, `psql` | No hacen falta en el host: OCR va en el contenedor de `rag-orchestrator`, gitleaks en la CI (US-036) y PostgreSQL en Compose |

**En el repo** (tareas dentro de su change, no se instala aquí):

| Dependencia | Historia |
|---|---|
| `workspaces` en `package.json` raíz, Compose, Milvus, perfil `LLM_PROVIDER=fake` | US-034 (la primera historia que crea `apps/*`) |
| `vitest.config.ts` raíz con `exclude: ['.claude/**', '**/node_modules/**']`, versiones fijas en `.mcp.json` y test contra listas literales (P-6, P-8) | US-036 (ya asignadas en el cierre del Pre-S1) |
| ESLint, Prettier, Ruff | US-215 |
| Modelos de Hugging Face para CPU (BGE-M3, *reranker*, mDeBERTa) en int8/ONNX; Tesseract `spa` y OCRmyPDF en el Dockerfile | US-012 y US-224 |
| Alembic y pymilvus | US-058 |

**Mejoras del stack:** ninguna fuera de ADR-39.

## 6. Diseño

| Pantalla | Diseño | Variantes |
|---|---|---|
| S1-01 Inicio de sesión (US-211) | [`docs/ux/S1/pantallas-s1.md`](../../docs/ux/S1/pantallas-s1.md) | Una: extiende la pantalla 01 del Pre-S1 |
| S1-08/09 Análisis por ruta directa, una opción (US-060, US-061, US-068, US-069) | ídem | Una: es la variante S1–S4 de la pantalla 09, ya resuelta en el Pre-S1 |

- **Revisiones**, todas aplicadas antes de pedir la elección:
  - `clinical-language-auditor`, modo Diseño: FAIL sin bloqueantes, con 2 Mayores y 5 Menores.
  - Accesibilidad WCAG 2.1 AA: FAIL sin críticos, con 4 Mayores y 4 Menores.
  - Contrato: ningún dato falta.
- **Excepciones**, que respetan literales de los AC:
  - el rótulo "Relevancia de la evidencia" (US-061 AC-2);
  - la sección "Descartadas por falta de soporte — solo para revisión" (US-061 AC-4).
- **Otros archivos tocados:**
  - [`docs/ux/sistema-de-diseno.md`](../../docs/ux/sistema-de-diseno.md): anillo de foco blanco sobre navy (el primario daba 2,16:1);
  - [`docs/ux/flujo-e2e.md`](../../docs/ux/flujo-e2e.md): campo "Correo electrónico" y literal del aviso.
- **Hallazgo del contrato:** no existe `GET /platform/evidence-analyses/{id}`, así que en el S1 el resultado se muestra en la misma página tras el POST, y `/pacientes/[id]/analisis/[analysisId]` llega con el historial.

## 7. Cierre

Linear publicado (§4). Rama `sprint/S1-refinement` desde `origin/main`, commit `[S1] Refinamiento: DoR, decisiones y diseño`, push y PR. **El humano lo mergea**; después, `/sprint-start S1`.
