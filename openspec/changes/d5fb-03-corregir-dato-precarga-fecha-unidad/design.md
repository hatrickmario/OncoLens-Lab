# Design — d5fb-03-corregir-dato-precarga-fecha-unidad

## Contexto

La corrección en línea (`l1d-309`, variante A de S5-01) vive en `BiomarcadorCorregible` →
`FormularioDeCorreccionDeBiomarcador`. La fila ya tiene el `Biomarker` completo (incluye `performedAt`, `unit`,
`resultType`) y el «hoy» del servidor (`hoy`). El formulario solo toma `id`, `value`, `unit`. Se arregla pasando el dato
completo y precargando; no se reabre ADR-50.

## Decisiones

- **D1 · Qué se precarga** (todos los campos que el formulario ofrece): `value` ← `biomarcador.value`; `unit` ←
  `biomarcador.unit ?? ''`; `performedAt` ← `biomarcador.performedAt`. `referenceRange` no es campo del formulario (fuera
  de alcance). El término (`name`) no es editable (D4 de `l1d-309`).
- **D2 · Fecha sin zona horaria.** `performedAt` es `format: date` (`YYYY-MM-DD`) y `<input type="date">` usa el mismo
  formato: se pasa la cadena tal cual, **sin** `new Date()`/`toISOString()` (evita el corrimiento de un día por zona
  horaria). Si el valor llegara con hora (`YYYY-MM-DDTHH…`), se toman los 10 primeros caracteres. Es la fecha **absoluta**
  del examen: la regla de fechas relativas (`[S5 resp. 11]`) es para lectura (histórico, tablas), no para un control de
  edición.
- **D3 · Validación de fecha.** El control lleva `max={hoy}` (los 10 primeros caracteres del «hoy» del servidor, no el
  reloj del navegador) y, además de la validación nativa, `errorDelCuerpoDeBiomarcador` rechaza una fecha futura con
  `ficha.correccion.errores.fechaFutura` junto al campo. El servidor sigue siendo la autoridad (`422`, `field =
  performedAt`, D5 de `l1d-309`). Una fecha vacía (el usuario la borra) vuelve a «conservar la fecha del examen»: no se
  envía `performedAt`.
- **D4 · Qué se envía.** `performedAt` solo si **difiere** de la fecha original. Razón: el servidor crea siempre un
  `Exam` nuevo `manual_correction` (desviación del Gate 2 de `l1d-309`); enviar la misma fecha no aporta y mancha el
  examen. Omitirla conserva la fecha anterior. `value` siempre; `unit`: no vacía → `unit`; vacía y existía → `null`;
  vacía y no existía → no se envía (regla actual, sin cambio). Se pasa `fechaActual` al helper junto a `unidadActual`.
- **D5 · Unidad opcional, explícita.** Etiqueta «Unidad (opcional)» (nueva clave de `ficha.correccion.formulario`, hoy
  el literal «Unidad» a secas) y, cuando el dato no tiene unidad (cualitativo como RE «Negativo» o cuantitativo sin ella),
  `placeholder="Sin unidad"` y texto de ayuda enlazado con `aria-describedby`: «Déjala vacía si el resultado no lleva
  unidad.» Con unidad (Ki-67 `%`, PSA `ng/mL`) el campo aparece rellenado y, al borrarla, se envía `null`. No se oculta el
  campo para los cualitativos: el oncólogo puede necesitar anotar una unidad que faltaba.
- **D6 · Trazabilidad (RN-08).** El cambio es solo de formulario: «Guardar mi corrección» sigue llamando `POST
  …/biomarkers/{id}/corrections`, que crea la fila `manual_correction` y marca la anterior `reemplazado` (también si venía
  «Por revisar» o «En conflicto»); nada se sobrescribe. El aviso «Los análisis anteriores se hicieron con el valor previo…»
  y el histórico no cambian. Con paciente egresado la acción sigue deshabilitada (RN-17).
- **D7 · Etiqueta de fecha.** Pasa de «Fecha del examen (opcional)» a «Fecha del examen» (ya viene rellena, por lo que
  «opcional» confundía). Si el usuario la vacía se conserva la anterior; no hace falta rotularlo.
- **D8 · Foco y accesibilidad.** Sin cambios de orden de foco; el error de fecha se anuncia en el `aria-live` de
  `CampoDeTexto`. La ayuda de la unidad es texto visible, no solo `placeholder`.
- **Descartado:** (i) enviar siempre `performedAt` (examen duplicado, ver D4); (ii) añadir `GET` del dato para leer la fecha
  (ya viene en `Biomarker`); (iii) ocultar «Unidad» en cualitativos (pierde la posibilidad de anotarla).

## Privacidad y ownership

Sin cambios: el navegador solo habla con `web`; no se toca `rag-orchestrator` ni se añaden datos a *logs* ni a la IA. Las
fechas del examen son dato clínico ya presente en la ficha, no identidad. Solo pacientes sintéticos en fixtures
(FX-253-a; el paciente (f) del seed para el E2E manual). Sin variables `NEXT_PUBLIC_`, sin dependencias nuevas.

## Contratos

**Sin cambio.** `Biomarker.performedAt` (`date`, requerido) y `unit` (`string|null`) y `BiomarkerCorrection.performedAt`
(opcional) y `unit` existen en `apps/clinical-api/openapi.yaml` 1.20.0. No hay oasdiff, regeneración ni versión.
`contract-keeper`: nada que verificar salvo que los ejemplos `biomarker-corrected.json` y el seed traigan `performedAt`.

## Pruebas de aceptación (Testing Library + MSW; sin Route Handler nuevo)

Archivo `apps/web/tests/ui/correccion-con-historico.test.tsx` (ampliar) y test unitario de
`lib/correcciones/cuerpos.ts`; MSW con handlers desde `contracts/examples/`; reloj congelado.

1. Precarga completa con unidad (Ki-67 `20 %`, `2026-10-20`): campos `20`, `%`, `2026-10-20`.
2. RE `Negativo` sin unidad: unidad vacía, «Unidad (opcional)», «Sin unidad» y ayuda.
3. PSA `4,2 ng/mL`: unidad `ng/mL` precargada y se conserva en el cuerpo.
4. Cuerpo: solo `value` cambiado → `{ value }` (sin `performedAt`); fecha cambiada → incluye `performedAt`; unidad borrada →
   `unit: null`.
5. Fecha futura: `max` = hoy; con `2099-01-01` el error aparece junto al campo y no se envía.
6. Dato «Por revisar · En conflicto»: guardar crea la corrección y el histórico muestra el anterior `reemplazado` (RN-08).
7. Fecha del borde (`2026-10-01`, reloj en `UTC-5`): el valor mostrado es `2026-10-01`, sin corrimiento.
8. Regresión: egresado deshabilita la acción; foco vuelve a «Corregir dato» al cerrar con `Esc`.
