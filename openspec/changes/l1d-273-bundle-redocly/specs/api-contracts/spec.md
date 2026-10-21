## ADDED Requirements

### Requirement: Los specs se empaquetan con bundleDocument de Redocly y fallan cerrado
`scripts/contracts` MUST empaquetar en memoria cada `openapi.yaml` con sus `$ref` a `contracts/` mediante `bundleDocument` de `@redocly/openapi-core`, sin escribir en el repositorio y sin un empaquetador propio. Tras empaquetar, una `$ref` externa sin resolver o un nombre de schema repetido MUST hacer fallar el comando nombrando el archivo y la referencia.

#### Scenario: El empaquetado nuevo no cambia lo generado ni el extracto [US-223 AC-1] [US-033 AC-8] [US-033 AC-16]
- **GIVEN** los specs de `main`
- **WHEN** se ejecutan `npm run contracts:check` y `npm run contracts:generate:check` con `bundleDocument`
- **THEN** `contracts:check` termina sin hallazgos y `contracts:generate:check` no produce diferencias en los tipos TS, el Zod, los modelos Pydantic ni el extracto del readme

#### Scenario: Una $ref externa no resuelta hace fallar el empaquetado [US-223 AC-2] [US-033 AC-8]
- **GIVEN** un spec temporal con una `$ref` a una subruta inexistente de `contracts/schemas/evidence.yaml`
- **WHEN** se empaqueta
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y la referencia

#### Scenario: Un nombre de schema repetido hace fallar el empaquetado [US-223 AC-2]
- **GIVEN** un spec temporal que define en `components.schemas` un nombre que también trae `evidence.yaml`
- **WHEN** se empaqueta
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y el schema repetido

#### Scenario: El empaquetador propio desaparece sin perder casos [US-223 AC-3]
- **GIVEN** la migración cerrada
- **WHEN** se inspecciona `scripts/contracts/`
- **THEN** no existe `lib/bundle.mjs` ni código que lo importe, el commit que borra sus tests lleva el *trailer* `Test-Removal:` y cada caso que cubrían tiene un test equivalente contra `bundleDocument`
