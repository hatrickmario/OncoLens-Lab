from app.infrastructure.adaptador import adaptar
from app.infrastructure.adaptador import adaptar as otro


def umbral() -> float:
    return adaptar() + otro()
