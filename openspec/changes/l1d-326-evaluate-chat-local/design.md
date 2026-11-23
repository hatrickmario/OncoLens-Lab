# Design — l1d-326-evaluate-chat-local

## Context

Residual de US-269 para el S7 (`[S7 resp. 3]`): que el chat se pueda medir con los modelos locales y medirlo en la
corrida base. Lo que ya está en `main` (change archivado `2026-11-13-l1d-326-chat-e2e-evaluate`):

- `apps/rag-orchestrator/app/evaluation/chat.py`: familia `chat` sobre el grafo de producción en proceso. CLI
  `python -m app.evaluation.chat --config … [--peticiones <dir>] [--salida <dir>]`. Con `proveedor: local` y sin
  `--peticiones` termina con código 2 («con modelos locales hacen falta --peticiones de eval:chat-preparar»).
  `cargar_peticiones` ya define el formato de entrada: una `<id>.json` por caso con `peticion`, `hechosPorClave` e
  `identidad`. `_puertos_de` ya aplica `exigir_proveedor_local` y `exigir_adapters_locales` antes de cargar pesos.
- `eval/configs/chat-fake.yaml` y `chat-local.yaml` (escrita el 2026-11-07, antes de los cambios de defaults de L1D-333).
- `data/eval/chat-v1/` (13 casos y 2 controles, `clase: sintetico`).
- `apps/clinical-api/src/modules/evidence-analysis/conversation/` (`conversation.service.ts`, `hechos-del-caso.ts`):
  arma el `ChatTurnRequest` desidentificado y numera los `factRefs`; el mapa `factRef → recurso` no sale de Backend 1.
- `apps/clinical-api/src/cli/medir-pii.ts` + `src/evaluacion/pii/`: patrón de un comando de evaluación en Backend 1
  (raíz de composición fina, lógica en `src/evaluacion/`, reloj y salidas inyectados).

Lo que **no** existe: `eval:chat-preparar`, `evaluate:chat`, `apps/clinical-api/eval/` y los disparadores del chat en
`scripts/ci/eval-trigger-paths.yaml`.

## Goals / Non-Goals

**Goals:** preparación de peticiones con el pipeline de producción; comando único `evaluate:chat`; corrida real en la
corrida base con reporte versionado (AC-3, AC-7); cierre de D6-50, D6-52 y D6-59.

**Non-Goals:** métricas de faltantes (AC-4, D6-51); E2E de próstata (D6-49); cambios de nodos, prompts, umbrales o UI;
metas definitivas (DEC-07); revisión clínica (D6-53).

## Decisions

1. **La preparación vive en `clinical-api` y se reduce a armar peticiones.** El `ChatTurnRequest` desidentificado solo lo
   puede construir Backend 1 (regla de ownership). El alcance es el mínimo que desbloquea `chat-local`: no calcula
   M-04.x ni `gapType`. *Descartadas:* escribir las peticiones a mano en el dataset (divergen del seed y la no fuga deja
   de medir el camino de producción); usar con modelos locales los ejemplos del contrato (medirían casos de juguete, no
   los pacientes sembrados; es justo la limitación de D6-50).
2. **Ubicación y forma: patrón de `medir-pii`.** `src/cli/eval-chat-preparar.ts` es la raíz de composición;
   `src/evaluacion/chat/` aloja `prepararPeticiones()` (lee el dataset, itera casos, escribe) y dos reglas con nombre
   propio: `resolverMarcadorDeIdentidad()` (marcador → identidad del seed, antes de enmascarar) y
   `traducirHechosEsperados()` (clave del seed → `factRef` de esa petición). El change archivado hablaba de
   `apps/clinical-api/scripts/`, que no existe; se sigue la estructura real.
3. **El pipeline de producción se ejerce por su puerto, no por una copia.** `prepararPeticiones()` usa el servicio de
   conversación real con un cliente de Backend 2 **capturador** en el puerto de `ports.ts` (el borde arquitectónico del
   HTTP saliente): guarda el cuerpo que saldría hacia `/chat/turn` y no llama a nadie. No se duplica la construcción del
   contexto ni la desidentificación; si el servicio no permite obtener la petición sin persistir un turno, la corrida
   usa la BD de test desechable y no deja nada fuera de ella.
