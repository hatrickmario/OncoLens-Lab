"""El contenedor de medición es reproducible y no corre como root (privacidad: sin código sin fijar)."""

from __future__ import annotations

import re

from tests.evaluation.conftest import RAIZ_APP

DOCKERFILE = (RAIZ_APP / "eval" / "configs" / "adr39-medicion.Dockerfile").read_text(encoding="utf-8")


def test_la_imagen_base_se_fija_por_digest() -> None:
    assert re.search(r"^FROM python:\S+@sha256:[0-9a-f]{64}$", DOCKERFILE, re.MULTILINE)


def test_el_contenedor_no_corre_como_root() -> None:
    usuarios = re.findall(r"^USER (\S+)$", DOCKERFILE, re.MULTILINE)

    assert usuarios and usuarios[-1] not in ("root", "0")


def test_las_versiones_del_exportador_con_codigo_remoto_son_exactas() -> None:
    instalacion = next(linea for linea in DOCKERFILE.splitlines() if "/opt/tf4" in linea and linea.startswith("RUN"))

    assert "transformers==4.57.6" in instalacion and re.search(r"tokenizers==\d+\.\d+\.\d+", instalacion)
