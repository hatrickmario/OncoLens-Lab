"""Generador del dataset sintético ``ocr-mini`` (US-224 AC-6, L1D-274).

Produce PDF "escaneados" en español (imagen rasterizada con ruido, inclinación leve y baja resolución) desde plantillas
de informes de mama y próstata, más ``ground_truth.json`` (verdad de terreno por campo crítico) y ``manifest.json``.

Todo es ficticio y evidente (RN-13, RN-14): ningún nombre, documento, fecha ni valor procede de una persona real y las
fechas son relativas al evento índice. Es determinista (semilla fija); requiere Pillow y numpy (``requirements-eval.txt``).

    python data/eval/ocr-mini/generar.py            # reescribe los PDF y los JSON junto a este archivo
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

VERSION_GENERADOR = "1.0.0"
SEMILLA = 224
ANCHO, ALTO = 900, 1273  # ~108 dpi en A4: baja resolución a propósito
TAMANO_FUENTE = 21
MARGEN = 60

# nombre del PDF -> (tipo, cáncer, líneas del informe, campos críticos a extraer con su valor exacto)
DOCUMENTOS: dict[str, tuple[str, str, list[str], dict[str, str]]] = {
    "mama-patologia-01.pdf": (
        "informe_anatomia_patologica",
        "mama",
        [
            "INFORME DE ANATOMÍA PATOLÓGICA (SINTÉTICO)",
            "Paciente: PACIENTE FICTICIO 001   Documento: SIN-DOCUMENTO",
            "Fecha del informe: día -30 respecto al evento índice",
            "Diagnóstico: carcinoma ductal infiltrante grado 2",
            "Estadio: IIA (pT2 pN0 M0)",
            "Receptor de estrógeno: positivo 90 %",
            "Receptor de progesterona: positivo 70 %",
            "HER2 por inmunohistoquímica: negativo (1+)",
            "Ki-67: 18 %",
        ],
        {
            "diagnostico": "carcinoma ductal infiltrante grado 2",
            "estadio": "IIA",
            "receptor_estrogeno": "positivo 90 %",
            "receptor_progesterona": "positivo 70 %",
            "her2": "negativo (1+)",
            "ki67": "18 %",
        },
    ),
    "mama-biomarcadores-02.pdf": (
        "informe_biomarcadores",
        "mama",
        [
            "INFORME DE BIOMARCADORES (SINTÉTICO)",
            "Paciente: PACIENTE FICTICIO 002   Documento: SIN-DOCUMENTO",
            "Fecha del informe: día -12 respecto al evento índice",
            "Diagnóstico: carcinoma lobulillar infiltrante grado 1",
            "HER2 por inmunohistoquímica: positivo (3+)",
            "HER2 por hibridación in situ: amplificado",
            "Receptor de estrógeno: positivo 80 %",
            "Receptor de progesterona: negativo 0 %",
        ],
        {
            "diagnostico": "carcinoma lobulillar infiltrante grado 1",
            "her2": "positivo (3+)",
            "her2_fish": "amplificado",
            "receptor_estrogeno": "positivo 80 %",
            "receptor_progesterona": "negativo 0 %",
        },
    ),
    "prostata-patologia-03.pdf": (
        "informe_anatomia_patologica",
        "prostata",
        [
            "INFORME DE ANATOMÍA PATOLÓGICA (SINTÉTICO)",
            "Paciente: PACIENTE FICTICIO 003   Documento: SIN-DOCUMENTO",
            "Fecha del informe: día -45 respecto al evento índice",
            "Diagnóstico: adenocarcinoma acinar de próstata",
            "Gleason: 3+4=7",
            "Grupo ISUP: 2",
            "Cilindros positivos: 4 de 12",
        ],
        {
            "diagnostico": "adenocarcinoma acinar de próstata",
            "gleason": "3+4=7",
            "grupo_isup": "2",
            "cilindros_positivos": "4 de 12",
        },
    ),
    "prostata-laboratorio-04.pdf": (
        "informe_laboratorio",
        "prostata",
        [
            "INFORME DE LABORATORIO (SINTÉTICO)",
            "Paciente: PACIENTE FICTICIO 004   Documento: SIN-DOCUMENTO",
            "Fecha de la muestra: día -7 respecto al evento índice",
            "Antígeno prostático específico (PSA): 12,4 ng/mL",
            "Testosterona total: 410 ng/dL",
            "Hemoglobina: 13,1 g/dL",
        ],
        {
            "psa": "12,4 ng/mL",
            "testosterona": "410 ng/dL",
            "hemoglobina": "13,1 g/dL",
        },
    ),
    "mama-laboratorio-05.pdf": (
        "informe_laboratorio",
        "mama",
        [
            "INFORME DE LABORATORIO (SINTÉTICO)",
            "Paciente: PACIENTE FICTICIO 005   Documento: SIN-DOCUMENTO",
            "Fecha de la muestra: día -3 respecto al evento índice",
            "Hemoglobina: 12,8 g/dL",
            "Creatinina: 0,9 mg/dL",
            "Fosfatasa alcalina: 85 U/L",
        ],
        {
            "hemoglobina": "12,8 g/dL",
            "creatinina": "0,9 mg/dL",
            "fosfatasa_alcalina": "85 U/L",
        },
    ),
    "prostata-nota-06.pdf": (
        "nota_oncologia",
        "prostata",
        [
            "NOTA DE ONCOLOGÍA (SINTÉTICA)",
            "Paciente: PACIENTE FICTICIO 006   Documento: SIN-DOCUMENTO",
            "Fecha de la consulta: día 0 (evento índice)",
            "Estadio clínico: cT2c N0 M0",
            "ECOG: 1",
            "Tratamiento previo: ninguno",
        ],
        {
            "estadio": "cT2c N0 M0",
            "ecog": "1",
            "tratamiento_previo": "ninguno",
        },
    ),
}


CANDIDATAS_DE_FUENTE = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux (contenedor de medición)
    "/System/Library/Fonts/Supplemental/Arial.ttf",  # macOS
)


def _ruta_de_fuente() -> Path:
    """Tipografía con tildes y eñes: la de Pillow por defecto las dibuja como recuadro y falsearía el OCR."""
    ruta = os.environ.get("OCR_MINI_FONT")
    candidatas = [ruta] if ruta else list(CANDIDATAS_DE_FUENTE)
    for c in candidatas:
        if c and Path(c).is_file():
            return Path(c)
    raise SystemExit(
        "falta una tipografía con tildes: define OCR_MINI_FONT con un .ttf (p. ej. DejaVuSans)"
    )


def _fuente() -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_ruta_de_fuente()), TAMANO_FUENTE)


def _pagina(lineas: list[str], rng: np.random.Generator) -> Image.Image:
    """Rasteriza el texto, lo inclina levemente y le añade ruido gaussiano (aspecto de escáner)."""
    pagina = Image.new("L", (ANCHO, ALTO), 255)
    dibujo = ImageDraw.Draw(pagina)
    fuente = _fuente()
    y = MARGEN
    for linea in lineas:
        dibujo.text((MARGEN, y), linea, fill=20, font=fuente)
        y += int(TAMANO_FUENTE * 2.2)
    angulo = float(rng.uniform(-1.0, 1.0))
    pagina = pagina.rotate(angulo, resample=Image.Resampling.BICUBIC, fillcolor=255)
    ruido = rng.normal(0.0, 6.0, size=(ALTO, ANCHO))
    return Image.fromarray(
        np.clip(np.asarray(pagina, dtype=float) + ruido, 0, 255).astype("uint8")
    )


def _normalizar(texto: str) -> str:
    return "".join(texto.split()).lower()


def generar(destino: Path) -> None:
    rng = np.random.default_rng(SEMILLA)
    verdad: dict[str, dict[str, object]] = {}
    archivos: list[dict[str, object]] = []
    for nombre, (tipo, cancer, lineas, campos) in sorted(DOCUMENTOS.items()):
        texto_pagina = "\n".join(lineas)
        for campo, valor in campos.items():
            if _normalizar(valor) not in _normalizar(texto_pagina):
                raise ValueError(
                    f"{nombre}: el valor de {campo} no aparece en el texto"
                )
        ruta = destino / nombre
        _pagina(lineas, rng).save(ruta, "PDF", resolution=108.0, quality=60)
        verdad[nombre] = {
            "tipo": tipo,
            "cancer": cancer,
            "campos": campos,
            "texto": texto_pagina,
        }
        archivos.append(
            {
                "archivo": nombre,
                "tipo": tipo,
                "cancer": cancer,
                "campos_criticos": len(campos),
                "sha256": hashlib.sha256(ruta.read_bytes()).hexdigest(),
            }
        )
    (destino / "ground_truth.json").write_text(
        json.dumps(
            {"version": VERSION_GENERADOR, "documentos": verdad},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (destino / "manifest.json").write_text(
        json.dumps(
            {
                "clase": "sintetico",
                "nombre": "ocr-mini",
                "version": VERSION_GENERADOR,
                "generador": "generar.py",
                "semilla": SEMILLA,
                "licencia": "CC0 1.0 (contenido ficticio generado; sin datos de personas)",
                "descripcion": "PDF escaneados en español de mama y próstata con valores ficticios; verdad de terreno por campo crítico en ground_truth.json (US-224 AC-6)",
                "resolucion_dpi": 108,
                "tipografia": _ruta_de_fuente().name,
                "archivos": archivos,
                "fuentes_excluidas": ["NCCN", "ESMO"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    generar(Path(__file__).resolve().parent)
    print(f"ocr-mini generado ({len(DOCUMENTOS)} PDF)", file=sys.stderr)
