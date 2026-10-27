# Design — l1d-95a-seed-codigos-catalogo

## Contexto

`packages/clinical-catalogs/mama/datos-criticos.json` (1.1.0) usa `destination.match.name` `RE`, `RP`, `HER2`
(+ `exam.exam_type`), `Ki-67`, `BRCA`; próstata usa `PSA` y `HRR`. El seed (`apps/clinical-api/prisma/seed/pacientes/`)
siembra `Receptor de estrógeno` (pacientes a, e) y `Receptor de progesterona` (c). `HER2` y `PSA` ya coinciden.
El catálogo no tiene entradas LOINC para estos biomarcadores (`codigos.json` solo trae CIE-10), de modo que siguen
`no_mapeado` con código nulo (RN-27).

## Decisiones

**D1 · Nombres tomados del catálogo, no inventados.** El nombre sembrado de `biomarker.name` es el
`destination.match.name` del ítem del catálogo (`RE`, `RP`). Es un nombre canónico del catálogo versionado, no un
código; el seed sigue sin contener códigos (RN-27) y sigue siendo solo sintético (RN-13/RN-14). La etiqueta legible
("Receptor de estrógeno") ya vive en `label.es` del catálogo; el seed no la duplica.

**D2 · Qué se renombra y qué no.** Se renombra: seed a, c, e; FX-T1a-a (`insertarFxT1aA`, que localiza el receptor del
seed por nombre y siembra `90 %`, `rechazada`, `reemplazada`); las aserciones de `contenido.test.ts`, `ficha.test.ts` y
`codigos-del-catalogo.test.ts` (el biomarcador sin entrada sigue siendo el `RP` de (c): `no_mapeado`). Se mantienen:
`tests/fixtures/completeness/catalogos/test-*` y `sembrarFM1…FM3` (FX-04-a/b usan los nombres de la tabla de US-002 con
catálogos propios, ver D9 de L1D-94). La etiqueta de la Base del análisis pasa de `Receptor de estrógeno 90 %` a `RE 90 %`:
consecuencia aceptada del cambio de nombre (se compone desde `name`); se ajusta solo esa cadena, no es un debilitamiento. Para L1D-98/L1D-181 se recomienda emparejar por `dataRef`/`id`, no por
el nombre.

**D3 · Test de checklist con el catálogo real 1.1.0.** Un test de integración nuevo
(`tests/integration/completeness/seed-catalogo-real.test.ts`) monta `packages/clinical-catalogs` (1.1.0, ruta real,
no `test-*`) y calcula el checklist con `CompletenessService`: la semilla (a) deja `re` presente; la (c) deja `rp`
presente; y un paciente de test (F-M2 con nombres del catálogo, sembrado con `sembrarBiomarcador` y `name` leído del
JSON del catálogo por el propio test, incluido `BRCA`) deja `re`, `rp` y `brca_germinal` presentes. BRCA y HRR no
existen en el seed (OL-01) y no se añaden: se cubren con la fila sintética del test. 

**D3b · `her2_ihq` (PENDIENTE de decisión del usuario).** El catálogo exige `exam.exam_type = "IHQ"` y el seed siembra
`inmunohistoquimica`. Opciones: (a) alinear el seed a `IHQ` en este change (recomendado: es seed); (b) dejarlo en
L1D-95/S4. No se aplica hasta que el usuario decida; este change y su test no afirman `her2_ihq`.

**D4 · Compatibilidad.** Un cambio de `nombre` en una fila sembrada no requiere migración (las `clave:` del seed no
cambian). Los entornos locales/CI se re-siembran; el piloto no usa el seed (guardas existentes).

## Privacidad y ownership

Solo `clinical-api` y PostgreSQL de test. No se añade ningún campo a la frontera con `rag-orchestrator`; solo cambia el
nombre canónico del biomarcador (`RE`/`RP`), que no es un identificador y viaja en `clinicalContext.biomarkers[].biomarkerName`
y en el texto embebido del paciente. Avisar a `ai-eval-runner`: cambia el texto embebido del paciente semilla. Seed y
fixtures son sintéticos (RN-13/RN-14); sin identidad ni secretos. RN-27: sin entrada en el catálogo → código nulo y `no_mapeado`, nunca
inventado.

## Contratos

Sin cambio de `openapi.yaml` ni de `contracts/examples/` (los ejemplos de `rag-orchestrator` con
`Receptor de estrógeno` se reportan a `ai-services-dev`). No hay commit `contract(L1D-95a)`.

## Riesgos

- L1D-98/L1D-181 en curso pueden afirmar el nombre antiguo; mitigación: van después de este change y emparejan por `id`.
- Etiquetas compuestas desde `name` cambian de texto (D2).
