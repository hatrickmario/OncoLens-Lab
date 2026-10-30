## MODIFIED Requirements

### Requirement: Errores de transporte sin resultado parcial
Ante un `4xx/5xx` (salvo `401` y el `422 TIPO_CANCER_NO_REGISTRADO` del requisito siguiente) de `POST /api/evidence-analyses`, el panel MUST mostrar solo el mensaje propio del código (`503 LLM_OUTPUT_INVALID`: salida no validada; otro `503`: modelo local no disponible; `504`: tiempo agotado; `502` y cualquier otro: genérico) seguido de "Código de traza: [traceId]", sin resultado parcial ni aviso de IA (RN-06) y MUST NOT mostrar el `message` ni otro detalle interno.

#### Scenario: Un error de transporte no deja resultado parcial [pantallas-s1 S1-08/09] [RN-06]
- **GIVEN** que `POST /api/evidence-analyses` responde `502` con el cuerpo de `contracts/examples/error-servicio-ia.json` y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "No se pudo completar el análisis. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso, y no se muestran detalles internos

#### Scenario: El modelo local no disponible (503) muestra su mensaje sin resultado parcial [pantallas-s1 S1-08/09] [RN-06] [S1 resp. 12]
- **GIVEN** que `POST /api/evidence-analyses` responde `503` con el cuerpo de `contracts/examples/error-llm-local-no-disponible.json` (`error = LOCAL_LLM_UNAVAILABLE`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El modelo local no está disponible. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno

#### Scenario: Una salida del LLM no validada (503 LLM_OUTPUT_INVALID) muestra su mensaje propio sin resultado parcial [US-245 AC-1] [RN-06] [RN-23] (decisión Q1, 2026-10-30)
- **GIVEN** que `POST /api/evidence-analyses` responde `503` con el cuerpo de `contracts/examples/error-salida-llm-invalida.json` (`error = LLM_OUTPUT_INVALID`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El modelo local devolvió una respuesta que no se pudo validar. Reintenta el análisis." y "Código de traza: [traceId]", nunca "El modelo local no está disponible"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno

#### Scenario: El tiempo agotado (504) muestra su mensaje sin resultado parcial [pantallas-s1 S1-08/09] [RN-06] [US-053 AC-3]
- **GIVEN** que `POST /api/evidence-analyses` responde `504` con el cuerpo de `contracts/examples/error-deadline-vencido.json` (`error = DEADLINE_VENCIDO`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El análisis superó el tiempo máximo de espera. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno
