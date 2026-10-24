# Architecture Decision Records

ADRs nuevos con la plantilla [`_plantilla-madr.md`](_plantilla-madr.md) (MADR 4, mínima, en español), desde ADR-39.
Los ADR #1–38 decididos antes del backlog están en `readme.md` §3.3 y §6.1. Las decisiones clínicas, legales o de producto
van como DEC en [`docs/decisions/`](../../decisions/).

| ADR | Título | Estado | Fecha | Historia |
|---|---|---|---|---|
| [ADR-26](ADR-26-contrato-congelado-y-excepciones-declaradas.md) | El contrato se cambia solo de forma aditiva; todo ERR de oasdiff aceptado se declara (E-1: 422 TIPO_CANCER_NO_REGISTRADO) | aceptado | 2026-10-17 | US-055 (L1D-106) |
| [ADR-36](ADR-36-fuentes-y-licencias.md) | Fuentes y licencias del corpus científico (Enmienda 1: ClinicalTrials.gov admitida, 2026-10-24) | aceptado | 2026-10-09 · enm. 2026-10-24 | US-007 (L1D-50) |
| [ADR-39](ADR-39-modelos-locales.md) | Modelos locales y runtime (fase A: recuperación y verificación; fase B pendiente) | propuesto | 2026-10-16 | US-012 (L1D-102) |
| [ADR-40](ADR-40-deteccion-pii.md) | Detección de PII: patrones configurables en ambos backends; el motor de nombres en documentos queda sin elegir porque ningún candidato alcanza G-8 | propuesto | 2026-10-21 | US-013 (L1D-205) |
| [ADR-41](ADR-41-evaluacion-ia.md) | Evaluación de la calidad de la IA: framework propio con Pytest, NLI como juez principal de fidelidad y juez LLM local secundario | propuesto | 2026-10-21 | US-014 (L1D-232) |
| ADR-42 | Streaming de progreso | pendiente | — | — |
| ADR-43 | Catálogo del corpus en base separada | pendiente | — | — |
| ADR-44 | Stack de observabilidad (Prometheus, Grafana, OpenTelemetry) | pendiente (Post-MVP) | — | US-028 |
| [ADR-45](ADR-45-mejora-recuperacion-ol06.md) | Mejora de la recuperación frente a las metas de OL-06: diagnóstico, protocolo anti-sobreajuste y plan por ablaciones | propuesto | 2026-10-16 | US-226…US-230 (borrador, sin Linear) |
| [ADR-46](ADR-46-contratos-provider-driven-sin-pact.md) | Los contratos son provider-driven: el proveedor verifica sus respuestas y los consumidores usan clientes generados, sin Pact | propuesto | 2026-10-21 | US-214 (L1D-264) |
| ADR-7 | Scoring de evidencia clínica | futuro | — | — |