4. **Cada caso se prepara como primer turno de su propia conversación.** Los casos con `previo` (AC06 sigue a AC05) los
   encadena ya la familia `chat` en el mismo hilo en proceso (`_hilo_de`, `_en_el_hilo`), que descarta la rehidratación
   en los turnos siguientes. Así la preparación no necesita una respuesta del LLM para el turno anterior.
5. **`evaluate:chat` es un script raíz delgado** (`scripts/eval/evaluate-chat.mjs`, hermano de `evaluate.mjs`, reutiliza
   `python.mjs`): 1) `eval:chat-preparar` (salvo `--sin-preparar`); 2) `python -m app.evaluation.chat --config …
   --peticiones <tmp> --salida <dir>`; 3) borra `<tmp>` en un `finally`. Devuelve el código de la familia. No interpreta
   el YAML: quien decide si hacen falta peticiones es la familia (código 2). Como AC-4 queda fuera, **no hay paso de
   combinación de agregados**: el reporte es el JSON de la familia; la combinación llega con D6-51.
   **Nombre y autoría del reporte:** la familia escribe `chat.json` en `--salida`, que es un directorio de trabajo
   fuera de `reports/eval/`. `ai-eval-runner` (skill `run-ai-eval`) lo versiona sin modificarlo como
   `reports/eval/l1d-326-chat-v1.json` y escribe `reports/eval/l1d-326-chat-v1.md`, que solo resume los agregados de
   ese JSON; ni el script ni la familia generan el `.md`. El código de salida es el de la familia: distinto de 0 si
   las salidas prescriptivas o las apariciones de identidad no son 0 (`codigo_de_salida()`, ya en `main`), con ambos
   conteos escritos en el reporte.
6. **Peticiones temporales fuera del repo y efímeras.** `apps/clinical-api/eval/results/tmp/` entra al `.gitignore`
   en la **primera tarea** (1.0), antes de que ningún comando genere una petición, y se borra al terminar. Como un
   SIGKILL se salta el `finally` y deja el directorio, la preparación **borra el residuo al arrancar**, antes de la
   guarda y de escribir nada. El campo `identidad` de cada archivo contiene textos de identidad **sintética** (solo
   para contarlos); nunca se copia al reporte ni a `reports/eval/`. *Descartada:* el directorio temporal del SO como
   salida por defecto (evita el `.gitignore`, pero el residuo de un SIGKILL quedaría fuera del alcance de la limpieza
   al arrancar); los tests sí inyectan un directorio temporal del SO.
7. **Ajustes de la familia `chat`, sin tocar el grafo.** (a) El reporte declara `reloj` (`real`/`simulado`) junto a
   `proveedor`; (b) añade las métricas de faltantes con valor `null` y la lista de no medidas (`null` ≠ `0.0`); (c) un
   fallo de conexión con el LLM local sale como `SuiteAbortada` (código ≠ 0, sin `chat.json`), distinto de una salida
   inválida del LLM, que se sigue contando en el caso; (d) `chat-local.yaml` se alinea con los defaults vigentes de
   `Settings` (p. ej., `RERANKER_MAX_PAIRS` y la expansión contextual de L1D-333) y con el corpus de la medición.
   Los umbrales **se leen de `Settings`** y no se duplican en el YAML (RN-22): se quita el bloque `umbrales` de
   `chat-local.yaml` y el reporte registra los valores efectivos, que son los actuales (`[S7 resp. 11]`).
8. **La medición no es una tarea de código.** Las tareas de la sección `## evaluación` que dependen de la corrida base
   se cierran **solo** con el reporte versionado en `reports/eval/` producido por `run-ai-eval`; hasta entonces quedan
   abiertas y diferidas a `H-1`. Ningún artefacto (PR, cierre, Linear) cita cifras del chat antes.
