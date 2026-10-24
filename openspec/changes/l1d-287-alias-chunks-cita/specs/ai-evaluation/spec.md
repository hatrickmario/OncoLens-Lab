## ADDED Requirements

### Requirement: Medición de citas por alias con el LLM real
Un cambio del formato de cita del prompt `rag-query` MUST medirse con `evaluate` y el LLM real sobre el dataset vigente (`data/evaluation/`) contra la referencia de `main`: precisión de citas ≥ `precision_citas` de `metas-iniciales.yaml` (M-07.2), `cita_invalida` sin subir y `cita_invalida = 0` en la pregunta del origen en `EVAL_ORIGIN_RUNS` corridas (inicial 10, asumido). El reporte MUST adjuntarse al PR; solo datos sintéticos.

#### Scenario: El prompt con alias no empeora las citas y elimina el fallo del origen [US-236 AC-7] [OL-06] [M-07.2] [S3 resp. 8]
- **GIVEN** la suite `evaluate` con el LLM real local, el dataset de evaluación actual (`data/evaluation/`) y la pregunta del origen «¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?» sobre el paciente sintético de mama (a)
- **WHEN** `ai-eval-runner` compara la rama contra la referencia de `main`
- **THEN** la precisión de citas es ≥ 0,90 y el recuento de `cita_invalida` no es mayor que el de la referencia
- **AND** la pregunta del origen produce `cita_invalida = 0` en cada una de las `EVAL_ORIGIN_RUNS` corridas
- **AND** el reporte en `reports/eval/` registra las versiones de modelo, prompt, catálogo, corpus y umbral, y se adjunta al PR
