# Spec Delta — clinical-catalogs (l1d-335, US-277)

## ADDED Requirements

### Requirement: Cada sinónimo declara su relación con el término canónico
Cada elemento de `sinonimos[]` en `<tipo>/sinonimos.json` MUST declarar `relacion` con uno de `equivalente`, `mas_amplio` o `miembro_de_clase`. Solo `equivalente` SHALL tratarse como el mismo concepto que `terminoCanonico`: `mas_amplio` y `miembro_de_clase` nombran términos relacionados que MUST NOT equipararse a él ni usarse para expandir una consulta (`[S7 resp. 6]`, revisión clínica S-1).

#### Scenario: Un sinónimo sin relación invalida el catálogo [US-277 AC-1] [RN-27] [S7 resp. 6]
- **GIVEN** una copia del catálogo en la que un sinónimo de `prostata/sinonimos.json` no declara `relacion`
- **WHEN** corre `catalog:validate`
- **THEN** termina con error `esquema_invalido` nombrando el tipo y el archivo, sin valores del catálogo

#### Scenario: Una relación fuera del conjunto cerrado invalida el catálogo [US-277 AC-1] [RN-27] (asumido)
- **GIVEN** una copia del catálogo con un sinónimo cuya `relacion` es `parecido`
- **WHEN** corre `catalog:validate`
- **THEN** termina con error `esquema_invalido` y ningún backend queda listo con ese catálogo

#### Scenario: Un miembro de clase no se equipara a la clase [US-277 AC-1] [S7 resp. 6] (asumido)
- **GIVEN** el término `inhibidores de aromatasa` con `letrozol` como `miembro_de_clase` y el término propio `letrozol`
- **WHEN** un consumidor del catálogo deduplica valores o busca el término canónico de `letrozol`
- **THEN** obtiene `letrozol`, nunca `inhibidores de aromatasa`

### Requirement: El validador del catálogo revisa los sinónimos
`catalog:validate` MUST validar `<tipo>/sinonimos.json` de cada tipo que el manifiesto declara en su lista `sinonimos` contra su esquema y SHALL rechazar: un texto `equivalente` asignado a dos términos canónicos del mismo tipo, un término canónico repetido en el archivo y un sinónimo que repite el texto de su propio término canónico. Los mensajes MUST nombrar el código de la violación, el tipo y el archivo, sin valores del catálogo.

#### Scenario: Un texto equivalente a dos términos del mismo tipo se rechaza [US-277 AC-1] [RN-27] (asumido)
- **GIVEN** un `prostata/sinonimos.json` de fixture con un mismo texto como `equivalente` de `vigilancia activa` y de `espera vigilante`
- **WHEN** corre `catalog:validate`
- **THEN** reporta `sinonimo_equivalente_ambiguo` para `prostata/sinonimos` y termina con error

#### Scenario: El mismo texto en dos tipos de cáncer es válido [US-277 AC-1] (asumido)
- **GIVEN** `hormonoterapia` como `equivalente` de `terapia endocrina` en mama y de `terapia de privación androgénica` en próstata
- **WHEN** corre `catalog:validate`
- **THEN** no reporta violación por ese texto

#### Scenario: Un catálogo que no declara sinónimos en el manifiesto sigue válido [US-277 AC-1] (asumido)
- **GIVEN** un catálogo anterior cuyo manifiesto no trae la lista `sinonimos` y que no tiene `sinonimos.json`
- **WHEN** corre `catalog:validate`
- **THEN** termina sin violaciones: el archivo solo se valida en los tipos que el manifiesto lista
- **AND** el catálogo publicado declara `sinonimos` para mama y para próstata

#### Scenario: Un texto no equivalente puede repetirse entre términos del mismo tipo [US-277 AC-1] (asumido)
- **GIVEN** `doble bloqueo anti-HER2` como término canónico propio y como `mas_amplio` de `pertuzumab`
- **WHEN** corre `catalog:validate`
- **THEN** no reporta `sinonimo_equivalente_ambiguo`

### Requirement: Procedimientos y tratamientos de mama y próstata en los sinónimos
`prostata/sinonimos.json` y `mama/sinonimos.json` MUST incluir, con variantes en español e inglés, los procedimientos y tratamientos de la lista del §2.2 de la revisión clínica del S7, con un mínimo obligatorio de seis términos entre los dos tipos. Ninguna entrada SHALL introducir un código: los códigos siguen saliendo de `codigos.json` (RN-27). El cambio MUST publicarse con una versión nueva del catálogo.

