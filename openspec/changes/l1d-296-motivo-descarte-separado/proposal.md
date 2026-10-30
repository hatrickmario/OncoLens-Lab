# Proposal — l1d-296-motivo-descarte-separado

## Trazabilidad

L1D-296 · US-246 · FEAT-10a (panel de la opción descrita) · Sprint 4 · Estimación **2** · HU-03 ·
FR-10 (descartadas en la UI), RN-19, RN-23, NFR-12, AC-10.4 · US-246 AC-1…AC-5 · `[S4 resp. 2]` `[S4 resp. 11]` ·
🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069 · Recorrido principal: sí ·
Diseño: `docs/ux/S4/pantallas-s4.md` S4-02 (extiende S3-03) · Sprint: `backlog/sprints/S4-refinamiento.md`.

## Dependencias

- ⛔ **l1d-295-afirmaciones-atomicas-por-papel** (US-245): emite `discardReason = lenguaje_no_permitido`, añade el valor aditivo al final del enum en `contracts/schemas/evidence.yaml` (AC-7), crea los ejemplos `con-evidencia-solo-descartadas-lenguaje.json` y `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json`, y adapta `web` lo mínimo para que compile (clave en `INDICE_DE_MOTIVO` y etiqueta provisional en `es.json`; D-b, 2026-10-30). Esta historia no toca contratos; necesita todo eso mergeado y hace la UI completa encima.
- ↪ US-237 (resumen por motivo, archivado/mergeado en S3) y US-061 (sección de descartadas): se extienden, no se rehacen.

## Por qué

Hoy `evidence.discardReason.afirmacion_sin_soporte` junta dos causas («no tiene soporte en la fuente o contenía lenguaje no permitido»). Con US-245 el backend distingue ambas; el panel debe presentarlas por separado para que el oncólogo sepa si reformular la pregunta o si la fuente no sostiene lo dicho (OUT-08 §5), sin mostrar nunca el texto prescriptivo.

## Qué cambia

- **Mensajes (fuente única, AC-4):** `evidence.discardReason.afirmacion_sin_soporte` = «Una afirmación no tiene soporte en la fuente citada»; `evidence.discardReason.lenguaje_no_permitido` = «Contenía lenguaje prescriptivo, que no se muestra» (la clave la crea `l1d-295` como provisional; aquí se confirma); título de la sección, clave de rótulo, «(texto no mostrado)» y nota de lenguaje en `apps/web/messages/es.json`. Sin clave de motivo desconocido.
- **Resumen por motivo (AC-1…AC-3):** el agrupador (`resumirMotivos`) reconoce `lenguaje_no_permitido` en el orden del enum; una línea por motivo con «n × » (formato US-237), nunca una frase que junte ambos.
- **Sección «Descartadas» (AC-1, AC-2):** el título pasa a «Descartadas en la verificación — solo para revisión» (ya no son solo por falta de soporte). `afirmacion_sin_soporte` muestra cada `unsupportedClaims[]` con el rótulo «Afirmación no verificada contra la fuente citada; se muestra solo para revisión» **después** del filtro RN-23; si el filtro la rechaza, o si la entrada es el literal «(texto no mostrado)» que envía el backend (modal normativo, D-a de US-245), se muestra «(texto no mostrado)» sin el rótulo y la opción conserva la etiqueta del motivo recibido. `lenguaje_no_permitido` no muestra sus `unsupportedClaims`: solo el nombre (filtrado) o «(texto no mostrado)» con «Se omitió por la redacción generada (lenguaje prescriptivo); no es una valoración de la evidencia».
- **Motivo desconocido (AC-5, reinterpretado por la sesión principal, 2026-10-30):** el Zod generado es estricto y no se relaja; un `discardReason` fuera del enum hace fallar `safeParse` y el panel muestra su estado de error existente (sin resultado parcial ni valor crudo).

## Capacidades afectadas y bounded contexts

- Capacidad: `evidence-panel` (MODIFIED de «Descartadas aparte, plegadas y sin controles» y «Resumen por motivo cuando todas las opciones se descartan»; ADDED lenguaje no permitido, motivo desconocido como respuesta no válida y mensajes sin términos prohibidos). Sin capacidad nueva.
- Contexto: **frontend** (`apps/web`). Sin cambios en `clinical-api`, `rag-orchestrator` ni contratos.

## Fuera de alcance

- Emitir `lenguaje_no_permitido` y el log por motivo (US-245; log por motivo ya en US-237 AC-5).
- Cambios de `openapi.yaml` / `contracts/` (aditivo, lo hace US-245).
- Traza completa de la descartada (frase retirada, regla, política: US-150, S6).
- Mostrar opciones fuera del tope de 3 (US-134).

## Regresiones activas

- [RN-23] lista de términos prohibidos sobre `es.json` y textos nuevos (US-068, `lint:lenguaje`).
- [RN-19] aviso de IA sigue visible en `role="note"` (US-069).
