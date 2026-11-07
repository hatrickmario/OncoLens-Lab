"""Dataset ``chat-v1`` de la familia ``chat`` de ``evaluate`` (US-269, OL-06): carga y validación, sin E/S de modelos."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.domain.chat.estado import INTENCIONES_CLASIFICABLES
from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido

INTENCIONES = tuple(i.value for i in INTENCIONES_CLASIFICABLES)
"""Las intenciones que el chat mide: las que enrutan a un nodo de capacidad (una sola definición, la del dominio)."""
TIPOS_DE_CANCER = ("mama", "prostata")
ACS = ("AC01", "AC02", "AC03", "AC04", "AC05", "AC06")
REVISIONES = ("pendiente", "aprobado")
MINIMO_DE_CASOS = 12


@dataclass(frozen=True)
class FaltanteSembrado:
    item: str
    gap_type: str


@dataclass(frozen=True)
class PacienteConFaltantes:
    paciente: str
    cancer: str
    items: tuple[FaltanteSembrado, ...]


@dataclass(frozen=True)
class EjemploDelCaso:
    """La petición de ``chat-fake.yaml``: un ejemplo de ``contracts/examples/`` y la traducción clave del seed → ``factRef``."""

    base: str
    hechos: Mapping[str, str]


@dataclass(frozen=True)
class GuionDelLlm:
    """La salida cruda del LLM falso: la intención que clasifica y las afirmaciones que propone."""

    ruta: str
    afirmaciones: tuple[Mapping[str, object], ...]


@dataclass(frozen=True)
class CasoDeChat:
    id: str
    ac: str
    cancer: str
    paciente: str
    intent: str
    pregunta: str
    respuesta_esperada: str
    hechos_esperados: tuple[str, ...]
    criterios_esperados: tuple[str, ...]
    revision_oncologo: str
    previo: str | None
    ejemplo: EjemploDelCaso
    guion: GuionDelLlm


@dataclass(frozen=True)
class ControlDeChat:
    """Un turno que solo cuenta en las salidas prescriptivas (RN-23): no entra en la cobertura ni en las métricas por tipo."""

    id: str
    control: str
    cancer: str
    pregunta: str
    ejemplo: EjemploDelCaso
    guion: GuionDelLlm


@dataclass(frozen=True)
class DatasetDeChat:
    nombre: str
    version: str
    clase: str
    corpus: Path
    casos: tuple[CasoDeChat, ...]
    controles: tuple[ControlDeChat, ...]
    faltantes_sembrados: tuple[PacienteConFaltantes, ...]


GAP_TYPES = ("no_buscado", "no_encontrado", "incompleto", "por_conciliar")


def cargar_dataset_de_chat(directorio: Path) -> DatasetDeChat:
    """Lee y valida ``chat-v1``: clase ``sintetico`` (RN-13, RN-14), cobertura AC01…AC06 por tipo, ``revision_oncologo`` por
    caso (AC-8) y un ``previo`` que va antes. Los mensajes nombran el campo y el id del caso, nunca su texto."""
    manifiesto = _leer(directorio / "manifest.yaml")
    crudo = _leer(directorio / manifiesto["archivos"]["casos"])
    if manifiesto.get("clase") != CLASE_SINTETICA or crudo.get("clase") != CLASE_SINTETICA:
        raise DatasetInvalido(
            "chat-v1 debe declarar clase: sintetico en el manifiesto y en casos.yaml"
        )
    try:
        casos = tuple(_caso(c) for c in crudo["casos"])
        controles = tuple(_control(c) for c in crudo.get("controles", []))
        faltantes = tuple(_paciente_con_faltantes(p) for p in crudo.get("faltantes_sembrados", []))
        dataset = DatasetDeChat(
            nombre=str(manifiesto["nombre"]),
            version=str(manifiesto["version"]),
            clase=CLASE_SINTETICA,
            corpus=Path(manifiesto["corpus"]),
            casos=casos,
            controles=controles,
            faltantes_sembrados=faltantes,
        )
    except (KeyError, TypeError, AttributeError):
        raise DatasetInvalido("la estructura de chat-v1 no es válida") from None
    _exigir_cobertura(dataset)
    _exigir_previos_antes(dataset)
    return dataset


def _leer(ruta: Path) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {ruta.name}") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{ruta.name} no es un mapa YAML")
    return contenido


def _elegir(id_: str, campo: str, valor: object, permitidos: tuple[str, ...]) -> str:
    if valor not in permitidos:
        raise DatasetInvalido(f"{campo} inválido en {id_}: debe ser uno de {', '.join(permitidos)}")
    return str(valor)


def _ejemplo(c: Mapping[str, Any]) -> EjemploDelCaso:
    e = c["ejemplo"]
    return EjemploDelCaso(base=str(e["base"]), hechos=dict(e.get("hechos", {})))


def _guion(c: Mapping[str, Any]) -> GuionDelLlm:
    g = c["guion"]
    return GuionDelLlm(
        ruta=_elegir(str(c["id"]), "intent del guion", g["ruta"], INTENCIONES),
        afirmaciones=tuple(dict(a) for a in g.get("afirmaciones", [])),
    )


def _caso(c: Mapping[str, Any]) -> CasoDeChat:
    id_ = str(c["id"])
    if "revision_oncologo" not in c:
        raise DatasetInvalido(f"falta revision_oncologo en {id_}")
    hechos = tuple(str(h) for h in c.get("hechos_esperados", []))
    criterios = tuple(str(k) for k in c.get("criterios_esperados", []))
    if not hechos and not criterios:
        raise DatasetInvalido(f"{id_} necesita hechos_esperados o criterios_esperados")
    if not c.get("respuesta_esperada"):
        raise DatasetInvalido(f"falta respuesta_esperada en {id_}")
    return CasoDeChat(
        id=id_,
        ac=_elegir(id_, "ac", c["ac"], ACS),
        cancer=_elegir(id_, "cancer", c["cancer"], TIPOS_DE_CANCER),
        paciente=str(c["paciente"]),
        intent=_elegir(id_, "intent", c["intent"], INTENCIONES),
        pregunta=str(c["pregunta"]),
        respuesta_esperada=str(c["respuesta_esperada"]),
        hechos_esperados=hechos,
        criterios_esperados=criterios,
        revision_oncologo=_elegir(id_, "revision_oncologo", c["revision_oncologo"], REVISIONES),
        previo=None if c.get("previo") is None else str(c["previo"]),
        ejemplo=_ejemplo(c),
        guion=_guion(c),
    )


def _control(c: Mapping[str, Any]) -> ControlDeChat:
    return ControlDeChat(
        id=str(c["id"]),
        control=str(c["control"]),
        cancer=_elegir(str(c["id"]), "cancer", c["cancer"], TIPOS_DE_CANCER),
        pregunta=str(c["pregunta"]),
        ejemplo=_ejemplo(c),
        guion=_guion(c),
    )


def _paciente_con_faltantes(p: Mapping[str, Any]) -> PacienteConFaltantes:
    id_ = str(p["paciente"])
    return PacienteConFaltantes(
        paciente=id_,
        cancer=_elegir(id_, "cancer", p["cancer"], TIPOS_DE_CANCER),
        items=tuple(
            FaltanteSembrado(str(i["item"]), _elegir(id_, "gap_type", i["gap_type"], GAP_TYPES))
            for i in p["items"]
        ),
    )


def _exigir_cobertura(dataset: DatasetDeChat) -> None:
    """Al menos ``MINIMO_DE_CASOS`` casos y uno por cada par (AC01…AC06, tipo de cáncer) (AC-2)."""
    presentes = {(c.ac, c.cancer) for c in dataset.casos}
    for ac in ACS:
        for tipo in TIPOS_DE_CANCER:
            if (ac, tipo) not in presentes:
                raise DatasetInvalido(f"chat-v1 sin cobertura de {ac} en {tipo}")
    if len(dataset.casos) < MINIMO_DE_CASOS:
        raise DatasetInvalido(f"chat-v1 necesita al menos {MINIMO_DE_CASOS} casos")


def _exigir_previos_antes(dataset: DatasetDeChat) -> None:
    """El turno previo de un caso (mismo hilo) existe y va antes en el archivo."""
    vistos: set[str] = set()
    for caso in dataset.casos:
        if caso.previo is not None and caso.previo not in vistos:
            raise DatasetInvalido(f"el caso previo de {caso.id} no existe o no va antes")
        vistos.add(caso.id)
