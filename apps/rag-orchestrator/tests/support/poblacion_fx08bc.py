"""FX-08b-c: población del estudio en lista por fragmento, pacientes A-M2 y A-M3 y el LLM falso ``LLM-POB`` (US-243).

Catálogo ``test-apl-1.2.0`` (6 criterios de mama, sinónimos es/en y ``restrictionMarkers``); corpus ``doc-b1``…``doc-b10``
en la forma de lista de US-241 (``metadata_source = extraido_verificado``). Solo datos sintéticos. El NLI falso implica
todas las afirmaciones, como declara la fixture.
"""

from __future__ import annotations

import copy
from typing import Any

from app.application.ports import EvidenciaGenerada, ResultadoDeRecuperacion
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import FichaDeFuente, OpcionGenerada
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.aplicabilidad import FICHAS_FX08BA, criterios_de
from tests.support.catalogo_aplicabilidad import APL_1_2_0
from tests.support.poblacion_lista import MARCA_PENDIENTE, poblacion_guardada, valor_nuevo
from tests.support.recuperacion import (
    Q_HER2,
    BuscadorFalso,
    CatalogoClinicoFalso,
    CatalogoFalso,
    ChunkFx,
    EntornoDeRecuperacion,
    RerankerFalso,
    _vector,
    crear_entorno,
    solicitud_de,
)

TIPOS_DE_TEST = ("mama", "prostata")
RELEVANCIA = 0.90
RAZON = "La evidencia recuperada describe el esquema adyuvante en la población estudiada."


def _menopausia(*valores: tuple[str, str]) -> dict[str, object]:
    return {"estado_menopausico": [valor_nuevo(texto, chunk) for texto, chunk in valores]}


POBLACIONES_FX08BC: dict[str, PoblacionDelEstudio] = {
    "doc-b1": poblacion_guardada(
        "extraido_verificado",
        _menopausia(("premenopausal women", "ch-b1-1"), ("postmenopausal women", "ch-b1-1")),
    ),
    "doc-b2": poblacion_guardada(
        "extraido_verificado", _menopausia(("postmenopausal women only", "ch-b2-1"))
    ),
    "doc-b3": poblacion_guardada(
        "extraido_verificado", _menopausia(("postmenopausal women", "ch-b3-1"))
    ),
    "doc-b4": poblacion_guardada(
        "extraido_verificado",
        {
            "biomarcadores": {
                "her2": [
                    valor_nuevo("HER2-positive (IHC 3+)", "ch-b4-1"),
                    valor_nuevo("HER2-negative (IHC 2+, ISH not amplified)", "ch-b4-2"),
                ]
            }
        },
    ),
    "doc-b5": poblacion_guardada(
        "extraido_verificado",
        _menopausia(("premenopausal women", "ch-b5-1"), ("postmenopausal women", "ch-b5-1")),
    ),
    "doc-b6": poblacion_guardada(
        "extraido_verificado",
        {
            "biomarcadores": {
                "receptores_hormonales": [
                    valor_nuevo("triple-negative (TNBC)", "ch-b6-1", "subgrupo")
                ]
            }
        },
    ),
    "doc-b7": poblacion_guardada(
        "extraido_verificado",
        _menopausia(
            ("postmenopausal women only", "ch-b7-1"), ("premenopausal women only", "ch-b7-2")
        ),
    ),
    "doc-b9": poblacion_guardada("extraido_verificado", {"estado_menopausico": MARCA_PENDIENTE}),
    "doc-b10": poblacion_guardada(
        "extraido_verificado",
        _menopausia(
            ("premenopausal women", "ch-b10-1"),
            ("perimenopausal women", "ch-b10-1"),
            ("postmenopausal women", "ch-b10-2"),
            ("women aged 60 or older", "ch-b10-2"),
        ),
    ),
}

CHUNKS_DE_DOCUMENTO: dict[str, tuple[str, ...]] = {
    "doc-b1": ("ch-b1-1",),
    "doc-b2": ("ch-b2-1",),
    "doc-b3": ("ch-b3-1",),
    "doc-b4": ("ch-b4-1", "ch-b4-2"),
    "doc-b5": ("ch-b5-1",),
    "doc-b6": ("ch-b6-1",),
    "doc-b7": ("ch-b7-1", "ch-b7-2"),
    "doc-b9": ("ch-b9-1",),
    "doc-b10": ("ch-b10-1", "ch-b10-2"),
}


def _chunk(chunk_id: str, documento: str) -> ChunkFx:
    texto = f"Synthetic adjuvant study {documento}, fragment {chunk_id} (test)."
    return ChunkFx(chunk_id, documento, texto, _vector(e0=0.9, e3=0.1), True, "mama")


CORPUS_FX08BC: tuple[ChunkFx, ...] = tuple(
    _chunk(chunk, documento)
    for documento, chunks in CHUNKS_DE_DOCUMENTO.items()
    for chunk in chunks
)


