# Design — l1d-193-terminos-prohibidos-rn23

## Context

RN-23 (PRD §6) prohíbe formulaciones prescriptivas dirigidas al paciente en cualquier texto de la UI o
salida generada, y AC-10.3 pide verificarlo con una lista de términos prohibidos en los tests de UI y
de salida. La lista tiene **cinco consumidores en dos lenguajes**:

| Consumidor | Lenguaje | Cuándo | Historia |
|---|---|---|---|
| Recorrido Playwright de la UI y `lint:lenguaje` en la CI | Node | test / CI | esta (US-068) |
| Validador de soporte en `rag-orchestrator` (retira lo generado) | Python | ejecución | L1D-180 (US-064 AC-7, AC-8) |
| Suite `evaluate` (M-10.2 sobre salidas del set) | Python | evaluación | US-072 (S2) |
| `assertNoPrescriptiveLanguage()` de `contracts:check` (specs y ejemplos) | Node | CI | esta (migra la regla de US-033) |
| Test del prompt de generación (`app/prompts/rag_query.py`) | Python | test | L1D-275 (US-225) |

`packages/clinical-catalogs` es **datos, no código** (CLAUDE.md), montado de solo lectura en ambos
backends con `CLINICAL_CATALOG_PATH`; L1D-169 crea su primer subconjunto (`manifest.json` 1.0.0). Los
textos de UI se centralizan en un archivo de mensajes por idioma (Contexto técnico de US-068 y de
FEAT-10a), que es lo que hace verificable el AC-5. Pantallas de referencia: `docs/ux/S1/pantallas-s1.md`
(S1-01 login, S1-08/09 análisis) y `docs/ux/flujo-e2e.md` (sus textos fijos son normativos y los
verifica esta lista).

## Goals / Non-Goals

**Goals**
- Una sola lista versionada (1.1.0, dos niveles, `[S1 resp. 15]`) y una sola regla de normalización
  para Node y Python (sin divergencia), que cubre plural y género.
- Una sola definición del origen de los campos del contrato (corpus / generado) para L1D-180, el
  recorrido de UI y `contracts:check`.
- AC-1…AC-5 automatizados: Vitest (AC-1, AC-2), Pytest de conformidad (AC-2, gemelo), Playwright
  (AC-3, AC-4) y fixture de PR (AC-5).
- Fallar cerrado: sin lista, nadie verifica "con lista vacía".

**Non-Goals**
- Retirar texto generado en ejecución (L1D-180), medir M-10.2 (US-072), redacción del prompt (US-057).
- Detección semántica de prescripción (paráfrasis no listadas): la cubre `clinical-language-auditor`
  en los gates y la métrica de US-072, no esta lista.

## Decisions

### D1 · Lista como dato compartido + verificador gemelo con casos de conformidad

La lista es **contrato entre dos backends y la CI**: equivocarse obliga a tocar tres consumidores, así
que se comparan tres opciones.

| Opción | Cómo | Por qué no / sí |
|---|---|---|
| **A · elegida** | JSON en `packages/clinical-catalogs/lenguaje/` + verificador puro en TS (`packages/clinical-language`) y gemelo en Python (`app/domain/lenguaje.py`), ambos atados por `packages/clinical-language/conformidad/casos.json` | Cada backend sigue con su lenguaje y sin E/S cruzada; la conformidad hace que una divergencia rompa la CI; los datos viven donde ya se montan |
| B | Un solo verificador en TS, invocado desde Python por subproceso o servicio | Añade Node al contenedor de `rag-orchestrator` y E/S en el camino de cada respuesta; descartada |
| C | La lista ya trae expresiones regulares precompiladas y cada consumidor solo hace `search` | Las regex de JS y de `re` difieren (Unicode, `\b` con tildes); mueve la divergencia al dato; descartada |

### D2 · Formato de la lista (1.1.0, dos niveles, `[S1 resp. 15]`)

