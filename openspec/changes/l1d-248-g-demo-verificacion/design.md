# Design — l1d-248-g-demo-verificacion

## Context

Ver proposal.md (Por qué). Estado en `main` y en los changes del S5:

- **E2E**: `apps/web/e2e/*.spec.ts` con `soporte.ts` (`iniciarSesion`, `analizar`, `esperarResultado`, `ejemplo`,
  `ID_SEMILLA_A`, `CORREO_DOC1`), lanzados por `scripts/e2e/ejecutar.sh` (Compose propio `oncolens-e2e`, secretos
  temporales, LLM y modelos **fingidos** desde `contracts/examples/`) y por el workflow `.github/workflows/e2e.yml`
  (con `verificar-e2e-activos.mjs`: sin `skip`/`only`/`fixme`). `demo-s4-pares.spec.ts` es el precedente de un E2E que
  lee su verdad de la guía de la demo.
- **Evaluación**: `npm run evaluate` → `app/evaluation/evaluate.py` con `--config`, `--suite` (por defecto
  `SUITE_COMPLETA = "all"`), `--salida` y `--p95-e2e-s`; metas iniciales en
  `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml` (incluye `p95_evidence_analyses_s: {maximo: 15}`), que el
  reporte compara sin modificar (spec `ai-evaluation` «Comparación con las metas iniciales sin modificarlas»).
  `l1d-246` crea la suite `opciones` y `eval/configs/s5.yaml`; `l1d-119` produce el baseline por tipo con el p95 como
  mediana de 3 corridas.
- **Solo sintético**: `levantar.sh` ya cuenta filas con el rol de cada servicio **dentro** de su contenedor
  (`contar-en-proceso.js`, sin superusuario ni cadena de conexión; spec `demo-install`). `clinical-api` lee
  `REAL_ANONYMIZED_ENABLED` / `REAL_IDENTIFIED_ENABLED` (`src/config/index.ts`) y Compose los fija a `false` por defecto
  en el seed y en `clinical-api`.
- **Procedencia**: `AIAnalysisRecord` y el `meta` de la respuesta traen `catalogVersion` y `corpusRelease`; los modelos
  están en la configuración de `rag-orchestrator` (`app/config/modelos.py`, ADR-39).
- No existe `docs/gates/`.

## Goals / Non-Goals

**Goals:** un E2E que recorra la hipótesis de D-5 válido en los dos modos; una verificación ejecutable que junte las
siete comprobaciones de US-142 y escriba un registro reproducible; ninguna lógica de producto nueva.

**Non-Goals:** feedback (S6); recalibrar metas (DEC-07, S6) o p95 (ADR-42); gate de datos reales (US-143); medir VM con
casos reales (FEAT-T5d).

## Decisions

### D1 · Paciente del gate: uno solo, elegido por propiedades, fijado en la guía de la Demo 5

El recorrido usa **un** paciente sintético (FX-G-DEMO) que cumpla: (a) ≥ 1 biomarcador vigente corregible, (b) ≥ 1
evento fechado en la vista de caso, (c) ≥ 1 dato crítico `faltante` cuya acción manual existe en el S5 (D-7:
`Biomarker`/`Diagnosis` → US-111; `ClinicalAttribute`/`PriorTreatment` → US-094), y (d) un par pregunta → respuesta del
modo fingido con ≥ 1 opción y 2 turnos de seguimiento con citas. Paciente: **F-M2** (sin Ki-67, FX-03b-a; lo usan
`l1d-91` y `l1d-96`; Decidido, usuario, 2026-11-03, `[S5 resp. 13]`). El identificador y la pregunta se leen de un bloque JSON
de la guía de la Demo 5 (`<!-- g-demo:inicio -->…<!-- g-demo:fin -->`), como `demo-s4-pares.spec.ts`: una sola fuente
para la demo y el test. *Descartadas:* recorrer varios pacientes (multiplica tiempo y fragilidad del E2E del cierre;
la variedad la cubre `l1d-310` AC-4) y pacientes distintos por paso (el recorrido dejaría de ser «un caso»).

### D2 · Aserciones estructurales, nunca de texto generado

