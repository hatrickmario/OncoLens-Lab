"""RN-12 (US-050): la regla pura de proveedores permitidos y el selector que la aplica por petición."""

import asyncio
import json

import pytest

from pathlib import Path

from app.application.corpus_metadata.poblacion_puertos import LlmCompleto
from app.application.ports import FalloDelLlm
from app.application.selector_proveedor_llm import (
    SelectorDeProveedorLlm,
    _contexto,
    con_clasificacion,
)
from app.domain.reglas_proveedor import ProveedorLlm, proveedores_permitidos
from app.schemas.generated.models import LlmProvider
from tests.support.llm_falso import FakeLlmClient
from tests.support.llm_nube_falso import LlmNubeFalso

pytestmark = pytest.mark.anyio

ESQUEMA: dict = {}


@pytest.mark.ac("US-050", 1)
@pytest.mark.parametrize(
    ("clasificacion", "nube_habilitada", "esperado"),
    [
        ("sintetico", True, (ProveedorLlm.local, ProveedorLlm.nube)),
        ("sintetico", False, (ProveedorLlm.local,)),
        ("real_anonimizado", True, (ProveedorLlm.local,)),
        ("real_anonimizado", False, (ProveedorLlm.local,)),
        ("real_identificado", True, (ProveedorLlm.local,)),
        ("real_identificado", False, (ProveedorLlm.local,)),
    ],
)
def test_proveedores_permitidos_solo_admite_la_nube_con_sinteticos_y_la_nube_habilitada(
    clasificacion, nube_habilitada, esperado
):
    assert proveedores_permitidos(clasificacion, nube_habilitada) == esperado


@pytest.mark.parametrize("desconocida", ["", "REAL", "otra", "Sintetico"])
def test_proveedores_permitidos_falla_cerrado_con_solo_local_cuando_la_clasificacion_es_desconocida(
    desconocida,
):
    assert proveedores_permitidos(desconocida, True) == (ProveedorLlm.local,)


async def test_el_selector_responde_con_el_local_y_no_toca_la_nube_cuando_el_dato_es_real():
    local, nube = FakeLlmClient(), LlmNubeFalso()
    selector = SelectorDeProveedorLlm(local, nube, nube_habilitada=True)

    with con_clasificacion("real_identificado") as contexto:
        await selector.completar_json("u", ESQUEMA)

    assert (local.invocaciones, nube.invocaciones) == (1, 0)
    assert contexto.proveedor_declarado is ProveedorLlm.local


async def test_el_selector_propaga_el_fallo_sin_tocar_la_nube_cuando_el_local_cae_con_dato_real():
    nube = LlmNubeFalso()
    selector = SelectorDeProveedorLlm(
        FakeLlmClient(error=FalloDelLlm()), nube, nube_habilitada=True
    )

    with con_clasificacion("real_anonimizado"):
        with pytest.raises(FalloDelLlm):
            await selector.completar_json("u", ESQUEMA)

    assert nube.invocaciones == 0


async def test_el_selector_usa_la_nube_y_la_declara_cuando_es_sintetico_habilitada_y_el_local_cae():
    nube = LlmNubeFalso()
    selector = SelectorDeProveedorLlm(
        FakeLlmClient(error=FalloDelLlm()), nube, nube_habilitada=True
    )

    with con_clasificacion("sintetico") as contexto:
        await selector.completar_json("u", ESQUEMA)

    assert nube.invocaciones == 1
    assert contexto.proveedor_declarado is ProveedorLlm.nube


async def test_el_selector_propaga_el_fallo_cuando_el_respaldo_esta_permitido_pero_no_hay_adapter_de_nube():
    selector = SelectorDeProveedorLlm(
        FakeLlmClient(error=FalloDelLlm()), None, nube_habilitada=True
    )

    with con_clasificacion("sintetico"):
        with pytest.raises(FalloDelLlm):
            await selector.completar_json("u", ESQUEMA)