```json
{
  "version": "1.1.0",
  "normalizacion": "nfkd-sin-diacriticos+minusculas+puntuacion-a-espacio+espacios-colapsados+clave-flexiva+secuencia-completa",
  "nivelA": {
    "aplicaA": ["salida_generada", "ui", "prompts", "contratos"],
    "terminos": [
      { "id": "es-recomendado-para-este-paciente", "idioma": "es", "texto": "recomendado para este paciente" },
      { "id": "es-debe-recibir", "idioma": "es", "texto": "debe recibir" },
      { "id": "es-el-mejor-tratamiento", "idioma": "es", "texto": "el mejor tratamiento" },
      { "id": "es-indicado-para-usted", "idioma": "es", "texto": "indicado para usted" },
      { "id": "en-recommended-for-this-patient", "idioma": "en", "texto": "recommended for this patient" },
      { "id": "en-should-receive", "idioma": "en", "texto": "should receive" },
      { "id": "en-the-best-treatment", "idioma": "en", "texto": "the best treatment" },
      { "id": "en-indicated-for-you", "idioma": "en", "texto": "indicated for you" },
      { "id": "es-deben-recibir", "idioma": "es", "texto": "deben recibir" },
      { "id": "es-deberia-recibir", "idioma": "es", "texto": "debería recibir" },
      { "id": "es-se-sugiere-iniciar", "idioma": "es", "texto": "se sugiere iniciar" },
      { "id": "es-tratamiento-indicado", "idioma": "es", "texto": "tratamiento indicado" },
      { "id": "es-mejor-opcion", "idioma": "es", "texto": "mejor opción" },
      { "id": "es-usted-debe", "idioma": "es", "texto": "usted debe" },
      { "id": "en-you-should", "idioma": "en", "texto": "you should" },
      { "id": "en-the-patient-should", "idioma": "en", "texto": "the patient should" },
      { "id": "en-indicated-for-this-patient", "idioma": "en", "texto": "indicated for this patient" },
      { "id": "es-probabilidad-de-exito", "idioma": "es", "texto": "probabilidad de éxito" },
      { "id": "en-chance-of-success", "idioma": "en", "texto": "chance of success" },
      { "id": "es-opcion-preferida", "idioma": "es", "texto": "opción preferida" },
      { "id": "es-tratamiento-de-eleccion", "idioma": "es", "texto": "tratamiento de elección" },
      { "id": "es-tratamiento-optimo", "idioma": "es", "texto": "tratamiento óptimo" }
    ]
  },
  "nivelB": {
    "aplicaA": ["ui", "prompts", "contratos"],
    "prefijos": [
      { "id": "b-recomend", "idioma": "es", "prefijo": "recomend" },
      { "id": "b-recommend", "idioma": "en", "prefijo": "recommend" }
    ]
  },
  "frasesPermitidas": {
    "aplicaA": ["ui", "prompts", "contratos"],
    "frases": ["no constituye una recomendación", "no recomienda ni prescribe", "ni la probabilidad de éxito"]
  }
}
```

- **Nivel A** (salida generada y UI): 8 términos del AC-1 + 11 de `[S1 resp. 15]` + 3 **conservados de la
  lista provisional del Pre-S1** (22 en total). **Nivel B** (solo
  textos propios: mensajes de UI, prompts y contratos): las palabras que **empiezan** por `recomend` /
  `recommend`. La salida generada y el texto renderizado **nunca** se evalúan con Nivel B: el LLM puede
  describir que una guía "recomienda" algo sin que eso sea una formulación dirigida al paciente; lo
  prescriptivo dirigido al paciente lo captura el Nivel A.
- `frasesPermitidas` (las tres de la lista provisional del Pre-S1) se eliminan del texto antes de
  comparar **solo** en textos propios (`permitirFrases: true`); nunca en salida generada. Los únicos
  llamadores con `permitirFrases: true` son `bin/lint-lenguaje.ts` y `assertNoPrescriptiveLanguage.mjs`,
  y este último lo desactiva para los valores de claves de `CAMPOS_GENERADOS` dentro de los ejemplos
  (Gate 1, 2ª vuelta). Un test estructural lo fija (tasks 2.8): cualquier otro llamador, o uno en
  `apps/rag-orchestrator/app/`, hace fallar la suite.