El spec comprueba conteos, presencia de citas y de avisos, el orden RN-28 recalculado desde los conteos que muestra la
UI (comparador puro en el soporte del E2E, mismo criterio que `applicability_order`; no duplica la regla: solo
compara números visibles), y textos **fijos** de la UI (`messages/es.json`). Así el mismo spec corre con el LLM fingido
en la CI y con el real en la demo. Cada paso va en `test.step('<paso>')` para que un fallo nombre el paso.

### D3 · `verify-g-demo`: entrada fina + módulos puros

`scripts/verify-g-demo` (bash, `set -euo pipefail`) solo orquesta: lee el modo (`LLM_PROVIDER`), ejecuta o recibe el
resultado del E2E (`--e2e-resultado <json>`), recibe el reporte de `evaluate` (`--reporte-evaluate <json>`), obtiene el
conteo por `data_origin` y las dos variables, y llama a `node scripts/gates/g-demo/verificar.mjs`. La lógica vive en
módulos `.mjs` con funciones con nombre propio:

- `evaluarMetricas(reporte, metas)` → lista de {métrica, valor, meta, estado: `en_meta | fuera_de_meta | no_medida`,
  validados/no validados}; G-2 y G-14 obligatorias.
- `verificarSoloSintetico(conteoPorOrigen, banderas)` → RN-13.
- `cargarExcepciones(json)` → valida Feature y destino.
- `evaluarP95(p95, meta)` → `en_meta | insumo_adr42 | no_medido` (nunca bloquea).
- `decidirResultado(comprobaciones, modo)` → `superado | no_superado | regresion_fingida` con los motivos.
- `renderizarRegistro(plantilla, datos)` → Markdown.

Un único dueño de la decisión del gate (`decidirResultado`). *Descartada:* todo en bash (sin tests unitarios de la
decisión; el S4 mostró que la lógica en shell se rompe en silencio).

### D4 · Conteo por `data_origin` con el patrón de `levantar.sh`

Se añade al contador del seed (`apps/clinical-api/prisma/seed/contar.ts`, que compila a `contar-en-proceso.js`) una
clave aditiva `clinical.patient.por_data_origin` (`{sintetico: n, real_anonimizado: n, real_identificado: n}`),
ejecutada con el rol de `clinical-api` **dentro** del contenedor. Las banderas se leen de `docker compose config` de
los servicios `clinical-api` y `seed` (solo esas dos claves). Nunca filas ni conexión. *Descartadas:* `psql` desde el
host (exige credenciales fuera del contenedor) y un endpoint nuevo en `clinical-api` (cambio de contrato para un gate).

### D5 · p95 desde el baseline del S5, no medición propia

US-141 no está comprometida en el S5. AC-7 toma el p95 del baseline de `l1d-119` AC-6 (mediana de 3 corridas contra
Compose con los modelos de ADR-39, aplicabilidad y `maxOptions` en configuración), que `evaluate` ya admite como
`--p95-e2e-s`; la meta es `p95_evidence_analyses_s` de `metas-iniciales.yaml`. En modo fingido el p95 se declara «no
medido». Mantiene la estimación en 5 (la historia pedía re-estimar a 8 solo si el S5 medía US-141 aquí).

### D6 · Excepciones como datos versionados

`docs/gates/g-demo-excepciones.json`: `[{id, descripcion, feature, destino, motivo}]` con AC-T1.5, AC-T3.3, CAP-05
(plantillas), CAP-07, CAP-09, CAP-11, agente de CAP-08, resumen del caso (AC-02.5), híbrida y filtros, visor, resolución
de conflictos, supuestos y limitaciones (slicing v2), OCR (E-17, Post-MVP) y feedback T5c (D-5, S6). La validación
clínica (AC-5) va en el mismo fichero con `tipo: "se_mide_en_el_piloto"`.

### D7 · El registro real lo produce el humano en la máquina de referencia

La CI corre el E2E en modo fingido y los tests de los módulos (regresión). El registro `docs/gates/G-Demo-<fecha>.md`
en modo real se genera el día de la Demo 5 con `scripts/verify-g-demo --modo real` tras `levantar.sh` y la corrida de
`evaluate` de `ai-eval-runner`, y lo firma el usuario (PO) en el PR `docs` del cierre. Un registro fingido nunca se
versiona en `docs/gates/` (va a `reports/gates/`, ignorado).