9. **`hechosPorClave` lleva claves semánticas, no identificadores de recurso.** Lo único que baja a Backend 2 además
   de la petición desidentificada es `clave semántica de hechos_esperados → factRef` (el número de hecho de esa
   petición). Las claves son las del dataset `chat-v1`, no UUID de paciente, diagnóstico, examen, tratamiento ni
   documento. El mapa `factRef → recurso` **no sale de Backend 1**: no se escribe en el archivo ni en *logs*. Lo prueba
   el test de 1.3b.
10. **La guarda exige BD de test sintética.** Además de `assertSeedPermitido` (`REAL_*_ENABLED`, `piloto`, `APP_ENV` en
    `SEED_ALLOWED_ENVS`), la preparación comprueba, antes de abrir las claves de identidad, que la base es la de test
    y que solo contiene pacientes del seed sintético; si no, termina con código distinto de 0. `APP_ENV` por sí solo
    no basta: una base con otros datos puede correr con un entorno permitido.
11. **Corpus y umbrales de la medición (`[S7 resp. 10]`, `[S7 resp. 11]`).** El chat mide sobre la ingesta de
    `l1d-119`, el mismo corpus en la corrida base y en la final, y el reporte lo declara. Corre con los umbrales
    actuales; los calibrados de `l1d-119` solo entran en la final como un brazo propio de ese change.

12. **Implementación de `clinical-platform` (decisiones no cubiertas arriba).**
    - **Cómo se obtiene `factRef → recurso` sin escribirlo.** El capturador responde con un bloque `documentado` por hecho de la
      petición; el servicio de producción valida y persiste ese turno (BD de test desechable, decisión 3) y devuelve sus
      `dataLinks` (`factRef`, `resourceId`). `traducirHechosEsperados()` casa esos ids con los del seed y solo escribe clave
      semántica → `factRef`. *Descartadas:* (a) reconstruir la numeración de `factRef` en la preparación (duplica
      `construirHechosDelCaso` y se desincroniza); (b) exportar el mapa interno del servicio (la regla del mapa que no sale de
      Backend 1 lo prohíbe y exige tocar `evidence-analysis`, fuera del alcance).
    - **Clave de hecho.** `<paciente>/<recurso>` admite la clave del dato (`her2`, `diagnostico-1`, `adt`) y la del examen con un
      solo biomarcador (`psa-1`): así están escritas las claves de `chat-v1`. Un examen con varios biomarcadores sin clave de
      biomarcador es ambiguo y se trata como hecho inexistente.
    - **Controles.** No nombran paciente: toman el del primer caso del mismo tipo de cáncer (mama → `paciente-a`, próstata →
      `paciente-b`). *Descartada:* añadir `paciente` a los controles (cambia `data/eval/chat-v1/`, que este change no toca).
    - **Guarda de base (decisión 10).** «Base de test sintética» = tiene pacientes, todos `sintetico` y todos del seed
      (`PACIENTES_SEMILLA` + `P-CHAT`); si no, `BaseNoSinteticaError` antes de abrir las claves. *Descartada:* comparar el
      nombre de la base con un prefijo de test (la base del seed de Compose se llama `oncolens` en cualquier entorno).
    - **Composición.** `componerConversacion` de `evidence-analysis.module.ts` no se exporta y ese módulo queda fuera del
      alcance: `src/evaluacion/chat/composicion.ts` cablea `crearConversationService` con las mismas piezas exportadas y lo
      comparten el proceso real y los tests (una sola composición). *Pendiente de decidir:* exportar `componerConversacion` y
      reutilizarla (quita ~30 líneas duplicadas).
    - **Conexión desde el host.** El PostgreSQL de Compose solo certifica el nombre `postgres`: la preparación admite
      `EVAL_CHAT_DB_TLS_SERVERNAME` (RN-22) con TLS verificado contra la CA, y `entornoDelStackDeTest()` completa conexión y
      rutas de secretos del stack de test. `APP_ENV` nunca se completa (RN-13). *Descartada:* `rejectUnauthorized: false`.
    - **Seudónimo y logs.** El servicio real usa el seudónimo aleatorio por consulta; el comando no registra nada (registrador
      nulo) y su mensaje de fallo nombra variable, caso o clave, o la clase del error, nunca su texto.

