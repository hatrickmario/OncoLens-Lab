# Design — l1d-195-analisis-sin-escrituras

## Contexto

AC-T3.2 (PRD §18.4): el sistema nunca ejecuta una acción clínica por su cuenta. Hoy la única escritura del gateway es
`INSERT INTO clinical.ai_analysis_record` (`evidence-analysis.repository.ts`), y la respuesta de `rag-orchestrator` se
valida con el Zod generado `zRagQueryInternalResponseRefinado`, que es `z.strictObject` (el `openapi.yaml` de Backend 2
declara `additionalProperties: false`). Solo US-053 AC-6 vigila una tabla (`clinical_event`). En el S5 se suman
escrituras manuales del doctor (`l1d-90`, `l1d-80`, `l1d-309`) y la ruta de seguimiento (`l1d-268`), cuya única
escritura es `clinical.analysis_follow_up` (bloquea la fila del análisis con `SELECT … FOR UPDATE`, sin actualizarla).

Lo más probable es que AC-1, AC-2 y AC-4 ya se cumplan: la historia aporta sobre todo el **guardia de regresión**. Por eso
los tests de aceptación se ejecutan primero y, si pasan, quedan como caracterización con una mutación comprobada.

## Decisiones

- **D1 · Instantánea por tabla: conteo + *hash* del contenido.** `instantaneaDeTablas(cliente, { schemas })` lista las
  tablas de `information_schema.tables` de los schemas pedidos y, por cada una, devuelve `{ filas, hash }` con
  `md5(string_agg(t::text, '|' ORDER BY <clave primaria>))`. El *hash* detecta un `UPDATE` (p. ej. un `review_status`
  cambiado) que el conteo no ve. La lista de tablas sale del catálogo, no de una constante: una tabla nueva entra sola.
  Se reutiliza `tablasDelCatalogo()` de `tests/support/catalogo.ts` filtrando por schema (no se duplica la consulta).
  *Descartadas:* solo conteos (no ve `UPDATE`) y *triggers* de auditoría de test (más código y tocan el esquema).
- **D2 · Alcance de la instantánea: `clinical` + `identity`.** AC-2 nombra `clinical`; `identity` se añade porque la
  identidad no debe cambiar al analizar (RN-10) y su coste es nulo (asumido). `auth` queda fuera (la sesión puede
  renovar `last_seen`), igual que `audit` (escrituras legítimas desde el S6) y `research`.
- **D3 · Diferencia esperada como dato del test.** El test compara las dos instantáneas y afirma que el conjunto de
  tablas con diferencia es exactamente `{clinical.ai_analysis_record}` (análisis) o `{clinical.analysis_follow_up}`
  (seguimiento), con `filas + 1`. La fila nueva se comprueba por `id`/`traceId` de la respuesta. Para AC-4 el conjunto
  esperado es **vacío** (ver D4).
- **D4 · AC-4: la respuesta con `actions` se rechaza entera, no se poda.** El supuesto de la historia («Zod descarta
  campos desconocidos») no coincide con el contrato: el Zod generado es estricto, así que la respuesta no valida y
  `mapearFalloRag()` la traduce a `502 ERROR_SERVICIO_IA` sin persistir el `AIAnalysisRecord` (requisito vigente «Una
  sola tabla de mapeo de fallos», «respuestas que no validan → 502»). Esto cumple el «Entonces» del AC (el campo no se
  persiste ni se devuelve; ninguna tabla clínica cambia) y es más seguro. No se relaja el Zod: hacerlo exigiría cambiar
  `additionalProperties` en el contrato (ADR-26). El escenario se escribe con el comportamiento real y el supuesto se
  corrige en «Pendiente de definir» para que el humano lo confirme.
- **D5 · Filas manuales sembradas por sus endpoints, no por SQL.** Antes de la instantánea, el test registra con la
  sesión del doctor un biomarcador y un diagnóstico (`l1d-90`), un tratamiento previo y un atributo (`l1d-80`) y una
  corrección (`l1d-309`, deja una fila `reemplazado` y su sucesora `manual_correction`). Así el test cubre las filas tal
  como las escribe el producto. Si alguno de esos changes se recorta, su paso del fixture se difiere con su ID y el test
  sigue con el seed (ver `tasks.md`).
- **D6 · AC-3 por recorrido de controles.** El test de componente renderiza `EvidenceOptionCard` con la opción de
  `contracts/examples/` y recorre `getAllByRole('button' | 'link')` y `<summary>`: el único control admitido es el
  desplegable «más detalle» y los enlaces a la cita (si existen); ninguno tiene nombre accesible ni `href` de registro,
  aplicación o modificación (lista de patrones en el test: `registrar`, `aplicar`, `tratamiento`, `/patients/…/` con
  método de escritura). Sin cambio de UI previsto; si el test falla, se quita el control en `feat(L1D-195)`.
