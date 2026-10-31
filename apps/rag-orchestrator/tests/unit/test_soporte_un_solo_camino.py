"""D4-19: el soporte tiene UN camino, el atómico por papel; una opción sin afirmaciones falla cerrado (RN-01)."""

from __future__ import annotations

import pytest

from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.saneamiento_de_descartadas import retirar_texto_prohibido
from app.domain.support import planificar_soporte

TEXTOS = {"c1": "premisa uno"}


def _buscar(texto: str, campo: str) -> tuple[str, ...]:
    return ()


def test_planificar_soporte_rechaza_una_opcion_sin_afirmaciones_atomicas() -> None:
    sin_afirmaciones = OpcionAceptada(OpcionGenerada("Opción", "Uno. Dos.", ("c1",)), ("c1",))

    with pytest.raises(ValueError, match="afirmaciones"):
        planificar_soporte([sin_afirmaciones], (), TEXTOS, _buscar, max_palabras=20)


def test_retirar_texto_prohibido_rechaza_una_opcion_sin_afirmaciones_atomicas() -> None:
    with pytest.raises(ValueError, match="afirmaciones"):
        retirar_texto_prohibido(OpcionGenerada("Opción", "Uno.", ("c1",)), _buscar, "es", 20)


def _con(*papeles: PapelDeAfirmacion) -> OpcionAceptada:
    atomicas = tuple(AfirmacionAtomica(f"texto {i}", p, ("c1",)) for i, p in enumerate(papeles))
    return OpcionAceptada(OpcionGenerada("Opción", "r", ("c1",), (), atomicas), ("c1",))


def test_planificar_soporte_rechaza_una_opcion_sin_afirmacion_principal() -> None:
    with pytest.raises(ValueError, match="principal"):
        planificar_soporte(
            [_con(PapelDeAfirmacion.secundaria)], (), TEXTOS, _buscar, max_palabras=20
        )


def test_planificar_soporte_rechaza_una_opcion_con_mas_de_una_afirmacion_principal() -> None:
    with pytest.raises(ValueError, match="principal"):
        planificar_soporte(
            [_con(PapelDeAfirmacion.principal, PapelDeAfirmacion.principal)],
            (),
            TEXTOS,
            _buscar,
            max_palabras=20,
        )


def test_retirar_texto_prohibido_rechaza_una_opcion_sin_afirmacion_principal() -> None:
    with pytest.raises(ValueError, match="principal"):
        retirar_texto_prohibido(_con(PapelDeAfirmacion.secundaria).opcion, _buscar, "es", 20)
