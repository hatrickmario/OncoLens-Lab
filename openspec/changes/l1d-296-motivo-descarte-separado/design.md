# Design — l1d-296-motivo-descarte-separado

## Context

`apps/web/lib/evidence/resumir-motivos.ts` agrupa las descartadas con un `Record<Motivo, number>` que rompe la compilación si el contrato añade un motivo; `components/molecules/discard-reasons-summary.tsx` pinta «Motivos:» (US-237) y `components/organisms/discarded-options.tsx` pinta cada descartada con `discardReason[...]` y el rótulo `discarded.sinSoporte` («Sin soporte»). Las etiquetas viven en `apps/web/messages/es.json`. Decidido `[S4 resp. 2]` y `[S4 resp. 11]`: no se reabre.

## Pantalla de referencia

`docs/ux/S4/pantallas-s4.md` S4-02 (extiende S3-03 de `docs/ux/S3/pantallas-s3.md`) y el sistema de diseño del Pre-S1 (`docs/ux/`).

**Desviaciones declaradas respecto a `docs/ux/S4/pantallas-s4.md:148`** (no se edita `docs/ux/`; las fija US-246 y su refinamiento):

1. **Título de la sección:** la pantalla dice «Descartadas · solo para revisión»; este change usa «Descartadas en la verificación — solo para revisión» (clave existente `…titulo`), el título que fija US-246 AC-2.
2. **Afirmación rechazada por el filtro RN-23:** la pantalla dice que, si el filtro la rechaza, «solo aparece la etiqueta de `lenguaje_no_permitido`»; este change muestra el literal «(texto no mostrado)», sin el rótulo de afirmación no verificada, y **conserva la etiqueta del motivo recibido** (p. ej. `afirmacion_sin_soporte`), porque el panel no reinterpreta el motivo que decidió el backend (RN-01) y el texto prescriptivo nunca se renderiza (RN-23).

## Decisiones

- **Una sola fuente de etiquetas:** `evidence.discardReason.<motivo>`; el resumen y la lista reusan la misma clave (US-237 AC-3). Etiquetas nuevas solo para el título de la sección («Descartadas en la verificación — solo para revisión», clave existente `…titulo`), el rótulo de la afirmación no verificada, «(texto no mostrado)» y la nota de lenguaje. La clave `evidence.discardReason.lenguaje_no_permitido` ya la crea `l1d-295` como provisional (D-b); aquí se confirma su texto.
- **Orden del enum del contrato:** `cita_invalida, afirmacion_sin_soporte, sin_citas, solo_soportada_por_analisis_previo, lenguaje_no_permitido` (fijado por `l1d-295`, valor nuevo al final). `resumirMotivos` conserva el `Record` exhaustivo; la clave `lenguaje_no_permitido: 4` ya la añade `l1d-295` (D-b).
- **Filtro RN-23 en la presentación:** función pura con nombre propio `mostrarSiPermitido(texto)` que devuelve el texto o `null` usando `checkProhibitedTerms` de `packages/clinical-language`; cada `unsupportedClaims[]` y cada `option` pasan por ella antes de renderizarse. `null` → «(texto no mostrado)» sin el rótulo de afirmación no verificada; la etiqueta del motivo recibido se conserva.
- **Literal del backend:** una entrada de `unsupportedClaims` igual a «(texto no mostrado)» (afirmación con modal normativo, D-a de US-245) se muestra tal cual y sin el rótulo. En una descartada `lenguaje_no_permitido` las `unsupportedClaims` no se muestran.
- **Despacho por motivo:** `descripcionDeDescartada(descartada)` (función pura, `lib/evidence/`) decide qué se muestra según `discardReason`, exhaustiva sobre el tipo generado (sin rama de motivo desconocido).
- **Motivo desconocido (AC-5), decisión de la sesión principal (Gate 1 del S4, 2026-10-30):** el Zod generado es estricto y no se relaja; un `discardReason` fuera del enum hace fallar `zEvidenceAnalysis.safeParse` en `lib/evidence/solicitar-analisis.ts`, que ya devuelve el fallo de transporte, y el panel muestra su estado de error existente (`evidence.error.generico` + «Reintentar»), sin resultado parcial ni valor crudo. Un valor nuevo del enum llega a `web` solo con su contrato regenerado (como en `l1d-295`), así que no hace falta una etiqueta genérica.
- **Alternativas:** una propuesta elegida (despacho en una función pura + claves de mensajes); descartada la lógica dentro del JSX por mezclar niveles de abstracción.

