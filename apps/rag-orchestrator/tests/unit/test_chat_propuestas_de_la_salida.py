"""Las afirmaciones crudas del LLM (US-261): ``kind`` sin resolver; solo el nodo ``caso`` decide el tipo."""

import json

from app.application.chat.grafo import propuestas_de_la_salida
from app.domain.chat.turno import TipoDeBloque


def _salida(*afirmaciones: dict) -> str:
    return json.dumps({"claims": list(afirmaciones)})


def test_propuestas_de_la_salida_deja_el_tipo_en_none_cuando_el_llm_no_eligio_kind():
    (propuesta,) = propuestas_de_la_salida(
        _salida({"text": "Hay un dato.", "factRefs": ["f1"], "citations": []}), "req_t"
    )

    assert propuesta.tipo is None


def test_propuestas_de_la_salida_devuelve_el_kind_crudo_cuando_el_llm_lo_eligio():
    documentado, interpretacion = propuestas_de_la_salida(
        _salida(
            {"kind": "documentado", "text": "", "factRefs": ["f1"], "citations": []},
            {"kind": "interpretacion", "text": "Une dos.", "factRefs": ["f1"], "citations": []},
        ),
        "req_t",
    )

    assert (documentado.tipo, interpretacion.tipo) == (
        TipoDeBloque.documentado,
        TipoDeBloque.interpretacion,
    )
