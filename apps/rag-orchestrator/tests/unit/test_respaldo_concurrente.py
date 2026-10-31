"""Las llamadas del respaldo corren en un ``TaskGroup`` (Gate 2, Q3): un defecto en una cancela a las demás y no las deja
vivas detrás de la excepción. Un fallo esperado (``RespaldoFallido``) degrada solo su criterio y no cancela nada."""

import asyncio

import pytest

from app.application.aplicabilidad_textual import AplicabilidadTextual, ParametrosDelRespaldo
from app.domain.applicability_text import (
    CausaDeRespaldo,
    ChunkDeFuente,
    CriterioPendiente,
    FuenteParaProponer,
    PropuestaDePoblacion,
    RespaldoFallido,
)

FUENTE = FuenteParaProponer(
    "CDR-TEST",
    (CriterioPendiente("a_defecto", "A", None), CriterioPendiente("b_lento", "B", None)),
    (ChunkDeFuente("ch-1", "texto"),),
)


class _Tarea:
    def __init__(self, fallo: Exception | None = None) -> None:
        self.fallo = fallo
        self.lento_cancelado = False

    async def proponer(self, fuente: FuenteParaProponer) -> tuple[PropuestaDePoblacion, ...]:
        if fuente.criterios[0].clave == "a_defecto":
            await asyncio.sleep(0)
            if self.fallo is not None:
                raise self.fallo
            return ()
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            self.lento_cancelado = True
            raise
        return ()


def _servicio(tarea: _Tarea, plazo_ms: int = 10000) -> AplicabilidadTextual:
    return AplicabilidadTextual(
        proponente=tarea,
        parametros=ParametrosDelRespaldo(plazo_ms=plazo_ms, concurrencia=2, version_del_prompt="p"),
        soporte=None,  # type: ignore[arg-type]
        terminos=None,  # type: ignore[arg-type]
        criterios_del=lambda tipo: (),
        reloj=None,  # type: ignore[arg-type]
    )


def test_un_defecto_en_una_llamada_cancela_a_las_demas_antes_de_propagarse():
    tarea = _Tarea(RuntimeError("defecto"))

    async def correr():
        with pytest.raises(RuntimeError):
            await _servicio(tarea)._pedir_respaldo([FUENTE])
        return tarea.lento_cancelado

    assert asyncio.run(correr()) is True


def test_un_respaldo_fallido_degrada_solo_su_criterio_y_no_cancela_a_las_demas():
    tarea = _Tarea(RespaldoFallido(CausaDeRespaldo.bucle, "length", 10))

    resultados = asyncio.run(_servicio(tarea, plazo_ms=50)._pedir_respaldo([FUENTE]))

    por_criterio = {r.criterio: r.fallo.causa if r.fallo else None for r in resultados}
    assert por_criterio == {"a_defecto": CausaDeRespaldo.bucle, "b_lento": CausaDeRespaldo.plazo}