## Dependencias y colaboradores

- Modifica `lib/evidence/resumir-motivos.ts`, `components/molecules/discard-reasons-summary.tsx`, `components/organisms/discarded-options.tsx`; nuevo `lib/evidence/descripcion-descartada.ts` (puro).
- Depende de `packages/clinical-language` (`checkProhibitedTerms`, ya usado por CI y backends) y del tipo generado de `packages/api-contracts` (nunca editado a mano). Si `apps/web` aún no declara el workspace, se añade como dependencia interna (sin paquete externo).
- Reglas extraídas con nombre: `mostrarSiPermitido()` (RN-23), `resumirMotivos()` (RN-01 de presentación, existente).

## Privacidad y ownership

El panel solo recibe la respuesta ya validada de `clinical-api` vía `/api/*` (mismo origen); no cruza ninguna frontera nueva ni toca `rag-orchestrator`, PostgreSQL ni `clinical-minio`. No hay identidad en el texto de descartadas (desidentificado, RN-11). El texto prescriptivo nunca se renderiza ni se registra.

**Seguridad web:** validación con el schema Zod compartido (sin cambios); sin variables `NEXT_PUBLIC_` nuevas; el módulo de filtro no es `server-only` (corre en cliente, es puro y sin secretos); texto del LLM renderizado como texto de React (sin `dangerouslySetInnerHTML`); sin impacto en CSP ni cabeceras; sin dependencias externas nuevas (la interna `clinical-language` pasa `npm audit` del workspace).

## Componentes y patrones

- `DiscardReasonsSummary` (se conserva, un concepto), `DiscardedOptions` (≤ 100 líneas: si lo supera al añadir los casos, se extrae `DiscardedOptionItem` con un caso por motivo).
- Sin patrones nuevos (sin hooks, providers ni compound components): YAGNI. Todo es RSC salvo `DiscardedOptions`, que ya es `'use client'` por el plegado; el resumen sigue sin estado.

## Contratos

**Sin cambio de contrato:** `web` es consumidor; el proveedor `clinical-api` ya expone `DiscardedOption.discardReason` y US-245 (l1d-295) añade `lenguaje_no_permitido` (aditivo, ADR-26, oasdiff sin incompatibilidades). `contracts:check` sin diferencias en este change y sin archivos nuevos en `contracts/`. Los handlers MSW se construyen desde `contracts/examples/` (`con-evidencia-solo-descartadas.json`, `…-otros-motivos.json`, `…-motivos-mixtos.json`, y `…-lenguaje.json` y `…-sin-soporte-y-lenguaje.json`, ambos creados por `l1d-295` en su `## contratos`). El caso de motivo desconocido es un override de MSW dentro del test (no un ejemplo del contrato, porque no valida contra él).

## Evaluación

No toca modelo, prompt, umbral, catálogo ni corpus: sin `run-ai-eval`. Evidencia: tests de componente + `visual-check` a 375 y 1280 px.

## Risks / Trade-offs

- Si l1d-295 cambia el orden del enum, `resumirMotivos` rompe la compilación (deseado) y se ajusta al contrato.
- Motivo desconocido como error: un backend más nuevo que `web` haría fallar todo el análisis en lugar de una sola descartada; aceptado porque el contrato y los generados se despliegan juntos en el monorepo.
- El filtro en el cliente puede divergir de la política del backend si las listas se versionan distinto; se mitiga usando el mismo paquete `clinical-language`.

## Hallazgo del visual-check

`packages/clinical-language/src` importa sus hermanos con `.js` (NodeNext); Vitest los resuelve pero Turbopack no (500 en `/analisis`). Se declara `turbopack.resolveAlias` en `apps/web/next.config.ts` para `./normalizar.js` y `./secuencias.js`, con un test que exige un alias por cada importación `.js` del verificador. No es un `webpack()` personalizado. Alternativa (mejor a largo plazo, fuera de alcance): que el paquete emita imports sin extensión o un subpath `exports` puro.

## Pendientes de definir

- «(texto no mostrado)» (AC-2): se asume que sustituye al nombre de la opción solo cuando el filtro RN-23 lo rechaza; con nombre limpio se muestra el nombre.
