# Design — l1d-333-defaults-expansion-max-pairs

## Context

Ver `proposal.md`, ADR-39 (modelos locales) y ADR-52 (segundo loop contextual). Decisión del usuario del 2026-11-07
(`[S6 resp. 24]`, D6-44): `RERANKER_MAX_PAIRS` 12 -> 20 y expansión activa por defecto.

## Decisions

1. **Indicador:** se cambia la constante `EXPANSION_HABILITADA_INICIAL` (única fuente del valor inicial, usada por `Settings`
   y por `ParametrosDeExpansionContextual`). Los tests que dependían del default apagado fijan `False` explícitamente.
2. **Sigue apagable (AC-6):** `QUERY_CONTEXT_EXPANSION_ENABLED=false` en el entorno -> sin segundo loop ni lectura del léxico.
3. **`RERANKER_MAX_PAIRS` no es un default de `Settings`:** `cargar_config_modelos` exige las claves de ADR-39 del entorno
   y no tiene valor inicial en código (RN-22: viven en configuración). El valor inicial es el de `.env.example` y el del
   bloque `adr39:decision` de ADR-39, que `app.evaluation.chequeo_config` exige iguales entre sí. Por eso el cambio a 20 se
   hace en un único paso humano (H-1) que edita `.env.example` y el bloque del ADR a la vez; este change deja la
   enmienda del ADR en prosa y no toca el bloque (si lo tocara sin H-1, el chequeo de coherencia fallaría).
   Compose pasa `RERANKER_MAX_PAIRS: ${RERANKER_MAX_PAIRS:-}` (sin valor inicial propio) y no necesita cambio; la
   expansión sí lleva `:-false` en Compose. **H-1 es un único paso humano** (`.env.example`, bloque `adr39:decision` y
   Compose en el mismo commit tras la corrida final): aplicar juntos, nunca solo la parte de Compose. Mientras tanto el
   código arranca con la expansión activa y `.env.example`/Compose con `false` (fuentes con valores distintos, declarado
   en ADR-52 y en el docstring del servicio); el test de paridad de Compose y `.env.example` ata ambas partes.
4. **REGLA DE PARADA (AC-3):** si el p95 de consulta completa con 20 pares, medido en la corrida final,
   supera el tope vigente (15 s originalmente; **20 s desde la decisión del usuario del 2026-11-07, techo absoluto de 25 s solo con mejora de calidad medida, CI en 20 s**), el implementador **se detiene y pregunta** al orquestador y al usuario las
   opciones (recalibrar el tope, 20 solo en análisis, o reducir el costo de generación). No decide ni pide el merge de los
   defaults. Sin corrida, el PR se cierra sin merge (AC-7). **Satisfecha:** p95 17,05 s (fase 1, n=69) y 18,3 s (fase 2, n=67) < 20 s; el máximo observado fue 23-25 s (el tope aplica al p95).
5. **Evaluación (AC-2 y AC-4), medidos en la corrida final del 2026-11-07** (`ai-eval-runner`, 20 pares con expansión activa, scripts del scratchpad porque el `evaluate` oficial no cablea la expansión): p95 de consulta completa 17,05 s (fase 1, n=69; base densa de 12 pares 14,71 s) y 18,3 s (fase 2, n=67); recall@10 0,875 -> 0,906, MRR 0,849 -> 0,887, precisión de citas 1,00, 0 violaciones de RN-02, controles intactos (los chunks off y on son idénticos), 47/47 adversarias sin evidencia con `topRelevanceScore` null y 0 llamadas al generador. **Limitaciones:** una sola corrida; sin A/B del mismo día (cambian código, pares y expansión a la vez); sin condición de máquina limpia garantizada; fidelidad NLI 0,822 < 0,90 sin línea base (D6-58); próstata con genéricas con evidencia 9/22 y 13/22 frente a la meta de L1D-331 (D6-57); `chat-local` no ejecutable (D6-59); el `evaluate` oficial no mide la expansión (D6-60). En CI corre `evaluate` con adapters o fake sin regresión.
6. **`clinical_catalog_path=None` con el indicador activo:** `bootstrap._marcos_de_pregunta_montados` y
   `_catalogo_de_terminos_montado` devuelven `None` y el loop contextual es un no-op silencioso. Es el comportamiento
   existente de US-271 (sin catálogo no hay términos que añadir; los tests lo usan); este change no lo cambia. Con
   catálogo montado y sin el léxico, el arranque falla cerrado (`test_arranque_falla_cuando_el_indicador_esta_activo_y_el_catalogo_no_trae_el_lexico`).
7. **Tope de 20 s en los sitios editables:** `eval/configs/metas-iniciales.yaml` (`p95_evidence_analyses_s: 20`, test en `test_barrido_unitarios.py` y `test_barrido_aceptacion.py`), ADR-39, ADR-52, `backlog/01-requisitos.md` (NFR-01, G-5), S6-plan, S6-deuda y la historia US-275. Sin editar por ser históricos o protegidos: `eval/configs/adr39-fase-*.yaml` (reglas de las mediciones ya hechas del ADR-39) y la tabla histórica del ADR-39; el PRD lo enmienda la sesión principal. El techo de 25 s **no** se fija como umbral de CI.

## Riesgos

El p95 de consulta completa puede superar el NFR de 15 s (estimado ~15,4 s): cubierto por la regla de parada. Activar la
expansión por defecto exige el léxico `marcos-de-pregunta.json` en el catálogo montado: el arranque falla cerrado
(`CatalogoNoDisponible`) si falta y `clinical_catalog_path` está definido.