def _ficha(documento: str) -> FichaDeFuente:
    base = FICHAS_FX08BA["doc-a1"]
    diseno = "guia" if documento == "doc-b5" else "eca"
    return FichaDeFuente(
        title=f"Estudio sintético {documento} (test)",
        source_name=base.source_name,
        external_id=f"CDR-TEST-{documento.removeprefix('doc-').upper()}",
        language=base.language,
        source_type="guideline",
        license_class=base.license_class,
        study_design=diseno,
        trial_phase=None,
        primary_endpoint=None,
        sample_size=None,
        published_at=base.published_at,
        last_updated_at=base.last_updated_at,
        guideline_version=base.guideline_version,
        authors=None,
        source_url=None,
    )


FICHAS_FX08BC: dict[str, FichaDeFuente] = {d: _ficha(d) for d in CHUNKS_DE_DOCUMENTO}

# LLM-POB: cada opción con los chunks que cita.
OPCIONES_LLM_POB: dict[str, tuple[str, ...]] = {
    "O-P1": ("ch-b1-1",),
    "O-P2": ("ch-b2-1",),
    "O-P3": ("ch-b3-1",),
    "O-P4": ("ch-b4-1", "ch-b4-2"),
    "O-P5": ("ch-b5-1",),
    "O-P6": ("ch-b6-1",),
    "O-P7": ("ch-b7-1",),
    "O-P8": ("ch-b7-2",),
    "O-P9": ("ch-b9-1",),
    "O-P10": ("ch-b10-1", "ch-b10-2"),
}


def texto_de_opcion(identificador: str) -> str:
    return f"Esquema adyuvante descrito en la evidencia ({identificador})"


class GeneradorLlmPob:
    """``EvidenceGenerator`` falso ``LLM-POB``: las opciones pedidas, en ese orden, citando sus chunks."""

    def __init__(self, *opciones: str) -> None:
        self._opciones = tuple(
            OpcionGenerada(texto_de_opcion(o), RAZON, OPCIONES_LLM_POB[o]) for o in opciones
        )
        self.recuperaciones: list[ResultadoDeRecuperacion] = []

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        self.recuperaciones.append(recuperacion)
        return EvidenciaGenerada(opciones=self._opciones)


def _procedencia_verificada() -> dict[str, Any]:
    return {
        "entryMethod": "seed",
        "extractionConfidence": "n_a",
        "reviewStatus": "verificado",
        "conflict": False,
    }


def _paciente(estado_menopausico: str) -> dict[str, Any]:
    solicitud = copy.deepcopy(solicitud_de(Q_HER2))
    solicitud["catalogVersion"] = APL_1_2_0.name
    contexto = solicitud["clinicalContext"]
    procedencia = _procedencia_verificada()
    contexto["diagnosis"]["provenance"] = procedencia
    plantilla = contexto["biomarkers"][0]
    contexto["biomarkers"] = [
        {
            **plantilla,
            "dataRef": f"r{i}",
            "biomarkerName": nombre,
            "value": valor,
            "provenance": procedencia,
        }
        for i, (nombre, valor) in enumerate(
            (("HER2", "3+ (IHQ)"), ("RE", "Positivo (80%)"), ("RP", "Positivo (60%)")), start=2
        )
    ]
    contexto["priorTreatments"] = []
    contexto["missingCriticalData"] = []
    contexto["attributes"] = [
        {
            "dataRef": "r20",
            "key": "estado_menopausico",
            "value": estado_menopausico,
            "monthsAgo": 1,
            "provenance": procedencia,
        }
    ]
    return solicitud


def solicitud_a_m2() -> dict[str, Any]:
    """A-M2: HER2 «3+ (IHQ)», RE y RP positivos, ``TNM_8`` «IIA», ECOG 1, «posmenopáusica», todo ``verificado``."""
    return _paciente("posmenopáusica")


def solicitud_a_m3() -> dict[str, Any]:
    """A-M3: como A-M2 salvo el estado menopáusico, «premenopáusica»."""
    return _paciente("premenopáusica")


def entorno_fx08bc(*opciones: str) -> EntornoDeRecuperacion:
    """El servicio real con los bordes falsos de FX-08b-c; se recuperan solo los chunks que citan las ``opciones``."""
    citados = {chunk for o in opciones for chunk in OPCIONES_LLM_POB[o]}
    chunks = tuple(c for c in CORPUS_FX08BC if c.chunk_id in citados)
    return crear_entorno(
        buscador=BuscadorFalso(chunks=chunks),
        reranker=RerankerFalso(puntajes={Q_HER2: {c.chunk_id: RELEVANCIA for c in chunks}}),
        catalogo=CatalogoFalso(fichas=FICHAS_FX08BC, poblaciones=POBLACIONES_FX08BC),
        catalogo_clinico=CatalogoClinicoFalso(version=APL_1_2_0.name, tipos=TIPOS_DE_TEST),
        generador=GeneradorLlmPob(*opciones),
        criterios=criterios_de(APL_1_2_0),
    )
