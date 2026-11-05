# Proposal — d5fb-03-corregir-dato-precarga-fecha-unidad

## Trazabilidad

Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario) ·
Extiende US-253 (`l1d-309-correccion-con-historico`, corrección en línea S5-01 variante A) · FR-23 · RN-08 (sin reemplazo
silencioso), RN-26 (avisos no bloquean), RN-17 (egresado), RN-23 (textos nuevos) · NFR-12 (accesibilidad) ·
`docs/ux/S5/pantallas-s5.md` S5-01 · Ficha del paciente sintético (f) `380dd24c-0458-55f7-bd22-23b87d965c86`.

## Por qué

En «Biomarcadores recientes» de la ficha, el botón «Corregir dato» (Ki-67 `20 %`, RE `Negativo`, ambos «Carga inicial ·
Por revisar», RE además «En conflicto») abre un formulario que solo precarga el **valor**: la **fecha del examen** queda
vacía y la **unidad** queda vacía sin decir que es opcional. Palabras del usuario: «no me carga la fecha ni la Unidad;
debería cargar al menos la fecha. Si la Unidad es opcional, debe ser mencionada.»

Causa en el código (`apps/web/components/molecules/formulario-de-correccion-de-biomarcador.tsx`): el campo `performedAt`
no recibe `defaultValue`; el componente solo recibe `Pick<Biomarker, 'id' | 'value' | 'unit'>` aunque
`Biomarker.performedAt` ya viene en la ficha. La unidad sí se precarga si existe (`defaultValue={unit ?? ''}`), pero un
dato cualitativo como RE no tiene unidad y el campo no dice «opcional» (la etiqueta «Unidad (opcional)» existe solo en
`registroManual`, no en `ficha.correccion.formulario`). La fecha se rotula «(opcional)» aunque debería verse siempre.

## Qué cambia

- **`apps/web` · UI (frontend):** `FormularioDeCorreccionDeBiomarcador` precarga **valor, unidad y fecha del examen**
  (`performedAt`, `YYYY-MM-DD`, sin conversión de zona horaria) desde el `Biomarker` que ya recibe la fila. La etiqueta
  de unidad pasa a «Unidad (opcional)» con marcador «Sin unidad» cuando está vacía; la fecha se rotula «Fecha del examen»
  y no puede ser posterior a hoy (`max` = «hoy» del servidor que ya llega a la fila).
- **`apps/web` · cuerpo de la corrección:** `cuerpoDeCorreccionDeBiomarcador` envía `performedAt` solo si el oncólogo
  lo **cambió** (un valor sin tocar no genera un `Exam` de corrección con la misma fecha por accidente); la unidad
  mantiene su regla actual (vacía = no enviar o `null` si existía).
- **Textos** en `apps/web/messages/es.json` (`ficha.correccion.formulario.*`), sin términos prohibidos (RN-23).
- **Sin cambio de contrato:** `Biomarker.performedAt`/`unit` y `BiomarkerCorrection.performedAt`/`unit` ya existen en
  `apps/clinical-api/openapi.yaml` 1.20.0. No hay versión nueva, ni `packages/api-contracts`, ni ejemplos nuevos.
- **Sin cambio en `clinical-api`:** la regla de corrección (ADR-50, `human-control`) no cambia; una corrección sobre un
  dato «Por revisar» o «En conflicto» sigue creando una fila `manual_correction` y dejando la anterior `reemplazado`
  (RN-08), con el histórico desplegable.

## Capacidades

- `human-control` (MODIFIED): requisito «Corrección en línea con histórico desplegable en la ficha» (precarga de valor,
  unidad y fecha; unidad opcional indicada; fecha no futura).

## Bounded contexts

- **frontend** únicamente (formulario, helper de cuerpo, textos). Sin clinical-platform ni contratos ni ai-services.

## Dependencias

- Ninguna bloqueante: `l1d-309` ya está archivado y en `main`.
- 🔗 Cadena de versiones del `openapi.yaml`: este change **no** la toca.

## Fuera de alcance

- Editar o precargar `referenceRange` (existe en `BiomarkerCorrection` y en `Biomarker`, pero el formulario no lo ofrece
  hoy): se propone aparte si el usuario lo pide.
- Corrección de notas clínicas y de diagnóstico (no mencionadas en el feedback).
- Deshabilitar «Guardar» cuando no hay cambios (hoy el servidor responde `422` y el formulario lo pinta): mejora aparte.
- Cambiar el `review_status` o resolver el conflicto de RE (otra historia de revisión/conflictos).
