"""Un solo dueño del tope de opciones del chat (L1D-322): Backend 2 aplica ``CHAT_EVIDENCE_MAX_OPTIONS`` y Backend 1 declara en
la Base ``ANALYSIS_MAX_OPTIONS``; sus valores por defecto deben coincidir para que la Base diga lo que Backend 2 aplicó."""

import re
from pathlib import Path

from app.config.settings import Settings

SECCIONES = Path(__file__).resolve().parents[3] / "clinical-api" / "src" / "config" / "secciones.ts"


def test_el_tope_de_opciones_del_chat_de_backend_2_es_el_de_la_base_del_analisis_de_backend_1():
    texto = SECCIONES.read_text(encoding="utf-8")
    coincidencia = re.search(r"const DEFAULT_ANALYSIS_MAX_OPTIONS = (\d+);", texto)

    assert coincidencia is not None
    assert Settings().chat_evidence_max_options == int(coincidencia.group(1))
