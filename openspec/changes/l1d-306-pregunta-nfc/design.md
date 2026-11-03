# Design — l1d-306-pregunta-nfc

## Context

Ver proposal.md (Why). Estado actual:

- `clinical-api`: `evidence-analysis.schema.ts` reexporta tal cual el Zod generado `zEvidenceAnalysisRequest`
  (`query`: `string`, `min 1`, `max 2000`). El controller lo aplica (`safeParse`) y el service pasa
  `peticion.query` al desidentificador (ADR-40) y de ahí al `AIAnalysisRecord` y a `armarRagQueryRequest`.
  Ningún paso normaliza Unicode.
- `web`: `lib/evidence/reglas-del-formulario.ts` valida la longitud con `zEvidenceAnalysisRequest.shape.query`
  y `lib/evidence/solicitar-analisis.ts` valida y envía el cuerpo con el mismo Zod generado.
- `rag-orchestrator`: `app/api/rag_query.py` recibe `RagQueryInternalRequest` (Pydantic generado) y
  `RAGOrchestratorService` usa `solicitud.query` en idioma, recuperación, *reranker*, reescritura (US-238)
  y generación (`application/generation.py`).
- Precedentes en el árbol: `documents.reglas.ts::normalizarNombreOriginal` (NFC en el borde) y
  `app/domain/corpus_seed/chunking.py::normalizar_texto` (el corpus ya está en NFC; la nota del contexto
  técnico «verificar si la ingesta normaliza» queda resuelta: **sí**, sin deuda nueva).
  `packages/clinical-language` ya tiene un gemelo TS/Python (`normalizar.ts` ↔ `app/domain/lenguaje.py`,
  RN-23) que comparte reglas entre lenguajes.

Decisiones de sprint que aplican: D-6 (2 pts) `[S5 resp. 4]`; US-250 en la lista «Nunca» del recorte
`[S5 resp. 3]`; PR individual por tocar `openapi.yaml` (D-12) `[S5 resp. 7]`. No se reabre D-01 ni ADR-40.

## Goals / Non-Goals

**Goals:** una sola regla de normalización, aplicada en los tres bordes (web, clinical-api autoridad,
rag-orchestrator defensa), antes de cualquier uso de la pregunta; prompt idéntico para NFC y NFD.

**Non-Goals:** normalizar la pregunta de seguimiento (US-218/US-219), devolver análisis guardados (US-251),
medir reproducibilidad en `evaluate` (US-252), tocar el corpus, el prompt o el modelo.

## Decisions

### D1 · La regla: NFC + espacios Unicode → un espacio + recorte

`normalizarPregunta(texto) = texto.normalize('NFC')`, luego toda secuencia de espacio en blanco Unicode
(`\s` con Unicode: espacio, `\t`, `\n`, `\r`, U+00A0, U+2007, U+202F, U+3000…) → un U+0020, y `trim`.
No toca mayúsculas, signos ni puntuación (AC-2). NFC y no NFKC: NFKC cambiaría símbolos con significado
clínico (p. ej. `²`, `µ`, fracciones) y AC-2 pide no alterar signos. Decidido (usuario, 2026-11-03), `[S5 resp. 13]`: los saltos de línea cuentan
como espacio: la pregunta es una sola consulta y el contrato no les da significado.

*Descartadas:* NFKC (altera símbolos); quitar tildes (cambia la pregunta que ve el LLM y el oncólogo).

### D2 · Dónde vive la regla (un dueño por lenguaje, una tabla de casos compartida)

- **TS:** `packages/clinical-language/src/normalizar-pregunta.ts` exporta `normalizarPregunta()`; lo usan
  `clinical-api` y `web` (paquete puro ya consumido por `web`; `clinical-api` lo importa por ruta relativa
  como hace con `api-contracts`).
- **Python:** `apps/rag-orchestrator/app/domain/pregunta.py::normalizar_pregunta()` (dominio puro).
- **Tabla de casos compartida** `packages/clinical-language/fixtures/normalizacion-pregunta.json`
  (entrada → salida esperada, incluidas la pregunta de la Demo 4 en NFC y NFD escrita con escapes
  `́`, espacios no separables, tabuladores, solo espacios → `""`, y el par de 2000/>2000 caracteres
  del AC-3). Vitest y Pytest la recorren: los dos gemelos no pueden divergir. Es texto sintético, sin PII.

*Descartadas:* una sola implementación (no hay runtime común entre Node y Python); poner la función en
`api-contracts` (es código generado, no se edita a mano).

### D3 · Normalizar antes de validar: esquema del borde que compone el Zod generado

