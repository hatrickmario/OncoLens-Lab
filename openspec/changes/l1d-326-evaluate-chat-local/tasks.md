# Tasks — l1d-326-evaluate-chat-local

Residual de L1D-326 (US-269) para el S7 (`[S7 resp. 3]`): cierra D6-50, D6-52 y D6-59. Orden: las secciones 1 a 3 son
**código** y van en la etapa «preparar la medición», **antes** de la corrida base; la sección 4 es **medición** y sus
tareas de corrida real se cierran **solo** con el reporte versionado en `reports/eval/` producido por `run-ai-eval`
(`S7-refinamiento.md` §4), nunca antes. Sin cambios de API: no hay sección `## contratos`. Fuera: E2E de próstata
(D6-49) y métricas de faltantes de AC-4 (D6-51), ambos Post-MVP. Datos solo sintéticos; sin *fallback* a la nube (RN-12).

Decisiones del usuario del 2026-11-22: `[S7 resp. 10]` el chat mide sobre la **ingesta de `l1d-119`**, el mismo corpus
en la corrida base y en la final, declarado en el reporte; `[S7 resp. 11]` se mide con los umbrales **actuales**, leídos
de `Settings`.

## 1. clinical-platform

- [x] 1.0 (test después) **Primera tarea, antes de generar ninguna petición:** `.gitignore` raíz +
      `apps/clinical-api/eval/results/tmp/`. Las peticiones preparadas llevan `identidad` sintética y se escriben en
      disco: ningún comando ni test de este change escribe en esa ruta antes de este commit (los tests usan un
      directorio temporal del SO inyectado). Verificación: `git check-ignore apps/clinical-api/eval/results/tmp/x.json`
      sale con 0. Commit `chore(L1D-326)`.
- [x] 1.1 (TDD estricto) Test de aceptación en rojo: «escribe una petición que cumple ChatTurnRequest por cada caso y
      control, con los hechos esperados traducidos a factRefs de esa petición [US-269 AC-3]» · integración (PostgreSQL
      real de test con el seed sintético, vía `scripts/test-integration.sh`; directorio de salida temporal inyectado;
      valida `peticion` con el schema Zod generado del contrato de `rag-orchestrator`). Esqueleto de
      `src/evaluacion/chat/preparar-peticiones.ts` con `throw new Error('no implementado')`. Commit `test(L1D-326)`.
- [x] 1.2 (TDD estricto) Test de aceptación en rojo: «resuelve el marcador de identidad y la petición de
      CHAT-AC01-MAMA-PII no lleva nombre, documento ni fecha de nacimiento de P-CHAT, ni el marcador sin resolver
      [US-269 AC-6]» · integración; lee la identidad sintética de `prisma/seed/pacientes/chat.ts` (sin literales
      nuevos); comprueba también que el `pseudoPatientId` no se repite entre casos (RN-11). Commit `test(L1D-326)`.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: «termina con código distinto de 0 sin abrir las claves de
      identidad ni escribir peticiones cuando REAL_*_ENABLED o el entorno es piloto [RN-13]» y «nombra el caso y la
      clave y no deja peticiones parciales cuando el seed no tiene el paciente o el hecho [US-269 AC-3]» · integración.
      La guarda exige **además** la BD de test con datos sintéticos, no solo `APP_ENV` en `SEED_ALLOWED_ENVS`: «termina
      con código distinto de 0 sin abrir las claves de identidad cuando la base no es la de test o contiene un paciente
      que no es del seed sintético [RN-13]». Commit `test(L1D-326)`.
- [x] 1.3b (TDD estricto) Test de aceptación en rojo: «las claves de hechosPorClave son las claves semánticas de
      hechos_esperados y el archivo no contiene ningún identificador de recurso de Backend 1 ni el mapa factRef →
      recurso [US-269 AC-6] [RN-10]» · integración: compara cada archivo preparado con los UUID de los recursos del
      paciente sembrado (paciente, diagnóstico, exámenes, tratamientos, documentos) y exige cero coincidencias; los
      valores de `hechosPorClave` son solo `factRef` presentes en esa petición. Commit `test(L1D-326)`.
