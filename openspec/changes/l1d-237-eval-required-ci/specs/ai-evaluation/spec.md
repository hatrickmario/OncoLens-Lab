## ADDED Requirements

### Requirement: Evaluación obligatoria en PR que cambian la IA
La CI MUST ejecutar el job `eval-required` en todo PR cuyo diff toque una ruta o clave de `scripts/ci/eval-trigger-paths.yaml` (prompts, catálogo, manifiesto del corpus, claves de modelos y umbrales) y SHALL publicar el reporte de `evaluate` con la configuración de CI como artefacto y como comentario del PR.

#### Scenario: Un cambio de prompt dispara la suite y publica el reporte [US-074 AC-1] [AC-T5.4] [FR-20]
- **GIVEN** un PR que modifica un archivo de `apps/rag-orchestrator/app/prompts/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` ejecuta `evaluate` con la configuración de CI y publica el reporte como artefacto y como comentario del PR

#### Scenario: Un cambio de catálogo también dispara la suite [US-074 AC-2] [AC-T5.4] [C-10]
- **GIVEN** un PR que modifica `packages/clinical-catalogs/mama/codigos.json`
- **WHEN** corre la CI
- **THEN** el job `eval-required` se ejecuta

#### Scenario: Un cambio de umbral, modelo o manifiesto del corpus dispara la suite [US-074 AC-3] [AC-T5.4]
- **GIVEN** un PR que cambia `RELEVANCE_THRESHOLD` o `LLM_MODEL` en `.env.example` o en la configuración versionada, o el manifiesto del corpus en `data/raw/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` se ejecuta

#### Scenario: Un PR que no toca disparadores no ejecuta la suite [US-074 AC-1] (asumido)
- **GIVEN** un PR que solo modifica `apps/web/app/login/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` termina sin ejecutar `evaluate` y lo indica en su resumen

#### Scenario: El comentario trae la marca validada o no validada [US-074 AC-6] [AC-T5.3]
- **GIVEN** el comentario del PR del primer escenario
- **WHEN** se lee
- **THEN** contiene la tabla de métricas con la marca "validada / no validada" de cada una

### Requirement: Umbral de regresión desde configuración
El job MUST comparar el reporte con `eval/configs/regression.yaml`; sin umbrales SHALL terminar en éxito avisando que no se aplicó, y con umbrales SHALL fallar nombrando cada métrica por debajo. Los umbrales MUST vivir solo en esa configuración.

#### Scenario: Sin baseline de regresión el job pasa con aviso [US-074 AC-4] [TBD-02] (asumido en el texto del aviso)
- **GIVEN** `eval/configs/regression.yaml` sin umbrales
- **WHEN** corre la CI sobre el PR que cambia un prompt
- **THEN** el job `eval-required` termina en éxito, publica el reporte y el comentario indica "Sin baseline de regresión: umbral no aplicado"

#### Scenario: Una regresión rompe el job y nombra la métrica [US-074 AC-5] [RN-22]
- **GIVEN** un `regression.yaml` de prueba con `recall_at_10_min: 0.80` y un reporte con FX-T5a-a cuyo recall@10 es 0,50
- **WHEN** corre la CI
- **THEN** el job falla y su salida nombra `recall_at_10`