El Zod generado mide `max(2000)` sobre el texto crudo, lo que rompería AC-3. `evidence-analysis.schema.ts`
pasa a componer el generado: preproceso de `query` con `normalizarPregunta` y luego el schema generado sin
cambios (`z.preprocess` sobre el campo, o `extend` con `z.string().transform(...).pipe(shape.query)`).
El mismo esquema compuesto se exporta para `web` desde `packages/clinical-language`
(`esquemaPreguntaNormalizada`) y lo usan `reglas-del-formulario.ts` (longitud y contador) y
`solicitar-analisis.ts` (cuerpo enviado). El contrato sigue siendo la fuente de los límites (2000 sale del
generado, nunca de un literal). La normalización ocurre **antes** de la desidentificación (ADR-40): los
patrones de PII ven una sola forma del texto.

### D4 · rag-orchestrator: normalizar en el router, no en el modelo generado

`app/schemas/generated/models.py` no se edita. `rag_query.py` sustituye `solicitud` por
`solicitud.model_copy(update={"query": normalizar_pregunta(solicitud.query)})` antes de llamar a
`consulta.consultar`; si queda vacía, lanza la misma `RequestValidationError`/422 `CUERPO_INVALIDO` del
manejador existente (sin eco). Así todas las etapas ven NFC. Límite aceptado: un llamador directo que envíe
>2000 caracteres en NFD recibe 422 de Pydantic antes de normalizar; `clinical-api` siempre envía ya
normalizado, así que no ocurre en el flujo real.

*Descartada:* normalizar dentro de `generation.py` (el prompt quedaría en NFC pero la recuperación y el
idioma verían NFD: dos formas de la misma pregunta en un mismo análisis).

## Criterios de verificación por AC

| AC | Nivel | Dónde |
|---|---|---|
| AC-1 | Integración (Supertest + PostgreSQL real + MSW hacia `rag-orchestrator`) + UI (Vitest + MSW) | `apps/clinical-api/tests/integration/evidence-analysis/pregunta-nfc.test.ts`; `apps/web/tests/ui/` |
| AC-2 | Integración (clinical-api) + unitarios de la tabla compartida (TS y Python) | ídem; `packages/clinical-language/tests/`, `apps/rag-orchestrator/tests/unit/` |
| AC-3 | Integración (clinical-api) + UI | ídem |
| AC-4 | Integración (`TestClient` + LLM falso que registra el prompt) | `apps/rag-orchestrator/tests/integration/` |
| AC-5 | Integración (`TestClient`, SHA-256 del prompt registrado) | ídem |

## Privacidad y ownership

- **Fronteras:** la pregunta cruza web → clinical-api (cookie de sesión) → rag-orchestrator (JWT de
  servicio), como hoy. Este change solo cambia su forma Unicode y sus espacios; no añade campos ni datos.
- **RN-11:** la normalización ocurre **antes** de la desidentificación en `clinical-api`, que sigue
  enmascarando la pregunta antes de persistirla y enviarla. NFC no puede reintroducir PII: es una
  equivalencia canónica del mismo texto. Mejora la detección por patrones (una sola forma).
- **rag-orchestrator** no toca datos clínicos ni `clinical-minio`; la función es pura y no persiste nada.
- **Logs:** ningún log nuevo registra la pregunta (el requisito «El gateway no registra la pregunta ni el
  contexto en los logs» sigue vigente); los tests de AC-5 calculan el hash en el test, no en un log.
- **Tabla de casos:** texto sintético sin PII; pasa `pii-scan` y `data-scan`.

**Seguridad web** (toca `apps/web/lib`): validación con el esquema Zod compartido en cliente y servidor
(el servidor es `clinical-api`, que revalida); sin variables `NEXT_PUBLIC_` nuevas; sin módulos
`server-only` nuevos; no cambia cómo se renderiza texto del LLM o del corpus; sin impacto en CSP ni
cabeceras; sin dependencias nuevas.

## Componentes y patrones

Ningún componente nuevo ni dividido; ningún patrón nuevo (hook, provider, compound). Solo cambian dos
módulos de lógica de `apps/web/lib/evidence/`. El contador y el mensaje de error existentes leen la
longitud normalizada. Referencia UI: `docs/ux/S5/pantallas-s5.md` declara US-250 **sin UI propia**; el
panel del Pre-S1/S4 no cambia visualmente. Sin desviación de diseño.

## Contratos

Proveedores: `clinical-api` (`EvidenceAnalysisRequest`) y `rag-orchestrator` (`RagQueryInternalRequest`).
Consumidores: `web` → clinical-api; `clinical-api` → rag-orchestrator (clientes generados).

```diff
 # apps/clinical-api/openapi.yaml · components.schemas.EvidenceAnalysisRequest.properties
         query:
           type: string
           minLength: 1
           maxLength: 2000
+          description: >-
+            Pregunta del oncólogo. clinical-api la normaliza antes de validarla, persistirla y enviarla
+            (Unicode NFC, espacios colapsados a uno y recortados; mayúsculas y puntuación sin cambios).
+            minLength y maxLength se miden después de normalizar (US-250).
```

