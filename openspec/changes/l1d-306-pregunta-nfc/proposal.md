# Proposal — l1d-306-pregunta-nfc

## Trazabilidad

L1D-306 · US-250 · FEAT-06a (L1D-16) · Sprint 5 · Estimación **2** (D-6, `[S5 resp. 4]`) · HU-03 ·
RN-06, RN-11, RN-22 · OUT-05 (Demo 4) · US-250 AC-1…AC-5 · 🔗 Medido en: US-252 (S6) · Fuente:
`backlog/features/FEAT-06a-analisis-walking-skeleton.md` §US-250; contexto:
`backlog/sprints/S5-refinamiento.md` §2 (oleada O1, «Nunca» se recorta, `[S5 resp. 3]`) y §3 D-6;
origen: `docs/evidence/S4-demo4/S4-demo-outcomes.md` §OUT-05. Diseño UI del sprint:
`docs/ux/S5/pantallas-s5.md` (US-250 **sin UI propia**).

> **Decidido (usuario, 2026-11-03, refinamiento del S5):** D-6, estimación **2** confirmada `[S5 resp. 4]`.
> US-250 está en la lista «Nunca» del orden de recorte del S5 `[S5 resp. 3]`.

## Why

En la Demo 4 la misma pregunta visible dio tres análisis distintos (0 opciones frente a 2) porque llegó
en Unicode **NFD** (letra + acento combinante, 206 caracteres frente a 202): la recuperación fue idéntica,
pero el LLM recibió otros *tokens*. Con la pregunta en NFC, 57 de 57 ejecuciones dieron el mismo
análisis (OUT-05). El resultado debe depender de la evidencia, no de cómo el portapapeles codificó el texto.
Normalizar solo en el navegador se descartó en la Demo 4: cualquier cliente de la API se lo saltaría.

## What Changes

- **Regla de normalización de la pregunta** (función pura, una por lenguaje con una tabla de casos
  compartida): Unicode **NFC** + todo espacio en blanco Unicode (incluidos los no separables) colapsado a
  un único espacio y recortado en los extremos; mayúsculas, signos y puntuación intactos (AC-2).
- **`clinical-api` (autoridad):** el cuerpo de `POST /platform/evidence-analyses` se normaliza en el borde
  (Zod) **antes** de validar la longitud (AC-3) y antes de desidentificar; el `queryText` persistido y la
  `query` enviada a `rag-orchestrator` salen en NFC (AC-1, RN-06).
- **`web`:** el formulario valida la longitud y envía la pregunta con la misma regla (mismo esquema
  compartido); el Route Handler no cambia.
- **`rag-orchestrator` (defensa en profundidad):** `/rag/query` normaliza la `query` al recibirla, de modo
  que idioma, recuperación, *reranker* y prompt ven la misma forma NFC (AC-4, AC-5).
- **Contratos:** solo la `description` de `EvidenceAnalysisRequest.query` (clinical-api) y
  `RagQueryInternalRequest.query` (rag-orchestrator) declaran la normalización; el campo sigue siendo
  `string` con `minLength 1` / `maxLength 2000`. Sin cambio incompatible (ADR-26).
- **Verificado en el refinamiento del change:** la ingesta del corpus ya normaliza a NFC
  (`app/domain/corpus_seed/chunking.py::normalizar_texto`); no hace falta deuda nueva.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis-gateway`: nuevo requisito de normalización de la pregunta en el borde de
  `POST /platform/evidence-analyses` (persistencia y envío en NFC, longitud medida tras normalizar).
- `evidence-analysis`: nuevo requisito de normalización defensiva de la `query` en `/rag/query`
  (prompt idéntico para NFC y NFD).
- `evidence-panel`: nuevo requisito: el panel valida y envía la pregunta normalizada.

**Bounded contexts:** clinical-platform · ai-services · frontend.

## Dependencias

- ↪ Pasarela `POST /platform/evidence-analyses` (FEAT-06a, US-052/US-053, ya en `main`) y `/rag/query`
  (US-055, en `main`). Sin ⛔ dentro del S5.
- Orden de oleada: O1, después de **ARR-11** (CI más rápida, D-12), que va primero en la oleada.
- 🔗 Coordinación (no bloqueo) con `l1d-268-*` (US-218, seguimiento backend): `FollowUpCreate.question`
  y `/rag/follow-up` deberían reutilizar la misma regla (ver «Fuera de alcance»).
- 🔗 Lo mide US-252 (S6, reproducibilidad con hashes de prompt en `evaluate`).
- PR **individual** (cambia la descripción de dos `openapi.yaml`): regla de agrupación de D-12 `[S5 resp. 7]`.

## Fuera de alcance

- La pregunta de **seguimiento** (`POST …/follow-ups`, `/rag/follow-up`): es de US-218/US-219; este change
  deja la regla lista para reutilizar.
- Devolver el análisis guardado ante la misma entrada (OUT-06 → US-251, S6) y medir la reproducibilidad
  en `evaluate` (OUT-07 → US-252, S6).
- Normalizar otros textos libres (notas, atributos, eventos) o el texto del corpus (ya en NFC).
- Cambiar la temperatura, la semilla o el modelo (descartados en OUT-05).

## Impact

- `packages/clinical-language/src/` (función pura y tabla de casos compartida).
- `apps/clinical-api/src/modules/evidence-analysis/evidence-analysis.schema.ts` (esquema del borde que
  compone el Zod generado con la normalización); `openapi.yaml` (descripción; `info.version` *patch* **1.15.1**).
- `apps/web/lib/evidence/` (`reglas-del-formulario.ts`, `solicitar-analisis.ts`).
- `apps/rag-orchestrator/app/domain/` (gemelo Python), `app/api/rag_query.py`; `openapi.yaml` (descripción; `info.version`
  *patch* **1.10.1**). Cadena de versiones del S5: este change es el primero (1.15.0 → 1.15.1; 1.10.0 → 1.10.1).
- Artefactos generados (`packages/api-contracts/**`, `app/schemas/generated/models.py`) solo por
  `contracts:generate`. Sin migración, sin dependencias nuevas, sin cambio de prompt ni de modelo.
