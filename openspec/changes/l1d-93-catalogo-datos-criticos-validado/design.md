# Design — l1d-93-catalogo-datos-criticos-validado

## Context

Ver `proposal.md` (Por qué). Estado observado en `main`:

- `packages/clinical-catalogs/{mama,prostata}/datos-criticos.json` = `{ "version": "1.0.0", "items": [] }`;
  `schemas/datos-criticos.schema.json` solo exige `version` e `items: array`. `manifest.json.version = "1.0.0"`.
- `packages/clinical-catalogs` no es un workspace con `package.json`; los esquemas JSON se validan hoy en el test de
  US-041 con `ajv` (dependencia de raíz).
- `clinical-api` valida el manifiesto con Zod (`src/infrastructure/catalogo/manifiesto.schema.ts`), compara versión
  (`modules/evidence-analysis/catalog-version.provider.ts`) y emite `configuracion_invalida` desde `src/startup.ts`
  con los motivos cerrados de `src/config/secciones.ts` (`catalogo_no_disponible`, `version_catalogo_distinta`,
  `tipo_no_en_catalogo`).
- Prisma: los campos se declaran en camelCase con `@map` a snake_case (`stageValue` → `stage_value`); `Biomarker`
  se relaciona con `Exam` (`exam_type`); `ClinicalAttribute.attribute_key` es `String` libre.
- `catalog:validate` no existe. l1d-126 (US-121) cuenta con él y le añade `rechazarCamposDePuntaje()`.

## Goals / Non-Goals

**Goals:** esquema estricto del ítem de dato crítico; validador ejecutable en CI y en el arranque de `clinical-api`
con reglas RN-29 con nombre; allowlist generada del modelo; integridad `catalogHash`; contenido del S3.

**Non-Goals:** calcular el checklist (US-002), forma/contenido de los criterios de aplicabilidad (l1d-126), registro
de la decisión clínica (L1D-92), endpoints nuevos.

## Decisions

**D1 · Forma del ítem** (`additionalProperties: false` en todos los niveles):

```json
{ "key": "her2_ish", "cancerType": "mama", "label": { "es": "HER2 por ISH", "en": "HER2 ISH" },
  "destination": { "entity": "Biomarker", "field": "value", "match": { "name": "HER2", "exam.exam_type": "ISH" } },
  "condition": { "item": "her2_ihq", "operator": "pertenencia", "values": ["2+"] },
  "whenConditionUnknown": "faltante", "minValues": 1, "estado": "propuesta" }
```

- `destination` = `entity` + `field` (opcional cuando la entidad entera es el dato, p. ej. `PriorTreatment`) + `match`
  (pares campo → valor). Los nombres de campo son los **de columna** (`stage_value`, `attribute_key`), los mismos que
  usan la documentación y el PRD; la allowlist mapea DMMF `dbName ?? name`. `entity` ∈ **lista cerrada de entidades
  clínicas**: `Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`, `ClinicalAttribute`, `ClinicalEvent`
  (decisión del usuario, 2026-10-24, `[S3 resp. 16]`). Un catálogo nunca apunta a `PatientIdentity`, `User`,
  `Session`, `AuditLog` ni `ClinicalNote` (identidad, cuentas, auditoría y texto libre: RN-10, mínimo privilegio);
  aunque existan en el DMMF, para el validador son `destino_inexistente`. Una clave `relacion.campo` en `match`
  recorre una relación directa (solo `exam.exam_type` en el S3, `[S3 resp. 5]`). Es la misma forma que l1d-126 D1
  usa para los criterios: una sola regla cubre ambos.
- `condition.operator` ∈ {`igualdad`, `pertenencia`, `prefijo`}; `whenConditionUnknown` ∈ {`faltante`, `no_aplica`},
  obligatorio si hay `condition` (por esquema, `if/then`). Valor del S3: `faltante` (DEC-01 Q4, `[S3 resp. 1]`).
