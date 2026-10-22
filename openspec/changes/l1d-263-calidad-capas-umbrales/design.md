# Design — l1d-263-calidad-capas-umbrales

## Contexto

Ya existen `eslint.config.js` (raíz, `npm run lint` con `--max-warnings 0`), el job `quality` de `ci.yml`
(lint, formato y `npm run test:quality` con fixtures en `ci/tests/quality/`) y Ruff en
`apps/rag-orchestrator/pyproject.toml`. No existen `quality-thresholds.json`, `.dependency-cruiser.cjs` ni
`.importlinter`.

## Decisiones

**D1 · Umbrales iniciales (AC-4, AC-5).** Se adoptan los valores a calibrar de la historia: `max-lines-per-function`
40 (tests excluidos), `complexity` 10, `C901` max-complexity 10 y `PLR0915` max-statements 50. `web`:
`componentLinesWarn = 100`, `componentLinesError = 150` (decidido 2026-10-09). Se recalibran en la retro del S2
con los hallazgos reales. Viven solo en `quality-thresholds.json` (RN-22).

**D2 · Un solo comando, un solo reporte.** `npm run quality` encadena las cuatro herramientas y no se detiene en
la primera que falla: ejecuta todas y termina con el peor código. `quality:report` normaliza las salidas
(ESLint JSON, dependency-cruiser JSON, Ruff JSON, texto de `import-linter`) al formato común.

**D3 · Alertas frente a errores.** Solo `componentLinesWarn` es alerta (`warn` en ESLint, aparece en `latest.json`,
no falla). `npm run lint` mantiene `--max-warnings 0` fuera de esa regla: la regla de tamaño de componentes
se ejecuta en una pasada aparte que permite *warnings*.

**D4 · Fixtures de PR (test después).** Un archivo que viola cada regla en `ci/tests/quality/` y un test por regla
en `npm run test:quality` que comprueba el código de salida y el mensaje (regla, archivo, valor y umbral), como US-036.

**D5 · Violaciones existentes.** Se corre `npm run quality` sobre `main` antes de activar el job. Lo que viole una regla
se corrige con `refactor(L1D-263)` si son ≤ 2 operaciones por archivo; si no, una excepción por archivo con fecha de
caducidad en la configuración de la herramienta y una historia de deuda en el Markdown.

## Privacidad y ownership

Sin datos. `reports/quality/latest.json` solo contiene rutas, reglas y números; está en `.gitignore`.

## Contratos

Ninguno.

## Riesgos

- Conflictos en `ci.yml` con `l1d-267`, `l1d-277` y `l1d-237`: este change va el último de O6 o se rebasa sobre ellos.

## Excepciones decididas durante la ejecución

- Las 16 excepciones por archivo de `quality-thresholds.json` (14 de `max-lines-per-function`, 2 de `complexity`) son preexistentes del S1 (D5) y caducan el 2026-11-30.
- `analysis-completion.ts` (`crearAnalysisCompletion`, 56 líneas, llegó con #142 / L1D-173) no se registró como excepción: se corrigió con un Extract Method sin cambio de comportamiento (`refactor(L1D-263)`). Si el orquestador prefiere una excepción nueva, requiere su decisión explícita y visibilidad para el usuario.

## Endurecimiento tras el Gate 2 (decisiones y preguntas abiertas)

- **Excepciones:** solo `max-lines-per-function`, `complexity` y `max-lines` (nunca capas ni seguridad), con `historia`, `caduca` real (AAAA-MM-DD) y tope de 90 días desde hoy; `archivo` literal dentro del repo. `eslint-disable` de tamaño o genérico falla (`sin-eslint-disable-de-tamano`). `QUALITY_THRESHOLDS` se rechaza con `CI=true` fuera de Vitest.
- **import-linter:** `.importlinter` ausente, configuración inválida, contratos no nombrados o estado 1 sin contrato roto fallan; ya no existe la rama "pendiente". `dominio-independiente` prohíbe además `app.schemas`, `app.config`, `app.prompts`, `app.bootstrap`, `app.evaluation` y `app.scripts` (el dominio actual sigue en KEPT).
- **Reporte:** `latest.json` incluye `generadoEn` y `commit` y se borra al empezar, para que una herramienta rota no deje uno viejo.
- **Pregunta para el usuario (¿puede un componente importar el SDK `client-web` de clinical-api?):** hoy la regla `componentes-sin-datos` excluye `packages/api-contracts/src/client-web/`, o sea lo permite. Opción A: mantenerlo (los componentes usan el cliente generado del BFF). Opción B: prohibirlo y exigir que los datos lleguen por props o `lib/`. No se cambió.
- **Preguntas del revisor sin cambio:** (1) las excepciones por archivo no tienen un tope medido por función (una excepción apaga la regla en todo el archivo; opción: excepciones por símbolo); (2) Ruff mide también `tests/` de rag-orchestrator (opción: excluirlos como en clinical-api); (3) el dominio puede importar paquetes externos (opción: contrato `forbidden` de externos en `app.domain`).
- **Deuda sin resolver:** avisar de excepciones que no suprimen ningún hallazgo (hoy solo se validan estructura y vigencia).