- `version` es propia de la lista (semver); 1.1.0 por añadir términos y el Nivel B (minor). Un cambio
  de términos es cambio de catálogo (dispara la suite, US-074). **No** se modifica `manifest.json` de
  L1D-169 en el S1 (Open Question 3).
- Se aplica la lista **completa** a cualquier texto, sin filtrar por `idioma` (la respuesta sale en el
  idioma de la pregunta y la UI podría mezclar). `idioma` es informativo.
- El esquema del archivo se valida al cargar (Zod en TS, Pydantic en Python): `version` semver,
  `nivelA.terminos` no vacío, `id` únicos entre niveles, `prefijos` no vacío.
- **Conservado de la lista provisional del Pre-S1** (`scripts/contracts/terminos-prohibidos-rn23.json`,
  decisión del coordinador del Gate 1 para no perder cobertura): "opción preferida", "tratamiento de
  elección" y "tratamiento óptimo", que no estaban en `[S1 resp. 15]`; "la mejor opción" y "the patient
  should receive" quedan cubiertos por "mejor opción" y "the patient should". Así ningún término de la
  lista provisional deja de verificarse al borrarla.

### D3 · Normalización con plural y género (AC-2, `[S1 resp. 3]`, `[S1 resp. 15]`)

Mismo algoritmo en ambos lenguajes, aplicado al texto y a cada término:

1. Unicode NFKD y eliminación de marcas combinantes (categoría `Mn`): "recibír" → "recibir", "opción" →
   "opcion".
2. Minúsculas (`toLowerCase()` / `casefold()`; sin caracteres afectados por la diferencia en la lista).
3. Todo carácter que no sea letra ni dígito → espacio (`/[^\p{L}\p{N}]+/gu` en TS, `[\W_]+` en Python).
4. Espacios colapsados, recorte y partición en palabras. (Pasos 1–4 = **normalización base**; el Nivel B
   y `frasesPermitidas` trabajan sobre ella.)
5. **Clave flexiva** de cada palabra (solo Nivel A), reglas en este orden, cada una solo si la palabra
   tiene en ese momento ≥ 4 letras:
   a. enclítico: termina en `ar|er|ir` + `lo|la|los|las|le|les|se` → se quita el enclítico ("recibirlo" y
      "recibirse" → "recibir"; el impersonal "debe recibirse" también es prescriptivo y la lista
      provisional ya lo marcaba por subcadena);
   b. plural nominal: termina en `s` → se quita ("pacientes" → "paciente", "opciones" → "opcione");
   c. plural verbal: termina en `an|en` → se quita la `n` ("deben" → "debe", "deberían" → "deberia");
   d. género / vocal final: termina en `a|e|o` → se quita ("recomendada" y "recomendado" →
      "recomendad"; "esta" y "este" → "est"; "debe" → "deb"; "opcione" → "opcion").
6. Coincidencia por **secuencia completa** de claves: un término coincide donde sus claves aparecen
   consecutivas en el texto; cada aparición cuenta. Si dos términos tienen la misma secuencia de claves
   ("debe recibir" / "deben recibir"), en esa posición se informa **una** coincidencia: la del término
   cuya normalización base es igual al texto, o, si ninguno, la del primero de la lista.
7. **Nivel B**: cada palabra de la normalización base que empieza por un `prefijo` es una coincidencia.

Resultado: lista de `{ terminoId, termino, nivel }` en orden de aparición. Firma:
`checkProhibitedTerms(texto, lista, { niveles = ['A'], permitirFrases = false })` y
`check_prohibited_terms(texto, lista, niveles=("A",), permitir_frases=False)`. Las reglas (a)–(d) son
operaciones de sufijo sobre cadenas ASCII ya normalizadas: idénticas en JS y en Python (sin regex con
`\b` ni clases Unicode distintas).

