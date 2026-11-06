"""Mensajes fijos del chat (RN-23, RN-19, glosario S6 §3): lenguaje no prescriptivo y avisos sin punto final."""

from pathlib import Path

import pytest

from app.domain.chat.mensajes import MENSAJE_FUERA_DE_ALCANCE, MENSAJE_NO_CLASIFICADA
from app.domain.chat.valores_iniciales import AVISO_ACADEMICO_INICIAL, AVISO_DE_IA_INICIAL
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
        AVISO_DE_IA_INICIAL,
        AVISO_ACADEMICO_INICIAL,
    ],
)
def test_los_textos_fijos_del_chat_no_contienen_terminos_prohibidos_cuando_se_verifican(texto):
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    assert check_prohibited_terms(texto, lista, niveles=("A", "B"), permitir_frases=False) == []


def test_los_avisos_iniciales_no_llevan_punto_final_cuando_se_leen_de_la_configuracion():
    assert not AVISO_DE_IA_INICIAL.endswith(".") and not AVISO_ACADEMICO_INICIAL.endswith(".")
    assert "validación clínica independiente" in AVISO_DE_IA_INICIAL
    assert "Uso académico/investigación" == AVISO_ACADEMICO_INICIAL
