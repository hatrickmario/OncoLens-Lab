"""Preguntas del dataset con línea actual y faltantes declarados (US-116 / L1D-113, tarea 4.1): solo datos sintéticos.

La suite arma la solicitud con ``currentLine`` y ``missingCriticalData`` de la pregunta; los faltantes son claves del
catálogo del tipo (RN-11) y ningún valor se atribuye a un dato faltante (expectativa de no inferencia, que mide la
corrida nocturna con el LLM local, D5-nn).
"""

from __future__ import annotations

import pytest

from app.evaluation.corrida import solicitud_base, solicitud_de
from app.evaluation.dataset_loader import ContextoDePregunta, DatasetInvalido, Pregunta
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio, _pregunta
from app.infrastructure.catalogo_clinico.datos_criticos import cargar_datos_criticos
from tests.support.contract import CATALOGOS, RAIZ_REPOSITORIO

DIRECTORIO = RAIZ_REPOSITORIO / "data/eval/s5-corpus-ampliado"
TIPOS = ("mama", "prostata")


def _cruda(**cambios) -> dict:
    return {
        "id": "S5-X01",
        "idioma": "es",
        "cancer": "mama",
        "modo_acierto": "sin_evidencia",
        "pregunta": "¿Qué describe la evidencia sobre melanoma uveal?",
        **cambios,
    }


def _pregunta_con(contexto: ContextoDePregunta | None, cancer: str = "mama") -> Pregunta:
    return Pregunta("S5-X01", "es", cancer, "", "¿p?", "sin_evidencia", (), (), contexto=contexto)


@pytest.fixture(scope="module")
def dataset() -> DatasetSuite:
    return FuenteDatasetEnDirectorio(DIRECTORIO).cargar()


def test_la_pregunta_lee_la_linea_actual_y_los_faltantes_de_su_contexto() -> None:
    pregunta = _pregunta(_cruda(contexto={"linea_actual": 2, "faltantes": ["ki67", "ecog"]}))

    assert pregunta.contexto == ContextoDePregunta(2, ("ki67", "ecog"))


def test_la_pregunta_no_tiene_contexto_cuando_el_dataset_no_lo_declara() -> None:
    assert _pregunta(_cruda()).contexto is None


def test_la_pregunta_admite_un_contexto_sin_linea_y_sin_faltantes() -> None:
    assert _pregunta(_cruda(contexto={})).contexto == ContextoDePregunta(None, ())


@pytest.mark.parametrize(
    "contexto",
    [
        {"linea_actual": 0},
        {"linea_actual": "1"},
        {"linea_actual": True},
        {"faltantes": ["Ki-67"]},
        {"faltantes": ["ki 67"]},
    ],
)
def test_la_pregunta_se_rechaza_cuando_su_contexto_no_es_valido(contexto: dict) -> None:
    with pytest.raises(DatasetInvalido):
        _pregunta(_cruda(contexto=contexto))


def test_la_solicitud_lleva_la_linea_y_los_faltantes_de_la_pregunta() -> None:
    pregunta = _pregunta_con(ContextoDePregunta(1, ("estado_castracion",)), cancer="prostata")

    contexto = solicitud_de(solicitud_base(), pregunta, "sintetico", 0, "2026.10.0").clinicalContext

    assert contexto.currentLine == 1
    assert [f.root for f in contexto.missingCriticalData] == ["estado_castracion"]
    assert contexto.diagnosis is not None and contexto.diagnosis.cancerType.root == "prostata"


def test_la_solicitud_conserva_el_caso_base_cuando_la_pregunta_no_declara_contexto_y_es_del_mismo_tipo() -> (
    None
):
    base = solicitud_base()

    contexto = solicitud_de(base, _pregunta_con(None), "sintetico", 0, "2026.10.0").clinicalContext

    assert contexto.currentLine == base["clinicalContext"]["currentLine"]
    assert [f.root for f in contexto.missingCriticalData] == base["clinicalContext"][
        "missingCriticalData"
    ]


def test_la_solicitud_no_arrastra_los_faltantes_del_caso_base_a_otro_tipo_de_cancer() -> None:
    contexto = solicitud_de(
        solicitud_base(), _pregunta_con(None, cancer="prostata"), "sintetico", 0, "2026.10.0"
    ).clinicalContext

    assert contexto.missingCriticalData == []


def test_el_dataset_s5_trae_casos_con_linea_actual_y_faltantes_para_mama_y_prostata(
    dataset: DatasetSuite,
) -> None:
    con_contexto = [p for p in dataset.preguntas if p.contexto is not None]

    assert {p.cancer for p in con_contexto} == set(TIPOS)
    for tipo in TIPOS:
        del_tipo = [p for p in con_contexto if p.cancer == tipo]
        assert any(p.contexto and p.contexto.linea_actual for p in del_tipo)
        assert any(p.contexto and p.contexto.faltantes for p in del_tipo)


def test_los_faltantes_del_dataset_s5_son_claves_del_catalogo_de_su_tipo(
    dataset: DatasetSuite,
) -> None:
    catalogo = cargar_datos_criticos(CATALOGOS, TIPOS)

    ajenas = [
        (p.id, f)
        for p in dataset.preguntas
        if p.contexto is not None
        for f in p.contexto.faltantes
        if f not in catalogo.claves(p.cancer)
    ]

    assert ajenas == []


def test_cada_caso_con_contexto_del_dataset_s5_tiene_evidencia_esperada_o_es_sin_evidencia(
    dataset: DatasetSuite,
) -> None:
    for pregunta in (p for p in dataset.preguntas if p.contexto is not None):
        assert pregunta.modo_acierto == "sin_evidencia" or pregunta.evidencia
