"""``validar_afirmaciones_citadas`` depende del puerto ``RecuperadorDeEvidencia`` y no del servicio completo (L1D-323, b).

Un recuperador falso que cumple el contrato del puerto (solo los chunks que existen, mismas firmas) basta para validar un
seguimiento: citas del turno → soporte. Solo datos sintéticos.
"""

import json
from collections.abc import Mapping, Sequence

import pytest

from app.application.chunk_citable import ChunkCitable
from app.application.ports import ResultadoDeRecuperacion
from app.application.seguimiento import validar_afirmaciones_citadas
from app.domain.citations import OpcionAceptada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.relevance import ChunkPuntuado
from app.domain.resolucion_de_soporte import ResultadoSoporte
from app.schemas.generated.models import RagMeta
from tests.support.recuperacion import EJEMPLOS, FICHAS_FX06A

pytestmark = pytest.mark.anyio

CHUNK = ChunkPuntuado("ch-m1-1", "doc-m1", "Texto sintético del fragmento.", 0.9)


class RecuperadorFalso:
    """``RecuperadorDeEvidencia`` en memoria: un único chunk citable y un soporte que acepta todo lo que se cita."""

    def __init__(self) -> None:
        self.verificaciones: list[tuple[str, tuple[str, ...]]] = []

    async def recuperar(self, solicitud, *, con_reescritura: bool, version_del_prompt: str):
        raise NotImplementedError

    async def chunks_citables(
        self, trace_id: str, recuperacion: ResultadoDeRecuperacion
    ) -> dict[str, ChunkCitable]:
        return {CHUNK.chunk_id: ChunkCitable(CHUNK, FICHAS_FX06A["doc-m1"])}

    async def verificar(
        self,
        trace_id: str,
        idioma: str,
        aceptadas: Sequence[OpcionAceptada],
        limitaciones_propuestas: Sequence[str],
        textos_de_chunks: Mapping[str, str],
        titulos_de_chunks: Mapping[str, str],
    ) -> ResultadoSoporte:
        self.verificaciones.append((idioma, tuple(textos_de_chunks)))
        return ResultadoSoporte(tuple(aceptadas), (), (), 0)


def _recuperacion() -> ResultadoDeRecuperacion:
    meta = json.loads((EJEMPLOS / "rag-query-con-evidencia.json").read_text(encoding="utf-8"))[
        "meta"
    ]
    return ResultadoDeRecuperacion(
        chunks_sobre_umbral=(CHUNK,), recuperados=1, meta=RagMeta.model_validate(meta)
    )


async def test_validar_afirmaciones_citadas_acepta_la_cita_del_turno_cuando_el_recuperador_la_declara_citable():
    recuperador = RecuperadorFalso()
    afirmaciones = (
        AfirmacionAtomica(
            "El estudio describe el esquema.", PapelDeAfirmacion.principal, ("ch-m1-1",)
        ),
        AfirmacionAtomica(
            "Cita un chunk ajeno al turno.", PapelDeAfirmacion.principal, ("ch-x-9",)
        ),
    )

    validadas = await validar_afirmaciones_citadas(
        recuperador, "req_x", _recuperacion(), afirmaciones
    )

    assert [a.chunk_ids_validos for a in validadas.soportadas] == [("ch-m1-1",)]
    assert validadas.omitidas == 1  # la cita ajena al turno no pasa (RN-24)
    assert recuperador.verificaciones == [("es", ("ch-m1-1",))]