- Nivel de archivo: `verifiedReviewStatuses` (`["verificado", "corregido"]`, DEC-01 Q1) y `validation` opcional.
- **Claves de `ClinicalAttribute`**: archivo nuevo de raíz `packages/clinical-catalogs/atributos.json`
  (`{ version, keys: [{ key, cancerTypes, label }] }`) con `estado_menopausico`, `sitios_metastasicos`,
  `estado_castracion`. Va en la raíz para no alterar los seis archivos por tipo que exige US-041. Alternativa
  descartada: lista dentro de `datos-criticos.json` (l1d-126 y US-094 también necesitan las claves).

**D2 · Validador** `scripts/catalog/validate.mjs` (Node, sin bundler, `ajv` ya en raíz) + script de raíz
`catalog:validate [--dir <ruta>]` (por defecto `packages/clinical-catalogs`). El núcleo es una función pura
`validarCatalogo(archivos, allowlist) → Resultado` en `packages/clinical-catalogs/validator/` exportada para que
`clinical-api` la importe en el arranque (una sola implementación, dos entradas). Reglas con nombre, cada una con
su código estable (lo que viaja al log del AC-6):
`exigirDestino()` → `destino_ausente` · `exigirDestinoExistente()` → `destino_inexistente` ·
`exigirAtributoDeclarado()` → `atributo_no_declarado` · `exigirCondicionBienFormada()` → `condicion_invalida` ·
`exigirEstadoValido()` → `estado_invalido` (además del esquema) · `verificarCatalogHash()` → `hash_distinto`.
El validador recorre **todos** los archivos con ítems con destino (`datos-criticos.json`, `aplicabilidad.json` y,
cuando exista, el de supuestos de US-129). l1d-126 añade `rechazarCamposDePuntaje()` y `exigirStudyKey()` en el mismo registro de reglas.
Mensaje: `<codigo> <cancerType>/<key>`; nunca ruta absoluta ni valores.

**D3 · Allowlist del modelo** generada, no escrita a mano: `scripts/catalog/generar-allowlist.mjs` lee el DMMF con
`@prisma/internals` `getDMMF` sobre `apps/clinical-api/prisma/schema.prisma` y escribe
`packages/clinical-catalogs/validator/modelo.allowlist.json` con **solo** las seis entidades clínicas de D1 (lista
cerrada en el generador, `[S3 resp. 16]`), sus campos de columna y relaciones directas entre ellas. Una entidad de
la lista que desaparece del DMMF rompe la generación; una entidad nueva del modelo no entra sin cambiar la lista. Un test de CI comprueba que el archivo commiteado coincide con el regenerado (mismo patrón
que `contracts:generate:check`): un cambio del modelo rompe la validación. El escenario "campo eliminado" usa un
`schema.prisma` de fixture.
- Alternativa descartada: leer el DMMF en cada validación (arrastra Prisma al arranque y a la CI de catálogo).

**D4 · `catalogHash`** = SHA-256 hex del JSON canónico (claves ordenadas, sin espacios) de los ítems cubiertos por
`scope` (`datos_criticos` → `items` de `datos-criticos.json` del archivo; `matriz_item_campo` → sus `destination`),
excluyendo el propio bloque `validation`. `scope` es **array** en todos los archivos, con valores ∈
{`datos_criticos`, `matriz_item_campo`, `aplicabilidad`}; `aplicabilidad` → `items` de `aplicabilidad.json` del
archivo. l1d-126 usa `scope = ["aplicabilidad"]` con su `catalogHash` (decisión del usuario, 2026-10-24,
`[S3 resp. 16]`). Un script `catalog:hash` lo calcula para quien publica la versión revisada (L1D-92).

**D5 · Arranque**: `startup.ts` llama a `validarCatalogo` tras leer el manifiesto; un fallo emite
`configuracion_invalida` con `motivo = catalogo_invalido` (motivo nuevo en `secciones.ts`) y `codigo` (enum
cerrado de D2), y el proceso no queda listo (`[S3 resp. 5]`, como US-042 AC-5). `rag-orchestrator` no valida
(solo lee `manifest.json`; l1d-126 añade su lector de aplicabilidad).

**D6 · Versión**: `manifest.json.version` y la `version` de cada archivo por tipo suben a **`1.1.0`** (contenido
nuevo; una sola subida para FEAT-04 y FEAT-08b del S3, l1d-126 D5). Se actualizan los valores
`CLINICAL_CATALOG_VERSION` del Compose, la CI y los fixtures de test de ambos backends que hoy esperan `1.0.0`.