13. **Implementación de `ai-services` (decisiones no cubiertas arriba).**
    - **Umbrales de `Settings` sin valor en código.** `Settings` no tiene valores por defecto para `RELEVANCE_THRESHOLD`,
      `NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K` ni `RERANK_TOP_N` (RN-22): «leer de `Settings`» es leer el entorno. Con
      `umbrales` ausente del YAML, `cargar_config_suite(ruta, entorno)` los resuelve con `Settings` (rango validado), los
      mete en el texto hasheado (cambiar uno cambia la huella) y, si falta o es inválida alguna variable, lanza
      `ConfigInvalida` nombrando la variable, nunca el valor (la familia sale con código 2). El bloque `umbrales` presente
      en un YAML sigue mandando (las demás configuraciones no cambian). Consecuencia: la corrida base necesita esas cuatro
      variables en el entorno; el bloque literal de H-1 las exporta con los valores del Compose. Los cuatro tests de
      `test_chat_evaluate_unitarios.py` que cargaban `chat-local.yaml` sin entorno reciben ahora uno (solo su preparación;
      las aserciones no cambian). *Descartadas:* (a) mantener el bloque en `chat-local.yaml` (es el drift que cierra
      D6-52: 40 frente a 30 candidatos); (b) un valor por defecto en código (rompe RN-22); (c) leer `os.environ` dentro del
      cargador (el único punto del entorno es `entorno_del_proceso`).
    - **Corpus declarado frente a corpus cargado.** La familia compone el chat **en proceso** sobre el corpus en memoria del
      dataset (`data/evaluation/opciones`), no sobre Milvus: no puede medir «la ingesta de `l1d-119`» (`[S7 resp. 10]`) por sí
      sola. `chat-local.yaml` declara `corpus.declarado` y el reporte publica `corpus.declarado` y `corpus.cargado` lado a lado
      para que el hallazgo no quede escondido. **Abierto (lo decide el orquestador o el humano antes de 4.1):** o la corrida
      base se acepta sobre el corpus del dataset y se corrige la declaración, o se construye un `FuenteDataset` desde la
      ingesta (cambio mayor, fuera de este alcance).
    - **LLM caído = `SuiteAbortada`.** El grafo traduce el `FalloDelLlm` del adapter real a `LlmLocalNoDisponibleError` (también
      lo hace con un NLI caído); `_turno` lo convierte en `SuiteAbortada` (código 2, sin `chat.json`). Una salida del LLM
      que no valida sigue siendo `LlmSalidaInvalidaError` y cuenta como turno errado. *Descartada:* abortar con cualquier
      excepción (ocultaría un turno defectuoso como «dependencia caída»).
    - **`CHAT-AC01-MAMA-PII` e `intent_correcto: false` (observación del humo).** La causa **no es un defecto del enrutador ni
      del dataset**: `clinical-api` enmascara el nombre como `[NOMBRE]` y la regla de US-259 (`S5 resp. 13`,
      `MARCADORES_DE_IDENTIDAD`) trata cualquier marcador de identidad como «otra persona» → `fuera_de_alcance`, sin LLM. Con
      adapters falsos el ejemplo del contrato se enmascaraba como `[REDACTADO]`, que el enrutador no reconoce, por eso el
      humo anterior sí daba `caso`: el fake no tenía la forma de producción. Alternativas: (1) cambiar el enrutador para que
      reconozca el nombre del propio paciente (decisión de producto de US-259: no se toca sin reportar); (2) cambiar
      `intent: caso` del dataset a `fuera_de_alcance` (rompe la ruta de adapters falsos, que sigue dando `caso`, y contradice
      su `respuesta_esperada`); (3) **elegida:** el caso con marcador de identidad cuya respuesta es `fuera_de_alcance` se
      mide solo por no fuga (AC-6): queda en `por_caso` con `control_de_identidad: true` e `intent_correcto: null` y no entra
      en la exactitud de intención, la latencia por intención ni soporte, enlaces o hechos del tipo de cáncer (con la
      respuesta de rechazo penalizaría `hechos_presentes` de mama por construcción). Una respuesta de otra intención se mide
      como cualquier caso, así que la regla no oculta un enrutado defectuoso. **Pendiente para el humano/DEC:** si el
      producto quiere que «la paciente Fulana» siga en el caso, es un cambio de US-259 con su propia evaluación.
      El fake conserva `[REDACTADO]` (cambiarlo movería las cifras que fijan los tests existentes); el humo con
      preparación real (3.2) sí ejerce la forma de producción.
    - **Reporte.** Nuevos campos aditivos: `reloj`, `umbrales` (con `origen`), `corpus`, `metricas.faltantes` (tres `null`),
      `metricas.no_medidas`, `metricas.latencia.rotulo` (`simulada`/`real`) y `por_caso[].control_de_identidad`. Un test
      inyecta los puertos en `main(..., puertos=...)` para probar el LLM caído sin red.
    - **`eval-required`.** La familia `chat` corre con `chat-fake.yaml --sin-preparar` desde `scripts/ci/eval-required.mjs`
      (`ejecutarFamiliaDelChat`, hermana de la de `opciones`), salida en `<carpeta>/chat`; el resumen publica solo los dos
      conteos; un código distinto de 0 rompe el job (2 si no corre, 1 en otro caso).

