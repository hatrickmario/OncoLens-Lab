"""Atajo de `python -m app.evaluation.medicion_alias` (US-236 AC-7): ver ese módulo para los parámetros.

Uso desde apps/rag-orchestrator: `python eval/medicion_us236.py [--config ...] [--salida ...] [--max-preguntas N]`.
"""

import sys
from pathlib import Path


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.evaluation.medicion_alias import main as medir

    return medir(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