```diff
 # apps/rag-orchestrator/openapi.yaml · components.schemas.RagQueryInternalRequest.properties
         query:
           type: string
           minLength: 1
           maxLength: 2000
-          description: Pregunta ya enmascarada (RN-11).
+          description: >-
+            Pregunta ya enmascarada (RN-11) y normalizada por clinical-api (Unicode NFC, espacios
+            colapsados y recortados). rag-orchestrator vuelve a normalizarla al recibirla; vacía tras
+            normalizar → 422 CUERPO_INVALIDO (US-250).
```

- Compatibilidad: solo `description`; `oasdiff` no lo marca incompatible (ADR-26). Sin entradas en
  `scripts/ci/contracts-breaking-excepciones.json`.
- `info.version` *patch* (solo descripción): `clinical-api` 1.15.0 → **1.15.1** y `rag-orchestrator` 1.10.0 →
  **1.10.1**, primeros de la cadena de versiones del S5 (siguen l1d-268 con 1.16.0 / 1.11.0). Si el orden de merge
  cambia, quien rebasa renumera y **regenera** `packages/api-contracts`; nunca fusiona generados a mano.
- `contracts/examples/`: sin ejemplos nuevos ni cambiados (los ejemplos existentes ya traen la pregunta
  en NFC). Los 422 usan los cuerpos de error existentes.
- Generados (`packages/api-contracts/**`, `app/schemas/generated/models.py`) solo vía `contracts:generate`;
  el diff esperado se limita a comentarios de documentación.

## Evaluación

No cambia modelo, prompt (plantilla), umbral, catálogo ni corpus: no es obligatoria la suite `evaluate`
(OL-06). Efecto esperado: estabilidad ante entradas NFD (OUT-05). La medición de reproducibilidad con
hashes de prompt y salida es de US-252 (S6); el baseline de la Demo 4 (57/57 en NFC) es su referencia.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `packages/clinical-language/src/normalizar-pregunta.ts` | nuevo: `normalizarPregunta()` y `esquemaPreguntaNormalizada` | Zod generado (`zEvidenceAnalysisRequest.shape.query`) |
| `apps/clinical-api/src/modules/evidence-analysis/evidence-analysis.schema.ts` | compone el Zod generado con la normalización de `query` | `normalizarPregunta()` |
| `apps/web/lib/evidence/reglas-del-formulario.ts`, `solicitar-analisis.ts` | validan y envían con el esquema compartido | `esquemaPreguntaNormalizada` |
| `apps/rag-orchestrator/app/domain/pregunta.py` | nuevo: `normalizar_pregunta()` (gemelo) | solo `unicodedata` y `re` |
| `apps/rag-orchestrator/app/api/rag_query.py` | normaliza antes de delegar en `EvidenceQueryPort` | `normalizar_pregunta()` |

Regla extraída a un método con nombre propio: `normalizarPregunta()` / `normalizar_pregunta()` (OUT-05).
Antes del PR: buscar `normalize('NFC')`/`unicodedata.normalize("NFC"` en el árbol y confirmar que la
pregunta no tiene otro dueño (`normalizarNombreOriginal` y `normalizar_texto` son reglas distintas: nombre
de archivo y texto del corpus, con saltos de línea conservados).

**Fakes:** se usa el LLM falso existente (`tests/support/llm_falso.py`) y los adapters falsos de
recuperación/*reranker*; si hay que añadirles el registro del prompt o de la consulta, se extiende el fake
y su test de contrato (`tests/support/test_contract.py`) sigue verde (mismos errores y casos límite).
En `clinical-api`, MSW hacia `rag-orchestrator` desde `contracts/examples/`; sin mocks de módulos propios.

## Risks / Trade-offs

- [Divergencia TS ↔ Python] → la tabla de casos compartida la recorren ambos lenguajes.
- [`\s` difiere entre JS y Python en algún separador raro] → la tabla incluye U+00A0, U+2007, U+202F,
  U+3000 y ` `; si difieren, se fija la clase explícita en ambos.
- [Llamador directo con NFD > 2000 en `/rag/query`] → 422 de Pydantic antes de normalizar; aceptado
  (D4), el flujo real siempre normaliza antes en `clinical-api`.
- [Análisis previos guardados en NFD] → no se migran: `queryText` histórico se conserva (RN-05/RN-06);
  solo afecta a análisis nuevos.

## Migration Plan

Sin migración de datos ni de esquema. Despliegue normal; *rollback* = revertir el PR.

## Open Questions

Ninguna. Todos los supuestos de este change (saltos de línea como espacio, D1; mínimo de 1 carácter medido tras
normalizar, también como defensa en profundidad en `rag-orchestrator`) quedan Decidido (usuario, 2026-11-03),
`[S5 resp. 13]`. Coordinación con `l1d-268-*` (US-218): reutilizar `normalizarPregunta()` en
`FollowUpCreate.question` y `/rag/follow-up` se decide en ese change.
