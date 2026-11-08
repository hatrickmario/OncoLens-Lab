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
   expansión sí lleva `:-false` en Compose (H-2).
4. **REGLA DE PARADA (AC-3):** si el p95 de consulta completa con 20 pares, medido en máquina limpia en la corrida final,
   supera 15 s (la medición previa dio ~15,4 s), el implementador **se detiene y pregunta** al orquestador y al usuario las
   opciones (recalibrar el tope, 20 solo en análisis, o reducir el costo de generación). No decide ni pide el merge de los
   defaults. Sin corrida, el PR se cierra sin merge (AC-7).
5. **Evaluación (AC-4):** en CI corre `evaluate` con adapters o fake sin regresión; la corrida real (recall@10 y MRR no
   menores, 0 falsos positivos en adversarias, controles intactos) es la final única (H-3, D6-50).

## Riesgos

El p95 de consulta completa puede superar el NFR de 15 s (estimado ~15,4 s): cubierto por la regla de parada. Activar la
expansión por defecto exige el léxico `marcos-de-pregunta.json` en el catálogo montado: el arranque falla cerrado
(`CatalogoNoDisponible`) si falta y `clinical_catalog_path` está definido.