#### Scenario: El catálogo ampliado contiene los seis procedimientos mínimos en dos idiomas [US-277 AC-1] [RN-27]
- **GIVEN** el catálogo de la versión nueva
- **WHEN** se leen los sinónimos de cada tipo
- **THEN** prostatectomía radical, radioterapia externa, braquiterapia y vigilancia activa (próstata) y mastectomía y cirugía conservadora de mama (mama) existen cada uno como término canónico con al menos un sinónimo `equivalente` en `es` o en `en` y, entre canónico y sinónimos, queda nombrado en los dos idiomas
- **AND** `catalog:validate` termina sin violaciones

#### Scenario: Un texto más estrecho que su canónico no es equivalente [US-277 AC-1] [S7 resp. 6] (asumido)
- **GIVEN** el catálogo de la versión nueva
- **WHEN** se leen los sinónimos de `radioterapia externa`, `prostatectomía radical`, `terapia de privación androgénica`, `mastectomía` y `cirugía conservadora de mama`
- **THEN** `IMRT`, `prostatectomía radical robótica`, `análogos de LHRH`, `mastectomía total` y `cuadrantectomía` figuran como `miembro_de_clase`, no como `equivalente` (revisión clínica S-1)
- **AND** cada uno de esos términos canónicos conserva al menos un sinónimo `equivalente`

#### Scenario: Cambiar los sinónimos sin subir la versión falla el guardián [US-277 AC-1] [RN-22]
- **GIVEN** una copia del catálogo con `prostata/sinonimos.json` ampliado y la misma `manifest.version` que la base
- **WHEN** corre `catalog:version-guard`
- **THEN** reporta `contenido_cambiado_sin_subir_version` nombrando el tipo y el archivo

#### Scenario: Conceptos que se confunden quedan en términos separados [US-277 AC-1] [S7 resp. 1]
- **GIVEN** el catálogo de la versión nueva
- **WHEN** se buscan `vigilancia activa` y `espera vigilante`, y `terapia de privación androgénica` y `orquiectomía bilateral`
- **THEN** cada uno es un término canónico distinto y ninguno es sinónimo `equivalente` del otro (revisión clínica S-2)

#### Scenario: La lista no añade siglas nuevas de dos letras [US-277 AC-1] (asumido)
- **GIVEN** los sinónimos añadidos en este cambio
- **WHEN** se revisan sus textos
- **THEN** ninguno es una sigla de dos letras (revisión clínica S-3); las siglas ya publicadas (`RE`, `RP`, `ER`, `PR`) no cambian

### Requirement: Las entradas de la revisión clínica del S7 llevan la marca de revisión provisional
Cada término de `sinonimos.json` añadido o corregido por la revisión clínica del S7 MUST llevar `revision_provisional` con `rol = "ia"` y `fecha = "2026-11-21"`. Esa marca SHALL significar que no hay validación de un oncólogo: ningún archivo, reporte ni texto del sistema MUST presentar esas entradas como validadas, y los reportes de `evaluate` siguen rotulados `no_validada` (`[S7 resp. 1]`, SUP-4).

#### Scenario: Toda entrada nueva o corregida lleva la marca [US-277 AC-1] [S7 resp. 1]
- **GIVEN** el catálogo de la versión nueva y el de la versión anterior
- **WHEN** se comparan los términos de `sinonimos.json` por tipo
- **THEN** todo término nuevo o con sinónimos cambiados tiene `revision_provisional = { rol: "ia", fecha: "2026-11-21" }`

#### Scenario: Una marca con rol desconocido invalida el catálogo [US-277 AC-1] (asumido)
- **GIVEN** una copia del catálogo con `revision_provisional.rol = "oncologo"` en un término
- **WHEN** corre `catalog:validate`
- **THEN** termina con error `esquema_invalido`; el esquema de esta versión solo admite `ia`

### Requirement: El doble bloqueo anti-HER2 no es sinónimo equivalente de pertuzumab
`mama/sinonimos.json` MUST declarar `doble bloqueo anti-HER2` como término canónico propio, con `dual HER2 blockade` como `equivalente`, y MUST NOT declarar ninguno de esos dos textos como `equivalente` de `pertuzumab`; en `pertuzumab` solo pueden quedar como `mas_amplio`. `prostata/sinonimos.json` MUST incluir `leuprolide` como `equivalente` en inglés de `leuprorelina` (revisión clínica S-4 y S-5).

#### Scenario: Pertuzumab ya no se equipara al doble bloqueo [US-277 AC-1] [S7 resp. 6]
- **GIVEN** el catálogo de la versión nueva
- **WHEN** un consumidor busca el término canónico de `doble bloqueo anti-HER2`
- **THEN** obtiene `doble bloqueo anti-HER2`, no `pertuzumab`
- **AND** `pertuzumab` sigue siendo un término del catálogo

#### Scenario: Leuprolide resuelve a leuprorelina [US-277 AC-1] [RN-27]
- **GIVEN** el catálogo de la versión nueva
- **WHEN** un consumidor busca el término canónico de `leuprolide` en próstata
- **THEN** obtiene `leuprorelina`
