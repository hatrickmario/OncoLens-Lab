# Design — l1d-310-pacientes-momentos-enfermedad

## Contexto

El seed (`apps/clinical-api/prisma/seed/`) siembra (a)–(f) desde `pacientes/<x>.ts` (`PacienteSemilla`, términos
canónicos sin códigos, fechas en «días antes» de `SEED_REFERENCE_DATE`) con `upsertar()` idempotente sobre
`idSembrado(claveNatural)` (UUID v5). Ya escribe `prior_treatment`, `clinical_event` y `clinical_attribute`, pero:
todo tratamiento queda `ongoing = true`, `ended_at = null`, y `EventoSemilla.tipo` solo admite `progresion`. El seed
publica sus conteos (`seed_completo.filas`) y `levantar.sh` los compara con `count(*)` en «Verificación del seed»
(`contar.ts`, `verificar-conteos.py`, US-247). El modo `LLM_PROVIDER=fake` elige la respuesta por la `query` exacta
de cada ejemplo `RagQueryInternalResponse` de `contracts/examples/index.json`; los estados de aplicabilidad del modo
fingido son los del ejemplo (no dependen del paciente), y la guía de la demo es la fuente única de los conteos
(`guia-demo-S4.md`, bloque `conteos-demo-s4`, leído por `apps/web/e2e/demo-s4-pares.spec.ts`).

## Decisiones

- **D1 · Pacientes nuevos (g)–(m), un fichero cada uno**, mismo patrón que (a)–(f); se añaden al final de
  `PACIENTES_SEMILLA` para que (a)–(f) conserven sus ordinales 1–6 (identidades `SINT-0000001`…`6` intactas) y los
  nuevos tomen 7–13 (`SINT-0000007`…`SINT-0000013`, «Prueba Sintética 7»…«13»). Todos `data_origin = sintetico`,
  `entry_method = seed`, `review_status = verificado`, mismo convenio y un episodio abierto. Contenido propuesto
  (términos canónicos; los nombres de biomarcador son los del catálogo de datos críticos):

  | Paciente | Momento | Diagnóstico (días) | Biomarcadores y atributos | Tratamientos previos (inicio → fin, motivo) | Eventos (días antes) |
  |---|---|---|---|---|---|
  | (g) F 1978 | mama inicial sin tratar | CDI, TNM_8 IIA, ECOG 0, Nottingham 2 (12) | RE 90 %, RP 70 %, HER2 2+ (IHQ); premenopáusica; sin ISH, Ki-67 ni BRCA | ninguno | ninguno |
  | (h) F 1966 | mama adyuvante tras cirugía | CDI, IIA, ECOG 0, Nottingham 2 (150) | RE 95 %, RP 40 %, HER2 1+, Ki-67 20 %; posmenopáusica | L1 `adyuvante` Letrozol (60 → en curso) | `cirugia` cuadrantectomía (120) |
  | (i) F 1961 | mama recaída local | CDI, IIB, ECOG 1, Nottingham 3 (1900) | RE 80 %, RP negativo, HER2 1+, Ki-67 30 %; posmenopáusica | L1 `adyuvante` Tamoxifeno (1830 → 30, `progresion`) | `cirugia` mastectomía (1860) · `recaida` local en pared torácica (30) |
  | (j) F 1958 | mama metastásica, primera línea | CDI, IV, ECOG 1, Nottingham 2 (75) | RE 90 %, RP 50 %, HER2 0, Ki-67 15 %, BRCA no mutado; posmenopáusica | L1 `primera_linea_metastasica` Letrozol + palbociclib (45 → en curso) | ninguno |
  | (k) F 1970 | mama HER2+ metastásica tras trastuzumab, pertuzumab y T-DM1 | CDI, IV, ECOG 1, Nottingham 3 (1400) | HER2 3+ (IHQ) y amplificado (ISH), RE y RP negativos, Ki-67 40 %, BRCA no mutado; posmenopáusica | L1 `primera_linea_metastasica` Trastuzumab + pertuzumab + docetaxel (1370 → 560, `progresion`) · L2 `segunda_linea_metastasica` Trastuzumab emtansina (540 → 40, `progresion`) | `progresion` hepática (560) · `progresion` pulmonar y hepática (40) |
  | (l) M 1952 | próstata metastásica sensible a la castración | adenocarcinoma acinar, T3aN1M1b, ECOG 1, Gleason 4+4 biopsia (50) | PSA 48,0 (52) y 6,2 (10) ng/mL; castración: `sensible_castracion` (lo añade `l1d-80`, `[S5 resp. 13]`); sitios `oseo` | L1 `primera_linea_metastasica` Leuprorelina (`L02AE02`) + abiraterona (40 → en curso) | ninguno |
  | (m) M 1948 | próstata resistente a la castración | adenocarcinoma acinar, T3bN1M1b, ECOG 1, Gleason 4+5 biopsia (1100) | PSA 85,0 (1100), 0,8 (400), 14,5 (30) ng/mL; HRR no mutado; `resistente_castracion`; sitios `oseo` | L1 `primera_linea_metastasica` Leuprorelina (`L02AE02`) + docetaxel (1080 → 90, `progresion`) · L2 `segunda_linea_metastasica` Enzalutamida (60 → en curso) | `progresion` bioquímica y ósea (90) |

  Los faltantes **los calcula el servicio de completitud** con el catálogo montado, no se escriben a mano: se
  esperan (g) con varios (HER2 ISH, Ki-67, BRCA…), (l) con HRR, y (k) sin ninguno (los 12 ítems de mama presentes).
  La guía publica la lista resultante, generada por el test del AC-3.

  **Códigos y catálogo.** Los valores de atributos y `setting` salen de `atributos.json` 1.2.0 / manifest 1.4.0 (cadena
  del catálogo `[S5 resp. 10]`, misma versión en ambos backends). Los ATC son **solo reales** del subconjunto que añade
  `l1d-80` (`L02AE02` leuprorelina, `L02BB03` bicalutamida, trastuzumab, pertuzumab, trastuzumab emtansina;
  `[S5 resp. 9]`): la deprivación androgénica se siembra como leuprorelina `L02AE02`; nunca un código de test
  (`ATC-T-LEUP`) ni se relaja el patrón. Los regímenes sin código en el subconjunto (palbociclib, tamoxifeno,
  abiraterona, enzalutamida) quedan `no_mapeado` (RN-27); letrozol (`L02BG04`) y docetaxel (`L01CD02`) sí están.
  **Combinaciones (implementado):** `TratamientoPreviaSemilla.farmacos` lista los términos canónicos de cada fármaco;
  el catálogo resuelve cada uno, `atc_codes` lleva los que encuentra y el régimen solo es `mapeado` si resuelven todos
  (p. ej. «Leuprorelina + abiraterona» lleva `L02AE02` y queda `no_mapeado`). Sin `farmacos`, el régimen se resuelve
  entero, como en (a)–(f).
