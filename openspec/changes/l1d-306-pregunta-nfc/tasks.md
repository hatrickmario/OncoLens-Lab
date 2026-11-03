# Tasks — l1d-306-pregunta-nfc

> US-250 · L1D-306 · Sprint 5, oleada O1 (después de ARR-11). Matriz TDD de `CLAUDE.md`: regla de
> dominio en el borde y endpoints → **TDD estricto, doble bucle** (commit `test(L1D-306)` del AC-1 en rojo
> antes del `feat`, `[S5 resp. 4]` D-6); lógica de `web` → **test del AC primero**; descripción de
> contratos → secuencia `contract → test → feat → refactor`. PR **individual** (toca `openapi.yaml`, D-12
> `[S5 resp. 7]`). Solo datos sintéticos. Sin `## humano`: no hay `.env.example` ni excepciones.

## 1. contratos

- [x] 1.1 Editar la `description` de `EvidenceAnalysisRequest.query` en `apps/clinical-api/openapi.yaml` y de
      `RagQueryInternalRequest.query` en `apps/rag-orchestrator/openapi.yaml` según el diff de design.md
      §Contratos (skill `sync-contracts`) y subir `info.version` *patch*: `clinical-api` 1.15.0 → **1.15.1**,
      `rag-orchestrator` 1.10.0 → **1.10.1** (cadena del S5; si cambia el orden de merge, quien rebasa renumera
      y regenera `packages/api-contracts`); `npm run contracts:check`, `contracts:breaking` (0 incompatibles),
      `contracts:generate` (diff solo en comentarios); commit `contract(L1D-306)` · **exento (contrato)**

## 2. clinical-platform

- [x] 2.1 Tabla de casos compartida `packages/clinical-language/fixtures/normalizacion-pregunta.json`
      (pregunta de la Demo 4 en NFC y NFD con escapes `́`, espacios en extremos, repetidos, `\t`,
      U+00A0, U+2007, U+202F, U+3000, solo espacios → `""`, par 2000 NFC / >2000 NFD) y esqueleto
      `normalizarPregunta()` que lanza `no implementado` · **TDD estricto** `[US-250 AC-2]`
- [x] 2.2 Test de aceptación en rojo: «persiste y envía la pregunta en NFC idéntica byte a byte cuando
      llega en NFD [US-250 AC-1]» · integración (Supertest + PostgreSQL real + MSW desde `contracts/examples/`
      que registra el cuerpo; respuesta validada contra el spec del proveedor), en
      `apps/clinical-api/tests/integration/evidence-analysis/pregunta-nfc.test.ts`; junto a él, en rojo,
      AC-2 (espacios), AC-3 (NFD > 2000, NFC = 2000 → aceptada) y solo espacios → `422 CUERPO_INVALIDO` sin
      llamadas; commit `test(L1D-306)` · **TDD estricto**
- [x] 2.3 Implementar `normalizarPregunta()` en `packages/clinical-language/src/normalizar-pregunta.ts` con
      unitarios uno a uno sobre la tabla compartida (Vitest), exportarla y componer el esquema del borde en
      `evidence-analysis.schema.ts` (normaliza `query` y después aplica el Zod generado; el máximo sale del
      generado). Extraer `normalizarPregunta()` (OUT-05). Tests 2.2 en verde; commit `feat(L1D-306)` ·
      **TDD estricto** `[US-250 AC-1…AC-3]`
- [x] 2.4 Suite de `clinical-api` y de `packages/clinical-language` en verde (incluidos
      `desidentificacion-pregunta.test.ts` y `gateway-rechazos.test.ts`); `contracts:verify-provider` en verde ·
      **verificación**
- [x] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento,
      tests en verde antes y después, commit refactor(L1D-306)

## 3. ai-services

- [x] 3.1 Esqueleto `app/domain/pregunta.py::normalizar_pregunta()` (`raise NotImplementedError`) y tests de
      aceptación en rojo con `@pytest.mark.ac("US-250", 4)` y `("US-250", 5)`: «el prompt contiene la
      pregunta en NFC cuando llega en NFD» y «NFC y NFD producen el mismo SHA-256 de prompt y la misma
      consulta en recuperación y *reranker*» · integración (`TestClient` + LLM falso que registra el prompt,
      adapters falsos); más «solo espacios → 422 `CUERPO_INVALIDO` sin llamar adapters»; commit
      `test(L1D-306)` · **TDD estricto**
- [x] 3.2 Implementar `normalizar_pregunta()` con unitarios Pytest sobre la tabla compartida
      `packages/clinical-language/fixtures/normalizacion-pregunta.json` (los dos gemelos dan la misma salida)
      y aplicarla en `app/api/rag_query.py` antes de delegar en `EvidenceQueryPort` (sin editar el modelo
      generado). Si el LLM falso o los adapters falsos necesitan registrar prompt o consulta, extenderlos y
      mantener verde su test de contrato. Tests 3.1 en verde; commit `feat(L1D-306)` · **TDD estricto**
      `[US-250 AC-2, AC-4, AC-5]`
- [x] 3.3 Suite de `rag-orchestrator` en verde y verificación del proveedor de `/rag/query` · **verificación**
- [x] 3.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento,
      tests en verde antes y después, commit refactor(L1D-306)

## 4. frontend

- [ ] 4.1 Test del AC primero, en rojo: «envía la pregunta en NFC cuando el oncólogo pega la de la Demo 4 en
      NFD [US-250 AC-1]» y «no muestra el error de máximo y envía 2000 caracteres NFC cuando el NFD supera
      2000 [US-250 AC-3]» · Vitest + Testing Library + MSW desde `contracts/examples/` que registra el cuerpo;
      commit `test(L1D-306)` · **test del AC primero**
- [ ] 4.2 `reglas-del-formulario.ts` (longitud y contador) y `solicitar-analisis.ts` (cuerpo) usan
      `esquemaPreguntaNormalizada` de `packages/clinical-language`; el campo conserva el texto pegado. Tests
      4.1 y los existentes del panel (`panel-estados-s3.test.tsx`, máximo 2000) en verde; commit
      `feat(L1D-306)` · **test del AC primero**
- [ ] 4.3 Sin loop visual: el change no cambia la UI (`docs/ux/S5/pantallas-s5.md`, US-250 sin UI propia);
      se justifica en el PR · **exento**
- [ ] 4.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento,
      tests en verde antes y después, commit refactor(L1D-306)

## 5. evaluación

- [ ] 5.1 Confirmar que el diff no toca modelo, plantilla de prompt, umbral, catálogo ni corpus (job
      `eval-required` en verde sin pedir `run-ai-eval`); la reproducibilidad la mide US-252 (S6) · **exento**

## 6. cierre

- [x] 6.1 Buscar `normalize('NFC')` y `unicodedata.normalize("NFC"` en el árbol y confirmar que la pregunta
      tiene un solo dueño por lenguaje (design.md §Dependencias) · **verificación**
- [ ] 6.2 `openspec validate l1d-306-pregunta-nfc --strict`, tests de los tres contextos en verde,
      `contracts:verify-provider` en verde · **verificación**