## Dependencias y colaboradores

| Módulo | Estado | Depende de |
|---|---|---|
| `apps/clinical-api/src/cli/eval-chat-preparar.ts` | nuevo | `src/evaluacion/chat/`, entorno, reloj y salidas inyectados |
| `src/evaluacion/chat/preparar-peticiones.ts` | nuevo | servicio de conversación por su *factory*; puerto de Backend 2 de `evidence-analysis/ports.ts` (cliente capturador); guarda del seed (`prisma/seed/guarda.ts`) |
| `resolverMarcadorDeIdentidad()`, `traducirHechosEsperados()` | nuevos | datos del seed; sin E/S |
| `scripts/eval/evaluate-chat.mjs` | nuevo | `scripts/eval/python.mjs`; `EVAL_PYTHON`, `EVAL_TIMEOUT_S` (RN-22) |
| `apps/rag-orchestrator/app/evaluation/chat.py` | modificado | puertos de la suite (`PuertosLocales`), `Settings` |
| `eval/configs/chat-local.yaml` | modificado | umbrales leídos de `Settings` (sin bloque `umbrales`), corpus de la ingesta de `l1d-119` |

Reglas que no se duplican: la guarda de datos reales es la del seed (`guarda.ts`); la desidentificación es la del
servicio de conversación; la lista cerrada de proveedores locales es `exigir_proveedor_local`. **Fakes tocados:** el
cliente capturador de Backend 2 implementa el mismo puerto que el cliente HTTP real y pasa su test de contrato (mismos
errores); no se toca ningún fake de `rag-orchestrator`.

## Privacidad y ownership

- **clinical-api:** la preparación corre contra la BD de **test** con seed sintético y se niega con `REAL_*_ENABLED`,
  entorno `piloto` o una base que no sea la de test sintética, antes de abrir las claves de identidad (RN-13). La identidad de `P-CHAT` se lee solo para resolver el
  marcador y sale enmascarada de la petición (RN-10, RN-11); cada petición lleva su propio `pseudoPatientId`.
- **clinical-api → rag-orchestrator:** no hay llamada HTTP; cruza un archivo local con la misma petición desidentificada
  que viajaría a `/chat/turn`, más `hechosPorClave` (claves **semánticas** de `hechos_esperados` → `factRef`, sin
  ningún UUID de recurso; el mapa `factRef → recurso` no sale de Backend 1) e `identidad` sintética para el conteo.
  Vive en un directorio ignorado desde la primera tarea, se borra al terminar y su residuo se limpia al arrancar.