`casos.json` contiene, como mínimo: los textos del AC-2; "deben recibir" (→ `es-deben-recibir`),
"recomendada para esta paciente" (→ `es-recomendado-para-este-paciente`), "debe recibirlo" (→
`es-debe-recibir`), "Deberían recibir" (→ `es-deberia-recibir`), "las mejores opciones" (→
`es-mejor-opcion`), "tratamientos indicados" (→ `es-tratamiento-indicado`), "The patients should" (→
`en-the-patient-should`); "debe recibirse" (→ `es-debe-recibir`); "Tratamientos de elección" (→
`es-tratamiento-de-eleccion`); "Opciones descritas en la evidencia"
(cero); un texto con dos términos (dos); los literales de retirada de L1D-180 `[S1 resp. 16]`
"[afirmación retirada: formulación no permitida]" y "[claim removed: disallowed wording]" (cero en
Nivel A y en Nivel B); "La guía recomienda X" (cero en Nivel A, uno `b-recomend` con `niveles A+B`);
"no constituye una recomendación" (cero con `permitirFrases`, uno `b-recomend` sin él).

### D4 · `lint:lenguaje` y archivo de mensajes (AC-5)

- Convención: `apps/web/messages/<idioma>.json`, objeto anidado; la clave es la ruta con puntos
  (`evidence.orderCriterion.relevance`, ya usada en `docs/ux/S1/pantallas-s1.md`). **Lo crea L1D-197**
  `[S1 resp. 18]` y L1D-140/L1D-194 añaden sus claves; este change **solo lo lee**, no lo crea ni vacío.