- Recomendación única (decisión barata de revertir, solo tests): no hacen falta 3 alternativas.

## Privacidad y ownership

- No cambia ningún flujo de datos: `web` → `clinical-api` → `rag-orchestrator` sigue igual; el contexto hacia la IA va
  desidentificado como hoy (RN-11). `rag-orchestrator` no cambia y sigue sin acceso a datos clínicos ni a
  `clinical-minio`.
- Los tests usan solo el seed sintético y filas manuales sintéticas. Ni el *hash* ni las instantáneas se escriben en
  *logs* ni en reportes; un fallo informa la tabla y el conteo, nunca el contenido de las filas (identidad cifrada).
- **UX:** referencia `docs/ux/S4/pantallas-s4.md` (tarjeta de opción con su tabla de aplicabilidad) y `docs/ux/S5/pantallas-s5.md` (sin avisos ni acciones nuevas en la tarjeta en el S5); sin desviación.
- **Seguridad web:** el único cambio en `apps/web` es un test; no hay variables `NEXT_PUBLIC_`, módulos, CSP ni
  dependencias nuevas. La tarjeta sigue renderizando el texto del LLM y del corpus como texto de React (sin HTML crudo).

## Contratos

- **Sin cambio** en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`; `contracts:breaking`
  debe dar 0 diferencias.
- AC-4 construye la respuesta con `actions` **en el test** a partir de `contracts/examples/rag-query-con-evidencia.json`
  (copia + campo extra); no se añade un ejemplo inválido a `contracts/examples/` (la CI valida todos los ejemplos contra
  el spec). Los handlers de MSW siguen saliendo de `contracts/examples/` (US-213).
- Verificación del proveedor: las respuestas `200`, `201` y `502` de los tests se validan contra el spec de
  `clinical-api` con el cliente verificado existente (`tests/support/verificarProveedor.ts`, US-214).

## Dependencias y colaboradores

- **Nuevo** `apps/clinical-api/tests/support/instantanea-de-tablas.ts`: `instantaneaDeTablas()` y
  `tablasConDiferencia(antes, despues)`; depende de `pg.Client` y de `tablasDelCatalogo()` (`tests/support/catalogo.ts`,
  exportándola si hoy es privada).
- **Nuevo** `apps/clinical-api/tests/integration/evidence-analysis/analisis-sin-escrituras.test.ts` (AC-1, AC-2, AC-4 y
  seguimiento). Usa `tests/support/gateway.ts` (base con seed, MSW hacia `/rag/query` y `/rag/follow-up`).
- **Nuevo** `apps/web/tests/ui/tarjeta-opcion-sin-acciones.test.tsx` (AC-3).
- **Código de producto:** ninguno salvo que un rojo real lo exija; la regla «la única escritura del análisis es
  `ai_analysis_record`» sigue con un solo dueño (`evidence-analysis.repository.ts`), sin constantes nuevas.
- **Fakes:** ninguno nuevo. MSW hacia `rag-orchestrator` usa los ejemplos del contrato (mismo contrato que el real).

## Tests

| AC | Nivel | Archivo |
|---|---|---|
| AC-1, AC-2 (+ filas manuales y seguimiento) | Integración (Supertest + PostgreSQL real + MSW) | `tests/integration/evidence-analysis/analisis-sin-escrituras.test.ts` |
| AC-3 | Componente (Vitest + Testing Library) | `apps/web/tests/ui/tarjeta-opcion-sin-acciones.test.tsx` |
| AC-4 | Integración | `analisis-sin-escrituras.test.ts` |

Si un test de aceptación pasa a la primera, se comprueba que detecta la regresión con una **mutación local no
commiteada** (p. ej. un `UPDATE clinical.biomarker SET review_status = 'verificado'` en el repositorio del análisis) y
se anota la evidencia en la tarea.

## Riesgos

- Una tabla con columnas de *timestamp* actualizadas por lectura haría fallar el diff: hoy no existe en `clinical` ni en
  `identity`; si aparece, el fallo es un hallazgo (una lectura que escribe), no un test frágil.
- El orden de oleadas: O3 depende de cuatro changes de O1/O2; si se recortan, los pasos del fixture se difieren con ID.

## Pendiente de definir

- **P-1 (dueño: humano, afecta a AC-4):** el supuesto «Zod descarta campos desconocidos» se sustituye por el
  comportamiento real del contrato: la respuesta con `actions` se rechaza con `502 ERROR_SERVICIO_IA` y no se crea
  ningún `AIAnalysisRecord` (D4). Se propone aceptarlo y anotarlo en la historia; no requiere cambio de contrato.
