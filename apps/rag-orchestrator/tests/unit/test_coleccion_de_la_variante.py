"""El nombre de la colección identifica la variante de contexto (US-279 D5, RN-22): reglas puras, sin Milvus."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.coleccion_de_la_variante import (
    ColeccionNoCorrespondeALaVariante,
    OrigenIgualAlDestino,
    coleccion_de_la_variante,
    exigir_coleccion_de_la_variante,
    exigir_origen_distinto_del_destino,
)
from app.domain.corpus_seed.contexto_del_chunk import VERSION_DE_LA_PLANTILLA, VarianteDeContexto

BASE = "corpus_chunks"


def test_ninguno_usa_el_nombre_base_sin_sufijo_de_contexto() -> None:
    assert coleccion_de_la_variante(BASE, VarianteDeContexto.NINGUNO) == BASE


@pytest.mark.parametrize("variante", [VarianteDeContexto.DETERMINISTA, VarianteDeContexto.LLM])
def test_las_otras_variantes_llevan_variante_y_version_de_la_plantilla_en_el_nombre(
    variante: VarianteDeContexto,
) -> None:
    assert (
        coleccion_de_la_variante(BASE, variante)
        == f"{BASE}__ctx_{variante.value}_v{VERSION_DE_LA_PLANTILLA}"
    )


@pytest.mark.parametrize("variante", list(VarianteDeContexto))
def test_el_nombre_que_construye_la_regla_corresponde_a_su_variante(
    variante: VarianteDeContexto,
) -> None:
    exigir_coleccion_de_la_variante(coleccion_de_la_variante(BASE, variante), variante)


@pytest.mark.parametrize(
    ("nombre", "variante"),
    [
        (BASE, VarianteDeContexto.DETERMINISTA),
        (BASE, VarianteDeContexto.LLM),
        (f"{BASE}__ctx_determinista_v{VERSION_DE_LA_PLANTILLA}", VarianteDeContexto.NINGUNO),
        (f"{BASE}__ctx_llm_v{VERSION_DE_LA_PLANTILLA}", VarianteDeContexto.DETERMINISTA),
        (f"{BASE}__ctx_determinista_v{VERSION_DE_LA_PLANTILLA}", VarianteDeContexto.LLM),
        (
            f"{BASE}__ctx_determinista_v{VERSION_DE_LA_PLANTILLA + 1}",
            VarianteDeContexto.DETERMINISTA,
        ),
        ("__ctx_determinista_v1", VarianteDeContexto.DETERMINISTA),
    ],
)
def test_un_nombre_que_no_corresponde_a_la_variante_se_rechaza_nombrando_las_dos_variables(
    nombre: str, variante: VarianteDeContexto
) -> None:
    with pytest.raises(ColeccionNoCorrespondeALaVariante) as error:
        exigir_coleccion_de_la_variante(nombre, variante)

    assert "CORPUS_CHUNK_CONTEXT" in str(error.value)
    assert "MILVUS_COLLECTION_NAME" in str(error.value)


def test_origen_y_destino_iguales_se_rechazan_sin_distinguir_mayusculas_ni_espacios() -> None:
    with pytest.raises(OrigenIgualAlDestino) as error:
        exigir_origen_distinto_del_destino(" Corpus_Chunks ", BASE)

    assert "--origen" in str(error.value) and "MILVUS_COLLECTION_NAME" in str(error.value)


def test_origen_distinto_del_destino_pasa() -> None:
    exigir_origen_distinto_del_destino(BASE, f"{BASE}__ctx_llm_v{VERSION_DE_LA_PLANTILLA}")
