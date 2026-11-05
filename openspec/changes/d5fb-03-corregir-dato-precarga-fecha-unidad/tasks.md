# Tasks — d5fb-03-corregir-dato-precarga-fecha-unidad

> Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario).
> Sin dependencias bloqueantes ni cambio de contrato. Matriz TDD (CLAUDE.md): componentes y helpers de `web` → test del AC
> primero (commit `test` en rojo, luego `feat`); textos → test después. MSW solo en el HTTP saliente, handlers desde
> `contracts/examples/`; nunca `vi.mock` de módulos propios; reloj inyectado; nunca `.skip`/`.only`/`it.todo`.

## 1. frontend

- [x] 1.1 (test del AC primero) Tests en rojo, ampliando `apps/web/tests/ui/correccion-con-historico.test.tsx` y el
  unitario de `lib/correcciones/cuerpos.ts`, según `design.md` §Pruebas: "precarga valor, unidad y fecha del examen de
  Ki-67 [D5 feedback 1]", "indica Unidad (opcional) con Sin unidad y ayuda en RE cualitativo sin unidad", "conserva ng/mL
  y envía null al borrarla", "envía performedAt solo si cambió", "no desplaza la fecha por zona horaria", "rechaza fecha
  futura junto al campo sin enviar", "corregir un dato por revisar y en conflicto deja el anterior reemplazado [RN-08]",
  y regresión de egresado/foco. Esqueleto sin implementación. Commit `test(...)`.
- [x] 1.2 (test del AC primero) Implementar: `FormularioDeCorreccionDeBiomarcador` recibe el `Biomarker` completo
  (`performedAt`, `unit`) y el `hoy`; `BiomarcadorCorregible` se los pasa; `defaultValue` de fecha (10 primeros
  caracteres, sin `Date`), `max={hoy}`; unidad con etiqueta opcional, `placeholder` y ayuda `aria-describedby`;
  `cuerpoDeCorreccionDeBiomarcador(datos, unidadActual, fechaActual)` omite `performedAt` si no cambió;
  `errorDelCuerpoDeBiomarcador` rechaza fecha futura con `errores.fechaFutura` (reloj inyectado). Commit `feat(...)`.
- [x] 1.3 Textos en `apps/web/messages/es.json` (`ficha.correccion.formulario`: `unidad` → «Unidad (opcional)»,
  `sinUnidad`, `ayudaUnidad`, `fecha` → «Fecha del examen»), sin términos prohibidos (RN-23); correr el lint de textos.
- [x] 1.4 Refactor en verde (p. ej. extraer la normalización de la fecha a `lib/correcciones`), tests antes y después,
  sin cambio de comportamiento; la cobertura del módulo no baja. Resultado: refactor sin cambios (el helper `soloElDia` ya nació extraído en `lib/correcciones/cuerpos.ts`; formulario 86 líneas).
- [x] 1.5 `visual-check` (ver el bloque al final) en 375 y 1280 px contra el seed sintético, paciente (f): formulario de Ki-67 y de RE, consola
  sin errores, solo `/api/*` del mismo origen, orden de foco y `Esc`.

## Deuda

- `referenceRange` queda fuera de alcance (decisión del usuario): el formulario no lo precarga ni lo edita; sin L1D.

## 2. cierre

- [ ] 2.1 (local verificado; falta PR y CI) Verificación: `npm test` de `web`, lint y `contracts:check` sin diferencias (no se esperan cambios en
  `openapi.yaml`); registrar en el PR la evidencia ejecutada y esperar CI en verde antes de pedir el merge.

## visual-check

## visual-check · d5fb-03 · 2026-11-05
Veredicto: PASS (con una nota ⚠ de foco, preexistente)
Stack: imagen web de esta rama como contenedor temporal en 127.0.0.1:3100 (red `oncolens_clinical-net`, origen permitido `http://localhost:3100`; se navega por `localhost` porque la cookie es `Secure`), seed sintético, paciente (f); no se guardó ninguna corrección.
| Paso | Ruta / estado | Resultado | Evidencia |
|---|---|---|---|
| Estados | Ki-67 «20 %» | ✓ | campos Valor `20 %`, «Unidad (opcional)» vacía con «Sin unidad» y ayuda «Déjala vacía si el resultado no lleva unidad.», «Fecha del examen» `2026-10-02`, `max` = `2026-11-05` (hoy del servidor) |
| Estados | RE «Negativo» (en conflicto) | ✓ | mismos campos; fecha `2026-10-09`, unidad vacía con marcador y ayuda |
| Estados | Fecha futura `2099-01-01` | ✓ | error «La fecha no puede ser posterior a hoy.» junto al campo, `aria-invalid=true`, 0 peticiones POST/PATCH/DELETE |
| Teclado | Corregir dato → formulario | ✓ | Tab recorre Valor, Unidad, Fecha, sin trampas |
| Teclado | Cancelar | ⚠ | el formulario se cierra pero el foco cae al inicio del documento (no vuelve a «Corregir dato»); comportamiento previo de l1d-309, fuera de este change |
| Consola | ficha (f) | ✓ 0 errores, 0 advertencias, 0 violaciones CSP | — |
| Red | todas | ✓ | único origen `http://localhost:3100`; ninguna petición a clinical-api ni a terceros; sin identidad en URLs (solo UUID) |
| Rendimiento | ficha | ✓ | DOMContentLoaded 37 ms (laboratorio local) |
| Capturas | 375 / 1280 | ✓ | sin scroll horizontal a 375 px; capturas fuera del repo |
Fallos convertidos en tests: ninguno
