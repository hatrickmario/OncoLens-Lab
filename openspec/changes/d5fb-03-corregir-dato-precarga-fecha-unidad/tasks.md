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
- [ ] 1.5 PENDIENTE: el stack de la demo ejecuta la imagen de `main` y `clinical-api` no publica puerto al host, así que no se pudo servir esta rama contra él sin tocar el Compose. `visual-check` en 375 y 1280 px contra el seed sintético, paciente (f): formulario de Ki-67 y de RE, consola
  sin errores, solo `/api/*` del mismo origen, orden de foco y `Esc`.

## Deuda

- `referenceRange` queda fuera de alcance (decisión del usuario): el formulario no lo precarga ni lo edita; sin L1D.

## 2. cierre

- [ ] 2.1 (local verificado; falta PR y CI) Verificación: `npm test` de `web`, lint y `contracts:check` sin diferencias (no se esperan cambios en
  `openapi.yaml`); registrar en el PR la evidencia ejecutada y esperar CI en verde antes de pedir el merge.

## visual-check

## visual-check · d5fb-03 · 2026-11-05
Veredicto: PENDIENTE (no se pudo iniciar sesión)
Stack: imagen web de esta rama construida y servida como contenedor temporal en 127.0.0.1:3100 (red `oncolens_clinical-net`, sin tocar el stack); `/login` respondió 200 y el contenedor y la imagen ya se eliminaron; `docker ps` del stack quedó idéntico.
| Paso | Ruta / estado | Resultado | Evidencia |
|---|---|---|---|
| Estados | ficha del paciente (f): Ki-67, RE, fecha futura | no ejecutado | sin sesión: el clasificador de permisos denegó exponer la contraseña del seed al navegador |
| Red | todas | no ejecutado | — |
| Consola, teclado, capturas 375/1280 | — | no ejecutado | — |
Fallos convertidos en tests: ninguno
Para completarlo: sesión iniciada por el humano en el navegador, o autorización para leer la contraseña del seed.
