"""RN-12 (US-050): la regla pura de proveedores permitidos y el selector que la aplica por petición."""

import pytest

from app.application.ports import FalloDelLlm
from app.application.selector_proveedor_llm import SelectorDeProveedorLlm, con_clasificacion
from app.domain.reglas_proveedor import ProveedorLlm, proveedores_permitidos
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