## Privacidad y ownership

- **Fronteras**: el E2E habla solo con `web` (navegador → Route Handlers → `clinical-api` → `rag-orchestrator`); no
  añade rutas ni cruces. El recorrido usa solo pacientes `sintetico` del seed y textos sin PII; las preguntas del
  seguimiento salen de la guía y no contienen identificadores (la desidentificación RN-11 la aplican `l1d-268` y
  ADR-40, no este change).
- `rag-orchestrator` no recibe nada nuevo y sigue sin tocar datos clínicos ni `clinical-minio`.
- **`verify-g-demo`** lee solo agregados (conteos por `data_origin`, métricas) y dos banderas; nunca filas, identidad,
  contraseñas ni cadenas de conexión (RN-14, patrón de `demo-install`). El registro no contiene PII ni secretos y pasa
  por `secret-scan` y `data-scan` en el PR.
- **RN-13**: el gate falla si hay un paciente no sintético o una bandera de datos reales; no sustituye a US-143.
- **Seguridad web**: el change no toca código de `apps/web` fuera de `e2e/`: sin Route Handlers, sin `NEXT_PUBLIC_`
  nuevas, sin cambios de CSP ni cabeceras, sin dependencias nuevas. El E2E comprueba que el navegador solo pide al
  origen de `web`.

## Contratos

Sin diff en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`. Sin ejemplos nuevos: el modo
fingido usa los de `l1d-268` (`rag-follow-up-*`), `l1d-269`, `l1d-246` y `l1d-310`. Proveedor/consumidor sin cambios;
compatible con ADR-26.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus (no dispara `eval-required`). Consume la suite completa con
`s5.yaml`: M-10.1 (G-2), M-10.2 (G-14), M-07.2 y orden RN-28 de la suite `opciones` (`l1d-246`), recall@10, recall es→en,
MRR, fidelidad, precisión de citas, «sin evidencia», p95 (G-5, M-06.2) frente a `metas-iniciales.yaml`. La corrida
real la hace `ai-eval-runner` (skill `run-ai-eval`) en la máquina de referencia.

## Dependencias y colaboradores

- **Nuevos**: `apps/web/e2e/g-demo.spec.ts` (depende de `soporte.ts` y de la guía de la Demo 5);
  `scripts/gates/g-demo/{metricas,solo-sintetico,excepciones,p95,resultado,registro,verificar}.mjs` (puros salvo
  `verificar.mjs`, que lee ficheros y escribe el registro); `scripts/verify-g-demo`; `docs/gates/*`.
- **Modificados**: `apps/web/e2e/soporte.ts` (helpers `pasoCorreccion`, `pasoVistaDeCaso`, `pasoRegistroManual`,
  `pasoSeguimiento`; sin tocar los existentes); `apps/clinical-api/prisma/seed/contar.ts` (clave aditiva D4).
- **Reglas con nombre propio**: `decidirResultado()` (dueña del veredicto), `verificarSoloSintetico()` (RN-13),
  `evaluarMetricas()` (metas sin modificarlas). Las metas se leen de `metas-iniciales.yaml`; ningún literal de meta en
  los módulos (RN-22). El orden RN-28 del E2E reutiliza la definición documentada de `applicability_order` y solo
  compara conteos visibles.
- **Fakes**: ninguno nuevo. El E2E usa el modo fingido existente (`LLM_PROVIDER=fake`, US-034), cuyo contrato ya
  prueban los changes dueños de cada ejemplo.

## Risks / Trade-offs

- **El E2E es el último en verde**: depende de nueve changes. Mitigación: se escribe al inicio de O4 con el esqueleto
  de pasos y se completa paso a paso según se mergean; los módulos de `scripts/gates/` no dependen de nadie.
- **LLM real no determinista**: D2 evita aserciones de texto; aun así, un análisis `sin_evidencia` real haría fallar el
  paso; la pregunta de la guía se elige con evidencia comprobada en el baseline de `l1d-119`.
- **Recorte del sprint**: si US-254 baja a 4 pacientes o US-094 se recorta, D1 permite elegir otro paciente que cumpla
  las propiedades (el faltante debe tener acción en US-111 si US-094 sale).
