"""``ConstructorDeCitas`` (L1D-322, RN-04): las citas del chat salen del corpus o el turno falla cerrado, sin respuesta parcial.

El contrato de `/chat/turn` aún no declara `RETRIEVAL_UNAVAILABLE` en su 503 (deuda de contrato, ver tasks.md): por eso se
prueba la unidad y no la respuesta HTTP.
"""

import pytest

from app.application.chat.citas import ConstructorDeCitas, FuenteDeCita
from app.application.errores import RecuperacionNoDisponibleError
from tests.support.posiciones_falsas import PosicionesFalsas
from tests.support.recuperacion import CORPUS_FX06A

pytestmark = pytest.mark.anyio

FUENTE = FuenteDeCita("ch-m1-1", "Título del catálogo", "Texto del chunk")


async def test_construye_la_cita_con_la_posicion_del_corpus_y_el_titulo_y_texto_recibidos():
    citas = await ConstructorDeCitas(PosicionesFalsas(CORPUS_FX06A)).construir("req_x", [FUENTE])

    cita = citas["ch-m1-1"]
    assert (cita.document_id, cita.ordinal, cita.cantidad) == ("doc-m1", 1, 1)
    assert (cita.titulo_de_la_fuente, cita.texto_del_chunk) == (
        "Título del catálogo",
        "Texto del chunk",
    )


async def test_falla_cerrado_sin_detalle_cuando_el_puerto_de_posiciones_falla():
    posiciones = PosicionesFalsas(CORPUS_FX06A, error=RuntimeError("SINT-detalle-de-milvus"))

    with pytest.raises(RecuperacionNoDisponibleError) as error:
        await ConstructorDeCitas(posiciones).construir("req_x", [FUENTE])

    assert "SINT-detalle-de-milvus" not in str(error.value)


async def test_falla_cerrado_cuando_un_chunk_citado_no_tiene_posicion_vigente():
    sin_el_citado = [c for c in CORPUS_FX06A if c.chunk_id != "ch-m1-1"]

    with pytest.raises(RecuperacionNoDisponibleError):
        await ConstructorDeCitas(PosicionesFalsas(sin_el_citado)).construir("req_x", [FUENTE])
