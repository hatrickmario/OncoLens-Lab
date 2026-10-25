"""Evaluación del paso de metadatos del corpus (US-118, OL-06, ``run-ai-eval``): precisión y cobertura con adapters falsos.

Usa la FÁBRICA DE PRODUCCIÓN (``ingest.servicio_de_metadatos``) con el LLM y el NLI falsos de la CI: la composición y el
umbral son los reales; solo los modelos son dobles. Dataset 100 % sintético. Métricas (las de M-08.3 y M-08.4 con
modelos reales son de US-132 y US-233):

* ``inventados_conservados`` = valores sin respaldo en el texto que llegaron al catálogo. Meta = 0 (RN-25).
* ``cobertura_de_respaldados`` = valores respaldados que se conservaron / valores respaldados. Meta = 1,0 con el NLI falso.

La variante ``sin_verificacion`` reproduce lo que haría un paso que confía en el LLM (el comportamiento de ``main``
antes de este change): la métrica DEBE detectarla (``inventados_conservados > 0``); si no la detectara, la evaluación no
protegería nada.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import pytest

from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.domain.corpus_metadata.resultado import CampoDeMetadato
from app.domain.corpus_metadata.verbalizacion import verbalizar_metadato
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.nli import ResultadoNli
from app.scripts.ingest import ModelosDeMetadatos, _modelos_de_metadatos, servicio_de_metadatos
from tests.support.metadatos import FakeMetadataLlm
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

UMBRAL = 0.8


@dataclass(frozen=True)
class CasoSintetico:
    clave: str
    propuesta: dict[str, Any]
    # Campos que el texto sí respalda; el resto de lo propuesto es inventado.
    respaldados: frozenset[str]


CASOS = (
    CasoSintetico(
        "c-1",
        {"trial_phase": "III", "sample_size": 300, "population_criteria": {"ecog": "0-1"}},
        frozenset({"trial_phase", "sample_size", "ecog"}),
    ),
    CasoSintetico(
        "c-2",
        {"study_design": "eca", "primary_endpoint": "reducción total de la mortalidad"},
        frozenset({"study_design"}),
    ),
    CasoSintetico(
        "c-3",
        {"population_criteria": {"estadio": "IV", "biomarcadores": {"her2": "positivo"}}},
        frozenset({"biomarcadores.her2"}),
    ),
    CasoSintetico("c-4", {}, frozenset()),
    CasoSintetico("c-5", {"sample_size": 99999, "trial_phase": "II"}, frozenset({"trial_phase"})),
)


def _documento(clave: str) -> DocumentoDeSemilla:
    return DocumentoDeSemilla(
        document_key=clave,
        version_group_id=clave,
        source_type="literature",
        source_name="PMC Open Access",
        external_id=f"sintetico-{clave}",
        title=f"Artículo sintético {clave}",
        language="en",
        cancer_type_tags=("mama",),
        published_at=date(2024, 1, 1),
        study_design="otro",
        population="adulto",
        original_format="jats_xml",
    )


def _texto(caso: CasoSintetico) -> str:
    return f"Synthetic evaluation article {caso.clave}, fictional text with no patient data at all."


def _campos_de(propuesta: dict[str, Any]) -> list[tuple[str, Any]]:
    campos = [(k, v) for k, v in propuesta.items() if k != "population_criteria"]
    poblacion = propuesta.get("population_criteria", {})
    for clave, valor in poblacion.items():
        if clave == "biomarcadores":
            campos += [(f"biomarcadores.{k}", v) for k, v in valor.items()]
        else:
            campos.append((clave, valor))
    return campos


def _nli_del_caso(casos: tuple[CasoSintetico, ...]) -> NliFalso:
    """``entailment`` para lo respaldado y ``neutral`` para lo inventado (la hipótesis es la verbalización determinista)."""
    neutrales = {
        verbalizar_metadato(campo, valor): NEUTRAL
        for caso in casos
        for campo, valor in _campos_de(caso.propuesta)
        if campo not in caso.respaldados
    }
    return NliFalso(resultados=neutrales, por_defecto=IMPLICA)


def _conservados(servicio: MetadataExtractionService, caso: CasoSintetico) -> set[str]:
    texto = _texto(caso)
    metadatos = servicio.resolver(_documento(caso.clave), texto, [texto])
    return {c.campo for c in metadatos.campos_verificados}


def _medir(servicio: MetadataExtractionService) -> dict[str, float]:
    inventados = respaldados_conservados = respaldados = 0
    for caso in CASOS:
        conservados = _conservados(servicio, caso)
        inventados += len(conservados - caso.respaldados)
        respaldados += len(caso.respaldados)
        respaldados_conservados += len(conservados & caso.respaldados)
    return {
        "inventados_conservados": inventados,
        "cobertura_de_respaldados": respaldados_conservados / respaldados,
    }


def _servicio_de_produccion(nli: NliFalso | None = None) -> MetadataExtractionService:
    propuestas = {_texto(c): c.propuesta for c in CASOS}
    modelos = ModelosDeMetadatos(
        llm=FakeMetadataLlm(propuestas=propuestas),
        nli=nli or _nli_del_caso(CASOS),
        umbral_nli=UMBRAL,
        nombre_del_llm="llm-de-evaluacion",
    )
    return servicio_de_metadatos(modelos)


class _SinVerificacion(MetadataExtractionService):
    """Lo que hace un paso que confía en el LLM: conserva todo lo propuesto. Es el comportamiento que esta evaluación impide."""

    def _verificar(self, propuestos: Any, fragmentos: Any) -> tuple[CampoDeMetadato, ...]:
        return tuple(propuestos)


def test_ningun_valor_inventado_llega_al_catalogo_con_la_fabrica_de_produccion() -> None:
    medida = _medir(_servicio_de_produccion())

    assert medida["inventados_conservados"] == 0


def test_todo_valor_respaldado_por_el_texto_se_conserva_con_la_fabrica_de_produccion() -> None:
    medida = _medir(_servicio_de_produccion())

    assert medida["cobertura_de_respaldados"] == 1.0


def test_la_evaluacion_detecta_un_paso_que_no_verifica_con_el_nli_variante_que_falla_en_main() -> (
    None
):
    propuestas = {_texto(c): c.propuesta for c in CASOS}
    sin_verificacion = _SinVerificacion(
        llm=FakeMetadataLlm(propuestas=propuestas), nli=_nli_del_caso(CASOS), umbral_nli=UMBRAL
    )

    medida = _medir(sin_verificacion)

    assert medida["inventados_conservados"] == 3  # c-2 endpoint, c-3 estadio, c-5 sample_size


def _conservados_con_umbral_del_entorno(
    monkeypatch: pytest.MonkeyPatch, umbral: str, p_entailment: float
) -> int:
    """Umbral por la ruta de producción (``NLI_ENTAILMENT_THRESHOLD`` -> ``_modelos_de_metadatos`` -> servicio) con un NLI
    cuya probabilidad de ``entailment`` queda ENTRE los dos umbrales de los tests."""
    monkeypatch.setenv("NLI_ENTAILMENT_THRESHOLD", umbral)
    caso = CASOS[0]
    modelos = _modelos_de_metadatos(
        FakeMetadataLlm(propuestas={_texto(caso): caso.propuesta}),
        NliFalso(por_defecto=ResultadoNli(label="entailment", p_entailment=p_entailment)),
    )
    return len(_conservados(servicio_de_metadatos(modelos), caso))


def test_el_umbral_de_entorno_descarta_un_campo_con_p_de_entailment_bajo_el_umbral(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert _conservados_con_umbral_del_entorno(monkeypatch, "0.8", 0.75) == 0


def test_el_umbral_de_entorno_conserva_un_campo_con_p_de_entailment_sobre_el_umbral(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert _conservados_con_umbral_del_entorno(monkeypatch, "0.7", 0.75) == len(
        CASOS[0].respaldados
    )


def test_la_variante_sin_verificacion_sobrescribe_un_metodo_que_existe_en_el_servicio() -> None:
    assert hasattr(MetadataExtractionService, "_verificar")