- [x] 1.3c (TDD estricto) Test de aceptación en rojo: «borra el residuo de una corrida anterior antes de preparar
      [US-269 AC-6]» · integración: un archivo previo en el directorio de salida (como el que deja un SIGKILL) ya no
      existe tras arrancar, también cuando la guarda de 1.3 se niega a preparar. Commit `test(L1D-326)`.
- [x] 1.4 (TDD estricto) Implementar `src/evaluacion/chat/` y `src/cli/eval-chat-preparar.ts` (patrón de `medir-pii`;
      script `eval:chat-preparar` en `apps/clinical-api/package.json`): servicio de conversación de producción con un
      cliente **capturador** en el puerto de Backend 2 (sin HTTP), un primer turno por caso, guarda del seed
      (`prisma/seed/guarda.ts`) reutilizada y ampliada con la comprobación de BD de test sintética (1.3), limpieza
      del residuo al arrancar (1.3c), reloj y generador de IDs inyectados; **sin** métricas de faltantes
      (D6-51). El mapa `factRef → recurso` no se escribe ni se registra. Unitarios uno a la vez. Commit
      `feat(L1D-326)`. Verificación: 1.1–1.3c en verde.
- [x] 1.5 Extraer `resolverMarcadorDeIdentidad()` (RN-10, RN-11) y `traducirHechosEsperados()` (clave del seed →
      `factRef`) como funciones puras con nombre propio y sus unitarios; el cliente capturador pasa el test de contrato
      del puerto de Backend 2 (mismos errores que el cliente real). Entra con el `feat(L1D-326)` de 1.4.
- [x] 1.6 (test después) `scripts/eval/evaluate-chat.mjs` y script raíz `evaluate:chat` en `package.json`: prepara
      (salvo `--sin-preparar`), llama a `python -m app.evaluation.chat --config … --peticiones <tmp> --salida <dir>`,
      borra `<tmp>` en un `finally` y devuelve el código de la familia; `EVAL_PYTHON` y `EVAL_TIMEOUT_S` (RN-22).
      El `finally` no cubre un SIGKILL: por eso la preparación limpia el residuo al arrancar (1.3c).
      Test en `scripts/eval/__tests__/` que **ejecuta el comando real** con `chat-fake.yaml --sin-preparar` (tiempo
      máximo explícito, no los 5 s por defecto) y otro que comprueba el código 2 sin reporte con `chat-local.yaml
      --sin-preparar`. Commit `feat(L1D-326)` con su test.
- [x] 1.7 (test después) Verificación del `.gitignore` de 1.0 con el comando real: tras
      `npm run eval:chat-preparar`, `git status --porcelain` no lista nada bajo `apps/clinical-api/eval/results/tmp/`
      (aserción dentro de 1.1). La entrada del `.gitignore` ya no se añade aquí: va en 1.0.
- [ ] 1.8 (test después) `scripts/ci/eval-trigger-paths.yaml`: + `data/eval/chat-v1/**`,
      `apps/rag-orchestrator/app/evaluation/chat.py`, los nodos y prompts del chat que hoy no cubren los globs; y el
      workflow de `eval-required` corre `npm run evaluate:chat -- --config
      apps/rag-orchestrator/eval/configs/chat-fake.yaml --sin-preparar` cuando se dispara. Verificación: caso nuevo en
      `scripts/ci/__tests__/evalRequired.test.mjs` (un cambio en `data/eval/chat-v1/casos.yaml` dispara) y
      `evalRequiredWorkflow.test.mjs` en verde.
