"""Mensajes fijos del chat (RN-23, RN-19, glosario S6 §3): lenguaje no prescriptivo y avisos sin punto final."""

from pathlib import Path

import pytest

from app.domain.chat.mensajes import (
    ANCLA_DEL_PERIODO,
    AVISO_EN_CURSO_SIN_VERIFICAR,
    CAUSA_FALTA_EN_PACIENTE,
    ENCABEZADO_DE_OPCIONES,
    MENSAJE_FUERA_DE_ALCANCE,
    MENSAJE_NO_CLASIFICADA,
    MENSAJE_SEGUIMIENTO_SIN_AFIRMACIONES,
    MENSAJE_SIN_OPCIONES_CON_SOPORTE,
    ORDEN_POR_APLICABILIDAD,
    TITULO_DE_APLICABILIDAD,
    TITULO_DE_FALTANTES,
)
from app.domain.chat.periodo_de_la_pregunta import (
    MARCA_EN_CURSO,
    MARCA_INICIADO_ANTES_DEL_PERIODO,
)
from app.prompts.chat_seguimiento_evidencia import PLANTILLA_SEGUIMIENTO_DEL_CHAT
from app.domain.chat.valores_iniciales import (
    AVISO_ACADEMICO_INICIAL,
    AVISO_DE_IA_INICIAL,
    CHAT_AVISO_BUSQUEDA_AMPLIADA_INICIAL,
)
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)


@pytest.mark.parametrize(
    "texto",
    [
        MENSAJE_FUERA_DE_ALCANCE,
        MENSAJE_NO_CLASIFICADA,
        ENCABEZADO_DE_OPCIONES,
        ORDEN_POR_APLICABILIDAD,
        TITULO_DE_APLICABILIDAD,
        TITULO_DE_FALTANTES,
        CAUSA_FALTA_EN_PACIENTE,
        MENSAJE_SIN_OPCIONES_CON_SOPORTE,
        MENSAJE_SEGUIMIENTO_SIN_AFIRMACIONES,
        PLANTILLA_SEGUIMIENTO_DEL_CHAT,
        AVISO_DE_IA_INICIAL,
        AVISO_ACADEMICO_INICIAL,
        CHAT_AVISO_BUSQUEDA_AMPLIADA_INICIAL,
        ANCLA_DEL_PERIODO,
        AVISO_EN_CURSO_SIN_VERIFICAR,
        MARCA_EN_CURSO,
        MARCA_INICIADO_ANTES_DEL_PERIODO,
    ],
)
def test_los_textos_fijos_del_chat_no_contienen_terminos_prohibidos_cuando_se_verifican(texto):
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    assert check_prohibited_terms(texto, lista, niveles=("A", "B"), permitir_frases=False) == []


def test_los_avisos_iniciales_no_llevan_punto_final_cuando_se_leen_de_la_configuracion():
    assert not AVISO_DE_IA_INICIAL.endswith(".") and not AVISO_ACADEMICO_INICIAL.endswith(".")
    assert "validación clínica independiente" in AVISO_DE_IA_INICIAL
    assert "Uso académico/investigación" == AVISO_ACADEMICO_INICIAL
