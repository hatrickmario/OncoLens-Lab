"""Informe de sensibilidad del detector de PII de Backend 1 (ADR-40): el JSON de `npm run eval:pii` de clinical-api.

Forma esperada (``InformeDePii`` en ``clinical-api/src/evaluacion/pii/medir-detector.ts``): ``textos`` y, por cada modo
(``solo_formatos`` e ``identidad_de_referencia``), ``sensibilidadDocumentos`` (por tipo directo y ``total``),
``tiposDirectosPorDebajo`` y ``cumpleSensibilidadMinimaPorTipoDirecto``. De ahí salen solo conteos y banderas: las
``notas`` y cualquier otro campo no se copian (RN-14). Un tipo fuera del vocabulario se rechaza en lugar de ignorarse.

``identidad_de_referencia`` usa etiquetas de oro: es una cota de oráculo, no la sensibilidad de producción.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

TIPOS_DIRECTOS = ("nombre", "documento", "telefono", "correo", "direccion", "fecha_nacimiento")
MODOS = ("solo_formatos", "identidad_de_referencia")
CLAVE_TOTAL = "total"


class InformePiiInvalido(ValueError):
    """El informe no tiene la forma de `eval:pii`; el mensaje nombra la clave, nunca su valor ni la ruta."""


@dataclass(frozen=True)
class SensibilidadPii:
    aciertos: int
    total: int
    valor: float | None


@dataclass(frozen=True)
class ModoPii:
    por_tipo: dict[str, SensibilidadPii]
    total: SensibilidadPii
    tipos_por_debajo: int
    cumple_minimo: bool


@dataclass(frozen=True)
class InformePiiB1:
    textos: int
    modos: dict[str, ModoPii]


def _mapa(valor: Any, clave: str) -> Mapping[str, Any]:
    if not isinstance(valor, Mapping):
        raise InformePiiInvalido(f"{clave} no es un objeto")
    return valor


def _entero(valor: Any, clave: str) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int):
        raise InformePiiInvalido(f"{clave} no es un entero")
    return valor


def _sensibilidad(valor: Any, clave: str) -> SensibilidadPii:
    crudo = _mapa(valor, clave)
    medida = crudo.get("valor")
    if medida is not None and (isinstance(medida, bool) or not isinstance(medida, (int, float))):
        raise InformePiiInvalido(f"{clave}.valor no es un número")
    return SensibilidadPii(
        _entero(crudo.get("aciertos"), f"{clave}.aciertos"),
        _entero(crudo.get("total"), f"{clave}.total"),
        None if medida is None else float(medida),
    )


def _modo(valor: Any, nombre: str) -> ModoPii:
    crudo = _mapa(valor, nombre)
    por_documentos = _mapa(crudo.get("sensibilidadDocumentos"), f"{nombre}.sensibilidadDocumentos")
    desconocidos = set(por_documentos) - {*TIPOS_DIRECTOS, CLAVE_TOTAL}
    if desconocidos:
        raise InformePiiInvalido(
            f"{nombre}: {len(desconocidos)} tipo(s) de PII fuera del vocabulario"
        )
    if CLAVE_TOTAL not in por_documentos:
        raise InformePiiInvalido(f"{nombre}.sensibilidadDocumentos no trae total")
    por_debajo = crudo.get("tiposDirectosPorDebajo")
    if isinstance(por_debajo, list) and not set(por_debajo) <= {*TIPOS_DIRECTOS, CLAVE_TOTAL}:
        raise InformePiiInvalido(
            f"{nombre}: tiposDirectosPorDebajo trae tipos fuera del vocabulario"
        )
    cumple = crudo.get("cumpleSensibilidadMinimaPorTipoDirecto")
    if not isinstance(por_debajo, list) or not isinstance(cumple, bool):
        raise InformePiiInvalido(f"{nombre}: faltan tiposDirectosPorDebajo o el veredicto")
    return ModoPii(
        por_tipo={
            tipo: _sensibilidad(por_documentos[tipo], f"{nombre}.{tipo}")
            for tipo in TIPOS_DIRECTOS
            if tipo in por_documentos
        },
        total=_sensibilidad(por_documentos[CLAVE_TOTAL], f"{nombre}.total"),
        tipos_por_debajo=sum(tipo in TIPOS_DIRECTOS for tipo in por_debajo),
        cumple_minimo=cumple,
    )


def interpretar_informe_pii(crudo: Mapping[str, Any]) -> InformePiiB1:
    modos = _mapa(crudo.get("modos"), "modos")
    faltantes = [m for m in MODOS if m not in modos]
    if faltantes:
        raise InformePiiInvalido(f"faltan {len(faltantes)} modo(s) de medición")
    return InformePiiB1(
        textos=_entero(crudo.get("textos"), "textos"),
        modos={m: _modo(modos[m], m) for m in MODOS},
    )


class ProveedorPii(Protocol):
    def leer(self) -> InformePiiB1 | None:
        """La sensibilidad medida por B1, o ``None`` si no se midió (``null`` ≠ ``0.0``)."""
        ...


class SinInformePii:
    def leer(self) -> InformePiiB1 | None:
        return None


class ProveedorPiiDeArchivo:
    def __init__(self, ruta: Path) -> None:
        self._ruta = ruta

    def leer(self) -> InformePiiB1 | None:
        try:
            crudo = json.loads(self._ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise InformePiiInvalido("el informe de PII de B1 no se pudo leer") from None
        return interpretar_informe_pii(_mapa(crudo, "informe"))
