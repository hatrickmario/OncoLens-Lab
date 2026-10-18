"""Medición de los motores OCR de ADR-39 fase B (AC-6) y su directorio de trabajo por request (RN-14).

Los PDF de ``data/eval/ocr-mini/`` se procesan como el endpoint ``/documents/extract``: en memoria, con un
``TemporaryDirectory`` por request bajo ``TMPDIR`` que se borra siempre (éxito, fallo del motor o plazo agotado). Tras
cada PDF se comprueba que ``TMPDIR`` quedó vacío y que no aparecieron archivos nuevos fuera de él; si hay residuos la
corrida falla nombrando motor y ruta, nunca el contenido. Los motores reales se importan al usarse: sin el paquete, el
motor figura como no disponible (nunca se inventa una cifra). Mide un motor por proceso para que la memoria pico
(``ru_maxrss``) sea la de ese motor.
"""

from __future__ import annotations

import json
import os
import resource
import subprocess
import sys
import tempfile
import unicodedata
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.scripts.adr39.reglas import mediana, percentil_95

Reloj = Callable[[], float]


class MotorNoDisponible(RuntimeError):
    """El paquete o el binario del motor no está instalado en este entorno."""


class ResiduosDeOcr(RuntimeError):
    """Quedaron archivos después de extraer un PDF. El mensaje nombra motor y ruta, nunca contenido."""

    def __init__(self, motor: str, rutas: Sequence[Path]) -> None:
        self.motor = motor
        self.rutas = tuple(rutas)
        super().__init__(f"el motor {motor} dejó residuos: {', '.join(str(r) for r in rutas)}")


class Motor(Protocol):
    id: str

    def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
        """Texto del PDF. Todo archivo temporal va bajo ``directorio_de_trabajo``; respeta ``plazo_s``."""


class MotorOcrmypdfTesseract:
    """OCRmyPDF + Tesseract: sidecar de texto sin PDF de salida; ``TMPDIR`` del subproceso es el directorio de trabajo."""

    id = "ocrmypdf-tesseract"

    def __init__(self, idiomas: str) -> None:
        self._idiomas = idiomas

    def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
        entrada = directorio_de_trabajo / "entrada.pdf"
        sidecar = directorio_de_trabajo / "texto.txt"
        entrada.write_bytes(pdf)
        orden = [
            "ocrmypdf", "--language", self._idiomas, "--force-ocr", "--output-type", "none",
            "--sidecar", str(sidecar), str(entrada), "-",
        ]  # fmt: skip
        entorno = {**os.environ, "TMPDIR": str(directorio_de_trabajo)}
        try:
            subprocess.run(orden, env=entorno, check=True, timeout=plazo_s, capture_output=True)
        except FileNotFoundError:
            raise MotorNoDisponible(
                "ocrmypdf no está en el PATH (instalar ocrmypdf y tesseract-ocr-spa)"
            ) from None
        # subprocess.run mata al hijo si vence el plazo; el directorio se borra después, en el `finally` del llamador
        return sidecar.read_text(encoding="utf-8")


class MotorPaddleOcr:
    """PaddleOCR (PP-OCRv5 latino) en el proceso; las páginas se rasterizan con pypdfium2 bajo el directorio de trabajo."""

    id = "paddleocr"

    def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
        try:
            import pypdfium2  # type: ignore[import-not-found]
            from paddleocr import PaddleOCR  # type: ignore[import-not-found]
        except ImportError as error:
            raise MotorNoDisponible(
                f"falta {error.name} (pip install paddleocr pypdfium2)"
            ) from None
        os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(directorio_de_trabajo / "cache"))
        ocr = PaddleOCR(lang="latin", ocr_version="PP-OCRv5")
        lineas: list[str] = []
        for n, pagina in enumerate(pypdfium2.PdfDocument(pdf)):
            ruta = directorio_de_trabajo / f"pagina-{n}.png"
            pagina.render(scale=2).to_pil().save(ruta)
            for resultado in ocr.predict(str(ruta)):
                lineas.extend(resultado["rec_texts"])
        return "\n".join(lineas)


class MotorDoctr:
    """docTR en el proceso; ``DocumentFile.from_pdf`` rasteriza en memoria."""

    id = "doctr"

    def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
        try:
            from doctr.io import DocumentFile  # type: ignore[import-not-found]
            from doctr.models import ocr_predictor  # type: ignore[import-not-found]
        except ImportError as error:
            raise MotorNoDisponible(f"falta {error.name} (pip install python-doctr)") from None
        os.environ.setdefault("DOCTR_CACHE_DIR", str(directorio_de_trabajo / "cache"))
        resultado = ocr_predictor(pretrained=True)(DocumentFile.from_pdf(pdf))
        return str(resultado.render())


