# Design — l1d-84-normalizacion-final-manual

## Contexto

ADR-33 hace a Backend 1 dueño de la normalización terminológica final; Backend 2 solo propone (Post-MVP en la
extracción). RN-27: los códigos salen solo del catálogo versionado y, sin mapeo, `no_mapeado`, nunca inventado ni
descartado. En el S5 los consumidores son el registro manual (US-110, US-094) y la corrección con histórico (US-253).
El esquema ya tiene las columnas (`mapping_status` `NOT NULL` en las cuatro entidades; `EventMappingStatus` con `n_a`):
no hay migración.

## Decisiones

- **D1 · Servicio puro de decisión, sin E/S propia.** `createReconciliationService({ catalogo })` expone
  `decidir(propuesta): DecisionDeNormalizacion`. No persiste: devuelve la decisión y el service del consumidor la guarda
  en su transacción. Así US-110/US-094/US-253 no duplican la regla y este change no toca sus endpoints. *Descartadas:*
  persistir desde el servicio (dos dueños de la transacción) y normalizar dentro de cada consumidor (D-4 lo descarta:
  dos dueños de RN-27).
- **D2 · Orden de resolución** (método `resolverCodigo()`, RN-27): (1) `codigoPropuesto` válido en el catálogo para el
  estándar de la entidad → se acepta; (2) si no, se busca `textoOriginal` normalizado (`clave()`: minúsculas, sin
  tildes, espacios colapsados, recorte) entre `terminoCanonico`, `etiquetaEs`, `nombreOficial` y los sinónimos; (3) sin
  coincidencia → `no_mapeado`. El código propuesto inválido nunca se guarda.
- **D3 · Estándar por entidad** (constante única `ESTANDAR_DE_ENTIDAD`): `Diagnosis → cie10`, `Biomarker → loinc`,
  `PriorTreatment → atc` (lista `atcCodes`), `ClinicalEvent → cie10 | cups` según su tipo. `tipoDeEventoSinCodigo()`
  (p. ej. `progresion`) → `n_a`. La lista de tipos sin código se declara una vez, junto al enum del evento.
- **D4 · Ambigüedad.** Si una clave coincide con dos términos canónicos distintos del mismo estándar, el servicio
  devuelve `no_mapeado` (no elige) y lo registra como `terminologia_ambigua` sin el texto (solo entidad y estándar).
  El validador del catálogo ya debería impedirlo; si no lo hace, queda como pendiente.
- **D5 · `catalogVersion` en la decisión, no en la fila.** Las entidades clínicas no tienen columna `catalog_version`;
  la decisión la devuelve (AC-4) para el registro de procedencia del consumidor y **no se persiste** por fila (sin
  migración). Decidido (usuario, 2026-11-03) `[S5 resp. 13]`.
- Recomendación única (decisión barata de revertir): no hacen falta 3 alternativas.

## Privacidad y ownership

- Todo ocurre dentro de `clinical-api`; ningún dato cruza a `rag-orchestrator` ni a `clinical-minio`. El servicio no
  llama a la IA.
- El `textoOriginal` es dato clínico (no identidad); nunca va a *logs*: el evento `terminologia_ambigua` solo lleva
  entidad, estándar y `traceId`. Sin `patientId` en el servicio.
- `rag-orchestrator` no cambia y sigue sin acceso a datos clínicos.
- Solo datos sintéticos: FX-01b-b usa códigos LOINC ficticios (`LOINC-T-*`) y códigos reales de CIE-10 y ATC
  (`L02AE02`, leuprorelina; el patrón ATC del contrato de `rag-orchestrator` no se relaja, `[S5 resp. 10]`).

## Contratos

- **Sin cambio en `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`.** El servicio es interno.
  Proveedor/consumidor: no aplica. `contracts:breaking` debe dar 0 cambios.
- AC-7 lee el `openapi.yaml` como dato de test (no lo modifica).

## Dependencias y colaboradores

- **Nuevo** `src/modules/reconciliation/reconciliation.service.ts` (factory), `reconciliation.reglas.ts`
  (`clave()`, `resolverCodigo()`, `tipoDeEventoSinCodigo()`, `ESTANDAR_DE_ENTIDAD`), `ports.ts`
  (`CatalogoTerminologico { version(); entradas(tipoDeCancer, estandar); sinonimos(tipoDeCancer) }`, tipos
  `PropuestaDeNormalizacion`, `DecisionDeNormalizacion`).
- **Nuevo** `src/infrastructure/catalogo/catalogo-terminologico.ts`: adaptador que lee `codigos.json` y `sinonimos.json`
  desde `CLINICAL_CATALOG_PATH` (reusa `leerCatalogo` de `packages/clinical-catalogs/validator`) y la versión del
  `ProveedorDeCatalogo` existente. Se construye una vez en `server.ts` y se inyecta.
- **Modificado** `src/server.ts`/`composition.ts`: solo construir el servicio para que lo inyecten los consumidores.
- El servicio depende del puerto, nunca del adaptador; no hay contenedor de DI.
- **Fakes:** el test unitario usa el adaptador **real** sobre el fixture FX-01b-b (es lectura de disco determinista),
  no un fake: no hay test de contrato de fake que mantener.
- Regla única: antes del PR, buscar en el árbol cualquier `no_mapeado`/`mapeado` asignado fuera de este módulo
  (`grep -rn "no_mapeado" apps/clinical-api/src`) y redirigirlo aquí; el seed sintético se exceptúa (datos fijos).

## Tests

- Unitarios (Vitest, lógica pura): `clave()`, `resolverCodigo()`, `tipoDeEventoSinCodigo()`.
- Aceptación (Vitest sobre el servicio con el adaptador real y FX-01b-b): AC-2, AC-3, AC-4, AC-5.
- Integración (PostgreSQL de test): `NOT NULL` de `mapping_status` (AC-5).
- Arquitectura: AC-7 sobre `openapi.yaml` y la CLI.
- Arranque: `codigos.json` inválido → no arranca (reutiliza el arnés de `tests/integration/startup`).

## Riesgos

- El catálogo real hoy solo trae CIE-10; tras `l1d-90` (LOINC mínimo, manifest 1.3.0) y `l1d-80` (ATC, manifest 1.4.0)
  Ki-67 y leuprorelina manuales saldrán `mapeado` en la demo `[S5 resp. 9]`. Este change no depende de ese orden: sus
  escenarios usan FX-01b-b o, con el catálogo real, un término ausente de cualquier subconjunto.
- Si el validador no detecta sinónimos duplicados entre términos, D4 lo absorbe con `no_mapeado`.

## Decisiones del Gate 1 (usuario, 2026-11-03)

- **P-1 → decidido `[S5 resp. 13]`:** `catalog_version` se devuelve en la decisión y no se persiste por dato (D5).
- **P-2 → decidido `[S5 resp. 9]`:** el catálogo real se puebla en el S5 con un subconjunto mínimo de LOINC (`l1d-90`)
  y de ATC (`l1d-80`), con nombres oficiales sin modificar y los avisos de DEC-04; cada uno corre `run-ai-eval`.
- **P-3:** el sinónimo «HER-2/neu» de FX-01b-b lo crea este change.
- Los supuestos marcados antes como «(asumido)» quedan decididos `[S5 resp. 13]`.
