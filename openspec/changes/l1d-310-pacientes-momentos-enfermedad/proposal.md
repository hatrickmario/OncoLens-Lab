# Proposal — l1d-310-pacientes-momentos-enfermedad

## Trazabilidad

L1D-310 · US-254 · FEAT-06c (L1D-18) · Sprint 5 · Estimación **5** (D-6, `[S5 resp. 4]`) · CAP-02, CAP-04, CAP-08 ·
RN-11, RN-13, RN-14, RN-27, RN-29 · PRD E-17 (3) · US-254 AC-1…AC-5 · ↪ US-247 (seed y guía de la Demo 4), US-039
(seed sintético) · 🔗 Medido en: US-142 (G-Demo) · `backlog/features/FEAT-06c-corpus-cientifico.md` §US-254 ·
`backlog/sprints/S5-refinamiento.md` §2 (O3; orden de recorte punto 4: «US-254 de 7 a 4 pacientes»), D-6

## Por qué

Los 5 pacientes del seed (a)–(e) no cubren la evolución de la enfermedad. Los oncólogos (feedback del 2026-11-02, PRD
E-17) piden casos en distintos momentos para comprobar que el análisis cambia con la historia del paciente y no solo con
la pregunta, y G-Demo (US-142) necesita esos casos para «caso registrado y editado a mano → faltantes → análisis con
debate».

## Qué cambia

- **Seed sintético** (`apps/clinical-api/prisma/seed/pacientes/`): 7 pacientes nuevos (f)–(l) con identificadores
  deterministas (`idSembrado`, claves `paciente-f`…`paciente-l`, identidades sintéticas ordinales 6–12):
  - mama: (f) diagnóstico inicial sin tratar · (g) adyuvante tras cirugía · (h) recaída local · (i) metastásico en
    primera línea · (j) metastásico tras trastuzumab, pertuzumab y trastuzumab emtansina;
  - próstata: (k) metastásico sensible a la castración · (l) resistente a la castración.
  Cada uno con tratamientos previos por línea (con fin y motivo cuando terminaron) y eventos (`cirugia`, `recaida`,
  `progresion`) con fechas relativas a `SEED_REFERENCE_DATE` coherentes con su momento. Tipos del seed ampliados de
  forma aditiva (`EventoSemilla.tipo`, fin de un tratamiento). Se usan las tablas existentes `prior_treatment`,
  `clinical_event` y `clinical_attribute` (sin migración) con los valores del catálogo que fija `l1d-80`.
- **Conteos del seed**: `contar.ts` y `scripts/demo/verificar-conteos.py` añaden `clinical.prior_treatment`,
  `clinical.clinical_event` y `clinical.clinical_attribute` como **mínimos** (un registro manual de la demo los sube);
  pacientes = identidades siguen siendo igualdad. `levantar.sh` imprime los conteos nuevos en «Verificación del seed».
- **Modo fingido**: un par de ejemplos por paciente nuevo en `contracts/examples/`
  (`rag-query-request-demo-s5-<paciente>.json` → `rag-query-demo-s5-<paciente>.json`), registrados en `index.json`
  con su `request`; sin cambios en ningún `openapi.yaml`.
- **Guía de la demo**: `docs/demo/guia-demo-S5.md` (nueva) con la tabla de pacientes por momento, la pregunta sugerida
  exacta de cada uno, los faltantes esperados y un bloque JSON `conteos-demo-s5` con los conteos de aplicabilidad
  esperados en modo fingido (fuente única, como el de la Demo 4).
- **Tests**: test de conteos del seed (integración, PostgreSQL real), test de coherencia temporal de las historias,
  test de faltantes variados, prueba de aceptación E2E `apps/web/e2e/demo-s5-pacientes.spec.ts` contra Compose con
  `LLM_PROVIDER=fake`, humo de la verificación del seed; los tests que fijaban «5 pacientes» pasan a leer el número de
  una sola fuente.