- **D2 · Fin de un tratamiento (aditivo en `tipos.ts`).** `TratamientoPreviaSemilla` gana `fin?: { diasAntes;
  motivo: 'progresion' | 'toxicidad' | 'completado' }`; sin `fin` → `ongoing = true`, `ended_at = null`,
  `end_reason = desconocido` (como hoy, alineado con P-2 de `l1d-80`). `EventoSemilla.tipo` pasa a
  `'cirugia' | 'recaida' | 'progresion' | 'respuesta'` (subconjunto del enum de `data-model.md`). Un evento de
  progresión que cierra una línea se enlaza con `prior_treatment_id` (clave `<paciente>/<tratamiento>`); el resto
  `null`. (a)–(f) no cambian.
- **D3 · Coherencia temporal como regla con nombre.** `historiaCoherente(paciente)` (pura, en `pacientes/tipos.ts` o
  `pacientes/coherencia.ts`) comprueba: diagnóstico ≤ inicio de cada línea y de cada evento; líneas numeradas 1..n sin
  huecos y con inicio creciente; `fin` posterior al inicio y anterior o igual al inicio de la línea siguiente; ningún
  día negativo (nada en el futuro respecto del reloj del seed). La usa el test (AC-2) sobre los 13 pacientes; el seed
  no la ejecuta en producción (YAGNI).