- **rag-orchestrator:** consume solo esas peticiones; no accede a datos clínicos, a la BD de `clinical-api` ni a
  `clinical-minio`; no persiste el estado del hilo.
- **RN-12:** `chat-local.yaml` usa Ollama nativo en `127.0.0.1`; las guardas corren antes de crear el cliente; sin
  *fallback* a la nube. **RN-14:** solo datos sintéticos; el reporte lleva agregados e ids de caso.
- **Logs:** el comando no registra preguntas, respuestas, identidad ni rutas con contenido; solo ids de caso y conteos.
- Sin sesión de usuario ni JWT de servicio: no hay tráfico entre servicios en esta suite.

## Contratos

- **Sin diff** en `apps/rag-orchestrator/openapi.yaml` ni en `apps/clinical-api/openapi.yaml`; sin ejemplos nuevos en
  `contracts/examples/`. Proveedor de `ChatTurnRequest`: `rag-orchestrator`; consumidor: `clinical-api`. Compatible con
  ADR-26 (nada cambia).
- La `peticion` preparada se valida en el test con el schema Zod **generado** del contrato de `rag-orchestrator`
  (`packages/api-contracts`) y, al cargarla, con el modelo Pydantic generado (`ChatTurnRequest.model_validate`).
- El archivo intermedio `{peticion, hechosPorClave, identidad}` es un formato interno de la suite, ya fijado por
  `cargar_peticiones`; no es un contrato HTTP.

## Evaluación

- No cambia modelo, prompt, umbral, catálogo ni corpus de producción. Cambia `eval/configs/chat-local.yaml`, que dispara
  `eval-required`: la CI corre la suite con adapters falsos (`--suite all` sin cambios de huella en `test-fake.yaml`) y
  la familia `chat` con `chat-fake.yaml`.
- **Corrida base (modelos locales, `ai-eval-runner`):** `evaluate:chat` con `chat-local.yaml` → 
  `reports/eval/l1d-326-chat-v1.{json,md}`. Métricas: exactitud de `intent`; por tipo de cáncer, soporte NLI de las
  afirmaciones mostradas (M-02.3), precisión de enlaces (M-02.2) y hechos esperados presentes (M-02.1); salidas
  prescriptivas (= 0, bloquea); apariciones de identidad (= 0, bloquea); p95 por turno e intención (informativo, ADR-51);
  rótulo `no_validada`. Faltantes (M-04.x, `gapType`): `null`, no medidas (D6-51).
- Metas: no se fijan aquí; las decide DEC-07 con el reporte de la corrida final. Este change no adelanta ninguna cifra.

## Risks / Trade-offs

- **El servicio de conversación puede exigir persistir el turno** para armar la petición: se acepta en la BD de test
  desechable (decisión 3). Si obligara a tocar el servicio de producción, el implementador se detiene y lo reporta.
- **Hilo en proceso frente a rehidratación real** (decisión 4): AC06 se mide sin el camino de rehidratación de
  Backend 1; queda anotado como limitación en el reporte.
- **Corpus de los turnos de evidencia · cerrado (`[S7 resp. 10]`):** el chat mide sobre la ingesta de `l1d-119`,
  declarada en el reporte. Si esa ingesta no está lista, la medición no corre (no se mide sobre otro corpus).
- **Una sola medición:** `S7-refinamiento.md` §5 sitúa la medición del chat en la corrida base; repetirla en la corrida
  final (para ver el efecto de US-277…US-279 en los turnos de evidencia) es una pregunta abierta al humano (H-2). Si se
  repite, usa el mismo corpus y los umbrales actuales.
- **Presupuesto de la corrida:** 13 casos y 2 controles con el LLM local; cabe en la carga única de modelos de la
  corrida base junto a las otras suites.
