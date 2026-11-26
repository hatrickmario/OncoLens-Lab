"""Dataset sintético de la familia `diagnostico` (``data/eval/parafrasis-v1/``, US-276).

``manifest.yaml`` declara la clase, el corpus sobre el que se miden los pares (``data/eval/s5-corpus-ampliado``, el mismo en
la corrida base y en la final) y la ``revision_provisional``; ``pares.yaml`` trae cada par con sus redacciones y la evidencia
esperada como documento y cita literal del corpus. Los mensajes nombran el par o el archivo, nunca un texto (RN-14).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Final

import yaml

from app.evaluation.config_suite import ruta_del_repo
from app.evaluation.dataset_loader import (
    CLASE_SINTETICA,
    DatasetInvalido,
    Evidencia,
    Pregunta,
    exigir_clase_sintetica,
)
from app.evaluation.fuente_dataset import DatasetSuite, FuenteDatasetEnDirectorio, OpcionPropuesta
from app.evaluation.metricas.diagnostico import chunks_esperados_de
from app.evaluation.revision_provisional import (
    MarcaDeRevisionProvisional,
    exigir_revision_provisional,
)

FAMILIA: Final = "diagnostico"
TIPOS_DE_VARIACION: Final = ("coloquial_tecnico", "sin_tildes", "orden", "es_en")
IDIOMAS: Final = ("es", "en")
MAXIMO_DE_PALABRAS_DEL_GUION: Final = 12
"""Palabras de la cita que el generador FALSO usa como afirmación (cabe en ``CLAIM_MAX_WORDS``)."""


@dataclass(frozen=True)
class RedaccionDePar:
    id: str
    idioma: str
    texto: str
    """Solo vive en memoria: el informe nombra la redacción por su id."""


@dataclass(frozen=True)
class ParDeParafrasis:
    id: str
    tipo: str
    tipo_de_cancer: str
    redacciones: tuple[RedaccionDePar, ...]
    evidencia: tuple[Evidencia, ...]
    chunks_esperados: tuple[str, ...]
    """Ids de los chunks del corpus que contienen la cita literal (D3)."""


@dataclass(frozen=True)
class DatasetDiagnostico:
    nombre: str
    version: str
    clase: str
    corpus: DatasetSuite
    pares: tuple[ParDeParafrasis, ...]
    revision_provisional: MarcaDeRevisionProvisional

    def preguntas(self) -> tuple[tuple[ParDeParafrasis, RedaccionDePar, Pregunta], ...]:
        return tuple(
            (par, redaccion, pregunta_de_redaccion(par, redaccion))
            for par in self.pares
            for redaccion in par.redacciones
        )


def identificador_de_pregunta(par: ParDeParafrasis, redaccion: RedaccionDePar) -> str:
    return f"{par.id}-{redaccion.id}"


def pregunta_de_redaccion(par: ParDeParafrasis, redaccion: RedaccionDePar) -> Pregunta:
    """La redacción como ``Pregunta`` de la suite (el servicio de consulta y el generador falso la reconocen por su texto)."""
    return Pregunta(
        id=identificador_de_pregunta(par, redaccion),
        idioma=redaccion.idioma,
        cancer=par.tipo_de_cancer,
        tipo="parafrasis",
        texto=redaccion.texto,
        modo_acierto="cualquiera",
        documentos=tuple(dict.fromkeys(e.documento for e in par.evidencia)),
        evidencia=par.evidencia,
    )


def cargar_dataset_diagnostico(directorio: Path, pares_minimos: int) -> DatasetDiagnostico:
    """Se niega (``DatasetInvalido``) si el manifiesto no declara ``clase: sintetico``, si falta la marca de revisión, si una
    cita no es un fragmento literal del documento esperado o si el conjunto no cubre los pares y los tipos exigidos."""
    manifiesto = _leer(directorio / "manifest.yaml", "manifest.yaml")
    exigir_clase_sintetica(manifiesto.get("clase"), "manifest.yaml", FAMILIA)
    crudo = _leer(directorio / str(_clave(manifiesto, "archivos")["pares"]), "pares.yaml")
    exigir_clase_sintetica(crudo.get("clase"), "pares.yaml", FAMILIA)
    revision = exigir_revision_provisional(manifiesto.get("revision_provisional"), "manifest.yaml")
    corpus = FuenteDatasetEnDirectorio(ruta_del_repo(str(_clave(manifiesto, "corpus")))).cargar()
    exigir_clase_sintetica(corpus.clase, "el corpus", FAMILIA)
    pares = _pares(crudo, corpus)
    _exigir_cobertura(pares, pares_minimos)
    return DatasetDiagnostico(
        str(manifiesto.get("nombre", directorio.name)),
        str(manifiesto.get("version", "")),
        CLASE_SINTETICA,
        corpus,
        pares,
        revision,
    )


def dataset_para_el_servicio(dataset: DatasetDiagnostico) -> DatasetSuite:
    """El corpus con las redacciones como preguntas y, para el generador FALSO, una opción por redacción que cita el chunk
    esperado con las primeras palabras de la cita como afirmación. Con el generador local real esas propuestas no se usan."""
    preguntas = [pregunta for _, _, pregunta in dataset.preguntas()]
    propuestas = {
        pregunta.id: (_propuesta_guionada(par),)
        for par, _, pregunta in dataset.preguntas()
        if par.chunks_esperados
    }
    return replace(
        dataset.corpus,
        preguntas=(*dataset.corpus.preguntas, *preguntas),
        propuestas={**dataset.corpus.propuestas, **propuestas},
    )


def _propuesta_guionada(par: ParDeParafrasis) -> OpcionPropuesta:
    palabras = par.evidencia[0].cita.split()[:MAXIMO_DE_PALABRAS_DEL_GUION]
    return OpcionPropuesta(
        f"Opción descrita en {par.id}", " ".join(palabras), par.chunks_esperados[:1]
    )


def _pares(crudo: dict[str, Any], corpus: DatasetSuite) -> tuple[ParDeParafrasis, ...]:
    try:
        pares = tuple(_par(p, corpus) for p in _clave(crudo, "pares"))
    except DatasetInvalido:
        raise  # ya nombra el par: ``DatasetInvalido`` es un ``ValueError`` y no debe volverse el mensaje genérico
    except (KeyError, TypeError, AttributeError, ValueError):
        raise DatasetInvalido("pares.yaml no tiene la forma esperada") from None
    if len({p.id for p in pares}) != len(pares):
        raise DatasetInvalido("pares.yaml repite el id de un par")
    return pares


def _par(crudo: dict[str, Any], corpus: DatasetSuite) -> ParDeParafrasis:
    identificador = str(crudo["id"])
    if crudo["tipo"] not in TIPOS_DE_VARIACION:
        raise DatasetInvalido(f"el par {identificador} declara un tipo de variación desconocido")
    redacciones = tuple(
        RedaccionDePar(str(r["id"]), str(r["idioma"]), str(r["pregunta"]))
        for r in crudo["redacciones"]
    )
    if (
        len(redacciones) < 2
        or len({r.id for r in redacciones}) != len(redacciones)
        or len({r.texto for r in redacciones}) != len(redacciones)
        or any(r.idioma not in IDIOMAS for r in redacciones)
    ):
        raise DatasetInvalido(
            f"el par {identificador} necesita dos o más redacciones distintas con idioma es o en"
        )
    evidencia = tuple(Evidencia(str(e["documento"]), str(e["cita"])) for e in crudo["evidencia"])
    esperados = _esperados(identificador, evidencia, corpus)
    return ParDeParafrasis(
        identificador,
        str(crudo["tipo"]),
        str(crudo["tipo_de_cancer"]),
        redacciones,
        evidencia,
        esperados,
    )


def _esperados(
    identificador: str, evidencia: tuple[Evidencia, ...], corpus: DatasetSuite
) -> tuple[str, ...]:
    if not evidencia:
        raise DatasetInvalido(f"el par {identificador} no declara evidencia esperada")
    for e in evidencia:
        if not chunks_esperados_de([e], corpus.chunks):
            raise DatasetInvalido(
                f"el par {identificador}: la cita de {e.documento} no es un fragmento literal del documento en el corpus"
            )
    return chunks_esperados_de(evidencia, corpus.chunks)


def _exigir_cobertura(pares: tuple[ParDeParafrasis, ...], pares_minimos: int) -> None:
    if len(pares) < pares_minimos:
        raise DatasetInvalido(
            "el dataset de diagnostico tiene menos pares que diagnostico.pares_minimos"
        )
    faltan = [t for t in TIPOS_DE_VARIACION if not any(p.tipo == t for p in pares)]
    if faltan:
        raise DatasetInvalido(f"el dataset de diagnostico no tiene ningún par del tipo {faltan[0]}")


def _clave(crudo: dict[str, Any], clave: str) -> Any:
    if clave not in crudo:
        raise DatasetInvalido(f"falta la clave {clave} en el dataset de diagnostico")
    return crudo[clave]


def _leer(ruta: Path, nombre: str) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise DatasetInvalido(f"no se pudo leer {nombre} del dataset de diagnostico") from None
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{nombre} del dataset de diagnostico no es un mapa")
    return contenido