- [ ] 1.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-326)`.

## 2. ai-services

- [ ] 2.1 (TDD estricto) Test de aceptación en rojo: «declara el reloj y el proveedor y rotula la latencia como
      simulada cuando corre con chat-fake.yaml [US-269 AC-7]» y «publica las métricas de faltantes como null en la
      lista de no medidas, nunca 0.0 [US-269 AC-4]» · integración de la familia (grafo de producción en proceso,
      adapters falsos, reloj simulado). Commit `test(L1D-326)`.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: «termina con código distinto de 0 y no escribe chat.json cuando el
      LLM local no responde [US-269 AC-3]» · integración con el cliente del LLM en su puerto devolviendo el error de
      conexión del adapter real (mismo tipo de error, sin red); una salida inválida del LLM sigue contándose en el caso
      y no aborta. Commit `test(L1D-326)`.
- [ ] 2.3 (TDD estricto) Implementar en `app/evaluation/chat.py`: campo `reloj` y rótulo de latencia, métricas no
      medidas con `null`, y `SuiteAbortada` ante dependencia caída. Sin tocar nodos, prompts ni el grafo. Commit
      `feat(L1D-326)`. Verificación: 2.1 y 2.2 en verde; los tests existentes de `test_chat_evaluate*.py` siguen en
      verde sin cambiar aserciones.
- [ ] 2.4 (test después) Test: «carga las peticiones que deja eval:chat-preparar» con un archivo de ejemplo sintético
      del formato `{peticion, hechosPorClave, identidad}` generado en el propio test (sin identidad literal en el repo);
      cubre el caso con `previo` (AC06 continúa el hilo de AC05 sin rehidratación).
- [ ] 2.5 (test primero: orquestación con adapters falsos) `eval/configs/chat-local.yaml` deja de duplicar los
      umbrales: se quita su bloque `umbrales` (y no se copian los pares del *reranker* ni la expansión contextual); la
      familia los lee de `Settings` (RN-22) y el reporte registra los valores efectivos, que son los actuales
      (`[S7 resp. 11]`). Declara el corpus de la medición: la ingesta de `l1d-119` (`[S7 resp. 10]`). Test: «usa los
      umbrales de Settings y los registra en el reporte cuando la configuración no los declara [US-269 AC-3]». Sin
      valores copiados como constantes en código. Verificación: `cargar_config_suite` y `exigir_proveedor_local` en
      verde; test existente de host de nube en verde; `python -m app.scripts.adr39_measure --check-config`.
- [ ] 2.5b (TDD estricto) Test de aceptación: «publica salidas_prescriptivas y apariciones_de_identidad y termina con
      código distinto de 0 cuando alguno no es 0, con las peticiones preparadas [US-269 AC-5] [US-269 AC-6] [RN-23]
      [RN-10]» y su variante limpia (ambos conteos en 0 y código 0) · integración con adapters falsos y un archivo de
      peticiones sintético generado en el test. `codigo_de_salida()` ya existe: si queda en rojo es un bug de la
      familia, no se relaja la aserción. Commit `test(L1D-326)`.
- [ ] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-326)`.

## 3. evaluación (código; antes de la corrida base)

- [ ] 3.1 (suite `evaluate`) `run-ai-eval` con adapters falsos: `--suite all` da el mismo
      `data/evaluation/baseline.json` y la misma huella de `test-fake.yaml`; `npm run evaluate:chat -- --config
      apps/rag-orchestrator/eval/configs/chat-fake.yaml --sin-preparar` sale con 0.
- [ ] 3.2 (humo) Ensayo de `npm run evaluate:chat` de punta a punta **con adapters falsos y preparación real**
      (BD de test con seed, `chat-fake.yaml` sin `--sin-preparar`): las 15 peticiones preparadas cargan en la familia
      y el directorio temporal queda borrado. Demuestra que la corrida base no fallará por la tubería. Sin cifras.

## 4. evaluación (medición; depende de la corrida base)

> Estas tareas **no** se marcan con el merge del código. Se cierran con `reports/eval/l1d-326-chat-v1.{json,md}`
> versionado por `run-ai-eval`. Ninguna cifra del chat se cita antes en PR, cierre ni Linear.
>
> **Nombre y autoría del reporte (design, decisión 5):** la familia escribe `chat.json` en `--salida` (directorio de
> trabajo, fuera de `reports/eval/`). `ai-eval-runner` lo versiona **sin modificarlo** como
> `reports/eval/l1d-326-chat-v1.json` y escribe `reports/eval/l1d-326-chat-v1.md`, que solo resume los agregados de
> ese JSON. Ningún otro nombre ni otro autor.

