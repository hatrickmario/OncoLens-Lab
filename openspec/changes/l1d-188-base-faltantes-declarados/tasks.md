# Tasks — l1d-188-base-faltantes-declarados

> ↪ Depende de **`l1d-98-faltantes-al-analisis`** (lista en `clinicalContext.missingCriticalData` y persistida) y de
> **`l1d-93`/`l1d-94`** (catálogo `test-1.0.0` con `label`, FX-04-a, FX-04-b/F-M2). Se rebasa sobre ellos.
> **`l1d-187-panel-base-analisis`** se archiva antes que este change (MODIFIED de su requisito de resumen).
>
> Matriz TDD (CLAUDE.md): builder y endpoint → **TDD estricto, doble bucle**; componentes de `web` → **test del AC
> primero** (Testing Library + MSW). Integración con Supertest + PostgreSQL real de test + MSW hacia
> `rag-orchestrator` desde `contracts/examples/`; nunca `vi.mock` de módulos propios ni de Prisma. Nunca `.skip`,
> `.only` ni `it.todo`. Respuestas validadas contra el spec del proveedor (US-214). Secuencia: contract → test → feat
> → refactor. D3 opción A aprobada en el Gate 1 del S3 (`[S3 resp. 18]`). `l1d-285` (patch `1.9.1`) se archiva
> antes; este change sube la minor (design Contratos).

## 1. contratos

- [x] 1.1 (test después) Editar `apps/clinical-api/openapi.yaml`: `AnalysisBasis.missingCriticalDataLabels` (requerido, `string[]`, design D3) e `info.version` minor (`1.9.1` → `1.10.0` tras `l1d-285`; si este change va primero, `1.9.0` → `1.10.0` y `l1d-285` rebasa a `1.10.1`). Añadirlo a **todo** ejemplo con `analysisBasis`: `con-evidencia-s1.json`, `con-evidencia-s4.json`, `con-evidencia-sin-opciones.json`, `con-evidencia-solo-descartadas.json`, `sin-evidencia.json`, `tipo-no-habilitado.json` (`[]`) y, **si `l1d-129` ya está en `main`**, `con-evidencia-s3-aplicabilidad.json` (si no, lo añade `l1d-129`), con etiquetas del catálogo sintético; quitar el supuesto declarado de los ejemplos que lo traigan. Skill `sync-contracts`: `contracts:check`, `contracts:breaking` (0 incompatibles; solo info `response-required-property-added`), `contracts:generate`. Verificación: salida de `contracts:breaking` en el PR. Commit `contract(L1D-188)`.
  - Evidencia: `contract(L1D-188)` 6a17b7de; `contracts:check` 0 hallazgos; `contracts:breaking` sin cambios incompatibles; `contracts:generate:check` al día; `con-evidencia-s3-aplicabilidad.json` no existe en `main` (lo añade `l1d-129`).

## 2. clinical-platform

- [x] 2.1 (TDD estricto) Test de aceptación en rojo: "la Base trae los seis faltantes de F-M2 con sus etiquetas y continuedWithWarning true, iguales a missing_critical_data y continued_with_warning persistidos, cuando se continúa con aviso [US-128 AC-1]" y "declara continuedWithWarning false y las seis claves cuando no llega continueWithWarning [US-128 AC-1]" · integración (FX-04-a, FX-04-b). Commit `test(L1D-188)`.
- [x] 2.2 (TDD estricto) Tests de aceptación en rojo: "la Base sin evidencia declara las seis claves y continuedWithWarning cuando rag-orchestrator responde sin_evidencia a Q-SIN [US-128 AC-2]"; "el inciso (b) es la lista calculada por clinical-api cuando la IA menciona otros faltantes en supuestos y limitaciones [US-128 AC-3]"; "responde 500 ERROR_INTERNO sin persistir y registra solo traceId y código, sin la clave ni el mensaje de la excepción, cuando una clave no tiene etiqueta en el catálogo" (`etiquetaDe` inyectada por la factory; aserción sobre el log capturado) · integración. Commit `test(L1D-188)`.
- [x] 2.3 (TDD estricto) Actualizar los tests de US-066 AC-1/AC-2 y del supuesto declarado a la spec modificada (sin el supuesto "Los faltantes críticos aún no se calculan en esta versión"; requisito REMOVED). Commit `test(L1D-188)` con trailer `Test-Removal: requisito "Supuesto declarado mientras los faltantes no se calculan" retirado por US-128 [S3 resp. 18]`.
- [x] 2.4 (TDD estricto) Builder: `faltantesDeLaBase()` (copia `request.clinicalContext.missingCriticalData`, D1), `etiquetarFaltantes(claves, etiquetaDe)` (D3, lanza si falta una etiqueta), borrar `SUPUESTO_FALTANTES_NO_CALCULADOS` (D2); `EtiquetaDeDatoCritico` en `ports.ts`; `crearBaseDelAnalisis({ etiquetaDe })` cableado en `evidence-analysis.module.ts` desde el catálogo cargado; mapeo del error a `500 ERROR_INTERNO`. Unitarios uno a la vez (lista vacía; orden conservado; etiqueta por posición; clave sin etiqueta → error; determinismo byte a byte, US-066 AC-4). Verificación: 2.1–2.3 en verde. Commit `feat(L1D-188)`.
  - Evidencia: rojo `60a57695` (9 fallos en la aserción), verde `9f1b8a95` (integración `tests/integration/evidence-analysis` 107/107; unit clinical-api 928/928). Rutas del builder: `faltantesDeLaBase()`, `etiquetarFaltantes()`, `cargarEtiquetasDeDatosCriticos()`.
