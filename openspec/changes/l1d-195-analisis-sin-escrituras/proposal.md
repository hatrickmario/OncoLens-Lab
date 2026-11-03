# Proposal — l1d-195-analisis-sin-escrituras

## Trazabilidad

L1D-195 · US-070 · FEAT-T3 (L1D-39) · Sprint 5 (oleada O3) · Estimación **2** · HU-03 · AC-T3.2 (dueña) · RN-06 · FR-10 ·
🔗 relacionadas RN-08 (FEAT-03a), RN-09 (FEAT-01c) · US-070 AC-1…AC-4 · Fuente:
`backlog/features/FEAT-T3-control-humano.md` §US-070; sprint: `backlog/sprints/S5-refinamiento.md` §2 (O3, tercera en el
orden de recorte, `[S5 resp. 3]`).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-10-29)** `[S4 resp. 1]`: la historia pasa del S4 al S5.
- **Decidido (usuario, 2026-11-03, refinamiento del S5)** `[S5 resp. 3]`: comprometida en el S5; con la escritura manual
  nueva de US-094 (`l1d-80`), US-110 (`l1d-90`) y US-253 (`l1d-309`), el test de diff de tablas cubre también que el
  análisis **no toca esas filas**.
- **Instrucción de `/sprint-start` (2026-11-03):** el mismo diff cubre la pregunta de seguimiento de US-218
  (`l1d-268-seguimiento-analisis`): la única escritura del análisis es `clinical.ai_analysis_record` y la del seguimiento,
  `clinical.analysis_follow_up`. El AC-3 (sin acciones en la tarjeta) es de UI.
- **Política TDD:** estricta (doble bucle) porque AC-T3.2 es un invariante de dominio; donde el comportamiento ya existe, el
  test de aceptación se ejecuta primero y, si pasa, queda como **caracterización** (patrón `l1d-181` D4, `l1d-126`,
  `us-117b`) con su salida y una mutación comprobada.

## Por qué

El oncólogo pidió que la herramienta no actúe por él (PP-1, P12). Hoy ningún test prueba de forma global que pedir un
análisis deja intactos los datos clínicos: solo existe el recuento de `clinical_event` de US-053 AC-6. En el S5 aparecen
por primera vez escrituras manuales del doctor (registro, corrección con histórico, tratamientos y atributos) y una
segunda ruta de IA (seguimiento); sin un guardia de "diff" de tablas, un cambio futuro podría, por ejemplo, marcar
`verificado` un dato al usarlo en el análisis o registrar una opción como tratamiento sin que nadie lo note.

## Qué cambia

- **`clinical-api` (solo tests y soporte de test):** un ayudante `instantaneaDeTablas()` en `tests/support/` que toma,
  por cada tabla de los schemas `clinical` e `identity`, el conteo de filas y un *hash* de su contenido ordenado por
  clave primaria; y tests de integración (Supertest + PostgreSQL real + MSW hacia `rag-orchestrator` desde
  `contracts/examples/`) que comparan la instantánea antes y después de:
  - un análisis `con_evidencia` sobre el paciente semilla (a) con filas manuales sembradas por los endpoints de
    `l1d-90`, `l1d-80` y `l1d-309` (incluida una fila `reemplazado` con su sucesora `manual_correction`);
  - una pregunta de seguimiento sobre ese análisis (`l1d-268`);
  - una respuesta de `rag-orchestrator` con un campo extra `actions`.
- **Código de producto de `clinical-api`:** ninguno previsto. Si un test de aceptación falla en la aserción (una escritura
  colateral real), la corrección mínima va en `feat(L1D-195)` dentro del módulo `evidence-analysis`.
- **`web`:** test de componente de la tarjeta de opción (`evidence-option-card.tsx`) que recorre sus controles y afirma
  que ninguno registra, aplica ni modifica datos; sin cambios de UI previstos.
- **Sin cambios de contrato** (`openapi.yaml` de ambos backends intactos) ni de esquema.

## Capacidades

- `human-control` (ADDED): el análisis y el seguimiento no escriben datos clínicos; la respuesta interna con campos
  inesperados no persiste nada; la tarjeta de opción no ofrece acciones clínicas.

Ninguna capacidad nueva. `evidence-analysis-gateway` conserva «El análisis no escribe eventos clínicos» (US-053 AC-6) sin
cambios: el requisito nuevo lo generaliza sin duplicarlo.

## Bounded contexts

- `clinical-platform` (tests de integración de `apps/clinical-api`).
- `frontend` (un test de componente en `apps/web`, sin cambios de UI).

## Dependencias

- ⛔ `l1d-90-registro-manual-biomarcador-diagnostico`, `l1d-80-tratamientos-atributos-manuales` y
  `l1d-309-correccion-con-historico` (O2): sus endpoints siembran las filas manuales del AC-1/AC-2.
- ⛔ `l1d-268-seguimiento-analisis` (O1): `POST …/follow-ups` para el escenario de seguimiento.
- ↪ US-053 (gateway y `AIAnalysisRecord`, mergeado) y US-061 (tarjeta de opción, mergeado).
- Recorte: si `/sprint-run` recorta alguno de los cuatro changes bloqueantes, el escenario correspondiente se difiere con
  su ID (`DIFERIDA -> US-xxx`) y el resto de la historia sigue.

## Fuera de alcance

- Vincular una decisión clínica a un análisis (FR-13): FEAT-11b, Post-MVP; siempre la ejecuta el oncólogo.
- Auditoría de accesos (`audit`): S6. Si el S6 añade escrituras de auditoría al análisis, el diff las admite en `audit`,
  que no forma parte de la instantánea (`clinical` + `identity`).
- Avisos de la tarjeta (US-071, US-136) y feedback 1–5 (S6).
