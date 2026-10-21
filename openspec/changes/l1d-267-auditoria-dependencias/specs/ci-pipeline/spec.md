## ADDED Requirements

### Requirement: Cada PR audita las dependencias de los tres servicios
`.github/workflows/ci.yml` MUST tener un job `dependencies`, incluido en `needs` de `ci-ok`, que ejecute `npm audit` sobre el workspace (raíz y workspaces) y `pip-audit` sobre los `requirements*.txt` de `rag-orchestrator`. El job MUST fallar ante un aviso de severidad alta o crítica de `npm` o ante cualquier aviso de `pip-audit` no cubierto por una excepción vigente, nombrando paquete, versión e identificador del aviso.

#### Scenario: Un PR sin dependencias vulnerables pasa el job [US-217 AC-1] [RN-14] (asumido en el umbral)
- **GIVEN** un PR cuyas dependencias no tienen avisos `high` ni `critical` de `npm` ni avisos de `pip-audit`, o solo avisos cubiertos por excepciones vigentes
- **WHEN** corre el job `dependencies`
- **THEN** ejecuta `npm audit --audit-level=high` y `pip-audit` y termina en verde

#### Scenario: Una dependencia con un aviso alto hace fallar el job [US-217 AC-2] (asumido)
- **GIVEN** el fixture de PR que añade al workspace una versión de un paquete con un aviso conocido de severidad alta
- **WHEN** corre el job `dependencies`
- **THEN** termina en rojo nombrando el paquete, la versión instalada y el identificador del aviso

#### Scenario: Un aviso de pip-audit hace fallar el job [US-217 AC-2] (asumido)
- **GIVEN** la salida de `pip-audit` con un aviso sobre un paquete de `requirements.txt`
- **WHEN** se interpreta en el job
- **THEN** termina en rojo nombrando el paquete, la versión y el identificador `PYSEC`/`GHSA`

### Requirement: Las excepciones de auditoría son declarativas y vencen
Una vulnerabilidad sin parche disponible MUST poder registrarse en `security/audit-exceptions.json` con identificador, paquete, motivo, mitigación y fecha de revisión; mientras la fecha no haya pasado el aviso no hace fallar el job. Una excepción vencida o sin alguno de esos campos MUST hacer fallar el job nombrando su identificador. La fecha de hoy MUST inyectarse en el intérprete.

#### Scenario: Una excepción vigente deja pasar el aviso [US-217 AC-3] (asumido)
- **GIVEN** un aviso alto registrado en `security/audit-exceptions.json` con `revisarAntesDe` posterior a la fecha inyectada
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en verde e imprime la excepción aplicada

#### Scenario: Una excepción vencida hace fallar el job [US-217 AC-3] (asumido)
- **GIVEN** la misma excepción con `revisarAntesDe` anterior a la fecha inyectada
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en rojo nombrando el identificador de la excepción vencida

#### Scenario: Una excepción sin mitigación se rechaza [US-217 AC-3] (asumido)
- **GIVEN** una excepción sin el campo `mitigacion`
- **WHEN** corre el intérprete de la auditoría
- **THEN** termina en rojo nombrando la excepción y el campo ausente

### Requirement: Dependabot propone actualizaciones de los cuatro ecosistemas
`.github/dependabot.yml` MUST configurar actualizaciones de seguridad y de versión, semanales y agrupadas por ecosistema, para `npm` (raíz y workspaces), `pip` (`apps/rag-orchestrator`), `github-actions` y las imágenes Docker del stack. Sus PRs MUST pasar por la misma CI y MUST NOT mergearse solos.

#### Scenario: La configuración de Dependabot cubre los cuatro ecosistemas [US-217 AC-4] (asumido)
- **GIVEN** `.github/dependabot.yml`
- **WHEN** un test lo inspecciona
- **THEN** declara `npm` en `/`, `pip` en `/apps/rag-orchestrator`, `github-actions` en `/` y `docker` en los directorios de los Dockerfiles, todos con `interval: weekly` y un grupo por ecosistema, y ningún `automerge`
