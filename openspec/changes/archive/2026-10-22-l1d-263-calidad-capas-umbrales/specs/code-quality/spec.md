## ADDED Requirements

### Requirement: Un comando de calidad con reporte determinista
`npm run quality` MUST ejecutar ESLint en `web` y `clinical-api`, `dependency-cruiser` sobre `apps/` y `packages/`, y Ruff e `import-linter` en `rag-orchestrator`, y `npm run quality:report` MUST escribir `reports/quality/latest.json` con `{tool, rule, file, line, symbol, measured, threshold}` por hallazgo. El job `quality` de la CI MUST ejecutar lo mismo en cada PR.

#### Scenario: El monorepo actual pasa la calidad y deja el reporte [US-213 AC-1]
- **GIVEN** el monorepo de `main` con las correcciones o excepciones de D5
- **WHEN** se ejecutan `npm run quality` y `npm run quality:report`
- **THEN** termina con código 0 y `reports/quality/latest.json` existe con los hallazgos por herramienta, regla, archivo y línea

### Requirement: Reglas de capas en Node y en Python
Las dependencias entre capas MUST verificarse con `dependency-cruiser` (`controller-sin-acceso-a-datos`, `web-solo-por-bff`, `componentes-sin-datos`, `sin-ciclos`, `api-contracts-generado`) y con `import-linter` (`dominio-independiente`, `capas-hexagonales`), y una violación MUST hacer fallar el job nombrando la regla y el archivo o import.

#### Scenario: Un controller que importa Prisma hace fallar la calidad [US-213 AC-2]
- **GIVEN** el fixture `apps/clinical-api/src/modules/**/x.controller.ts` que importa `@prisma/client`
- **WHEN** corre `npm run quality`
- **THEN** falla y el mensaje nombra `controller-sin-acceso-a-datos` y el archivo

#### Scenario: web que importa clinical-api hace fallar la calidad [US-213 AC-2]
- **GIVEN** el fixture de `apps/web/**` que importa `apps/clinical-api/**`
- **WHEN** corre `npm run quality`
- **THEN** falla y el mensaje nombra `web-solo-por-bff` y el archivo

#### Scenario: El dominio de Python que importa infraestructura hace fallar la calidad [US-213 AC-3]
- **GIVEN** el fixture de `app/domain/` que importa `app/infrastructure/`
- **WHEN** corre `npm run quality`
- **THEN** `import-linter` falla con el contrato `dominio-independiente` y nombra el import

#### Scenario: application que importa api hace fallar la calidad [US-213 AC-3]
- **GIVEN** el fixture de `app/application/` que importa `app/api/`
- **WHEN** corre `npm run quality`
- **THEN** falla con el contrato `capas-hexagonales`

### Requirement: Umbrales de tamaño y complejidad en un solo archivo
Los umbrales MUST vivir solo en `quality-thresholds.json` (RN-22); ESLint y Ruff MUST aplicarlos sin otra edición, y un umbral ausente o no numérico MUST hacer fallar el job con el nombre de la clave.

#### Scenario: Una función de clinical-api por encima del umbral hace fallar la calidad [US-213 AC-4]
- **GIVEN** el fixture con una función de 41 líneas y `maxLinesPerFunction = 40`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando `max-lines-per-function`, la función, 41 y 40

#### Scenario: Una función de rag-orchestrator por encima del umbral hace fallar la calidad [US-213 AC-5]
- **GIVEN** el fixture con complejidad 11 y `C901` = 10
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando `C901`, la función y el umbral

#### Scenario: Cambiar un umbral solo en el archivo de umbrales cambia el resultado [US-213 AC-6] (asumido)
- **GIVEN** el fixture de 41 líneas que falla con 40
- **WHEN** se cambia `maxLinesPerFunction` a 45 solo en `quality-thresholds.json` y se sincroniza Ruff
- **THEN** `npm run quality` pasa sin editar ningún otro archivo de configuración

#### Scenario: Un umbral ausente hace fallar con el nombre de la clave [US-213 AC-6] (asumido)
- **GIVEN** `quality-thresholds.json` sin `complexity`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando la clave `complexity`

### Requirement: Tamaño de componentes de web en dos niveles
Los `.tsx` de `apps/web/components/**` y `apps/web/app/**`, contados sin blancos ni comentarios, MUST emitir una alerta por encima de `web.componentLinesWarn` (100) y hacer fallar el job por encima de `web.componentLinesError` (150); `components/ui/**`, tests, stories y código generado MUST quedar excluidos.

#### Scenario: Un componente de 120 líneas alerta sin fallar [US-213 AC-7]
- **GIVEN** el fixture `.tsx` de 120 líneas
- **WHEN** corre `npm run quality`
- **THEN** el job no falla y `latest.json` trae la alerta con el archivo, 120 y 100

#### Scenario: Un componente de 151 líneas hace fallar la calidad [US-213 AC-7]
- **GIVEN** el fixture `.tsx` de 151 líneas
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando el archivo, 151 y 150

#### Scenario: Las primitivas de shadcn no se miden [US-213 AC-7]
- **GIVEN** un archivo de 200 líneas en `apps/web/components/ui/`
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de tamaño para ese archivo
