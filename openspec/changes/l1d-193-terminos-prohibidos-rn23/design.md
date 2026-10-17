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
- Una sola lista versionada (1.2.0, dos niveles, `[S1 resp. 15]`, ampliada por forma en `[S1 resp. 33]`) y
  una sola regla de normalización para Node y Python (sin divergencia), que cubre plural, género,
  conjugación dirigida (formas explícitas) y negación.
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

### D2 · Formato de la lista (1.3.0, dos niveles, `[S1 resp. 15]`, `[S1 resp. 33]`)

`[S1 resp. 33]` (validación clínica de los oncólogos asesores, 2026-10-14, `backlog/sprints/S1-plan.md`
§7) amplía RN-23 **por forma**: imperativos y subjuntivos dirigidos ("administre"), deónticos
("se debe", "no debe recibir"), valorativos ("la mejor opción es") y sus equivalentes en inglés en el
Nivel A, y verbos de acción en infinitivo en el Nivel B. La lista sube a **1.2.0** (minor: añade términos,
`nivelB.terminos`, los campos opcionales `formas` y `excepciones`, un prefijo y la regla de tramo más largo;
ningún término de 1.1.0 se retira ni cambia de id). El Gate 2 (vuelta 1) la sube a **1.3.0** (minor: añade
"indicado para este paciente" e "indicado para esta paciente" al Nivel A, coherentes con "indicated for this
patient" de `[S1 resp. 15]`; sin retiradas ni cambios de id).

```json
{
  "version": "1.3.0",
  "normalizacion": "nfkd-sin-diacriticos+minusculas+puntuacion-a-espacio+espacios-colapsados+clave-flexiva+formas-verbales+excepciones+secuencia-completa+tramo-mas-largo",
  "nivelA": {
    "aplicaA": ["salida_generada", "ui", "prompts", "contratos"],
    "terminos": [
      { "id": "es-debe-recibir", "idioma": "es", "texto": "debe recibir" },
      { "id": "es-se-debe", "idioma": "es", "texto": "se debe", "excepciones": ["se debe a", "se debe al"] },
      { "id": "es-se-indica", "idioma": "es", "texto": "se indica", "excepciones": ["como se indica"] },
      { "id": "es-administre", "idioma": "es", "texto": "administre",
        "formas": ["administre", "administren", "administrese", "administrelo", "administrela",
                   "administrelos", "administrelas", "administrele", "administreles"] },
      { "id": "es-cambie-a", "idioma": "es", "texto": "cambie a",
        "formas": ["cambie a", "cambien a", "cambiese a", "cambielo a", "cambiela a", "cambielos a",
                   "cambielas a", "cambiele a", "cambieles a"] },
      "… (resto de términos: tabla siguiente)"
    ]
  },
  "nivelB": {
    "aplicaA": ["ui", "prompts", "contratos"],
    "prefijos": [
      { "id": "b-recomend", "idioma": "es", "prefijo": "recomend" },
      { "id": "b-recomiend", "idioma": "es", "prefijo": "recomiend" },
      { "id": "b-recommend", "idioma": "en", "prefijo": "recommend" }
    ],
    "terminos": [
      { "id": "b-es-iniciar", "idioma": "es", "texto": "iniciar" },
      { "id": "b-en-switch-to", "idioma": "en", "texto": "switch to" },
      "… (resto: tabla siguiente)"
    ]
  },
  "frasesPermitidas": {
    "aplicaA": ["ui", "prompts", "contratos"],
    "frases": ["no constituye una recomendación", "no recomienda ni prescribe", "ni la probabilidad de éxito",
               "iniciar sesión"]
  }
}
```

**Nivel A** (salida generada, UI, prompts y contratos), 56 términos:

| Origen | Términos (`id` = `es-`/`en-` + texto normalizado con guiones) | Coincidencia |
|---|---|---|
| AC-1 (8) | recomendado para este paciente, debe recibir, el mejor tratamiento, indicado para usted, recommended for this patient, should receive, the best treatment, indicated for you | clave flexiva |
| `[S1 resp. 15]` (11) | deben recibir, debería recibir, se sugiere iniciar, tratamiento indicado, mejor opción, usted debe, you should, the patient should, indicated for this patient, probabilidad de éxito, chance of success | clave flexiva |
| Lista provisional del Pre-S1 (3) | opción preferida, tratamiento de elección, tratamiento óptimo | clave flexiva |
| Gate 2 de L1D-193, 1.3.0 (2) | indicado para este paciente, indicado para esta paciente (género y número; el segundo gana solo cuando el texto es exactamente el suyo) | clave flexiva |
| `[S1 resp. 33]`, formas verbales (8) | inicie, administre, prescriba, suspenda, cambie a, elija, escoja, ofrezca | `formas` explícitas |
| `[S1 resp. 33]`, deónticos y valorativos (15) | se debe (excepciones "se debe a", "se debe al"), debe iniciar, debe suspender, se debe administrar, no debe recibir, no se debe administrar, es necesario, es imprescindible, se recomienda, se recomienda iniciar, se indica (excepción "como se indica"), está indicado, está contraindicado, la mejor opción es, manejo de elección | clave flexiva |
| `[S1 resp. 33]`, inglés (9) | we recommend, is recommended, should be started, must receive, should not receive, is indicated, is contraindicated, preferred treatment, treatment of choice | clave flexiva |

**Nivel B** (solo textos propios: mensajes de UI, prompts y contratos): los prefijos `recomend`,
`recomiend` y `recommend`, y 15 términos de `[S1 resp. 33]` con clave flexiva: iniciar, administrar,
prescribir, suspender, ofrecer, elegir, start, initiate, administer, prescribe, discontinue, offer,
choose, switch to, standard of care (`id` = `b-es-…` / `b-en-…`).

- **Por qué dos mecanismos para las variantes de `[S1 resp. 33]`.** Género y número ("está indicada",
  "deben iniciarse", "es necesaria") los cubre la **clave flexiva** de D3. La **conjugación** de los
  imperativos y subjuntivos dirigidos **no**: la clave quita la vocal final y uniría "administre" con el
  indicativo descriptivo "se administra cada 3 semanas", "inicie" con "la paciente inicia" y con el
  sustantivo "inicio", y "cambie a" con "el cambio a". Por eso esos 8 términos llevan `formas`: la lista
  cerrada de formas dirigidas (singular, plural `-n` y enclíticos `-se/-lo/-la/-los/-las/-le/-les` del
  singular; en "cambie a", sobre la primera palabra), comparadas con la **normalización base** (sin clave
  flexiva). Las formas son **dato** escrito en la lista, no se generan en código: los dos lenguajes las
  leen igual. La **negación** se cubre de dos modos: el término dentro de una negación sigue coincidiendo
  ("no administre", "no está indicado") y los negativos de `[S1 resp. 33]` ("no debe recibir", "no se debe
  administrar", "should not receive") son términos propios; la regla de tramo (D3.7) los informa una vez.
- **`excepciones`** (campo opcional por término): frases, con la misma clave flexiva, que anulan una
  coincidencia del término cuando su aparición **contiene** el tramo de esa coincidencia. Solo para los
  usos descriptivos frecuentes que la oncología escribe con la misma forma: "se debe a/al" (causal: "la
  toxicidad se debe a…") y "como se indica" (remisión: "como se indica en la tabla"). Aplica en todos los
  niveles y también en la salida generada (es parte del término, no una frase permitida). Cada excepción
  es un caso de conformidad.
- **Nivel B** sigue sin evaluarse nunca sobre la salida generada ni el texto renderizado: el LLM puede
  describir que "los ensayos evaluaron administrar trastuzumab" o que "la guía recomienda X para
  pacientes con [condición] en [escenario]" sin que eso sea una formulación dirigida al paciente
  (`[S1 resp. 34]`: la atribución con población y escenario explícitos la exige el prompt de L1D-275 y la
  mide `evaluate`; no hay regla determinista). Lo prescriptivo dirigido lo captura el Nivel A.
- **Corrección del prefijo:** "recomienda" no empieza por `recomend` (diptongo); 1.1.0 no lo marcaba en
  el Nivel B pese a que el caso "La guía recomienda X" lo esperaba. 1.2.0 añade `b-recomiend`.
- `frasesPermitidas` se eliminan del texto antes de comparar **solo** en textos propios
  (`permitirFrases: true`); nunca en salida generada. 1.2.0 añade **"iniciar sesión"** (botón del login de
  L1D-197, `login.enviar`), que el término `b-es-iniciar` marcaría. Los únicos llamadores con
  `permitirFrases: true` son `bin/lint-lenguaje.ts` y `assertNoPrescriptiveLanguage.mjs`, y este último lo
  desactiva para los valores de claves de `CAMPOS_GENERADOS` dentro de los ejemplos (Gate 1, 2ª vuelta).
  Un test estructural lo fija (tasks 2.8): cualquier otro llamador, o uno en
  `apps/rag-orchestrator/app/`, hace fallar la suite.
- `version` es propia de la lista (semver). Un cambio de términos es cambio de catálogo (dispara la
  suite, US-074). **No** se modifica `manifest.json` de L1D-169 en el S1 (Open Question 3).
- Se aplica la lista **completa** a cualquier texto, sin filtrar por `idioma` (la respuesta sale en el
  idioma de la pregunta y la UI podría mezclar). `idioma` es informativo.
- El esquema del archivo se valida al cargar (Zod en TS, Pydantic en Python): `version` semver,
  `nivelA.terminos` no vacío, `id` únicos entre niveles, `prefijos` no vacío, `formas` (si existe) no
  vacía y con la forma de `texto` incluida, `excepciones` (si existe) no vacía y cada una conteniendo el
  `texto` del término.
- **Conservado de la lista provisional del Pre-S1** (`scripts/contracts/terminos-prohibidos-rn23.json`,
  decisión del coordinador del Gate 1 para no perder cobertura): "opción preferida", "tratamiento de
  elección" y "tratamiento óptimo"; "la mejor opción" y "the patient should receive" quedan cubiertos por
  "mejor opción" y "the patient should".
- **Verificado sobre el repositorio (2026-10-14, prototipo del algoritmo):** con la lista 1.2.0, los
  textos, claves y `enum` de ambos `openapi.yaml`, `contracts/schemas/evidence.yaml` y
  `contracts/examples/` dan **cero** coincidencias en A + B con `frasesPermitidas`, igual que los textos
  entrecomillados de `docs/ux/S1/pantallas-s1.md`.

### D3 · Normalización con plural, género, formas verbales y tramo (AC-2, `[S1 resp. 3]`, `[S1 resp. 15]`, `[S1 resp. 33]`)

Mismo algoritmo en ambos lenguajes, aplicado al texto y a cada término:

1. Unicode NFKD y eliminación de las marcas combinantes de categoría **`Mn`** únicamente: "recibír" →
   "recibir", "opción" → "opcion". Las marcas `Mc` y `Me` no se quitan: pasan al paso 3 y separan palabras
   (Python: `unicodedata.category(c) != "Mn"`; TS: `/\p{Mn}/gu`). Los casos de conformidad lo fijan.
2. Minúsculas con `toLowerCase()` / `lower()`, **no** `casefold()`: "Straße" → "straße" en ambos.
3. Todo carácter que no sea letra ni dígito → espacio. Se decide por categoría Unicode: `/[^\p{L}\p{N}]+/gu`
   en TS y, en Python, categoría general distinta de `L*` y `N*`.
4. Espacios colapsados, recorte y partición en palabras. (Pasos 1–4 = **normalización base**; el Nivel B
   por prefijo, las `formas` y `frasesPermitidas` trabajan sobre ella.)
5. **Clave flexiva** de cada palabra (términos sin `formas`, de ambos niveles), reglas en este orden, cada
   una solo si la palabra tiene en ese momento ≥ 4 letras:
   a. enclítico: termina en `ar|er|ir` + `lo|la|los|las|le|les|se` → se quita el enclítico ("recibirlo" y
      "recibirse" → "recibir"; "debe iniciarse" → "debe iniciar");
   b. plural nominal: termina en `s` → se quita ("pacientes" → "paciente", "opciones" → "opcione");
   c. plural verbal: termina en `an|en` → se quita la `n` ("deben" → "debe", "deberían" → "deberia");
   d. género / vocal final: termina en `a|e|o` → se quita ("recomendada" y "recomendado" →
      "recomendad"; "esta" y "este" → "est"; "debe" → "deb"; "opcione" → "opcion").
6. **Candidatas.** (i) Término sin `formas`: sus claves aparecen consecutivas en el texto, salvo que una
   aparición de una de sus `excepciones` contenga ese tramo. (ii) Término con `formas`: alguna forma
   aparece como secuencia de palabras de la normalización base. (iii) Prefijo del Nivel B: una palabra de
   la normalización base empieza por él. Cada aparición es una candidata con su tramo (inicio, longitud
   en palabras).
7. **Tramo más largo** (nuevo en 1.2.0): de las candidatas se aceptan, por longitud descendente y, a igual
   longitud, por inicio ascendente, las que no se solapan con una ya aceptada; en el mismo tramo exacto
   gana el término cuya normalización base es igual al texto y, si ninguno, el primero de la lista. Así
   "no debe recibir" informa solo `es-no-debe-recibir` (no también `es-debe-recibir`), "la mejor opción es"
   solo `es-la-mejor-opcion-es`, "se recomienda iniciar" solo `es-se-recomienda-iniciar`, y "deben
   recibir" una sola vez (`es-deben-recibir`), como en 1.1.0.

Resultado: lista de `{ id, termino, nivel }` en orden de aparición. Firma:
`checkProhibitedTerms(texto, lista, { niveles = ['A'], permitirFrases = false })` y
`check_prohibited_terms(texto, lista, *, niveles=("A",), permitir_frases=False)` (keyword-only, para que
`permitir_frases=True` siempre sea visible en la llamada y lo vigile el test estructural). Python define
`ListaTerminos` (Pydantic) en `app/domain/lenguaje.py`, junto al verificador. Las reglas (a)–(d), las
`formas`, las `excepciones` y el tramo son operaciones de sufijo, de igualdad de secuencias y de orden
sobre cadenas ASCII ya normalizadas: idénticas en JS y en Python (sin regex con `\b` ni clases Unicode
distintas).

`casos.json` contiene, como mínimo (A = solo Nivel A; A+B = niveles A y B con `permitirFrases`):

| Texto | A | A+B |
|---|---|---|
| los textos del AC-2 | una por texto | — |
| "deben recibir" / "recomendada para esta paciente" / "debe recibirlo" / "debe recibirse" / "Deberían recibir" / "las mejores opciones" / "tratamientos indicados" / "The patients should" / "Tratamientos de elección" | una, con el id de 1.1.0 | — |
| "Opciones descritas en la evidencia" | 0 | 0 |
| un texto con dos términos | 2 | — |
| "[afirmación retirada: formulación no permitida]" / "[claim removed: disallowed wording]" `[S1 resp. 16]` | 0 | 0 |
| "La guía recomienda el esquema X" | 0 | 1 `b-recomiend` |
| "no constituye una recomendación" | 0 | 0 (sin `permitirFrases`: 1 `b-recomend`) |
| **`[S1 resp. 33]`, positivos** | | |
| "administre trastuzumab" / "No administre trastuzumab" / "Adminístrelo cada 3 semanas" | 1 `es-administre` | 1 |
| "no debe recibir" | 1 `es-no-debe-recibir` | 1 |
| "No se debe administrar en embarazo" / "se debe administrar con precaución" | 1 (`es-no-se-debe-administrar` / `es-se-debe-administrar`) | 1 |
| "debe iniciarse en las 12 semanas" | 1 `es-debe-iniciar` | 1 |
| "Inicie trastuzumab" / "cambie a pertuzumab" / "Elijan el esquema" / "Ofrezca cirugía" | 1 (id de la forma) | 1 |
| "es necesaria una biopsia" / "Es imprescindible la confirmación" | 1 | 1 |
| "Se recomienda trastuzumab" / "se recomienda iniciar trastuzumab" / "la mejor opción es trastuzumab" | 1 (el tramo más largo) | 1 |
| "se indica trastuzumab" / "no está indicado" / "está contraindicada" / "manejo de elección" | 1 | 1 |
| "We recommend trastuzumab" / "Trastuzumab is recommended" / "should be started" / "must receive" / "should not receive" / "is contraindicated" / "preferred treatment" / "treatment of choice" | 1 | 1 |
| "is indicated for you" | 1 `en-indicated-for-you` (tramo más largo) | 1 |
| **`[S1 resp. 33]`, negativos (descriptivos)** | | |
| "los ensayos evaluaron administrar trastuzumab" | **0** | 1 `b-es-administrar` |
| "la guía recomienda X para pacientes con HER2 positivo" | **0** | 1 `b-recomiend` |
| "el fármaco se administra cada 3 semanas" / "la paciente inicia tratamiento" / "fecha de inicio del tratamiento" / "el cambio a trastuzumab" | 0 | 0 |
| "la toxicidad se debe a la quimioterapia" / "como se indica en la tabla" | 0 (excepciones) | 0 |
| "Iniciar sesión" | 0 | 0 (frase permitida; sin `permitirFrases`: 1 `b-es-iniciar`) |
| **Literales de la UI y del contrato del S1** | | |
| L1D-140 `[S1 resp. 28]`: "Relevancia de recuperación de evidencia", "Metadato secundario: no mide eficacia ni solidez clínica", "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica.", "Orden basado en la cita recuperada más relevante asociada a cada opción", "No resume la aplicabilidad, la eficacia ni la calidad global de la opción." | 0 | 0 |
| L1D-140 `[S1 resp. 29]`, `[S1 resp. 31]`, `[S1 resp. 35]`, `[S1 resp. 36]`: "Registro solo para auditoría: no es contenido clínico utilizable.", "Reintentar", "Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.", la pregunta de prueba de la UI | 0 | 0 |
| L1D-194 `[S1 resp. 32]`: "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." y "Uso académico/investigación" | 0 | 0 |

Los literales de L1D-140 y L1D-194 dan cero **sin** necesidad de `frasesPermitidas` (comprobado con el
prototipo); "iniciar sesión" es la única frase permitida nueva.

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
  permitida). Con la lista 1.3.0 (56 términos de Nivel A, 15 términos y 3 prefijos de Nivel B), specs y
  ejemplos dan cero hallazgos (verificado con el prototipo del algoritmo, 2026-10-14). Los ejemplos nuevos
  de L1D-140 y L1D-194 del S1 (literales de `[S1 resp. 28]`, `[S1 resp. 32]`, `[S1 resp. 35]` y
  `[S1 resp. 36]`) también dan cero (D3).
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

- **Lista finita (56 + 15 términos y 3 prefijos):** paráfrasis no listadas ("se aconseja que reciba") pasan.
  Mitigación: `clinical-language-auditor` en Gate 1/2 y la ampliación por PR de catálogo (sube `version`).
- **Clave flexiva agresiva:** colapsa vocales finales y plurales; puede unir formas no prescriptivas a una
  secuencia prohibida (p. ej. "debo recibir"). El riesgo es acotado porque se exige la secuencia
  completa de palabras, y cada falso positivo se fija como caso de conformidad.
- **`contracts:check` cambia de subcadena a secuencia de palabras:** cubre además plural, género y
  enclíticos (incluido "debe recibirse", que ya marcaba la lista provisional).
- **Falsos positivos en texto del corpus:** las guías usan "should receive" con sujeto poblacional. Por
  eso el recorrido excluye el texto copiado del corpus (D5) y el validador de L1D-180 solo mira texto
  generado.
- **Formas verbales cerradas `[S1 resp. 33]`:** solo se marcan las formas listadas (usted / ustedes y
  enclíticos); el imperativo de tú ("administra") coincide con el indicativo descriptivo y no se lista.
  Un falso negativo así lo detectan `clinical-language-auditor` y la métrica de US-072; se amplía por PR de
  catálogo.
- **Deónticos ambiguos** ("se debe", "se indica", "es necesario"): también tienen usos descriptivos. Las
  `excepciones` cubren los dos frecuentes ("se debe a", "como se indica"); el resto de falsos positivos en
  la salida generada (que L1D-180 retiraría) los mide `false_positive_language_filter_rate` en `evaluate`
  y se revisan periódicamente `[S1 resp. 34]`; cada uno confirmado se fija como caso de conformidad o como
  excepción.
- **Consumidores de la lista:** L1D-180 (Nivel A en ejecución) y L1D-275 (A + B sobre el prompt) leen la
  1.3.0; un prompt que use "iniciar", "elegir" o "offer" fallará su test (Open Question 5).
- **Deriva por versión de Unicode:** CPython 3.13 usa Unicode 15.1 y Node usa el de su ICU; unos ~4850 code
  points (asignados en una versión y no en la otra) pueden clasificarse distinto en `L`/`N`/`Mn`. Riesgo
  aceptado: ningún caso de conformidad lo cubre y los textos de la lista y de la salida son español e inglés.
- **Dos implementaciones:** riesgo de divergencia, acotado por `casos.json` en ambas suites (ahora con los
  casos de formas, excepciones y tramo más largo).


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
2. ~~Ampliar la lista~~ — resuelta por `[S1 resp. 15]` (Nivel A de 22 términos con los conservados del
   Pre-S1, Nivel B `recomend*`) y ampliada por forma por `[S1 resp. 33]` (1.2.0, D2).
3. **Versión del catálogo:** si la lista debe registrarse en `manifest.json` y subir su versión, o
   basta su `version` propia mientras el catálogo no tenga release (asumido lo segundo; dueño: PO;
   afecta: US-041, US-074, `409` por versión distinta entre backends).
4. ~~Tres términos de la lista provisional fuera de `[S1 resp. 15]`~~ — resuelta en el Gate 1:
   "opción preferida", "tratamiento de elección" y "tratamiento óptimo" se conservan en el Nivel A
   (D2) y la clave flexiva cubre "debe recibirse" (D3).
5. **Prompts que citan la lista:** si el prompt de L1D-275 enumera las formulaciones que el LLM no debe
   usar, su test con Nivel A + B fallaría. Asumido: el prompt describe la regla sin citar los términos
   ("no formules indicaciones dirigidas al paciente"); dueño: L1D-275.

6. **Ubicación de `ListaTerminos`:** hoy vive en `app/domain/lenguaje.py` (el dominio no lee archivos, pero el
   modelo es el esquema de un archivo). L1D-180 decide al crear el puerto de carga si se mueve a
   `infrastructure/` y el dominio recibe una vista mínima; dueño: L1D-180.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-23] activa desde S2: listado y ficha se suman al recorrido del AC-3 (US-068 AC-3).
- Regresión [RN-23] activa desde S3: estados completos de espera, sin evidencia y error (US-062) se
  suman al recorrido.
- Regresión [RN-23] activa desde S4: pantalla de alta se suma al recorrido.
- Regresión [RN-23] (salidas generadas) activa desde S1 en L1D-180 (US-064 AC-7, AC-8).
- M-10.2 medido automáticamente desde S2 (US-072); disparo por cambio de lista desde US-074.
