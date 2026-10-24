# Design — l1d-285-higiene-tests-ci

## Context

US-213a (`l1d-263`) dejó `npm run quality`, `npm run quality:report`, `reports/quality/latest.json`
(`{tool, rule, file, line, symbol, measured, threshold}`), `quality-thresholds.json` como única fuente de umbrales y el job
`quality` de `ci.yml`. La higiene de tests solo existe en el *hook* local `.claude/hooks/pre-commit-gate.sh` (regex sobre los
archivos *staged*). `msw@3.0.3` ya está en `apps/web` y `apps/clinical-api`, `respx==0.23.1` en `rag-orchestrator`, pero no
hay un arnés común que ate los handlers a `contracts/examples/`. El job `integration-rag` (`l1d-277`) ejecuta
`compose up -d --wait --no-build` sin descarga previa: un `503` del registro aborta el `up` y el script lo informa como
salud. `PatientListItem.fullNameMasked` no tiene `pattern` y su ejemplo usa «Prueba Sintética 1» porque la regla AC-17
(`assertExamplesSynthetic.mjs`) solo exime a `nationalIdMasked` (Q-1 de `l1d-202`).

## Goals / Non-Goals

**Goals:** AC-8…AC-13 de US-213 deterministas en la CI y con el mismo reporte; Q-1 resuelto con el menor cambio en el
control de seguridad AC-17.

**Non-Goals:** *mutation testing* (US-185), umbral global o bloqueo por cobertura (el bloqueo en refactor es de la DoD),
PostgreSQL de test (US-038), migración masiva de tests existentes, reintentos de tests.

## Decisions

- **D1 · Higiene en Node con el plugin oficial, no con regex.** `@vitest/eslint-plugin` (`no-focused-tests`,
  `no-disabled-tests` —incluye `it.todo`—, `valid-title`) en el bloque de tests de `eslint.config.js`, nivel `error`, fuera
  del mecanismo de `excepciones` de `quality-thresholds.json`. Descartado: reutilizar la regex del *hook* (no entiende AST;
  falsos positivos en strings). **Corrección de diseño (implementación, aprobada por sprint-S3, 2026-10-24):** el plugin
  (1.6.27) no ve `it.todo` ni `fit`; los cubre la regla propia `oncolens/tests-sin-desactivar`
  (`scripts/quality/eslint-rules/tests-sin-desactivar.mjs`), con fixtures y tests.
- **D2 · Higiene en Python con Ruff `PT` + script propio.** Ruff `PT` cubre estilo, no prohíbe `skip`/`xfail`;
  `scripts/quality/check-pytest-hygiene.py` recorre el AST de `tests/**/*.py` (marcadores `skip`, `skipif`, `xfail` y
  llamadas `pytest.skip`/`pytest.xfail`) y emite hallazgos `tests-sin-desactivar` con el formato del reporte. Se invoca desde
  `scripts/quality/quality.mjs` (`higiene-pytest.mjs`). El `pre-commit-gate.sh` se mantiene como primera línea; la CI es la garantía.
  **Adición de implementación (aprobada por sprint-S3, 2026-10-24):** Ruff queda con `select = E4,E7,E9,F,PT` en
  `apps/rag-orchestrator/pyproject.toml` e `ignore = PT001, PT006, PT011, PT018`: son solo de estilo y los tests vigentes
  acumulan **298 hallazgos** en ellas (PT018 268, PT011 22, PT001 5, PT006 3). Deuda con destino: US-232 (calidad, S6); las
  reglas PT restantes (p. ej. PT003) siguen activas y un test lo demuestra. Los fixtures de la higiene de Pytest se escriben en
  un directorio temporal al ejecutar el test, porque `pre-commit-gate.sh` prohíbe commitear `skip`/`xfail` bajo `tests/`.
- **D3 · `check-ac-coverage` como alerta.** Lee `openspec/changes/*/proposal.md` (no `archive/`), extrae `US-xxx` del bloque
  Trazabilidad, toma los AC de la sección `## US-xxx` de `backlog/features/FEAT-*.md` (respetando partes `a`/`b`: para
  US-213b solo AC-8…AC-13 si el proposal lo declara con rango) y busca tags `[US-xxx AC-n]` en tests de Vitest/Playwright y
  `@pytest.mark.ac("US-xxx", n)` en Pytest. Severidad `warn`: el job no falla; el Gate 2 lo trata como Mayor.
- **D4 · `mock-solo-en-bordes` con `no-restricted-syntax`.** **Corrección de diseño (aprobada por sprint-S3, 2026-10-24):** regla propia `oncolens/mock-solo-en-bordes`
  (`scripts/quality/eslint-rules/mock-solo-en-bordes.mjs`) en lugar de `no-restricted-syntax`, que otros bloques ya usan y se
  pisarían; mismo criterio y el mensaje nombra el módulo. Criterio original: selector sobre `CallExpression[callee.object.name='vi'][callee.property.name='mock']`
  cuyo primer argumento literal empieza por `./`, `../`, `@/`, `@oncolens/` o es `@prisma/client`. Si el código vigente lo
  viola en más de dos operaciones de corrección, excepción con caducidad y deuda, como D5 de `l1d-263`.
