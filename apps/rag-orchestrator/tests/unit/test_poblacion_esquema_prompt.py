"""Esquema, prompt y validación de la salida de la tarea corta de población (US-242, RN-13, RN-23)."""

from __future__ import annotations

import json

import pytest

from app.application.corpus_metadata.esquema import SalidaInvalida
from app.application.corpus_metadata.esquema_poblacion import (
    PlantillaDePoblacionNoDisponible,
    cargar_plantilla,
    construir_prompt,
    esquema_de_poblacion,
    parsear_valores,
)
from app.application.corpus_metadata.poblacion_puertos import Fragmento
from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from tests.support.contract import CATALOGOS
from tests.support.poblacion_abanico import criterios_de_mama

PLANTILLA = cargar_plantilla("poblacion_v1")
CRITERIO = criterios_de_mama()[0]


def test_esquema_de_poblacion_toma_el_maximo_de_la_configuracion_y_es_cerrado() -> None:
    esquema = esquema_de_poblacion(7)

    assert esquema["properties"]["values"]["maxItems"] == 7
    assert esquema["additionalProperties"] is False
    valor = esquema["properties"]["values"]["items"]
    assert valor["additionalProperties"] is False
    assert valor["properties"]["value"]["maxLength"] == LONGITUD_MAXIMA_DE_VALOR
    assert valor["properties"]["scope"]["enum"] == ["elegibilidad", "subgrupo", "mencion"]
    assert valor["required"] == ["value", "chunkId", "scope"]


def test_construir_prompt_lleva_criterio_etiqueta_maximo_y_fragmentos_con_su_identificador() -> (
    None
):
    prompt = construir_prompt(
        PLANTILLA, CRITERIO, [Fragmento("c1", "Texto uno."), Fragmento("c2", "Texto dos.")], 3
    )

    assert f"Criterio: {CRITERIO.clave}" in prompt
    assert f"Etiqueta: {CRITERIO.etiqueta_es}" in prompt
    assert "como máximo 3 valores" in prompt
    assert "[c1]\nTexto uno." in prompt and "[c2]\nTexto dos." in prompt


def test_construir_prompt_no_reinterpreta_marcadores_que_vienen_en_un_fragmento() -> None:
    prompt = construir_prompt(PLANTILLA, CRITERIO, [Fragmento("c1", "{maximo} {clave}")], 3)

    assert "{maximo} {clave}" in prompt


def test_el_prompt_versionado_no_usa_lenguaje_prescriptivo_ni_datos_de_pacientes() -> None:
    """RN-23 sobre el prompt (nivel A de la lista versionada, el que aplica el filtro de producción) y RN-13: la plantilla no nombra pacientes concretos."""
    verificador = cargar_verificador_de_terminos(CATALOGOS)
    prompt = construir_prompt(PLANTILLA, CRITERIO, [Fragmento("c1", "Texto.")], 3)

    campos = ("option", "rationale", "details")
    assert not [c for c in campos if verificador.reglas_coincidentes(prompt, c)]  # type: ignore[arg-type]
    # La única mención es la regla que prohíbe juzgar pacientes concretos; no hay marcadores de datos de paciente.
    assert PLANTILLA.lower().count("paciente") == 1
    assert "{paciente" not in PLANTILLA


def test_cargar_plantilla_de_una_version_inexistente_falla_nombrando_solo_la_variable() -> None:
    with pytest.raises(PlantillaDePoblacionNoDisponible) as fallo:
        cargar_plantilla("poblacion_v999")

    assert str(fallo.value) == "POPULATION_PROMPT_VERSION"


def test_parsear_valores_devuelve_los_valores_con_su_fragmento_y_alcance() -> None:
    crudo = json.dumps(
        {"values": [{"value": "HER2-positive", "chunkId": "c1", "scope": "subgrupo"}]}
    )

    (valor,) = parsear_valores(crudo)

    assert (valor.valor, valor.chunk_id, valor.alcance, valor.resultado_nli) == (
        "HER2-positive",
        "c1",
        "subgrupo",
        None,
    )


@pytest.mark.parametrize(
    "crudo",
    [
        '{"values": [',  # JSON roto (salida cortada)
        "[]",
        '{"values": "x"}',
        '{"values": [{"value": "a", "chunkId": "c1", "scope": "otro"}]}',  # alcance fuera del enum
        '{"values": [{"value": "a", "chunkId": "c1", "scope": "mencion", "extra": 1}]}',
        '{"values": [{"value": "a", "scope": "mencion"}]}',
        '{"values": [], "confianza": 0.9}',  # la confianza autorreportada no se admite (RN-25)
        '{"values": [{"value": 3, "chunkId": "c1", "scope": "mencion"}]}',
    ],
)
def test_parsear_valores_rechaza_una_salida_fuera_del_esquema_sin_eco_de_la_salida(
    crudo: str,
) -> None:
    with pytest.raises(SalidaInvalida) as fallo:
        parsear_valores(crudo)

    assert crudo not in str(fallo.value)
