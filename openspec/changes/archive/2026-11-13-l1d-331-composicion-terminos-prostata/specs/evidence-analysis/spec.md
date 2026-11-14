## ADDED Requirements

### Requirement: La composición de términos del segundo loop contextual no ancla en biomarcadores no anclables
`terminos_del_caso` MUST omitir, al elegir el biomarcador principal, los biomarcadores que el catálogo declara no anclables
para el tipo (en próstata, PSA), sin su valor, y MUST tomar el siguiente biomarcador del catálogo presente en el caso. Los
términos siguen saliendo solo del catálogo versionado, sin identidad ni texto libre (RN-27, RN-11). En mama la salida no cambia.

#### Scenario: En próstata los términos añadidos ya no incluyen el PSA y la consulta contextual cambia [US-273 AC-1] [RN-27]
- **GIVEN** el caso de próstata con estadio, grado ISUP y PSA, y `QUERY_CONTEXT_EXPANSION_ENABLED = true` con adapters falsos
- **WHEN** una pregunta sin tema propio dispara el segundo loop contextual
- **THEN** la consulta enviada al *reranker* contiene el tipo, el estadio y el grado y no contiene el término del PSA ni su valor
- **AND** `contextExpansion.fields` no incluye `biomarcador_principal` si el caso no trae otro biomarcador del catálogo

#### Scenario: Solo términos del catálogo [US-273 AC-3] [RN-27] [RN-11]
- **GIVEN** un caso con texto libre sembrado, `pseudoPatientId` y un valor de biomarcador fuera del catálogo
- **WHEN** corre el segundo loop contextual
- **THEN** la consulta del *reranker* y los *logs* contienen solo términos del catálogo

#### Scenario: Mama queda idéntica [US-273 AC-5] [RN-02]
- **GIVEN** los casos de mama del fixture `temas-del-caso.json`
- **WHEN** se componen los términos
- **THEN** la salida es igual a la de antes de este change