- **D5 · Arnés de handlers desde los ejemplos.** `packages/test-support/msw/` (workspace npm, solo `devDependency`) exporta
  `handlerDesdeEjemplo(operación, archivoDeEjemplo, { sobrescribir })`, que carga el JSON de `contracts/examples/`, y falla
  (lanza) si `sobrescribir` introduce una clave ausente en el ejemplo. Equivalente Python en
  `apps/rag-orchestrator/tests/support/http.py` sobre `respx`. No se generan handlers del spec en este change: se construyen
  del ejemplo (fuente de los mocks según `CLAUDE.md`).
- **D6 · Cobertura de líneas cambiadas.** `vitest --coverage` (`@vitest/coverage-v8`, LCOV) en `web` y `clinical-api`,
  `pytest-cov` (Cobertura XML) en `rag-orchestrator`, y `diff-cover --compare-branch origin/main --json-report` **(corrección de diseño, aprobada por sprint-S3, 2026-10-24: las
  líneas cambiadas se calculan en Node con `git diff -U0` y LCOV, sin `diff-cover` ni paquete pip nuevo, porque
  `requirements-dev.txt` es de ai-services; `scripts/quality/cobertura.mjs`)**; un
  normalizador en `scripts/quality/` lo vuelca a `latest.json` (`tool: diff-cover`, `measured`, `threshold`). Clave nueva
  `coverage.changedLinesWarn` (propuesta 80) en `quality-thresholds.json`, validada por `umbrales.mjs`. Rutas de alerta como
  lista en la misma clave `coverage.alertPaths` (no literales en el script).
- **D7 · Q-1: exención mínima, solo para la máscara sintética.** En `assertExamplesSynthetic.mjs`, `esMascaraDeNombre(key, value)`:
  solo la clave `fullNameMasked` y solo si el valor cumple `^P\. S\.( \d\.)?$`, es decir, la máscara que `enmascararNombre()`
  produce para «Prueba Sintética [n]» (`"P. S."`, `"P. S. 1."`) **(decidido, usuario, 2026-10-24, `[S3 resp. 16]`)**; cualquier
  otro valor, incluidas unas iniciales reales como `"M. P."`, sigue exigiendo «Prueba Sintética». El `pattern` de
  `PatientListItem.fullNameMasked` en el contrato es el general `^\S\.( \S\.)*$` (forma de toda máscara que emite el
  proveedor); la exención de la regla es deliberadamente más estrecha que el `pattern`. **Este archivo es un control de seguridad (RN-14):
  lo edita la sesión principal o el humano**, con los tests de la regla, antes de que el implementador cambie el ejemplo.
  Riesgo aceptado: unas iniciales no son PII directa; la exención no alcanza a `fullName` ni a ningún otro campo.
