"""Lee el JSON de un hook de Claude Code por stdin e imprime un campo (ruta con puntos)."""
import json, sys
data = json.load(sys.stdin)
for key in sys.argv[1].split("."):
    data = data.get(key, "") if isinstance(data, dict) else ""
print(data if isinstance(data, str) else json.dumps(data))
