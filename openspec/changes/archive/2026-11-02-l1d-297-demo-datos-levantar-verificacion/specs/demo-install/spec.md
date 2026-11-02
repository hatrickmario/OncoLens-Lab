## ADDED Requirements

### Requirement: Guía de demo con pares paciente y pregunta y conteos esperados
`docs/demo/guia-demo-S4.md` MUST documentar al menos 2 pares paciente sintético + pregunta, cada uno con los conteos esperados de `applicabilitySummary` por estado, los fragmentos que los sustentan y el caso con criterio excluyente en No coincide.

#### Scenario: La guía documenta los pares y el caso excluyente [US-247 AC-4] [OUT-07]
- **GIVEN** `docs/demo/guia-demo-S4.md`
- **WHEN** se revisa
- **THEN** documenta ≥ 2 pares paciente + pregunta con conteos esperados por estado y fragmentos de soporte
- **AND** incluye el par con el criterio excluyente (HER2 en mama o castración en próstata) en No coincide

### Requirement: Los pacientes del seed producen Coincide, Parcial y No coincide
Con el seed sintético y `LLM_PROVIDER=fake` con respuestas que citan los fragmentos de la guía, cada par de la guía MUST devolver los conteos de `applicabilitySummary` escritos en la guía, con al menos un par con `coincide > 0` y otro con `parcial > 0`.

#### Scenario: Cada par devuelve los conteos de la guía [US-247 AC-2] [OUT-07]
- **GIVEN** Compose con el seed, `LLM_PROVIDER=fake` y los pares de la guía
- **WHEN** se ejecuta la prueba de aceptación
- **THEN** cada par devuelve los conteos de `applicabilitySummary` de la guía
- **AND** al menos un par tiene `coincide > 0` y otro `parcial > 0`

### Requirement: Una opción con criterio excluyente en No coincide se marca no comparable
Una opción con un criterio excluyente en No coincide MUST traer `populationNotComparable = true` y `warnings` con `poblacion_no_comparable` (AC-08.6).

#### Scenario: El par excluyente trae la marca de población no comparable [US-247 AC-3] [AC-08.6]
- **GIVEN** el par de la guía con HER2 (mama) o estado de castración (próstata) en No coincide
- **WHEN** se ejecuta la prueba del AC-2
- **THEN** esa opción trae `populationNotComparable = true`
- **AND** `warnings` contiene `poblacion_no_comparable`

### Requirement: levantar.sh carga metadatos de población y pesos sparse
Al terminar `scripts/demo/levantar.sh` desde cero, los documentos del corpus de la demo MUST tener sus metadatos de población cargados (no todos `no_disponible`) y todos los chunks vigentes MUST tener `sparse_vector`.

#### Scenario: Una instalación desde cero deja metadatos y sparse [US-247 AC-5] [OUT-07]
- **GIVEN** una instalación desde cero
- **WHEN** termina `levantar.sh`
- **THEN** los documentos del corpus de la demo tienen metadatos de población cargados y no todos están en `no_disponible`
- **AND** todos los chunks vigentes tienen `sparse_vector`

### Requirement: levantar.sh verifica el seed contra los conteos que publica el propio seed
`levantar.sh` MUST reconstruir la imagen del perfil `seed` antes de sembrar y, en el paso «Verificación del seed», comprobar `clinical.patient` = identidades = pacientes del seed, `auth."user"` y documentos del corpus contra los conteos que publica el seed; ante un conteo incorrecto MUST terminar con código ≠ 0 y un mensaje que nombre el conteo que falló.

#### Scenario: Un seed con 0 identidades hace fallar la verificación [US-247 AC-6] [OUT-02] [OUT-04]
- **GIVEN** un seed que deja 5 pacientes y 0 filas en `identity.patient_identity`
- **WHEN** `levantar.sh` llega a «Verificación del seed»
- **THEN** termina con código ≠ 0 y un mensaje que nombra el conteo que falló

#### Scenario: Con el seed correcto la verificación pasa [US-247 AC-6] [OUT-04]
- **GIVEN** el seed correcto reconstruido
- **WHEN** `levantar.sh` ejecuta la verificación
- **THEN** pacientes, identidades, usuarios y documentos coinciden con los conteos publicados por el seed

### Requirement: La verificación del seed no usa superusuario ni muestra credenciales
Cada conteo de «Verificación del seed» MUST ejecutarse solo con `count(*)` y con el rol del servicio dueño de su schema (`clinical-api` para `clinical`, `identity` y `auth`; `rag_corpus` para `corpus`) dentro de su contenedor; MUST NOT usar un superusuario ni leer filas o identidad, y la salida del script MUST NOT contener la variable ni la cadena de conexión.

#### Scenario: La verificación no usa superusuario ni muestra credenciales [US-247 AC-6] [RN-14] [privacy P2]
- **GIVEN** la demo levantada con el seed correcto
- **WHEN** `levantar.sh` ejecuta «Verificación del seed» con su salida capturada
- **THEN** cada conteo se ejecuta con el rol de `clinical-api` o `rag_corpus` y solo con `count(*)`, nunca con `postgres` ni otro superusuario
- **AND** la salida no contiene la cadena de conexión, el nombre de la variable que la guarda ni ninguna contraseña

### Requirement: levantar.sh no borra estado previo sin confirmación
Ante contenedores o volúmenes `oncolens_*` de una instalación anterior, `levantar.sh` MUST avisar con la lista encontrada y pedir confirmación antes de borrar; sin confirmación SHALL NOT borrar nada y MUST terminar con código ≠ 0 mostrando la orden `apagar.sh --borrar-datos` (F-07).

#### Scenario: Sin confirmación no se borra nada [US-247 AC-7] [OUT-03] [OUT-05]
- **GIVEN** volúmenes `oncolens_*` de una instalación anterior
- **WHEN** se ejecuta `levantar.sh` y no se confirma
- **THEN** avisa con la lista de lo encontrado, no borra nada y termina con código ≠ 0
- **AND** el mensaje incluye `apagar.sh --borrar-datos`

### Requirement: apagar.sh cierra Attu y el runbook documenta la limpieza
`scripts/demo/apagar.sh` MUST cerrar `attu` al terminar y `docs/demo/runbook-demo-S1.md` §2 (limpieza inicial) y §5 («Si algo falla»: volúmenes previos con otras contraseñas, `apagar.sh --borrar-datos`) MUST reflejarlo (OUT-03, OUT-05, F-10).

#### Scenario: apagar.sh deja attu cerrado [US-247 tareas de instalación] [OUT-05]
- **GIVEN** la demo levantada con `attu` activo
- **WHEN** se ejecuta `apagar.sh`
- **THEN** no queda ningún contenedor `attu` en ejecución

### Requirement: Los datos de la demo son sintéticos y sus metadatos verificables
Ningún valor de población de la demo MUST carecer de `chunkId` o `nliResult`; los pacientes MUST ser del seed sintético (que se niega a correr en `piloto`) y el escaneo de PII y secretos de la CI MUST NOT encontrar nada (RN-13, RN-14).

#### Scenario: La CI no encuentra valores sin respaldo ni datos reales [US-247 AC-8] [RN-13] [RN-14]
- **GIVEN** los metadatos y los pacientes de la demo
- **WHEN** corre la CI
- **THEN** ningún valor de población carece de `chunkId` o `nliResult`
- **AND** los pacientes son del seed sintético y el escaneo de PII y secretos no encuentra nada

#### Regresión [RN-13] activa desde S6 (US-143): el preflight bloquea datos reales; aquí solo se verifica que el seed se niega en `piloto`.
