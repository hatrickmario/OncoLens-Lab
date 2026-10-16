"""Punto de entrada de uvicorn: `uvicorn app.main:app`."""

from app.bootstrap import crear_app
from app.config.settings import Settings

app = crear_app(Settings())
