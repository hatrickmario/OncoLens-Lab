# Tasks — l1d-248-g-demo-verificacion

> US-142 · L1D-248 · Sprint 5, oleada O4 (cierre). Matriz TDD de `CLAUDE.md`: scripts, CI y E2E de integración del
> sprint → **test después** (el test o el fixture en el mismo PR); la decisión del gate (`decidirResultado`,
> `verificarSoloSintetico`) es lógica pura → unitarios Vitest antes de cablearla. Sin cambio de API (no hay
> `## contratos`), sin modelo, prompt, umbral, catálogo ni corpus (no dispara `eval-required`). Solo datos sintéticos.
> PR individual (D-12). Los pasos del E2E quedan en rojo hasta que su change dependiente esté en `main`.

## clinical-platform

- [x] 1.1 Unitarios Vitest en `scripts/gates/__tests__/` (en rojo con esqueletos `throw new Error('no implementado')`):
      «falla con datos no sintéticos y solo muestra el conteo agregado [US-142 AC-3]», «falla y nombra la variable cuando
      REAL_ANONYMIZED_ENABLED es true [US-142 AC-3]», «no supera el gate y nombra la métrica fuera de meta [US-142 AC-2]»,
      «declara no medida una métrica ausente salvo M-10.1 y M-10.2 [US-142 AC-2]», «lista las excepciones sin contarlas
      como fallo y falla con una sin destino [US-142 AC-4]», «declara la validación clínica como se mide en el piloto
      [US-142 AC-5]», «marca el p95 fuera de meta como insumo de ADR-42 sin bloquear [US-142 AC-7]», «el modo fingido nunca
      declara G-Demo [US-142 AC-6]», «procedencia incompleta no supera el gate [US-142 AC-6]»; commit `test(L1D-248)` ·
      **test del AC primero (lógica pura del gate)**
- [x] 1.2 Implementar `scripts/gates/g-demo/{metricas,solo-sintetico,excepciones,p95,resultado,registro}.mjs` (design D3)
      con las metas leídas de `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml`, sin literales de meta (RN-22);
      extraer `decidirResultado()` como único dueño del veredicto; commit `feat(L1D-248)` · **test después (script)**
- [x] 1.3 Clave aditiva `clinical.patient.por_data_origin` en `apps/clinical-api/prisma/seed/contar.ts` (design D4) con su
      test de integración contra la BD de test (incluye un paciente `real_anonimizado` insertado solo en la BD de test) ·
      **test después (script de datos)**
- [x] 1.4 `scripts/verify-g-demo` (bash fino, `--modo fingido|real`, `--e2e-resultado`, `--reporte-evaluate`,
      `--p95-e2e-s`) + `scripts/gates/g-demo/verificar.mjs`: conteo con el rol de `clinical-api` dentro del contenedor,
      banderas de `docker compose config`, escritura en `docs/gates/` (real) o `reports/gates/` (fingido, ignorado);
      test de humo con fixtures en `scripts/gates/__tests__/verificar.test.mjs` (tiempo máximo explícito de 30 s) que
      comprueba que la salida no contiene filas, correos ni cadenas de conexión · **test después (script)**
- [x] 1.5 `docs/gates/README.md`, `docs/gates/plantilla-G-Demo.md` (resultado, modo, commit, `catalogVersion`,
      `corpusRelease`, modelos, métricas, no medidas, excepciones, validación clínica, p95, dueño, fecha, firma) y
      `docs/gates/g-demo-excepciones.json` (design D6) · **exento (documentación y datos)**
- [x] 1.6 Sección «G-Demo» en el runbook de la Demo 5 (`docs/demo/`): `levantar.sh` → `evaluate` con `s5.yaml` y
      `--p95-e2e-s` del baseline de `l1d-119` → E2E en modo real → `scripts/verify-g-demo --modo real` → PR `docs` con la
      firma · **exento (documentación)**
- [x] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-248)`

## frontend

- [ ] 2.1 Bloque `<!-- g-demo:inicio -->…<!-- g-demo:fin -->` en la guía de la Demo 5 con el paciente del gate y sus
      preguntas (design D1; paciente F-M2, decidido `[S5 resp. 13]`), y helpers `pasoCorreccion`, `pasoVistaDeCaso`,
      `pasoRegistroManual`, `pasoSeguimiento` en `apps/web/e2e/soporte.ts` sin tocar los existentes · **test después
      (E2E)**
- [ ] 2.2 `apps/web/e2e/g-demo.spec.ts`: «el doctor recorre login, ficha con corrección, vista de caso, registro del
      faltante, análisis, Base del análisis con los faltantes como desconocido y 2 seguimientos con citas [US-142 AC-1]» con un `test.step` por paso, aserciones estructurales
      (design D2), orden RN-28 desde los conteos visibles (incluida «Población no comparable» nunca antes de una comparable), consola sin errores, peticiones solo al origen de `web`, y
      adjunto JSON sin PII con resultado por paso, `catalogVersion` y `corpusRelease` del análisis; sin `skip`, `only` ni
      `fixme` (lo comprueba `verificar-e2e-activos.mjs`) · **test después (E2E de integración del sprint)**
- [ ] 2.3 Verificación: `scripts/e2e/ejecutar.sh -- --grep "US-142"` en verde en modo fingido con todos los changes
      dependientes en `main` (⛔ l1d-74, l1d-76, l1d-90, l1d-91, l1d-96, l1d-309, l1d-268, l1d-269, l1d-310) · **test
      después**
- [ ] 2.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-248)`

## evaluación

- [ ] 3.1 DIFERIDA -> D5-28 Corrida real en la máquina de referencia (ai-eval-runner, skill `run-ai-eval`): `npm run evaluate -- --config
      eval/configs/s5.yaml --suite all --p95-e2e-s <p95 del baseline de l1d-119>` con los modelos de ADR-39; reporte en
      `reports/eval/` (⛔ `l1d-246` y `l1d-119` en `main`) · **evaluate**
- [ ] 3.2 DIFERIDA -> D5-28 E2E en modo real (`LLM_PROVIDER=local`) y `scripts/verify-g-demo --modo real` → `docs/gates/G-Demo-<fecha>.md`
      con resultado, procedencia y p95 · **evaluate (corrida registrada)**

## humano

- [ ] H-1 DIFERIDA -> H-1 Revisar y firmar `docs/gates/G-Demo-<fecha>.md` como dueño (usuario, PO) en el PR `docs` del cierre del S5;
      si dice «G-Demo no superado», decidir en `/sprint-close` (recorte o arrastre al S6).

## verificación

- [ ] 4.1 `openspec validate l1d-248-g-demo-verificacion --strict`; Vitest raíz (`scripts/gates/__tests__/`) y de
      `apps/clinical-api` (contador) en verde; E2E `g-demo.spec.ts` en verde en modo fingido; `secret-scan` y `data-scan`
      sobre `docs/gates/`. `contracts:verify-provider` no aplica (sin cambio de API); `run-ai-eval` es la tarea 3.1.