def motor_por_id(id_motor: str, idiomas: str) -> Motor:
    if id_motor == "ocrmypdf-tesseract":
        return MotorOcrmypdfTesseract(idiomas)
    if id_motor == "paddleocr":
        return MotorPaddleOcr()
    if id_motor == "doctr":
        return MotorDoctr()
    raise KeyError(id_motor)


def extraer_en_directorio_temporal(
    motor: Motor, pdf: bytes, plazo_s: float, tmp_raiz: Path
) -> tuple[str, int]:
    """Texto y número de archivos que el motor dejó en su directorio de trabajo antes de borrarlo.

    El directorio es **por request** y se borra siempre al salir del ``with`` (también si el motor falla o vence el
    plazo). Nunca se comparte entre requests.
    """
    with tempfile.TemporaryDirectory(dir=tmp_raiz) as directorio:
        texto = motor.extraer(pdf, Path(directorio), plazo_s)
        escritos = sum(1 for p in Path(directorio).rglob("*") if p.is_file())
    return texto, escritos


def listar_archivos(raices: Iterable[Path]) -> set[Path]:
    encontrados: set[Path] = set()
    for raiz in raices:
        if raiz.is_dir():
            encontrados.update(p for p in raiz.rglob("*") if p.is_file())
    return encontrados


def verificar_sin_residuos(
    motor: str, tmp_raiz: Path, vigiladas: Sequence[Path], antes: set[Path]
) -> None:
    """``TMPDIR`` vacío y sin archivos nuevos en las rutas vigiladas; si no, ``ResiduosDeOcr`` con las rutas."""
    residuos = sorted(listar_archivos([tmp_raiz]) | (listar_archivos(vigiladas) - antes))
    if residuos:
        raise ResiduosDeOcr(motor, residuos)


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "".join(sin_tildes.split()).lower()


def exactitud_por_campo(texto: str, campos: dict[str, str]) -> tuple[int, int]:
    """(aciertos, total): un campo acierta si su valor normalizado (sin tildes, espacios ni mayúsculas) está en el texto."""
    objetivo = _normalizar(texto)
    return sum(1 for valor in campos.values() if _normalizar(valor) in objetivo), len(campos)


def memoria_pico_mb() -> float:
    """Pico residente del proceso y sus hijos (``ru_maxrss``: bytes en macOS, KiB en Linux)."""
    divisor = 1e6 if sys.platform == "darwin" else 1e3
    return (
        max(
            resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
        )
        / divisor
    )


@dataclass(frozen=True)
class ResultadoOcr:
    motor: str
    disponible: bool
    exactitud: float | None
    p95_ms: float | None
    memoria_pico_mb: float | None
    escribe_a_disco_observado: bool | None
    residuos: tuple[str, ...]
    documentos: int


def medir_motor(
    motor: Motor,
    dataset: Path,
    corridas: int,
    plazo_s: float,
    tmp_raiz: Path,
    vigiladas: Sequence[Path],
    reloj: Reloj,
) -> ResultadoOcr:
    """Exactitud por campo crítico, p95 por documento (mediana de corridas), memoria pico y residuos de un motor."""
    verdad = json.loads((dataset / "ground_truth.json").read_text(encoding="utf-8"))["documentos"]
    aciertos = total = 0
    p95_por_corrida: list[float] = []
    escribio = False
    try:
        for corrida in range(corridas):
            tiempos: list[float] = []
            for nombre, doc in sorted(verdad.items()):
                pdf = (dataset / nombre).read_bytes()
                antes = listar_archivos(vigiladas)
                inicio = reloj()
                texto, escritos = extraer_en_directorio_temporal(motor, pdf, plazo_s, tmp_raiz)
                tiempos.append((reloj() - inicio) * 1000)
                verificar_sin_residuos(motor.id, tmp_raiz, vigiladas, antes)
                escribio = escribio or escritos > 0
                if corrida == 0:
                    a, t = exactitud_por_campo(texto, doc["campos"])
                    aciertos, total = aciertos + a, total + t
            p95_por_corrida.append(percentil_95(tiempos))
    except MotorNoDisponible:
        return ResultadoOcr(motor.id, False, None, None, None, None, (), 0)
    except ResiduosDeOcr as error:
        return ResultadoOcr(
            motor.id,
            True,
            None,
            None,
            memoria_pico_mb(),
            True,
            tuple(str(r) for r in error.rutas),
            len(verdad),
        )
    return ResultadoOcr(
        motor.id,
        True,
        aciertos / total,
        mediana(p95_por_corrida),
        memoria_pico_mb(),
        escribio,
        (),
        len(verdad),
    )


def resultado_a_dict(r: ResultadoOcr) -> dict[str, Any]:
    return {
        "motor": r.motor,
        "disponible": r.disponible,
        "exactitud": r.exactitud,
        "p95_ms": r.p95_ms,
        "memoria_pico_mb": r.memoria_pico_mb,
        "escribe_a_disco_observado": r.escribe_a_disco_observado,
        "residuos": list(r.residuos),
        "documentos": r.documentos,
    }