- **D4 · Conteos de la verificación.** `CONSULTAS_DE_CONTEO` suma `clinical.prior_treatment`, `clinical.clinical_event`
  y `clinical.clinical_attribute` (solo `count(*)`, rol de `clinical-api`); `verificar-conteos.py` los compara como
  **mínimos** (`MINIMOS`), porque un registro manual de la demo (US-094, US-110) los sube y no es un fallo. Pacientes =
  identidades = pacientes del seed sigue siendo igualdad. *Descartado:* igualdad estricta (rompe tras registrar a mano
  en el ensayo y relanzar con `--continuar`).
- **D5 · Una sola fuente del número de pacientes en los tests.** Los tests que hoy fijan `5` (listado, orden, seed,
  identidades, índice ciego, E2E del listado) leen `PACIENTES_SEMILLA.length` exportado por el seed, salvo el test de
  conteos del seed, que fija el literal (13, o 10 con el recorte) porque es justo lo que verifica. No es debilitar
  aserciones: cambia el dato de partida, no el AC; ningún test se quita.
- **D6 · Ejemplos del modo fingido por paciente.** Un par request/response por paciente nuevo, con una pregunta
  exacta distinta de las del S4 y entre sí, `status = con_evidencia` y opciones que citan fragmentos **existentes** del
  corpus de la demo (`data/raw/seed/`, `poblacion-verificada.json`), con `applicabilitySummary` coherente con los
  datos del paciente (p. ej., (j) una opción anti-HER2 con HER2 en No coincide → `populationNotComparable = true`;
  (k) Coincide en `estado_her2`; (m) No coincide excluyente en `estado_castracion` ante una población solo sensible).
  Los conteos se escriben **una vez** en el bloque `conteos-demo-s5` de la guía; el E2E compara ejemplos y respuesta
  contra ese bloque (patrón de `demo-s4-pares.spec.ts`). Lenguaje no prescriptivo en `summary` y opciones (RN-23) y
  aviso de IA (RN-19) como en los ejemplos del S4.
- **D7 · Guía nueva `docs/demo/guia-demo-S5.md`**, sección «Pacientes en distintos momentos de la enfermedad»; US-142
  (G-Demo) la amplía después. La Demo 4 no cambia.

## Ajustes al implementar (2026-11-03)

- **(f) ya existía.** `main` trae un paciente (f) = FX-T3-a (US-071, L1D-196, ordinal 6), no previsto por este change
  (que asumía cinco pacientes). Los siete nuevos son por eso **(g)–(m)** (ordinales 7–13, `SINT-0000007`…`SINT-0000013`,
  trece pacientes semilla). Los ejemplos se llaman `…demo-s5-{g-inicial, h-adyuvante, i-recaida, j-metastasica-1l,
  k-her2-tras-tdm1, l-hspc, m-crpc}`. (f) no cambia.
- **`historiaCoherente()` se aplica a los siete nuevos**, no a los trece: (b) (OL-01) fecha su ADT 229 días antes de la
  fecha de referencia y su diagnóstico 57 días antes, es decir, una línea anterior al diagnóstico. Corregirlo cambia los
  PSA y los tests de contenido de US-039 AC-2 (fuera del alcance de este change); queda reportado.
- **Iniciales del listado.** «Prueba Sintética 10»…«13» se abrevian «P. S. 1.» (primer carácter de cada palabra): el E2E
  del listado distingue a los pacientes por el final enmascarado del documento.
- **E2E con `ENABLED_CANCER_TYPES=mama`** (`scripts/e2e/ejecutar.sh`, fuera de los paths del change): los análisis por
  paciente se prueban para los cinco de mama; para (l) y (m) el E2E abre la ficha y comprueba el aviso de tipo fuera de
  alcance (US-043 AC-3), y sus conteos se comprueban contra los ejemplos fijos y la guía.
- **Oráculo de `codigos-del-catalogo.test.ts` ampliado** (US-039 AC-4): resuelve cada fármaco de un régimen combinado;
  los términos sin combinar se comprueban igual que antes.

## Privacidad y ownership

- Solo datos sintéticos (RN-13, RN-14): identidades `SINT-00000nn` / «Prueba Sintética n» (tipo `sintetico`), sin
  nombres, documentos, fechas absolutas ni lugares reales en descripciones de eventos o regímenes; el seed sigue
  negándose en `piloto` y con `REAL_*_ENABLED=true` (guarda existente).
