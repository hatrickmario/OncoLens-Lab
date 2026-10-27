"""Criterios de aplicabilidad leídos del catálogo montado (L1D-126, soporte del AC-5 de US-121; el AC-5 completo, el
estado calculado, vive en L1D-127): sin streaming ni red, solo archivos del catálogo y adapters falsos."""

import copy
import json
import shutil
from dataclasses import replace
from pathlib import Path

import pytest

from app.bootstrap import cargar_settings_o_salir, crear_app
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, LimitesDeRegla
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.support.catalogo_aplicabilidad import APL_1_0_0, APL_1_0_1
from tests.support.fakes import settings_de_prueba
from tests.support.logs import exigir_sin_valores_prohibidos, parsear_lineas_json

TIPOS = ("mama", "prostata")
SENTINELA_DE_CONTENIDO = "SENTINELA-CONTENIDO-APLICABILIDAD"


def _criterio(
    criterios: tuple[CriterioDeAplicabilidad, ...], clave: str
) -> CriterioDeAplicabilidad:
    return next(c for c in criterios if c.clave == clave)


def test_criterios_aplicabilidad_mama_se_cargan_con_destino_excluyente_y_regla_cuando_el_catalogo_esta_montado() -> (
    None
):
    criterios = cargar_criterios_de_aplicabilidad(APL_1_0_0, TIPOS).criterios("mama")

    assert [c.clave for c in criterios] == [
        "estado_her2",
        "estadio",
        "ecog",
        "estado_menopausico",
        "linea_tratamiento",
    ]
    her2 = _criterio(criterios, "estado_her2")
    assert her2.es_excluyente is True
    assert her2.clave_de_estudio == "biomarcadores.her2"
    assert (her2.destino.entidad, her2.destino.campo) == ("Biomarker", "value")
    assert dict(her2.destino.coincidencia) == {"name": ("HER2",)}
    assert her2.regla.operador == "igualdad"
    assert her2.regla.parcial_cuando == "solo_subgrupo"
    assert dict(her2.regla.equivalencias) == {"positivo": ("3+", "2+ con ISH positivo")}
    assert _criterio(criterios, "ecog").es_excluyente is False


def test_criterios_aplicabilidad_regla_ecog_se_lee_del_catalogo_montado() -> None:
    con_1_0_0 = cargar_criterios_de_aplicabilidad(APL_1_0_0, TIPOS).criterios("mama")
    con_1_0_1 = cargar_criterios_de_aplicabilidad(APL_1_0_1, TIPOS).criterios("mama")

    assert _criterio(con_1_0_0, "ecog").regla.limites is None
    assert _criterio(con_1_0_1, "ecog").regla.limites == LimitesDeRegla(minimo=None, maximo=0.0)
    sin_los_limites_de_ecog = [
        replace(c, regla=replace(c.regla, limites=None)) if c.clave == "ecog" else c
        for c in con_1_0_1
    ]
    assert tuple(sin_los_limites_de_ecog) == con_1_0_0


def test_criterios_aplicabilidad_quedan_en_el_estado_de_la_app_cuando_el_catalogo_esta_montado() -> (
    None
):
    settings = settings_de_prueba(clinical_catalog_path=APL_1_0_1)

    app = crear_app(settings)

    criterios = app.state.criterios_de_aplicabilidad.criterios("mama")
    assert _criterio(criterios, "ecog").regla.limites == LimitesDeRegla(minimo=None, maximo=0.0)


def _catalogo_con_aplicabilidad_de_mama(tmp_path: Path, contenido: object) -> Path:
    catalogo = tmp_path / "catalogo"
    shutil.copytree(APL_1_0_0, catalogo)
    (catalogo / "mama" / "aplicabilidad.json").write_text(json.dumps(contenido), encoding="utf-8")
    return catalogo


def test_arranque_no_queda_listo_con_configuracion_invalida_cuando_aplicabilidad_no_cumple_su_esquema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, logs_json
) -> None:
    contenido = json.loads((APL_1_0_0 / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))
    invalido = copy.deepcopy(contenido)
    invalido["items"][0]["peso"] = SENTINELA_DE_CONTENIDO  # RN-28: ningún criterio declara puntaje
    catalogo = _catalogo_con_aplicabilidad_de_mama(tmp_path, invalido)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("CLINICAL_CATALOG_PATH", str(catalogo))

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    registrado = logs_json()
    eventos = [e for e in parsear_lineas_json(registrado) if e.get("event")]
    assert salida.value.code == 1
    assert len(eventos) == 1
    assert eventos[0]["event"] == "configuracion_invalida"
    assert eventos[0]["variable"] == "CLINICAL_CATALOG_PATH"
    assert eventos[0]["motivo"] == "catalogo_no_disponible"
    exigir_sin_valores_prohibidos(registrado, [SENTINELA_DE_CONTENIDO, str(tmp_path)])