- **D8 · Descarga resiliente en `integration-rag`.** Función `descargar_imagenes()` antes de `levantar_servicios_reales()`:
  por servicio de la lista de dependencias (y `milvus-etcd`, `milvus-minio`), `compose pull <servicio>` con hasta
  `INTEGRACION_RAG_PULL_INTENTOS` (3) y espera `INTEGRACION_RAG_PULL_ESPERA_BASE_S × intento` (creciente); al agotar,
  `fallar "no se pudo descargar la imagen de <servicio>"`. El `up` conserva `--no-build` y ningún reintento. etcd pasa a
  `gcr.io/etcd-development/etcd:v3.5.34`. Descartado: `--quiet-pull` con reintento del `up` completo (mezcla descarga y salud,
  que es justo el fallo del PR #189).

## Dependencias y colaboradores

- `eslint.config.js` (bloque de tests) ← `@vitest/eslint-plugin`; regla `no-restricted-syntax` nueva.
- `scripts/quality/quality.mjs` orquesta: ESLint, Ruff, `check-pytest-hygiene.py`, `check-ac-coverage`, `diff-cover`; cada
  uno produce hallazgos por el normalizador existente (`normalizar.mjs`), sin formatos nuevos.
- `scripts/quality/umbrales.mjs` valida `coverage.changedLinesWarn` y `coverage.alertPaths`.
- `packages/test-support/msw/` depende solo de `msw` y de los JSON de `contracts/examples/`; ningún módulo de producción lo importa
  (regla de `dependency-cruiser` `test-support-solo-en-tests`).
- `scripts/ci/integracion-rag-orchestrator.sh` ← función `descargar_imagenes`; el test hermético
  `scripts/ci/__tests__/integracionRag.test.mjs` amplía el `docker` falso con el subcomando `pull` y `STUB_MODO=pull_503_*`.
- Reglas con nombre propio: `esMascaraDeNombre()` (D7, RN-14), `descargar_imagenes()` (D8).

## Privacidad y ownership

- Ningún dato cruza fronteras nuevas: todo es tooling de CI y tests con datos sintéticos. `rag-orchestrator` no gana acceso a
  datos clínicos ni a `clinical-minio`; el contenedor de Pytest de `integration-rag` sigue con los mismos secretos (requisito
  vigente de `ci-pipeline`).
- Los handlers de MSW/`respx` solo leen `contracts/examples/` (sintéticos, verificados por AC-17).
- `fullNameMasked`: las iniciales siguen siendo la única forma del nombre fuera de la ficha (RN-10); la exención D7 no relaja
  el nombre en claro. **`privacy-guardian` revisa D7 y el cambio de imagen de Compose** (registro distinto, misma versión).
- Los reportes de cobertura y de calidad no contienen PII (rutas de archivo y números); `reports/` sigue ignorado por git.
- Sin cambios en `apps/web` de producción: no aplica «Seguridad web» más allá de que la configuración de tests no introduce
  variables `NEXT_PUBLIC_`.

## Contratos

Proveedor: `clinical-api`. Consumidor: `web` (BFF, cliente generado). Diff propuesto de `apps/clinical-api/openapi.yaml`:

```yaml
 PatientListItem:
   properties:
     fullNameMasked:
       type: string
       description: >-
         Iniciales de cada palabra del nombre en mayúscula seguidas de punto y separadas por espacio
         ("L. F. R. P."). El completo solo en la ficha, auditado.
+      pattern: '^\S\.( \S\.)*$'
```

Ejemplo cambiado: `contracts/examples/patient-page-doctor.json` → `"fullNameMasked": "P. S. 1."` (antes «Prueba Sintética 1»).
Compatibilidad: añadir `pattern` a una propiedad de **respuesta** estrecha lo que el proveedor emite y no rompe al consumidor;
`contracts:breaking` (oasdiff) debe confirmarlo y, si lo marca, se registra en `contracts-breaking-excepciones.json` con
justificación (ADR-26). Versión: ni operación ni respuesta ni código nuevos → *patch*, `1.9.0` → `1.9.1` (decidido, usuario,
2026-10-24, `[S3 resp. 16]`; P-1 cerrada). Zod y
tipos se regeneran con `contracts:generate`; nunca a mano.

## Riesgos / Trade-offs

- **Imagen de gcr.io sin `etcdctl` o con otro *entrypoint*:** la imagen oficial de etcd es *distroless* con `etcd` y `etcdctl`
  en `/usr/local/bin`; el *healthcheck* en forma `CMD` y el `command: etcd …` actuales no necesitan *shell*. **Verificación
  explícita (`[S3 resp. 16]`, tarea 2.7):** confirmar que la imagen de gcr.io trae `etcdctl` (el *healthcheck*
  `etcdctl endpoint health` lo usa) antes de cambiar el Compose; además, el job real de la CI del PR y `compose config`.
- **`enmascararNombre()` frente al `pattern`:** con nombre vacío devuelve `''` y con un carácter astral (fuera del BMP)
  devuelve un par sustituto + punto; ninguno de los dos casos está fijado frente al `pattern` `^\S\.( \S\.)*$`
  (`''` no lo cumple; el astral depende del *flag* `u` del validador). Mitigación: casos nuevos en la tarea 1.3
  (`[S3 resp. 16]`) que hacen visible el comportamiento antes de declarar el `pattern`.
- **Fixtures de `web` derivados del ejemplo:** `apps/web/tests/support/pacientes-ui.ts` crea un segundo paciente con
  `fullNameMasked = 'Prueba Sintética 2'`, que dejaría de cumplir el `pattern`; se migra a `'P. S. 2.'` (`[S3 resp. 16]`).
- **El job `quality` se alarga** por la cobertura: se reutilizan las ejecuciones de tests existentes cuando ya generan LCOV;
  si no, se acepta el coste (alerta, no bloquea).
- **Falsos positivos de `check-ac-coverage`** en historias partidas (`a`/`b`): D3 respeta el rango declarado en el proposal.
- **Tests existentes que violan AC-8 o AC-10:** se corrigen en este change si son ≤ 2 operaciones; si no, excepción con
  caducidad e ID de deuda (nunca `.skip`).

## Pendientes de definir

- **P-1 · cerrada (usuario, 2026-10-24, `[S3 resp. 16]`):** añadir el `pattern` es *patch* (`info.version` `1.9.0` → `1.9.1`).
- **P-2 (dueño: Ingeniería · afecta: AC-11):** `coverage.changedLinesWarn = 80` es propuesta a calibrar en la retro del S3.
