# Design — l1d-326-chat-e2e-evaluate

## Context

US-269 cierra FEAT-12: demuestra AC01…AC06 del prompt del chatbot de punta a punta y los mide en `evaluate` (OL-06). Las
capacidades las construyen `l1d-315`…`l1d-325`; aquí no se cambia comportamiento del producto, solo se añaden un E2E, un
dataset, una familia de la suite y ejemplos de contrato para próstata. Lo que ya existe en `main`:

- `apps/rag-orchestrator/app/evaluation/`: runner `evaluate` (US-072) con `composicion_suite.componer_servicio`,
  `fuente_dataset`, `dataset_loader` (rechaza datasets sin `clase: sintetico`), `juez_fidelidad`, `lenguaje_estricto`
  (términos prohibidos), `informe_pii`, `cronometro`, `rotulo` (validada / no validada) y `seguimiento.py` como patrón de
  familia que reutiliza el pipeline de producción con un guion de LLM.
- `apps/web/e2e/` con Playwright contra Compose, `soporte.ts`, `buscar-secretos.ts` y `verificador-de-informe.ts`.
- Seed sintético: pacientes (a), (b), (d), (e) (OL-01, US-254) y `P-CHAT` (FX-12-b, lo crea `l1d-315-conversacion-paciente`;
  aquí solo se consume).
- Escaneo de PII de la CI con `config/pii-allowlist.json`.

## Goals / Non-Goals

**Goals:** E2E AC01…AC06 × {mama, próstata} con LLM fingido; dataset `chat-v1`; familia `chat` de `evaluate` con las
métricas de AC-3…AC-7; rótulo de revisión clínica (AC-8); no fuga verificada en las tres superficies (AC-6).

**Non-Goals:** cambiar nodos, prompts o UI del chat; fijar metas definitivas (DEC-07); revisión clínica efectiva.

## Decisions

1. **Dos pasos en `evaluate`, cada uno en su dueño.** Los faltantes (`gapType`) y la desidentificación son lógica
   determinista de Backend 1; el grafo y los modelos son de Backend 2. El paso 1 (`clinical-api`,
   `eval:chat-preparar`) carga el seed en la BD de test, arma cada `ChatTurnRequest` con el pipeline de producción y
   calcula M-04.1, M-04.2 y la exactitud de `gapType`; el paso 2 (`rag-orchestrator`, familia `chat`) ejecuta el grafo
   en proceso sobre esas peticiones. `npm run evaluate:chat` encadena ambos y combina los agregados.
   *Alternativa descartada:* escribir a mano las peticiones desidentificadas en el dataset — divergirían del seed y de la
   desidentificación real, y la no fuga dejaría de medir el camino de producción.
   *Alternativa descartada:* medir los faltantes en Backend 2 — no tiene acceso a datos clínicos (regla de ownership).
2. **Peticiones intermedias fuera del repo.** El paso 1 escribe en `apps/clinical-api/eval/results/tmp/`; solo
   contienen datos desidentificados de pacientes sintéticos, pero no se versionan para no duplicar el seed. Hoy el
   `.gitignore` raíz solo ignora `apps/rag-orchestrator/eval/results/`, así que este change **añade**
   `apps/clinical-api/eval/results/tmp/` (tarea propia).
3. **Dataset sin literales de identidad.** La pregunta FX-12-d se guarda con el marcador
   `{identidad_sintetica:P-CHAT}`; el paso 1 lo resuelve desde el seed antes de enmascarar. Así el dataset pasa el
   escaneo de PII sin ampliar la *allowlist* (AC-2). Los hechos esperados se referencian por **clave del seed**
   (`P-CHAT.estadio.IIB`, `b.psa.3`), nunca por UUID, y el paso 1 los traduce a los `factRefs` de la petición.
4. **Métricas del caso (AC-3).** Por tipo de cáncer, sobre los turnos con `intent = "caso"` (AC01, AC02):
   proporción de afirmaciones mostradas con soporte NLI (M-02.3; el NLI es el de producción, las afirmaciones las valida
   el grafo) y precisión de enlaces = enlaces de afirmaciones mostradas que apuntan a un hecho esperado / enlaces totales
   (M-02.2 como origen resoluble); M-02.1 se mide como hechos esperados presentes en la respuesta. Las afirmaciones
   omitidas (`omittedClaims`) se cuentan aparte, nunca como fallo de fidelidad.
5. **Términos prohibidos (AC-5)** con `lenguaje_estricto` (el mismo filtro de producción y lista de RN-23) sobre todo el
   texto mostrado de todos los turnos; meta 0 bloqueante en la CI con `chat-fake.yaml` y reportada con modelos locales.