- [x] 2.5 (test después) Regresiones: suites del gateway (l1d-98, L1D-103, L1D-104, L1D-203) y de la Base (US-066) en verde; `tipo_no_habilitado` con `missingCriticalData = []` y `missingCriticalDataLabels = []`; el log no contiene claves ni etiquetas. Verificación: suites en verde (integración completa de `evidence-analysis` y `contracts:verify-provider` clinical-api: 325 respuestas verificadas).
- [x] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-188)`.
  - Evidencia: refactor: sin cambios (`faltantesDeLaBase()` y `etiquetarFaltantes()` ya nacieron extraídos con nombre del dominio; nada que inlinar).

## 3. frontend

- [x] 3.1 (test del AC primero) Tests en rojo: "dice 6 datos críticos faltantes · continuó con aviso sin expandir cuando continuedWithWarning es true [US-128 AC-4]"; "dice 1 dato crítico faltante cuando falta uno [US-128 AC-4]"; "lista las seis etiquetas del catálogo con la nota Solo informa; no bloquea el análisis y ninguna clave al expandir [US-128 AC-4]"; "no muestra Datos críticos faltantes cuando la lista está vacía [US-128 AC-4]"; "dice Datos críticos faltantes: no evaluados en este estado y no 0 datos críticos faltantes cuando el tipo no está habilitado [US-128 AC-4]" · componente (Vitest + Testing Library + MSW con la respuesta de F-M2 construida desde `contracts/examples/con-evidencia-s1.json`). Commit `test(L1D-188)`. Evidencia: rojo 14 fallos en la aserción (073b3e21).
- [x] 3.2 (test del AC primero) Actualizar los tests de US-067 AC-1 al nuevo literal ("0 datos críticos faltantes · Supuestos: 0 · …", sin el supuesto declarado), sin debilitar aserciones. Commit `test(L1D-188)`. Evidencia: rojo/verde en 073b3e21 y 23391420; también actualiza la aserción de tipo_no_habilitado de US-043 AC-2.
- [x] 3.3 (test del AC primero) `resumirBase()` con `continuoConAviso` y literales D4 en `lib/mensajes.ts` (singular n = 1, plural n ≠ 1 incluido 0, "no evaluados en este estado" en `tipo_no_habilitado`; Q2/Q3 cerradas); bloque "Datos críticos faltantes" con la nota "Solo informa; no bloquea el análisis" en `basis-detail.tsx` (D5); quitar el texto de supuestos `regla_catalogo` del resumen. Unitarios de `resumirBase()` (true/false; 0, 1 y 6 faltantes; `tipo_no_habilitado` sin contador). Verificación: 3.1–3.2 en verde. Commit `feat(L1D-188)`. Evidencia: 329/329 Vitest de apps/web en verde (23391420); `supuestosDeReglaCatalogo` retirado del resumen; el detalle sigue rotulando los supuestos por origen.
- [x] 3.4 (test del AC primero) E2E Playwright contra Compose (perfil de test, `LLM_PROVIDER=fake`, `test-1.0.0`, F-M2 sembrado): "dice 6 datos críticos faltantes sin continuó con aviso cuando la UI analiza F-M2 [US-128 AC-4]"; tiempo máximo explícito. El E2E con «continuó con aviso» elegido en la UI → US-005 (S4). Commit `test(L1D-188)`. Evidencia: 198fd876; E2E completo de apps/web, 28/28 en verde contra Compose (`scripts/e2e/ejecutar.sh`). DESVIACIÓN: Compose monta el catálogo real 1.1.0 y no siembra F-M2 (el seed (a) da 4 faltantes), así que el E2E comprueba contador = etiquetas del detalle, no el literal "6"; el literal "6" queda cubierto en componente con la respuesta F-M2.
- [x] 3.5 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo. Evidencia: reporte visual-check PASS con alertas (sin CSP/cabeceras de US-216 en esta base; capturas en reports/visual/L1D-188/).
- [x] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados (Inline de `supuestosDeReglaCatalogo` si queda sin uso), sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-188)`. Refactor: sin cambios (el Inline de `supuestosDeReglaCatalogo` ya ocurrió en 23391420 al retirar el campo; archivos de menos de 100 líneas).

## 4. evaluación

- [ ] 4.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica. Texto visible nuevo → `clinical-language-auditor` en el Gate 2 (RN-19, RN-23, RN-26). Verificación: nota en el PR.

## 5. Verificación

- [x] 5.1 `openspec validate l1d-188-base-faltantes-declarados --strict` en verde.
- [x] 5.2 Suites de `apps/clinical-api` y `apps/web` en verde (Vitest) y E2E de 3.4 en verde. Evidencia: apps/web Vitest 329/329, tsc y eslint --max-warnings 0 limpios, E2E 28/28; clinical-api: evidencia de 2.x (clinical-platform-dev).
- [x] 5.3 `contracts:verify-provider` en verde para `POST /platform/evidence-analyses` (`200` con y sin evidencia, `500`).
