"""Medición AC-7 de US-236 (L1D-287): LLM real local sobre el dataset actual y la pregunta del origen x N.

Uso (desde apps/rag-orchestrator, con el venv de requirements*.txt y Ollama en localhost):
    python eval/medicion_us236.py . salida.json [corridas_origen=10] [max_preguntas]
El primer argumento es el directorio apps/rag-orchestrator del árbol a medir: apuntarlo a un worktree de main da la
referencia (el script funciona con ambos prompts). Usa el LlmEvidenceGenerator real y validar_citas; solo corpus público
y datos sintéticos; el LLM es el local (RN-12). Mide tres conjuntos:
  origen       : la pregunta de la demo sobre el inicio de pmc-mama-cdk46-guia (texto limpio).
  origen_ruido : la misma pregunta con un chunk sintético equivalente con LaTeX y ruido en el texto (limitación: el
                 chunk real de la demo no se versiona; esto es una aproximación).
  dataset      : data/eval/adr39-mini (preguntas con evidencia).
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

app_dir = Path(sys.argv[1]).resolve()
salida = Path(sys.argv[2])
corridas_origen = int(sys.argv[3]) if len(sys.argv) > 3 else 10
max_preguntas = int(sys.argv[4]) if len(sys.argv) > 4 else 1000
sys.path.insert(0, str(app_dir))

from app.application.generation import LlmEvidenceGenerator  # noqa: E402
from app.domain.citations import validar_citas  # noqa: E402
from app.domain.relevance import ChunkPuntuado  # noqa: E402
from app.evaluation.dataset_loader import cargar_dataset_configurado  # noqa: E402
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient  # noqa: E402
from app.prompts.rag_query import VERSION_DEL_PROMPT  # noqa: E402
from app.schemas.generated.models import RagQueryInternalRequest  # noqa: E402
from tests.support.recuperacion import solicitud_de  # noqa: E402

MODELO = "gemma4:26b-a4b-it-q4_K_M"
RAIZ = app_dir.parents[1]
PREGUNTA_ORIGEN = "¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?"
ID_DEL_ORIGEN = (
    "pmc-mama-cdk46-guia@a3bb26468a32#0000"  # largo y con hash, como en la demo del 2026-10-23
)

cliente = OpenAICompatibleLlmClient("http://localhost:11434/v1", MODELO, 180000, 2048, 0.0)
generador = LlmEvidenceGenerator(cliente, 2, 12000)


def _con_ruido(texto: str) -> str:
    """Intercala LaTeX y símbolos en el texto (sintético): imita la transcripción ruidosa del chunk de la demo."""
    palabras = texto.split()
    ruido = [r"$\mathrm{CDK4/6i}$", r"\(\geq\)", r"$\textit{n}=5101$", r"\%", r"$^{\dagger}$"]
    for i in range(7, len(palabras), 25):
        palabras.insert(i, ruido[(i // 25) % len(ruido)])
    return " ".join(palabras)


async def medir(pregunta: str, idioma: str, chunks: list[ChunkPuntuado]) -> dict:
    solicitud = RagQueryInternalRequest.model_validate(solicitud_de(pregunta))
    recuperacion = SimpleNamespace(
        chunks_sobre_umbral=tuple(chunks), meta=SimpleNamespace(responseLanguage=idioma)
    )
    inicio = time.perf_counter()
    try:
        evidencia = await generador.generar(solicitud, recuperacion)
    except Exception as error:  # noqa: BLE001
        return {"error": type(error).__name__, "s": round(time.perf_counter() - inicio, 1)}
    ids = {c.chunk_id for c in chunks}
    resultado = validar_citas(evidencia.opciones, ids)
    citas = [c for o in evidencia.opciones for c in o.chunk_ids_citados]
    return {
        "opciones": len(evidencia.opciones),
        "aceptadas": len(resultado.aceptadas),
        "cita_invalida": sum(d.motivo.value == "cita_invalida" for d in resultado.descartadas),
        "sin_citas": sum(d.motivo.value == "sin_citas" for d in resultado.descartadas),
        "citas": len(citas),
        "citas_validas": sum(c in ids for c in citas),
        "s": round(time.perf_counter() - inicio, 1),
    }


async def main() -> None:
    texto = (RAIZ / "data/raw/seed/docs/pmc-mama-cdk46-guia.txt").read_text(encoding="utf-8")[:1800]
    limpio = ChunkPuntuado(ID_DEL_ORIGEN, "pmc-mama-cdk46-guia", texto, 0.9)
    ruidoso = ChunkPuntuado(ID_DEL_ORIGEN, "pmc-mama-cdk46-guia", _con_ruido(texto), 0.9)
    reporte = {
        "prompt": VERSION_DEL_PROMPT,
        "modelo": MODELO,
        "origen": [],
        "origen_ruido": [],
        "dataset": [],
    }
    for clave, chunk in (("origen", limpio), ("origen_ruido", ruidoso)):
        for _ in range(corridas_origen):
            reporte[clave].append(await medir(PREGUNTA_ORIGEN, "es", [chunk]))
            salida.write_text(json.dumps(reporte, ensure_ascii=False, indent=1))
    dataset = cargar_dataset_configurado(RAIZ / "data/eval/adr39-mini")
    preguntas = [p for p in dataset.preguntas if p.modo_acierto != "sin_evidencia" and p.evidencia]
    for p in preguntas[:max_preguntas]:
        chunks = [
            ChunkPuntuado(f"{e.documento}-{n}", e.documento, e.cita, 1.0 - n / 100)
            for n, e in enumerate(p.evidencia, start=1)
        ]
        reporte["dataset"].append({"id": p.id, **await medir(p.texto, p.idioma, chunks)})
        salida.write_text(json.dumps(reporte, ensure_ascii=False, indent=1))


asyncio.run(main())
