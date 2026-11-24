"""Las redacciones de ``parafrasis-v1`` como preguntas de la comparación de brazos (US-278 AC-4, ``l1d-334``).

La comparación mide, además de las preguntas del dataset de la configuración, las dos redacciones de cada par de paráfrasis
sobre el MISMO corpus: así «paráfrasis recuperadas» sale de la misma corrida que recall y MRR, no de otra. El dataset de la
configuración conserva su partición (ADR-45 P2); solo se le añaden las redacciones. Los mensajes nombran el dataset, nunca un
texto (RN-14).
"""

from __future__ import annotations

from dataclasses import replace

from app.evaluation.config_suite import Parafrasis
from app.evaluation.dataset_diagnostico import (
    cargar_dataset_diagnostico,
    dataset_para_el_servicio,
    identificador_de_pregunta,
)
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.fuente_dataset import DatasetSuite


def con_parafrasis(
    dataset: DatasetSuite, parafrasis: Parafrasis
) -> tuple[DatasetSuite, dict[str, tuple[str, ...]]]:
    """El dataset con las redacciones añadidas y, por par, los ids de sus preguntas. ``DatasetInvalido`` si el corpus de los
    pares no es el del dataset de la configuración (la medición sería sobre otro corpus) o si un id ya existe."""
    pares = cargar_dataset_diagnostico(parafrasis.ruta, parafrasis.pares_minimos)
    if (pares.corpus.nombre, pares.corpus.version) != (dataset.nombre, dataset.version):
        raise DatasetInvalido(
            "los pares de paráfrasis se miden sobre otro corpus que el dataset de la configuración"
        )
    redacciones = pares.preguntas()
    existentes = {p.id for p in dataset.preguntas}
    if any(pregunta.id in existentes for _, _, pregunta in redacciones):
        raise DatasetInvalido(
            "una redacción de paráfrasis repite el id de una pregunta del dataset"
        )
    del_servicio = dataset_para_el_servicio(pares)
    ids = {pregunta.id for _, _, pregunta in redacciones}
    return (
        replace(
            dataset,
            preguntas=(*dataset.preguntas, *(p for _, _, p in redacciones)),
            propuestas={
                **dataset.propuestas,
                **{i: v for i, v in del_servicio.propuestas.items() if i in ids},
            },
        ),
        {
            par.id: tuple(identificador_de_pregunta(par, r) for r in par.redacciones)
            for par in pares.pares
        },
    )