- Identidad cifrada con `IdentityService` (RN-10) como (a)–(f); los logs del seed solo llevan conteos por tabla.
- Fronteras: el seed escribe solo en `clinical-api`/PostgreSQL. Al analizar, el contexto viaja desidentificado por el
  constructor existente (seudónimo por consulta, fechas relativas, RN-11); los ejemplos fingidos de
  `contracts/examples/` llevan el `patientContext` ya desidentificado (sin `patientId` ni fechas absolutas).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; no cambia.
- La verificación del seed sigue con `count(*)` y el rol del servicio dentro de su contenedor (privacy P2).

## Contratos

- Sin cambios en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml` (ADR-26 intacto; oasdiff
  sin diferencias).
- Ejemplos nuevos (no normativos), proveedor `rag-orchestrator`, consumidor `clinical-api` en modo fingido:
  `rag-query-request-demo-s5-<paciente>.json` (`#/components/schemas/RagQueryInternalRequest`) y
  `rag-query-demo-s5-<paciente>.json` (`#/components/schemas/RagQueryInternalResponse`, con `request`), con
  `<paciente>` ∈ {`g-inicial`, `h-adyuvante`, `i-recaida`, `j-metastasica-1l`, `k-her2-tras-tdm1`, `l-hspc`,
  `m-crpc`}. `contracts:check` los valida contra el spec; el test de `FakeEvidenceQuery` comprueba que cargan.

## Dependencias y colaboradores

- Modifica: `prisma/seed/pacientes/tipos.ts` (D2), `prisma/seed/sembrar.ts` (`PACIENTES_SEMILLA` exportado, fin de
  tratamiento, `prior_treatment_id` del evento), `prisma/seed/contar.ts`, `prisma/seed/identidades.ts` (solo el
  comentario de ordinales), `scripts/demo/verificar-conteos.py`, `scripts/demo/levantar.sh` (solo el texto del paso,
  si hace falta), `contracts/examples/index.json`.
- Crea: `prisma/seed/pacientes/{g,h,i,j,k,l,m}.ts`, `pacientes/coherencia.ts` (`historiaCoherente()`, D3),
  `docs/demo/guia-demo-S5.md`, `apps/web/e2e/demo-s5-pacientes.spec.ts`, 14 ejemplos.
- Depende de: catálogo montado (`leerCatalogo`, códigos solo del catálogo, RN-27: regímenes sin ATC → `no_mapeado`),
  `IdentityService`, servicio de completitud (AC-3), `GET …/case` de `l1d-74` (AC-2).
- Fakes tocados: ninguno nuevo; `FakeEvidenceQuery` se ejercita con más ejemplos (su test de contrato vive en
  `apps/rag-orchestrator/tests/unit/test_fake_evidence_query.py`).

## Evaluación

No aplica: no cambia modelo, prompt, umbral, catálogo ni corpus. Los ejemplos fingidos no entran en la suite
`evaluate`.

## Riesgos

- El servicio de completitud podría marcar «Tratamientos previos» como faltante en (g), que por definición no tiene
  ninguno (P-2, decidido: no se siembra nada y el checklist decide). El AC-3 solo exige variedad; la guía documenta lo
  que calcula el servicio.
- Conflictos de merge con `l1d-309` (sus 2 notas sintéticas en (a)) y `l1d-80` en `sembrar.ts` y en los tests de conteo
  (triviales, orden de PR; se conservan las 2 notas de `l1d-309`).
- Si `l1d-80` fija listas distintas de D6/D7, los valores de (g)–(m) se ajustan a ellas antes del merge (su test lo
  detecta).

## Pendiente de definir

- **P-1 — Decidido (usuario, 2026-11-03, `[S5 resp. 13]`):** el valor «sensible a la castración»
  (`sensible_castracion`) lo añade `l1d-80` a `estado_castracion` en `atributos.json` 1.2.0 / manifest 1.4.0; se usa en
  (l) y en (b).
- **P-2 — Decidido (usuario, 2026-11-03, `[S5 resp. 13]`):** «sin tratamientos previos» en (g) no se siembra; el
  checklist decide y la guía lo explica.
- **P-3 (dueño: humano; afecta a AC-1):** activar el recorte (4 pacientes) — punto 4 del orden de recorte del S5.