async def test_el_selector_trata_como_dato_real_cuando_no_hay_clasificacion_activa():
    local, nube = FakeLlmClient(error=FalloDelLlm()), LlmNubeFalso()
    selector = SelectorDeProveedorLlm(local, nube, nube_habilitada=True)

    with pytest.raises(FalloDelLlm):
        await selector.completar_json("u", ESQUEMA)

    assert nube.invocaciones == 0


async def test_el_selector_aplica_la_misma_regla_a_la_tarea_acotada_cuando_el_local_cae_con_dato_real():
    nube = LlmNubeFalso()
    selector = SelectorDeProveedorLlm(LlmNubeFalso(error=FalloDelLlm()), nube, nube_habilitada=True)

    with con_clasificacion("real_identificado"):
        with pytest.raises(FalloDelLlm):
            await selector.completar_json_acotado("u", ESQUEMA, max_tokens=8, semilla=1)

    assert nube.invocaciones == 0


async def test_el_selector_marca_nube_usada_en_el_contexto_externo_cuando_con_clasificacion_se_anida():
    nube = LlmNubeFalso()
    selector = SelectorDeProveedorLlm(
        FakeLlmClient(error=FalloDelLlm()), nube, nube_habilitada=True
    )

    with con_clasificacion("sintetico") as externo:
        with con_clasificacion("real_identificado"):  # el contexto activo manda: no se reabre
            await selector.completar_json("u", ESQUEMA)

    assert nube.invocaciones == 1
    assert externo.proveedor_declarado is ProveedorLlm.nube


async def test_el_selector_aisla_la_clasificacion_de_cada_peticion_cuando_dos_corren_concurrentes():
    nube = LlmNubeFalso()
    selector = SelectorDeProveedorLlm(
        FakeLlmClient(error=FalloDelLlm()), nube, nube_habilitada=True
    )

    async def peticion(clasificacion: str):
        with con_clasificacion(clasificacion) as contexto:
            await asyncio.sleep(0)  # cede el turno para que las dos se intercalen
            try:
                await selector.completar_json("u", ESQUEMA)
            except FalloDelLlm:
                return clasificacion, contexto.proveedor_declarado, False
            return clasificacion, contexto.proveedor_declarado, True

    resultados = await asyncio.gather(peticion("real_identificado"), peticion("sintetico"))

    assert resultados == [
        ("real_identificado", ProveedorLlm.local, False),
        ("sintetico", ProveedorLlm.nube, True),
    ]
    assert nube.invocaciones == 1
    assert _contexto.get() is None


def test_el_selector_cumple_el_puerto_completo_del_llm_cuando_se_compone_con_el_adapter_local():
    assert isinstance(
        SelectorDeProveedorLlm(LlmNubeFalso(), None, nube_habilitada=False), LlmCompleto
    )


def test_los_proveedores_del_dominio_coinciden_con_los_del_contrato_cuando_se_comparan_sus_valores():
    assert {p.value for p in ProveedorLlm} == {p.value for p in LlmProvider}


def test_ningun_modulo_de_produccion_inyecta_un_adapter_de_nube_cuando_se_compone_la_app():
    app = Path(__file__).resolve().parents[2] / "app"
    ofensores = [
        str(ruta.relative_to(app))
        for ruta in app.rglob("*.py")
        if "llm_nube=" in ruta.read_text(encoding="utf-8")
    ]

    assert ofensores == []


_TABLA = json.loads(
    (Path(__file__).resolve().parents[4] / "contracts" / "reglas" / "proveedor-llm.json").read_text(
        encoding="utf-8"
    )
)["casos"]


@pytest.mark.parametrize("caso", _TABLA, ids=lambda c: f"{c['clasificacion']}-{c['proveedor']}")
def test_la_regla_coincide_con_la_tabla_comun_con_clinical_api_cuando_la_nube_esta_habilitada(caso):
    permitidos = proveedores_permitidos(caso["clasificacion"], True)

    assert (ProveedorLlm(caso["proveedor"]) in permitidos) is caso["permitido"]
