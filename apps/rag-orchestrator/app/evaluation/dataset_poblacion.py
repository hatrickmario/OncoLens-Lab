"""Conjunto dorado de la familia `poblacion` (``data/evaluation/poblacion-dorado/``, L1D-299, D2).

Solo corpus público con licencia aceptada (RN-21) o texto sintético, sin datos de paciente. El manifiesto sin licencia
aceptada por documento o con una clase que no es ``sintetico``/``corpus_publico`` hace que la suite no corra (código 1)
antes de medir nada. Un revisor o fecha ausentes NO impiden correr: dejan la medición «no concluyente» (AC-7). Los
mensajes nombran el archivo o el id del documento, nunca un valor ni un fragmento (RN-14).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.application.corpus_metadata.poblacion_puertos import Fragmento
from app.evaluation.config_suite import ruta_del_repo
from app.evaluation.dataset_loader import CLASE_SINTETICA, DatasetInvalido
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.revision_provisional import RevisionProvisional, exigir_revision_provisional

CLASE_CORPUS_PUBLICO = "corpus_publico"
CLASES_DEL_DORADO = (CLASE_SINTETICA, CLASE_CORPUS_PUBLICO)
ESTRATOS = ("guia", "ensayo", "revision")
IDIOMAS = ("es", "en")
ALCANCES = ("elegibilidad", "subgrupo", "mencion")
REDACCIONES = ("plantilla", "dificil")
TIPOS_DE_REDACCION = (
    "negacion",
    "rango",
    "definicion_implicita",
    "inclusion_total",
    "umbral",
    "tabla",
)
"""Tipos de redacción difícil de D-2; solo los pares ``dificil`` llevan uno."""
RENDIJAS = ("c3",)
VENTANAS = ("tras_catalogo_s7",)
"""Ventana de un par o caso agregado o etiquetado después de la corrida base, con el catálogo 1.11.0 (S7-D5)."""
ESTADOS_ESPERADOS = ("coincide", "parcial", "no_coincide", "desconocido")
CASO_EXCLUIDO_DEL_BUCLE = "tamoxifen"
"""El bucle de OUT-06 se repite con casos DISTINTOS del que lo provocó (ADR47-R17)."""


@dataclass(frozen=True)
class ValorEsperado:
    valor: str
    scope: str
    chunk: str


@dataclass(frozen=True)
class DocumentoDorado:
    id: str
    estrato: str
    idioma: str
    tipo_de_cancer: str
    fragmentos: tuple[Fragmento, ...]


@dataclass(frozen=True)
class ParDorado:
    id: str
    documento: str
    criterio: str
    esperados: tuple[ValorEsperado, ...]
    propuesta: tuple[ValorEsperado, ...]
    """Lo que el LLM falso propone; por defecto, lo esperado. Solo la usan los adapters falsos."""
    corte: int
    """Cuántas de las primeras llamadas del criterio terminan con ``finish_reason = length`` (adapters falsos)."""
    redaccion: str = "plantilla"
    """``plantilla`` o ``dificil`` (S7-D3, D-2)."""
    tipo_de_redaccion: str | None = None
    """Tipo de la redacción difícil (``TIPOS_DE_REDACCION``); solo con ``redaccion: dificil``."""
    distractor: bool = False
    """El valor solo aparece como subgrupo o mención: el esperado no trae elegibilidad (D-3)."""
    ventana: str | None = None
    """``tras_catalogo_s7`` cuando el par se agregó o cambió después de la corrida base (S7-D5); ``None``: de la base."""


@dataclass(frozen=True)
class CasoDeEstadoDorado:
    id: str
    criterio: str
    tipo_de_cancer: str
    paciente: str
    valores: tuple[ValorEsperado, ...]
    citados: frozenset[str] | None
    esperado: str
    rendija: str | None = None
    """Caso que mide una rendija conocida de la regla (``c3``); el esperado sigue siendo el de la regla vigente."""
    ventana: str | None = None
    """``tras_catalogo_s7`` cuando el caso depende del catálogo 1.11.0 (S7-D5); ``None``: de la base."""


@dataclass(frozen=True)
class FuenteDelBucle:
    documento: str
    fragmentos: tuple[Fragmento, ...]
    corte: int


@dataclass(frozen=True)
class ParDelBucle:
    id: str
    fuentes: tuple[FuenteDelBucle, ...]


@dataclass(frozen=True)
class RevisionDelDorado:
    rol: str | None
    fecha: date | None

    @property
    def completa(self) -> bool:
        return bool(self.rol) and self.fecha is not None


@dataclass(frozen=True)
class DoradoDePoblacion:
    nombre: str
    version: str
    clase: str
    catalogo_de_estados: Path
    revision: RevisionDelDorado
    documentos: Mapping[str, DocumentoDorado]
    pares: tuple[ParDorado, ...]
    estados: tuple[CasoDeEstadoDorado, ...]
    bucle: tuple[ParDelBucle, ...]
    revision_provisional: RevisionProvisional | None = None
    """Marca de procedencia de IA (S7-D2): no firma el dorado; ``revision`` sigue vacía hasta que lo revise un humano."""

    def estratos(self) -> dict[str, int]:
        """Pares por estrato (tipo de fuente) e idioma: ``guia/es``…; solo conteos."""
        cuenta: dict[str, int] = {}
        for par in self.pares:
            documento = self.documentos[par.documento]
            clave = f"{documento.estrato}/{documento.idioma}"
            cuenta[clave] = cuenta.get(clave, 0) + 1
        return dict(sorted(cuenta.items()))


def cargar_dorado(directorio: Path, licencias_aceptadas: frozenset[str]) -> DoradoDePoblacion:
    manifiesto = _leer_json(directorio / "manifest.json", "manifest.json")
    if manifiesto.get("clase") not in CLASES_DEL_DORADO:
        raise SuiteAbortada(
            "el manifest.json del dorado no declara corpus público ni datos sintéticos (RN-13, RN-14)"
        )
    provisional = _revision_provisional(manifiesto)
    try:
        contenido = _leer_yaml(directorio / "pares.yaml", "pares.yaml")
        documentos = {d: _documento(d, v) for d, v in contenido["documentos"].items()}
        pares = tuple(_par(p) for p in contenido["pares"])
        dorado = DoradoDePoblacion(
            nombre=str(manifiesto["nombre"]),
            version=str(manifiesto["version"]),
            clase=str(manifiesto["clase"]),
            catalogo_de_estados=ruta_del_repo(str(manifiesto["catalogo_de_estados"])),
            revision=_revision(manifiesto.get("revisor")),
            documentos=documentos,
            pares=pares,
            estados=_estados(_leer_yaml(directorio / "estados.yaml", "estados.yaml")),
            bucle=_bucle(_leer_yaml(directorio / "pares-bucle.yaml", "pares-bucle.yaml")),
            revision_provisional=provisional,
        )
    except (KeyError, TypeError, AttributeError, ValueError):
        raise DatasetInvalido("el dorado de población no tiene la forma esperada") from None
    _exigir_forma(dorado)
    _exigir_licencias(manifiesto.get("licencias"), dorado, licencias_aceptadas)
    return dorado


def _exigir_licencias(
    licencias: object, dorado: DoradoDePoblacion, aceptadas: frozenset[str]
) -> None:
    """RN-21: cada documento medido declara una licencia aceptada; la suite se niega antes de calcular métricas."""
    declaradas = licencias if isinstance(licencias, dict) else {}
    sin_licencia = sorted(
        d for d in {p.documento for p in dorado.pares} if declaradas.get(d) not in aceptadas
    )
    if sin_licencia:
        raise SuiteAbortada(
            f"el manifest.json no declara una licencia aceptada para: {', '.join(sin_licencia)} (RN-21)"
        )


def _exigir_forma(dorado: DoradoDePoblacion) -> None:
    for par in dorado.pares:
        if par.documento not in dorado.documentos:
            raise DatasetInvalido(f"el par {par.id} cita un documento que no está en pares.yaml")
        _exigir_redaccion(par)
    repetidos = {(p.documento, p.criterio) for p in dorado.pares}
    if len(repetidos) != len(dorado.pares):
        raise DatasetInvalido("hay dos pares para el mismo documento y criterio")
    if any(CASO_EXCLUIDO_DEL_BUCLE in p.id.lower() for p in dorado.bucle):
        raise DatasetInvalido("el bucle debe usar casos distintos del tamoxifeno (ADR47-R17)")


def _exigir_redaccion(par: ParDorado) -> None:
    """``redaccion`` y ``tipo_de_redaccion`` del conjunto cerrado y un distractor sin valores de elegibilidad (D-2, D-3)."""
    if par.redaccion not in REDACCIONES:
        raise DatasetInvalido(f"el par {par.id} declara una redaccion fuera del conjunto")
    if not _tipo_corresponde_a_la_redaccion(par):
        raise DatasetInvalido(f"el par {par.id} declara un tipo de redaccion que no corresponde")
    if par.distractor and any(v.scope == "elegibilidad" for v in par.esperados):
        raise DatasetInvalido(f"el distractor {par.id} no puede esperar valores de elegibilidad")


def _tipo_corresponde_a_la_redaccion(par: ParDorado) -> bool:
    """Solo la redacción difícil lleva tipo, y es uno del conjunto cerrado."""
    if par.redaccion != "dificil":
        return par.tipo_de_redaccion is None
    return par.tipo_de_redaccion in TIPOS_DE_REDACCION


def _leer_json(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise DatasetInvalido(f"{nombre} del dorado no se puede leer") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dorado no tiene la forma esperada")
    return contenido


def _leer_yaml(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"{nombre} del dorado no se puede leer") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dorado no tiene la forma esperada")
    return contenido


def _revision_provisional(manifiesto: Mapping[str, Any]) -> RevisionProvisional | None:
    """Ausente es válido (dorado sin marca); presente se valida con la regla compartida de todas las familias."""
    if "revision_provisional" not in manifiesto:
        return None
    return exigir_revision_provisional(manifiesto["revision_provisional"], "manifest.json")


def _revision(crudo: object) -> RevisionDelDorado:
    if not isinstance(crudo, dict):
        return RevisionDelDorado(None, None)
    rol, fecha = crudo.get("rol"), crudo.get("fecha")
    try:
        fecha_leida = fecha if isinstance(fecha, date) else date.fromisoformat(str(fecha))
    except ValueError:
        fecha_leida = None
    return RevisionDelDorado(str(rol) if rol else None, fecha_leida)


def _fragmentos(crudo: list[dict[str, Any]]) -> tuple[Fragmento, ...]:
    return tuple(Fragmento(str(f["chunk_id"]), str(f["texto"])) for f in crudo)


def _documento(id_: str, crudo: dict[str, Any]) -> DocumentoDorado:
    if crudo["estrato"] not in ESTRATOS or crudo["idioma"] not in IDIOMAS:
        raise ValueError("estrato o idioma fuera del conjunto")
    return DocumentoDorado(
        id_,
        crudo["estrato"],
        crudo["idioma"],
        str(crudo["tipo_de_cancer"]),
        _fragmentos(crudo["fragmentos"]),
    )


def _valores(crudo: list[dict[str, Any]]) -> tuple[ValorEsperado, ...]:
    valores = tuple(ValorEsperado(str(v["valor"]), str(v["scope"]), str(v["chunk"])) for v in crudo)
    if any(v.scope not in ALCANCES for v in valores):
        raise ValueError("alcance fuera del conjunto")
    return valores


def _par(crudo: dict[str, Any]) -> ParDorado:
    esperados = _valores(crudo["esperados"])
    return ParDorado(
        id=str(crudo["id"]),
        documento=str(crudo["documento"]),
        criterio=str(crudo["criterio"]),
        esperados=esperados,
        propuesta=_valores(crudo["propuesta"]) if "propuesta" in crudo else esperados,
        corte=int(crudo.get("corte", 0)),
        redaccion=str(crudo.get("redaccion", "plantilla")),
        tipo_de_redaccion=(
            None if crudo.get("tipo_de_redaccion") is None else str(crudo["tipo_de_redaccion"])
        ),
        distractor=bool(crudo.get("distractor", False)),
        ventana=_ventana(crudo.get("ventana")),
    )


def _estados(contenido: dict[str, Any]) -> tuple[CasoDeEstadoDorado, ...]:
    casos = []
    for crudo in contenido["casos"]:
        esperado = str(crudo["esperado"]["estado"])
        if esperado not in ESTADOS_ESPERADOS:
            raise ValueError("estado fuera del conjunto")
        casos.append(
            CasoDeEstadoDorado(
                id=str(crudo["id"]),
                criterio=str(crudo["criterio"]),
                tipo_de_cancer=str(crudo["tipo_de_cancer"]),
                paciente=str(crudo["paciente"]),
                valores=_valores(crudo["valores"]),
                citados=frozenset(crudo["citados"]) if "citados" in crudo else None,
                esperado=esperado,
                rendija=_rendija(crudo.get("rendija")),
                ventana=_ventana(crudo.get("ventana")),
            )
        )
    return tuple(casos)


def _rendija(crudo: object) -> str | None:
    return _marca_opcional(crudo, RENDIJAS, "rendija")


def _ventana(crudo: object) -> str | None:
    return _marca_opcional(crudo, VENTANAS, "ventana")


def _marca_opcional(crudo: object, conjunto: tuple[str, ...], nombre: str) -> str | None:
    """Una marca opcional del dataset: ausente es ``None``; presente, debe pertenecer al conjunto cerrado."""
    if crudo is not None and crudo not in conjunto:
        raise ValueError(f"{nombre} fuera del conjunto")
    return None if crudo is None else str(crudo)


def _bucle(contenido: dict[str, Any]) -> tuple[ParDelBucle, ...]:
    return tuple(
        ParDelBucle(
            str(p["id"]),
            tuple(
                FuenteDelBucle(
                    str(f["documento"]), _fragmentos(f["fragmentos"]), int(f.get("corte", 0))
                )
                for f in p["fuentes"]
            ),
        )
        for p in contenido["pares"]
    )