## Capacidades

- `data-model` (MODIFIED «Seed sintético de demo con pacientes y usuarios de OL-01»; ADDED pacientes por momento,
  historia coherente, faltantes variados e identificadores sintéticos deterministas).
- `demo-install` (MODIFIED «levantar.sh verifica el seed contra los conteos que publica el propio seed»; ADDED guía de
  la demo con pregunta sugerida y estados esperados por paciente nuevo).
- `patients-identity`: sin delta (su requisito afirma las identidades de (a)–(e), que siguen siendo ciertas; las
  nuevas las cubre el requisito ADDED de `data-model`).

## Bounded contexts

contratos (solo ejemplos de `contracts/examples/`, sin cambio de API) · clinical-platform (seed de
`apps/clinical-api`, `scripts/demo/`, guía, E2E de la demo). Sin ai-services (el fake de `rag-orchestrator` ya carga
cualquier ejemplo de `index.json`) ni frontend.

## Dependencias

- ↪ `l1d-80-tratamientos-atributos-manuales` (US-094, O2): fija `setting` (D6) y `values` de los atributos (D7) del
  catálogo (`atributos.json` 1.2.0 / manifest 1.4.0, cadena del catálogo `[S5 resp. 10]`) y el subconjunto ATC con los
  códigos reales (`L02AE02` leuprorelina, `L02BB03` bicalutamida, trastuzumab, pertuzumab, T-DM1; `[S5 resp. 9]`); su test «los valores del seed sintético están en el catálogo» cubrirá también a (f)–(l). Los
  valores de este seed se toman de esas listas. El valor «sensible a la castración» lo añade `l1d-80` (`[S5 resp. 13]`).
- ↪ `l1d-74-vista-caso-timeline` (US-088, O1): `GET …/case` (`priorTreatments`, `timeline`) es por donde se verifica el
  AC-2. Si no ha mergeado, el AC-2 espera; el resto del change no.
- 🔗 `l1d-309-correccion-con-historico` (US-253, O2): añade las 2 notas sintéticas (`comorbilidad` y `nota_libre`, sin PII;
  `[S5 resp. 13]`) al paciente (a) en `sembrar.ts`; este change no toca (a) ni crea notas: el seed de notas es solo de
  `l1d-309`, y quien mergee segundo conserva esas 2 notas y los conteos que las incluyen. Conflicto de merge trivial en `sembrar.ts` y en los tests de conteo; se resuelve en orden de
  PR.
- 🔗 `l1d-76-vista-caso-pagina` (US-090): la vista de caso donde el oncólogo ve la historia en la demo (no bloquea).
- 🔗 `l1d-119-corpus-ampliado-calibracion` (US-120): los ejemplos fingidos citan fragmentos del corpus de la demo
  vigente en `data/raw/seed/`; si US-120 cambia los `chunkId` antes del merge, se reapuntan.
- 🔗 ARR-10 / D5-02: la CI valida `contracts/examples/**` contra `main`.
- ↪ Archivados: `l1d-169-synthetic-demo-seed`, `l1d-95a-seed-codigos-catalogo`, `l1d-297-demo-datos-levantar-verificacion`.

## Fuera de alcance

- Notas clínicas en los pacientes nuevos (las crea `l1d-309` solo en (a)); registro o corrección manual (US-094,
  US-110, US-253).
- Ampliar el catálogo ATC: los regímenes sin código quedan `no_mapeado` (RN-27); no es cambio de catálogo.
- Conteos de aplicabilidad en vivo con el LLM real (la guía los documenta solo en modo fingido; los de vivo los mide
  US-142).
- Corpus nuevo (US-120) y pacientes de leucemia (RN-20).
- **Orden de recorte del S5 (4):** si a mitad del día 2 el ritmo no da, se siembran 4 pacientes ((f), (j), (k), (l)) en
  lugar de 7; exige aprobación del humano y reescribir el AC-1 (ver `tasks.md` §6).
