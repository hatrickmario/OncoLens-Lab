"""FX-08b-a: documentos ``doc-a1``…``doc-a6``, paciente A-M1 y LLM falsos de la aplicabilidad por criterio (L1D-127).

Solo datos sintéticos (títulos «(test)», ningún paciente real). ``population_criteria`` y ``metadata_source`` están en la
forma real de L1D-117 (``biomarcadores`` como objeto); las excepciones (``doc-a3`` con la forma de la semilla, ``doc-a5``
con ``alcance = subgrupo``, ``doc-a6`` ``pendiente``) siguen lo que declaran el proposal y el delta. Los criterios y las
reglas son los del catálogo de test ``test-apl-*`` de L1D-126; nada de esto siembra ``grado``, ``estado_menopausico``
ni ``estado_castracion`` como si la ingesta los produjera.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path
from typing import Any

from app.application.ports import (
    EvidenceGenerator,
    EvidenciaGenerada,
    NliClassifier,
    PoblacionTask,
    ResultadoDeRecuperacion,
)
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import FichaDeFuente
from app.domain.criterios_aplicabilidad import CriteriosDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.opcion_generada import opcion_atomica
from tests.support.poblacion_lista import MARCA_PENDIENTE, poblacion_guardada
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

NO_DISPONIBLE = "no_disponible"
TIPOS_DE_TEST = ("mama", "prostata")


def criterios_de(catalogo: Path) -> CriteriosDeAplicabilidad:
    """Los criterios como los monta el arranque desde un directorio de catálogo (misma función de L1D-126)."""
    return cargar_criterios_de_aplicabilidad(catalogo, TIPOS_DE_TEST)


def escribir_aplicabilidad(catalogo: Path, tipo: str, items: list[dict[str, Any]]) -> None:
    """Escribe ``<catalogo>/<tipo>/aplicabilidad.json`` de un catálogo de test propio (versión ``test-apl-1.0.0``)."""
    carpeta = catalogo / tipo
    carpeta.mkdir(parents=True, exist_ok=True)
    contenido = {"version": "test-apl-1.0.0", "items": items}
    (carpeta / "aplicabilidad.json").write_text(json.dumps(contenido), encoding="utf-8")


def catalogo_de_test_sin_criterios(raiz: Path) -> Path:
    """Catálogo de test (``test-apl-1.0.0``) cuyos tipos declaran ``items: []``: ni un criterio de aplicabilidad."""
    catalogo = raiz / "test-apl-1.0.0"
    for tipo in TIPOS_DE_TEST:
        escribir_aplicabilidad(catalogo, tipo, [])
    return catalogo


def criterios_de_test_apl_1_0_0() -> CriteriosDeAplicabilidad:
    return criterios_de(APL_1_0_0)


def _poblacion_de_la_semilla() -> dict[str, object]:
    """Forma de ``corpus_seed/poblacion.py``: seis claves, cada una cadena con texto o ``no_disponible``."""
    return {
        clave: NO_DISPONIBLE
        for clave in ("subtipo", "estadio", "linea", "biomarcadores", "edad", "ecog")
    }


CRITERIOS_DE_DOC_A2: dict[str, object] = {
    **_poblacion_de_la_semilla(),
    "biomarcadores": {"her2": MARCA_PENDIENTE},
    "estadio": MARCA_PENDIENTE,
    "ecog": MARCA_PENDIENTE,
    "linea": MARCA_PENDIENTE,
}
"""``population_criteria`` de ``doc-a2``: la extracción de la ingesta falló en todos los criterios del catálogo y dejó la marca
``pendiente`` por criterio (ADR-47); el respaldo de la consulta (US-244) es lo único que los lee."""

CRITERIOS_DE_DOC_A1: dict[str, object] = {
    **_poblacion_de_la_semilla(),
    "biomarcadores": {"her2": "positivo"},
    "estadio": "I–III",
    "ecog": "0-1",
}
"""``population_criteria`` de ``doc-a1`` en la forma antigua (un valor por criterio): FX-08b-c la conserva para el lector doble."""

POBLACIONES_FX08BA: dict[str, PoblacionDelEstudio] = {
    # doc-a2: guía sin población extraída (US-123): la ingesta no pudo estructurarla y deja la marca por criterio.
    "doc-a2": poblacion_guardada("pendiente", CRITERIOS_DE_DOC_A2),
    "doc-a1": poblacion_guardada("fuente_estructurada", CRITERIOS_DE_DOC_A1),
    "doc-a3": poblacion_guardada("fuente_estructurada", _poblacion_de_la_semilla()),
    "doc-a4": poblacion_guardada(
        "fuente_estructurada",
        {**_poblacion_de_la_semilla(), "biomarcadores": {"her2": "negativo"}},
    ),
    "doc-a5": poblacion_guardada(
        "fuente_estructurada",
        {**_poblacion_de_la_semilla(), "ecog": {"valor": "0-1", "alcance": "subgrupo"}},
    ),
    "doc-a6": poblacion_guardada("pendiente", _poblacion_de_la_semilla()),
}

DOCUMENTOS_FX08BA = ("doc-a1", "doc-a2", "doc-a3", "doc-a4", "doc-a5", "doc-a6")


def _chunk_id(documento: str) -> str:
    return f"ch-{documento.removeprefix('doc-')}-1"


TEXTO_DE_CH_A2_1 = "This guidance applies to patients with HER2-negative disease."


def _texto_del_chunk(documento: str) -> str:
    if documento == "doc-a2":
        return TEXTO_DE_CH_A2_1
    return (
        f"Synthetic adjuvant study {documento} describing anti-HER2 therapy after surgery (test)."
    )


CORPUS_FX08BA: tuple[ChunkFx, ...] = tuple(
    ChunkFx(
        _chunk_id(documento),
        documento,
        _texto_del_chunk(documento),
        _vector(e0=0.9, e3=0.1),
        True,
        "mama",
    )
    for documento in DOCUMENTOS_FX08BA
)


# Metadatos factuales completos solo en ``doc-a1`` (US-127 AC-1/AC-2); el resto no registra fase, endpoint ni tamaño (AC-3).
_ENDPOINT_DOC_A1 = "Supervivencia libre de enfermedad invasiva"
_MUESTRA_DOC_A1 = 4800


def _ficha(documento: str) -> FichaDeFuente:
    return FichaDeFuente(
        title=f"Estudio sintético {documento} (test)",
        source_name="NCI PDQ",
        external_id=f"CDR-TEST-{documento.removeprefix('doc-').upper()}",
        language="en",
        source_type="guideline",
        license_class="dominio_publico",
        study_design="eca" if documento == "doc-a1" else "guia",
        trial_phase="III" if documento == "doc-a1" else None,
        primary_endpoint=_ENDPOINT_DOC_A1 if documento == "doc-a1" else None,
        sample_size=_MUESTRA_DOC_A1 if documento == "doc-a1" else None,
        published_at=date(2025, 3, 1),
        last_updated_at=date(2026, 5, 1),
        guideline_version="2026-05",
        authors=None,
        source_url=None,
    )


FICHAS_FX08BA: dict[str, FichaDeFuente] = {d: _ficha(d) for d in DOCUMENTOS_FX08BA}


def external_id_de(documento: str) -> str:
    return FICHAS_FX08BA[documento].external_id


def relevancias_de(documentos: dict[str, float]) -> dict[str, dict[str, float]]:
    """Puntajes del reranker falso para ``Q_HER2``: solo los documentos dados superan el umbral de 0.30."""
    return {Q_HER2: {_chunk_id(d): relevancia for d, relevancia in documentos.items()}}


def catalogo_falso_fx08ba(**errores: Exception) -> CatalogoFalso:
    return CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=POBLACIONES_FX08BA, **errores)


def catalogo_clinico_falso(version: str) -> CatalogoClinicoFalso:
    return CatalogoClinicoFalso(version=version, tipos=TIPOS_DE_TEST)


def solicitud_a_m1(version_del_catalogo: str = "test-apl-1.0.0") -> dict[str, Any]:
    """A-M1: HER2 «3+ (IHQ)», ``TNM_8`` «IIA», ECOG 1 con ``performanceScale = ECOG``, una línea previa y sin
    ``estado_menopausico``. Parte del ejemplo del contrato para que el cuerpo sea siempre válido."""
    solicitud = copy.deepcopy(solicitud_de(Q_HER2))
    solicitud["catalogVersion"] = version_del_catalogo
    solicitud["clinicalContext"]["priorTreatments"] = [
        {
            "dataRef": "r5",
            "lineNumber": 1,
            "setting": "adyuvante",
            "regimenName": "Esquema previo de prueba",
            "atcCodes": ["L01XC03"],
            "monthsSinceStart": 6,
            "monthsSinceEnd": 3,
            "endReason": "completado",
            "provenance": {
                "entryMethod": "seed",
                "extractionConfidence": "n_a",
                "reviewStatus": "verificado",
                "conflict": False,
            },
        }
    ]
    return solicitud


def _procedencia(revision: str, *, conflicto: bool = False) -> dict[str, Any]:
    return {
        "entryMethod": "ocr",
        "extractionConfidence": "media",
        "reviewStatus": revision,
        "conflict": conflicto,
    }


def a_m1_con_diagnostico_sin_verificar() -> dict[str, Any]:
    """A-M1 con su diagnóstico (estadio y ECOG) en ``requiere_revision``, como declara FX-08b-a para el ECOG."""
    solicitud = solicitud_a_m1()
    solicitud["clinicalContext"]["diagnosis"]["provenance"] = _procedencia("requiere_revision")
    return solicitud


def a_m1_conflicto() -> dict[str, Any]:
    """``A-M1-CONFLICTO`` (design D6): dos HER2, ``3+ (IHQ)`` y ``2+``, ambos ``requiere_revision`` con
    ``conflict = true`` (el seed los cruza por ``conflicts_with_id``; en la frontera solo viaja el booleano)."""
    solicitud = solicitud_a_m1()
    plantilla = solicitud["clinicalContext"]["biomarkers"][0]
    solicitud["clinicalContext"]["biomarkers"] = [
        {
            **plantilla,
            "dataRef": referencia,
            "value": valor,
            "monthsAgo": meses,
            "provenance": _procedencia("requiere_revision", conflicto=True),
        }
        for referencia, valor, meses in (("r2", "3+ (IHQ)", 1), ("r8", "2+", 2))
    ]
    return solicitud


class GeneradorDeAplicabilidad:
    """``EvidenceGenerator`` falso de FX-08b-a: una opción válida que cita el chunk de ``doc-a1`` y cuenta invocaciones.

    ``APL-VALOR-PACIENTE`` (design US-122 AC-2): su salida de generación atribuye «2+» al paciente; la aplicabilidad no
    debe leerla jamás (ADR-34 b)."""

    ESCENARIOS = {
        "APL-OK": "La evidencia recuperada describe la adición de terapia anti-HER2 a la quimioterapia adyuvante.",
        "APL-VALOR-PACIENTE": "En el paciente el estado de HER2 es 2+ y la evidencia describe terapia anti-HER2 adyuvante.",
    }

    def __init__(self, escenario: str = "APL-OK", documento: str = "doc-a1") -> None:
        self._opcion = opcion_atomica(
            "Quimioterapia adyuvante combinada con terapia dirigida anti-HER2",
            self.ESCENARIOS[escenario],
            (_chunk_id(documento),),
        )
        self.recuperaciones: list[ResultadoDeRecuperacion] = []

    @property
    def invocaciones(self) -> int:
        return len(self.recuperaciones)

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        self.recuperaciones.append(recuperacion)
        return EvidenciaGenerada(opciones=(self._opcion,))


def entorno_de_aplicabilidad(
    documentos: dict[str, float],
    *,
    catalogo: Path = APL_1_0_0,
    generador: EvidenceGenerator | None = None,
    catalogo_falso: CatalogoFalso | None = None,
    proponente: PoblacionTask | None = None,
    clasificador_nli: NliClassifier | None = None,
) -> EntornoDeRecuperacion:
    """El servicio real con los bordes falsos de FX-08b-a: solo los ``documentos`` dados superan el umbral.

    ``catalogo`` es el directorio del catálogo de test montado; su versión es la que declara el catálogo clínico falso."""
    version = catalogo.name
    return crear_entorno(
        buscador=BuscadorFalso(chunks=CORPUS_FX08BA),
        reranker=RerankerFalso(puntajes=relevancias_de(documentos)),
        catalogo=catalogo_falso or catalogo_falso_fx08ba(),
        catalogo_clinico=catalogo_clinico_falso(version),
        generador=generador or GeneradorDeAplicabilidad(),
        criterios=criterios_de(catalogo),
        proponente=proponente,
        clasificador_nli=clasificador_nli,
    )


# --- FX-08b-b: dos opciones válidas para el recorte a una (L1D-130) ----------------------------------------------

POBLACIONES_FX08BB: dict[str, PoblacionDelEstudio] = {
    **POBLACIONES_FX08BA,
    # doc-a6: «ECA estructurado con la misma población que doc-a1»; en FX-08b-a sigue ``pendiente`` y no se toca.
    "doc-a6": POBLACIONES_FX08BA["doc-a1"],
}
RELEVANCIAS_FX08BB = {"doc-a4": 0.92, "doc-a1": 0.70, "doc-a6": 0.60}
"""Puntajes del reranker falso de FX-08b-b: ``ch-a4-1`` 0,92 · ``ch-a1-1`` 0,70 · ``ch-a6-1`` 0,60."""
RAZON_B_SIN_SOPORTE = (
    "La fuente más parecida al paciente afirma una reducción de la mortalidad a la mitad."
)
OPCION_O_A = "Quimioterapia adyuvante sin terapia dirigida"
OPCION_O_B = "Quimioterapia adyuvante combinada con terapia dirigida anti-HER2"
OPCION_O_B_SIN_SOPORTE = (
    "Quimioterapia adyuvante con terapia dirigida anti-HER2 y reducción de dosis"
)
OPCION_O_D = "Terapia dirigida anti-HER2 posterior a la cirugía"
RAZON_FX08BB = "La evidencia recuperada describe el esquema adyuvante en la población estudiada."

ESCENARIOS_FX08BB: dict[str, tuple[tuple[str, str, str], ...]] = {
    "LLM-DOS-APL": (
        (OPCION_O_A, RAZON_FX08BB, "doc-a4"),
        (OPCION_O_B, RAZON_FX08BB, "doc-a1"),
    ),
    "LLM-EMPATE-APL": (
        (OPCION_O_B, RAZON_FX08BB, "doc-a1"),
        (OPCION_O_D, RAZON_FX08BB, "doc-a6"),
    ),
    "LLM-SIN-SOPORTE-APL": (
        (OPCION_O_B_SIN_SOPORTE, RAZON_B_SIN_SOPORTE, "doc-a1"),
        (OPCION_O_A, RAZON_FX08BB, "doc-a4"),
    ),
}


class GeneradorDeDosOpciones:
    """``EvidenceGenerator`` falso de FX-08b-b: dos opciones válidas, en el orden de salida del escenario."""

    def __init__(self, escenario: str) -> None:
        self._opciones = tuple(
            opcion_atomica(opcion, razon, (_chunk_id(doc),))
            for opcion, razon, doc in ESCENARIOS_FX08BB[escenario]
        )
        self.recuperaciones: list[ResultadoDeRecuperacion] = []

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        self.recuperaciones.append(recuperacion)
        return EvidenciaGenerada(opciones=self._opciones)


def solicitud_a_m1_con_max_opciones(max_options: int) -> dict[str, Any]:
    solicitud = solicitud_a_m1()
    solicitud["maxOptions"] = max_options
    return solicitud


def entorno_de_dos_opciones(
    escenario: str, *, clasificador_nli: NliClassifier | None = None
) -> EntornoDeRecuperacion:
    """El servicio real con los bordes falsos de FX-08b-b (umbral 0,30; los tres documentos superan el umbral)."""
    return entorno_de_aplicabilidad(
        RELEVANCIAS_FX08BB,
        generador=GeneradorDeDosOpciones(escenario),
        catalogo_falso=CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=POBLACIONES_FX08BB),
        clasificador_nli=clasificador_nli,
    )