6. **No fuga (AC-6) en tres superficies**, cada una con su test en el contexto dueño:
   - cuerpos hacia `rag-orchestrator`: Supertest + MSW que captura `POST /chat/turn` en `clinical-api`;
   - estado del hilo: Pytest que recorre el estado del `InMemorySaver` tras el turno con la petición del paso 1;
   - *logs*: el E2E recoge los *logs* de `web`, `clinical-api` y `rag-orchestrator` de Compose al final y busca la
     identidad sintética (nombre, documento, fecha de nacimiento absoluta) con `buscar-secretos.ts`; la suite cuenta
     además las apariciones en los *logs* capturados en proceso.
   El reporte publica solo conteos, nunca la identidad.
7. **Latencia (AC-7)**: `cronometro` por turno y por `intent`; p95 en el reporte sin umbral bloqueante; con
   `chat-fake.yaml` el reloj es simulado (determinismo), el p95 real solo sale de `chat-local.yaml`.
8. **Revisión clínica (AC-8)**: `revision_oncologo` obligatorio por caso; `rotulo` marca «validada» solo con
   `aprobado`. El cargador rechaza un caso sin el campo. Los pendientes se listan en el reporte y se registran como deuda
   en `backlog/sprints/S6-cierre.md`.
9. **E2E con LLM fingido.** El modo `LLM_PROVIDER=fake` (US-034) responde desde `contracts/examples/chat-turn-*.json`;
   para próstata se añaden variantes `*-prostata.json` donde falten. Un paso del E2E verifica `intent` (atributo de datos
   del turno que expone el panel de US-267) y los dos avisos de RN-19 con el literal sin punto final (glosario §3). La
   regla de cita o enlace (RN-01, glosario §3) se afirma **solo** sobre los bloques que la exigen: ≥ 1 `factRef` (enlace a
   dato del paciente) en `documentado`, `interpretacion` y `conflicto`, y ≥ 1 cita al corpus en `evidencia`. Los bloques
   `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas y exentos: el E2E no les exige enlace ni cita (si lo
   hiciera, AC03 y AC06 fallarían por diseño).

## Privacidad y ownership

- **web → clinical-api**: solo en el E2E, con sesión opaca de un usuario sintético; sin cambios de código en `web`.
- **clinical-api**: el paso 1 corre contra la BD de **test** con seed sintético; se niega a correr con `REAL_*_ENABLED`
  o entorno `piloto` (RN-13). La identidad solo se lee para resolver el marcador y queda enmascarada antes de escribir la
  petición (RN-10, RN-11).
- **rag-orchestrator**: el paso 2 consume solo peticiones desidentificadas; no accede a datos clínicos ni a la BD de
  `clinical-api`; no persiste el estado del hilo (invariante de US-259).
- **Datos reales → solo modelos locales** (RN-12): `chat-local.yaml` usa la lista cerrada de proveedores locales; sin
  nube. Solo datos sintéticos (RN-14): el manifiesto declara `clase: sintetico`.
- **Reporte**: solo agregados y configuración; nunca textos de preguntas, respuestas ni identidad.

## Contratos

- Sin cambios de esquema en `apps/rag-orchestrator/openapi.yaml` ni en `apps/clinical-api/openapi.yaml`.
- Ejemplos aditivos `contracts/examples/chat-turn-*-prostata.json` (válidos contra `ChatTurnResponse`); los handlers de
  MSW y el LLM falso se construyen desde ellos (US-213). `contracts:check` en verde.

## Evaluación

- Familia nueva `chat` con `chat-fake.yaml` (CI, adaptadores falsos FX-12-e) y `chat-local.yaml` (modelos locales).
- Métricas: exactitud de `intent`; M-02.1, M-02.2, M-02.3 por tipo de cáncer; M-04.1, M-04.2 y exactitud de `gapType`;
  salidas prescriptivas (= 0); apariciones de identidad (= 0); p95 por turno e intención; validadas / no validadas.
- Metas iniciales de referencia: M-02.3 = 100 % de las mostradas, M-04.1 ≥ 0,95, M-04.2 ≥ 0,90 (propuestas del PRD,
  a recalibrar en DEC-07); solo RN-23 = 0 y no fuga = 0 bloquean.
- Reporte de `ai-eval-runner` en el PR (`reports/eval/l1d-326-chat-v1.md`).

## Risks / Trade-offs

- **Dependencia de toda FEAT-12**: entra la última; si un nodo hermano no se mergea, su AC queda como caso fallido
  documentado en el reporte, no se oculta.
- **Selectores del E2E** dependen del panel de US-267: se usan atributos de datos acordados en su change.
- **Corrida con modelos locales lenta**: se agrupa con la corrida nocturna `[S6 resp. 12]`.