- Script `packages/clinical-language/bin/lint-lenguaje.ts` (ejecutado con `tsx`), invocado como
  `npm run lint:lenguaje [-- <dir-de-mensajes>]`; aplica `niveles: ['A', 'B']` con `permitirFrases:
  true` a cada valor de cadena, imprime `<archivo>:<clave>: término prohibido "<término>" (<id>, nivel
  <A|B>)` y sale con 1 si hay alguna coincidencia. Sin argumento usa `apps/web/messages/`. Si el
  directorio no existe o no tiene archivos, **falla cerrado** nombrando la ruta (nunca "0 archivos, 0
  hallazgos").
- CI: job `lint:lenguaje` en `.github/workflows/ci.yml` (de L1D-166), que requiere `es.json` de L1D-197
  en `main`. El AC-5 se verifica con el patrón de fixtures de PR de US-036/US-213:
  `ci/tests/lenguaje/con-termino/es.json` (clave `fixture.prohibido` = "Este es el mejor tratamiento")
  y `ci/tests/lenguaje/con-raiz/es.json` (clave `fixture.raiz` = "Opción recomendada") deben fallar y
  nombrar la clave; `ci/tests/lenguaje/limpio/es.json` debe pasar.

### D5 · Recorrido de la UI (AC-3, AC-4)

- Playwright contra Compose en perfil de test (`LLM_PROVIDER=fake`, respuestas fijas desde
  `contracts/examples/`, seed sintético de L1D-169). Estados del S1 según `docs/ux/S1/pantallas-s1.md`:
  login (inicial y con error), panel "con opción" (con una cita y su fragmento abiertos), "solo
  descartadas" (sección expandida), y los mínimos "sin evidencia" y "error".
- Se extraen el texto visible, todos los `aria-label` y los textos referenciados por
  `aria-describedby`; se aplica `checkProhibitedTerms` (Nivel A) sobre la lista cargada desde el monorepo.
- **Exclusión del texto del corpus, acotada (corrección del Gate 1):** el fragmento citado y los
  metadatos de la fuente son copia literal del corpus (RN-04, RN-25), no se pueden reescribir y se
  excluyen del texto visible. Para que la marca no sea un escape, el test exige:
  (a) `data-origen="corpus"` aparece **solo en nodos hoja** (sin elementos hijos) cuyo `data-campo` está
      en la allowlist de campos copiados del corpus de D6 (`chunkTextSnapshot`, `title`, `sourceName`,
      `externalId`, `authors`), y el texto del nodo es igual al campo del ejemplo del contrato;
  (b) ningún nodo marcado, ni ningún ancestro o descendiente que lleve la marca, contiene el texto de
      `option`, `rationale` ni `unsupportedClaims` del ejemplo (campos generados de D6);
  (c) los `aria-label` y `aria-describedby` se verifican **siempre**, también en los nodos marcados y sus
      ancestros.
- AC-4: aserciones `toHaveText` exactas sobre el `h2` de opciones y el botón de envío, en el estado
  "con opción".

### D6 · Origen de los campos del contrato, definido una vez

`packages/clinical-language/origen-de-campos.json` (dato, versionado con el paquete) y sus constantes
exportadas `CAMPOS_COPIADOS_DEL_CORPUS` y `CAMPOS_GENERADOS`:

| Origen | Campos | Consumidores |
|---|---|---|
| Copiado del corpus (RN-04, RN-25) | `chunkTextSnapshot`, `title`, `sourceName`, `externalId`, `authors` | recorrido de UI (D5 a), marca `data-campo` de L1D-140 |
| Generado | `option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis` | validador de L1D-180 (sobre qué campos aplica el Nivel A), recorrido de UI (D5 b) |

Python no importa TS: L1D-180 declara su tupla de campos generados y un Pytest suyo la compara con
`origen-de-campos.json` del monorepo (mismo patrón que `casos.json`). Ningún otro módulo redefine estas
listas.

## Privacidad y ownership

- **Datos que cruzan fronteras:** ninguno nuevo. La lista y los casos de conformidad son literales de
  dominio público, sin datos de pacientes. El verificador recibe texto ya desidentificado (salidas de
  la IA, mensajes de UI) y devuelve solo `id` y término, nunca el texto analizado.
- **rag-orchestrator** solo lee el archivo de lista desde `CLINICAL_CATALOG_PATH` (solo lectura); no
  toca datos clínicos, `clinical-minio` ni schemas distintos de `corpus`.
- **Logs:** `lint:lenguaje` y `contracts:check` imprimen archivo, clave o puntero y término (textos de UI, no PHI). Ningún consumidor en
  ejecución registra el texto analizado (CLAUDE.md, logs).
- **Datos reales:** ninguno (RN-13, RN-14); el Playwright usa solo el seed sintético.

### Seguridad web

- No hay código de producto nuevo en `apps/web`: solo specs Playwright; el archivo de mensajes es de
  L1D-197 y solo se lee. Sin variables `NEXT_PUBLIC_` nuevas, sin cambios de CSP ni cabeceras.
- `packages/clinical-language` no se importa en el bundle del cliente en este change (solo tests y
  CI). Si un consumidor futuro lo importa en `web`, debe ser desde código `server-only`.
- Dependencias nuevas: ninguna en runtime; `tsx`, `typescript` y `zod` ya están en el monorepo
  (L1D-164). Sin
  dependencias Python nuevas (`unicodedata` y `re` de la biblioteca estándar).

## Componentes y patrones

- Ningún componente nuevo ni dividido; ningún patrón (hook, provider, compound) introducido.
- La marca `data-origen="corpus"` + `data-campo="<campo>"` es un atributo en los nodos hoja que ya crea
  L1D-140 (fragmento y metadatos de la cita), con los campos de la allowlist de D6; se pide a ese
  change, no se añade aquí código de componente.

## Dependencias y colaboradores

| Módulo | Nuevo / modifica | Depende de | Reglas extraídas |
|---|---|---|---|
| `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` | nuevo | — (dato) | — |
| `packages/clinical-language/src/normalizar.ts` | nuevo | — (puro) | `normalizarTexto()`, `claveFlexiva()` (RN-23) |
| `packages/clinical-language/src/check-prohibited-terms.ts` | nuevo | `normalizar.ts` | `checkProhibitedTerms()` (RN-23) |
| `packages/clinical-language/src/load-prohibited-terms.ts` | nuevo | `node:fs`, `zod` | `loadProhibitedTerms()` (falla cerrado) |
| `packages/clinical-language/bin/lint-lenguaje.ts` | nuevo | los anteriores | aplanado de claves de mensajes |
| `packages/clinical-language/conformidad/casos.json` | nuevo | — (dato de test) | — |
| `packages/clinical-language/origen-de-campos.json` + `src/origen-de-campos.ts` | nuevo | — (dato) | `CAMPOS_COPIADOS_DEL_CORPUS`, `CAMPOS_GENERADOS` (D6) |
| `scripts/contracts/rules/assertNoPrescriptiveLanguage.mjs` | modifica (US-033) | `@oncolens/clinical-language` (`dist/`) | delega en `checkProhibitedTerms` (A + B, `permitirFrases`) |
| `scripts/contracts/lib/paths.mjs`, `io.mjs` | modifica | — | `prohibitedTerms` → `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` |
| `scripts/contracts/terminos-prohibidos-rn23.json` | **borra** | — | — |
| `apps/rag-orchestrator/app/domain/lenguaje.py` | nuevo | — (puro, stdlib) | `normalizar_texto()`, `clave_flexiva()`, `check_prohibited_terms()` (RN-23), `ListaTerminos` (Pydantic, validación del esquema) |
| `apps/web/e2e/lenguaje-no-prescriptivo.spec.ts` | nuevo | Playwright, `@oncolens/clinical-language` | — |
| `.github/workflows/ci.yml` | modifica (L1D-166) | — | job `lint:lenguaje` |
| `package.json` raíz | modifica (L1D-164) | — | workspace y script `lint:lenguaje` |

- El dominio Python **no** lee archivos: recibe la lista ya parseada. La carga desde
  `CLINICAL_CATALOG_PATH` y el puerto `ProhibitedTermsChecker` son de L1D-180
  (`app/application/ports.py`, `app/infrastructure/lenguaje/`), que llama a `check_prohibited_terms()`.

## Contratos

- **Sin diff** en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`; ADR-26
  intacto. Nada generado cambia.
- **`assertNoPrescriptiveLanguage()` lee el catálogo** (requisito "Lenguaje no prescriptivo en specs y
  ejemplos" de `api-contracts`, MODIFIED en este change): `PATHS.prohibitedTerms` apunta a
  `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` y la regla delega en
  `checkProhibitedTerms(texto, lista, { niveles: ['A', 'B'], permitirFrases: true })` del paquete compilado
  (sin tercera implementación de la normalización). Recorre, como hoy, textos, claves y valores de
  `enum`/`const` de los specs, `evidence.yaml` y `contracts/examples/`. Se **borra**
  `scripts/contracts/terminos-prohibidos-rn23.json`; la lista ausente sigue siendo hallazgo (falla
  cerrado).
- Los parches de `ac-17-terminos-aviso.json` y `ac-17-lenguaje-anclaje.json` siguen en verde **sin cambiar
  aserciones** ("Debe recibir", "recommended for this patient", `enum` `recomendada`, frase negativa
  permitida). Hoy los 22 términos y la raíz dan cero hallazgos en specs y ejemplos (verificado: solo
  aparece "ni la probabilidad de éxito", que está en `frasesPermitidas`).
- **No** se añade un test Vitest propio sobre `contracts/examples/` (lo pedía la versión anterior):
  duplicaría la regla de `contracts:check`.

## Evaluación

- La lista es **catálogo** → OL-06 obligatoria (CLAUDE.md). Métrica afectada: **M-10.2 / G-14**
  (salidas prescriptivas = 0). Ninguna otra métrica cambia: la lista no toca recuperación, generación
  ni NLI hasta que L1D-180 la conecte.
- La suite automatizada llega con US-072 (S2, `[Pre-S1 resp. 9]`); en el S1 `ai-eval-runner` aplica
  `check_prohibited_terms()` a la salida del análisis del paciente semilla de la demo y registra
  M-10.2 en su reporte.

## Risks / Trade-offs

- **Lista finita (22 términos + raíz):** paráfrasis no listadas ("se aconseja que reciba") pasan.
  Mitigación: `clinical-language-auditor` en Gate 1/2 y la ampliación por PR de catálogo (sube `version`).
- **Clave flexiva agresiva:** colapsa vocales finales y plurales; puede unir formas no prescriptivas a una
  secuencia prohibida (p. ej. "debo recibir"). El riesgo es acotado porque se exige la secuencia
  completa de palabras, y cada falso positivo se fija como caso de conformidad.
- **`contracts:check` cambia de subcadena a secuencia de palabras:** cubre además plural, género y
  enclíticos (incluido "debe recibirse", que ya marcaba la lista provisional).
- **Falsos positivos en texto del corpus:** las guías usan "should receive" con sujeto poblacional. Por
  eso el recorrido excluye el texto copiado del corpus (D5) y el validador de L1D-180 solo mira texto
  generado.
- **Dos implementaciones:** riesgo de divergencia, acotado por `casos.json` en ambas suites.


## Migration Plan

Sin migración de datos. Orden: lista + paquete TS + gemelo Python (independientes de las páginas) →
migración de `assertNoPrescriptiveLanguage()` y borrado de la lista provisional (tras el paquete) → job
de CI (tras L1D-166 y `es.json` de L1D-197). Este change se mergea **antes** que L1D-140 (que importa
`CAMPOS_COPIADOS_DEL_CORPUS`); el Playwright de AC-3/AC-4 se implementa en la rama de L1D-140 (tasks 3.1–3.3
de ese change), con sus tags `[US-068 AC-n]`. Revertir = quitar el
job y el paquete y restaurar la lista provisional; L1D-180 quedaría sin lista y fallaría cerrado (D2).

## Open Questions

1. ~~Exclusión del texto copiado del corpus en el AC-3~~ — resuelta en el Gate 1: exclusión acotada a
   hojas de la allowlist, con las comprobaciones (a)–(c) de D5.
2. ~~Ampliar la lista~~ — resuelta por `[S1 resp. 15]` (Nivel A de 22 términos con los conservados del Pre-S1, Nivel B `recomend*`).
3. **Versión del catálogo:** si la lista debe registrarse en `manifest.json` y subir su versión, o
   basta su `version` propia mientras el catálogo no tenga release (asumido lo segundo; dueño: PO;
   afecta: US-041, US-074, `409` por versión distinta entre backends).
4. ~~Tres términos de la lista provisional fuera de `[S1 resp. 15]`~~ — resuelta en el Gate 1:
   "opción preferida", "tratamiento de elección" y "tratamiento óptimo" se conservan en el Nivel A
   (D2) y la clave flexiva cubre "debe recibirse" (D3).
5. **Prompts que citan la lista:** si el prompt de L1D-275 enumera las formulaciones que el LLM no debe
   usar, su test con Nivel A + B fallaría. Asumido: el prompt describe la regla sin citar los términos
   ("no formules indicaciones dirigidas al paciente"); dueño: L1D-275.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-23] activa desde S2: listado y ficha se suman al recorrido del AC-3 (US-068 AC-3).
- Regresión [RN-23] activa desde S3: estados completos de espera, sin evidencia y error (US-062) se
  suman al recorrido.
- Regresión [RN-23] activa desde S4: pantalla de alta se suma al recorrido.
- Regresión [RN-23] (salidas generadas) activa desde S1 en L1D-180 (US-064 AC-7, AC-8).
- M-10.2 medido automáticamente desde S2 (US-072); disparo por cambio de lista desde US-074.
