# Proposal — l1d-187-panel-base-analisis

## Trazabilidad

L1D-187 · US-067 · FEAT-T2a (L1D-36) · Sprint 2 · Estimación **3** · HU-20 · FR-27 (UI del S1), FR-10 (omitidas
sin texto), NFR-12 (accesibilidad) · RN-03, RN-19, RN-23, RN-26 · AC-T2.1 (resumen visible), AC-T2.3 (UI) ·
OL-04 · US-067 AC-1…AC-5 · Pantalla de referencia **S2-09** (`docs/ux/S2/pantallas-s2.md`) · Refinamiento
`backlog/sprints/S2-refinamiento.md` (DoR ✓; revisión de `clinical-language-auditor` en modo Diseño: PASS).

## Why

La Base del análisis llega en cada respuesta (US-066), pero el panel del S1 no la muestra. El oncólogo necesita ver
de un vistazo cuántos faltantes, supuestos, fuentes no incluidas y afirmaciones omitidas tiene el análisis, la fecha
de corte del corpus y, cuando no hay evidencia, **qué se buscó**, sin leerlo todo (P12).

## What Changes

- **Organismo `AnalysisBasisPanel`** en `apps/web/components/organisms/`, montado en `AnalysisResult` después de las
  opciones y las descartadas y antes del pie, dentro del mismo contenedor anunciado (S2-09):
  - `h3` "Base del análisis" (subsección del resultado cuyo único h2 es "Opciones descritas en la evidencia"; desviación de S2-09).
  - **Resumen siempre visible** (también en `sin_evidencia`): "Faltantes: [n] · Supuestos: [n] · Fuentes no
    incluidas: [lista] · Afirmaciones omitidas: [n]" y la fecha de corte `dd/mm/aaaa`, desde
    `analysisBasis.missingCriticalData.length`, `assumptions.length`, `sourcesNotIncluded[]`, `omittedClaims` y
    `corpusCutoffDate`. El literal del resumen es exactamente "Fuentes no incluidas: NCCN, ESMO" (sin aclaración).
    El resumen muestra además el texto del supuesto declarado de L1D-186 ("Los faltantes críticos aún no se calculan en esta versión").
    > **Nota (Gate 1 del S3, `[S3 resp. 18]`):** este supuesto lo reemplaza `l1d-188-base-faltantes-declarados`
    > (US-128, MODIFIED de "Resumen de la Base visible sin expandir" y REMOVED del supuesto declarado), que se archiva
    > después de este change. Las tareas de este change no cambian.
  - **`tipo_no_habilitado`:** en lugar de "Qué se buscó", "No se consultó el corpus: tipo fuera de alcance".
  - **Control** `<button aria-expanded aria-controls="base-detalle">` "Ver detalle de la Base" ↔ "Ocultar detalle".
  - **Detalle:** "Datos del paciente usados" (`patientDataUsed[]` con `reviewStatus` en texto y el conflicto en
    texto), "Fuentes consultadas" (`sourcesConsulted`: fuentes, "[n] fragmentos recuperados · [m] sobre el umbral"),
    "Fuentes no incluidas" con la aclaración "fuente no incluida; su contenido no se consultó" (sin afirmar la causa, Gate 2), y "Supuestos" /
    "Limitaciones" rotulados por `origin` si existen (`estructural` → "Limitación estructural").
  - **`sin_evidencia`:** el resumen añade "Qué se buscó: fuentes [lista] · filtros [lista o 'ninguno'] · 0
    fragmentos sobre el umbral".
  - **Omitidas:** solo el número; el panel no tiene ningún campo que pueda mostrar el texto (el contrato no lo trae).
- **Funciones puras** en `apps/web/lib/evidence/`: `resumirBase()`, `formatearFechaDeCorte()` (sin desfase de zona
  horaria) y `describirBusqueda()`; textos en `lib/mensajes.ts`.
- **Sin cambios de contrato ni de Route Handler:** `analysisBasis` ya llega por `app/api/evidence-analyses/route.ts`
  (L1D-139) con los nombres de `apps/clinical-api/openapi.yaml`.

## Capabilities

### New Capabilities

- Ninguna propia de UI: el panel es la presentación de `analysis-basis`.

### Modified Capabilities

- `analysis-basis`: **añade** (ADDED) los requisitos de presentación de la Base en el panel. La capacidad la crea el
  change `l1d-186-base-analisis-builder`; si este change se archiva antes, `analysis-basis` nace aquí con estos
  requisitos y L1D-186 añade los suyos (ambos son ADDED, sin solaparse).

## Bounded contexts

- **frontend** (único): `apps/web/components/`, `apps/web/lib/evidence/`, `apps/web/lib/mensajes.ts`,
  `apps/web/tests/ui/`, `apps/web/e2e/`.

## Dependencias

- ↪ **Depende de** `l1d-186-base-analisis-builder` (US-066) para el E2E contra Compose (AC-1, AC-3 con datos reales
  de la Base). Los tests de componente usan respuestas fijas de `contracts/examples/` y no esperan: desarrollo en
  paralelo, **merge después** de L1D-186.
- ↪ Ya en `main`: L1D-139 (Route Handler del análisis), L1D-140 (panel con opciones y citas), L1D-194 (aviso de IA).
- 🔗 `l1d-278-e2e-ci-login-tailwind` (ARR-02, Tailwind v4 + shadcn/ui en `/login`): si mergea antes, el organismo usa los mismos tokens; si
  no, sigue el patrón de estilos vigente del panel (`evidence.module.css`). No bloquea.

## Fuera de alcance

- Bloques de los incisos (b) faltantes con "Continuar con aviso" (US-128), (c)/(g) generados por reglas
  (US-129/US-130) y (h)/(i) (Post-MVP): se reservan sin contenido.
- Cálculo de la Base (L1D-186). Puntaje clínico: ninguno (RN-03).

## Impact

- Código: `apps/web/components/organisms/{analysis-basis-panel.tsx, analysis-result.tsx}`, una molécula de resumen
  si supera el límite de tamaño, `lib/evidence/*`, `lib/mensajes.ts`; tests en `tests/ui/` y `e2e/`.
- Contratos: ninguno. Dependencias npm nuevas: ninguna.
- Evaluación: no toca la IA → sin `evaluate`. Texto visible nuevo → `clinical-language-auditor` en el Gate 2.