- [ ] 4.1 (suite `evaluate`) DIFERIDA -> H-1 (corrida base del S7). `ai-eval-runner` corre `evaluate:chat` con
      `chat-local.yaml` y los modelos locales de ADR-39 tras la ingesta del corpus de `l1d-119` (`[S7 resp. 10]`: es
      el corpus del chat; sin esa ingesta la medición no corre) y con los umbrales actuales (`[S7 resp. 11]`); reporte
      en `reports/eval/l1d-326-chat-v1.{json,md}` con soporte NLI, precisión de enlaces y hechos presentes por tipo de
      cáncer (US-269 AC-3, M-02.1…M-02.3), el corpus medido y los umbrales efectivos. Cierra D6-50 y D6-59.
- [ ] 4.2 (suite `evaluate`) DIFERIDA -> H-1 (misma corrida). El reporte publica el p95 por turno e intención con reloj
      real, sin umbral bloqueante (US-269 AC-7), para la revisión de ADR-51 en el cierre del S7.
- [ ] 4.3 DIFERIDA -> H-1 (misma corrida). Comprobar sobre el reporte: figuran ambos conteos, salidas prescriptivas = 0
      (RN-23) y apariciones de identidad = 0 (RN-10, RN-11), y el comando salió con código 0; rótulo `no_validada` con
      los ids pendientes (D6-53) y faltantes como no medidas (D6-51). Si RN-23 o la no fuga dan ≠ 0 (el comando sale
      con código distinto de 0), es una situación crítica: se pausa y se abre un bug en la historia dueña.
- [ ] 4.4 DIFERIDA -> H-2 (corrida final del S7, pendiente de confirmar por el humano). Repetir `evaluate:chat` con los
      mismos parámetros, el **mismo corpus** (ingesta de `l1d-119`, `[S7 resp. 10]`) y los umbrales actuales
      (`[S7 resp. 11]`), y versionar el reporte de la corrida final como insumo de DEC-07 (L1D-234).

## 5. Verificación

- [ ] 5.1 `openspec validate l1d-326-evaluate-chat-local --strict`; Pytest de `tests/evaluation` y la suite de
      `apps/rag-orchestrator` en verde; Vitest unitario e integración de `clinical-api` en verde; tests de
      `scripts/eval` y `scripts/ci` en verde; `ruff` y `lint-imports` limpios. Sin cambios de API:
      `contracts:verify-provider` no aplica.
- [ ] 5.2 CI del PR en verde (incluidos `data-scan`, `eval-required` e `higiene-proceso`): 0 checks en fallo, 0
      pendientes y 0 alertas antes de pedir el merge.

## humano

- [ ] H-1 DIFERIDA -> H-1: en la corrida base del S7 (`[S7 resp. 2]`), con un solo `ollama serve`
  (`OLLAMA_CONTEXT_LENGTH=8192`), sin swap, `modelos.env` de ADR-39 en el entorno y la BD de test levantada, lanzar la
  medición 4.1–4.3 con `ai-eval-runner` y versionar el reporte en `reports/eval/` (ruta protegida). La ingesta de
  `l1d-119` (8.1) debe haber terminado antes. Bloque literal:

```bash
scripts/setup-secrets.sh --profile test   # si no existe ya
SALIDA="$(mktemp -d)"                      # directorio de trabajo, fuera del repo
npm run evaluate:chat -- \
  --config apps/rag-orchestrator/eval/configs/chat-local.yaml \
  --salida "$SALIDA"
# ai-eval-runner versiona $SALIDA/chat.json como reports/eval/l1d-326-chat-v1.json (sin modificarlo)
# y escribe reports/eval/l1d-326-chat-v1.md con el resumen de esos agregados
```

- [ ] H-2 DIFERIDA -> H-2: decidir si el chat se vuelve a medir en la corrida final (4.4) y, si sí, versionar ese segundo
  reporte en `reports/eval/` con el mismo bloque.