## Dependencias y colaboradores

- Crea: `packages/clinical-catalogs/validator/` (núcleo puro + reglas + allowlist generada), `atributos.json` y su
  esquema, `scripts/catalog/{validate,generar-allowlist,hash}.mjs`, fixtures FX-04-a en
  `packages/clinical-catalogs/test/fixtures/`.
- Modifica: `schemas/datos-criticos.schema.json`, `{mama,prostata}/datos-criticos.json`, `manifest.json`,
  `package.json` de raíz (scripts), `apps/clinical-api/src/startup.ts` y `src/config/secciones.ts` (motivo nuevo),
  `.github/workflows/ci.yml` (job `catalog:validate` + chequeo de allowlist).
- `validarCatalogo` no hace E/S: recibe los archivos ya leídos y la allowlist; la lectura vive en el script y en el
  adaptador de arranque de `clinical-api`. Cada regla es una función con nombre (las verifica un guardián).

## Privacidad y ownership

- Solo datos de catálogo (públicos, versionados, sin PHI ni datos de pacientes, RN-14). No cruza ninguna frontera
  web → clinical-api → rag-orchestrator; el catálogo se monta de solo lectura (ADR-38).
- `rag-orchestrator` no cambia y no toca datos clínicos ni `clinical-minio`.
- Los mensajes y el log nombran código de regla e ítem, nunca la ruta ni el contenido (AC-6, regla de logs).
- Fixtures 100 % sintéticos.

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml` ni `contracts/examples/`: no
hay endpoints nuevos; `/health` ya responde ≠ 200 cuando el servicio no está listo. Proveedor: ninguno nuevo;
compatible con ADR-26 (oasdiff sin diferencias). Los esquemas JSON del catálogo no son contratos OpenAPI.

## Evaluación

Toca el **catálogo**: el PR corre `run-ai-eval` (OL-06, AC-T5.4 → US-074). Ninguna métrica actual cambia de forma
directa (los datos críticos aún no alimentan el prompt); se registra el baseline de faltantes que mide US-131
(M-04.1, M-04.2). `catalog:validate` en CI es el control de M-04.3 (gobierno).

## Risks / Trade-offs

- [Choque con l1d-126 en el validador y la versión] → este change va primero; l1d-126 solo añade una regla y el
  contenido de aplicabilidad sobre `1.1.0`.
- [`@prisma/internals` es API interna] → se fija la versión de Prisma del repo; si cambia, falla el chequeo de la
  allowlist en CI, no en silencio.
- [Subir a `1.1.0` rompe tests que esperan `1.0.0`] → tarea explícita de actualización; el `409` de US-041 detecta
  cualquier olvido entre backends.

## Decisiones del Gate 1 (usuario, 2026-10-24, `[S3 resp. 16]`)

- **Destinos permitidos**: solo las seis entidades clínicas (D1, D3); escenario `PatientIdentity.*` →
  `destino_inexistente`.
- **`validation.scope`**: array en todos los archivos más `catalogHash`; se admite `aplicabilidad` (D4).
- **Requisito sin duplicar**: "Todo ítem del catálogo con destino lo declara" vive aquí; l1d-126 le añade el
  escenario de US-121 AC-2 como `MODIFIED` y se archiva después de este change.

## Pendientes de definir

- **¿La versión del S3 ya lleva `validation.status = "propuesta_revisada"`? (dueño: L1D-92).** Este change publica
  los ítems con `estado = "propuesta"` (AC-7); el bloque `validation` y su hash los añade L1D-92 con `catalog:hash`.
- **Destino de `tratamientos_previos`, `psa_serie`, `brca_germinal` y `hrr_brca`** (asumidos: `PriorTreatment`
  entidad entera; `Biomarker` `name = PSA` con `minValues` de DEC-01 Q6; `Biomarker` `name = BRCA`/`HRR`). Se
  revisan en la sesión de oncólogos del S4; un cambio solo toca el JSON.
- **Discrepancia Linear ↔ Markdown:** no comprobada (MCP de Linear no consultado en esta corrida). Manda el Markdown.
