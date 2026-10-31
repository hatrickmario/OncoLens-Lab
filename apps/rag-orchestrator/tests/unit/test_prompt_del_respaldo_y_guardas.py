"""Guardas del respaldo de población (US-244, Gate 2): lenguaje del prompt real (RN-23), vocabulario retirado y
un valor por criterio. Cada una falla si alguien reintroduce lo que el Gate 2 pidió retirar o acotar."""

import asyncio
from pathlib import Path

from app.application.corpus_metadata.esquema_poblacion import cargar_plantilla, construir_prompt
from app.application.corpus_metadata.poblacion_puertos import Fragmento
from app.bootstrap import crear_proponente_local
from app.config.settings import Settings
from app.domain.applicability_text import ChunkDeFuente, CriterioPendiente, FuenteParaProponer
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from tests.support.aplicabilidad import criterios_de
from tests.support.catalogo_aplicabilidad import APL_1_2_0
from tests.support.respaldo_poblacion import RespaldoLlmFalso

RAIZ = Path(__file__).resolve().parents[4]
LISTA = RAIZ / "packages" / "clinical-catalogs" / "lenguaje" / "terminos-prohibidos.json"
APP = RAIZ / "apps" / "rag-orchestrator" / "app"
PUERTO_RETIRADO = "ApplicabilityTextProposer"


def _menopausia() -> CriterioDeAplicabilidad:
    return next(
        c for c in criterios_de(APL_1_2_0).criterios("mama") if c.clave == "estado_menopausico"
    )


def test_el_prompt_real_del_respaldo_no_contiene_terminos_de_nivel_a_ni_b():
    ajustes = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))
    prompt = construir_prompt(
        cargar_plantilla(ajustes.population_prompt_version),
        _menopausia(),
        (Fragmento("ch-b9-1", "Eligible patients were postmenopausal women."),),
        1,
    )

    assert check_prohibited_terms(prompt, lista, niveles=("A", "B"), permitir_frases=False) == []


def test_ningun_modulo_de_app_nombra_el_puerto_retirado_del_proponente_de_una_llamada():
    reincidentes = [
        ruta.relative_to(APP).as_posix()
        for ruta in APP.rglob("*.py")
        if PUERTO_RETIRADO in ruta.read_text(encoding="utf-8")
    ]

    assert reincidentes == []


def test_el_respaldo_pide_un_solo_valor_por_criterio_cuando_se_compone_para_produccion():
    ajustes = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    llm = RespaldoLlmFalso("RESP-SILENCIO")
    tarea = crear_proponente_local(ajustes, llm=llm)
    fuente = FuenteParaProponer(
        "CDR-TEST-B9",
        (CriterioPendiente("estado_menopausico", "Estado menopáusico", None),),
        (ChunkDeFuente("ch-b9-1", "texto"),),
    )

    asyncio.run(tarea.proponer(fuente))

    assert llm.esquemas[0]["properties"]["values"]["maxItems"] == 1
    assert "máximo 1 valores" in llm.llamadas[0].prompt
