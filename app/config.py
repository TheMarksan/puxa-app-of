"""Configuração lida de variáveis de ambiente, com padrões seguros para uso pessoal."""

import os
import tempfile
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Onde os arquivos temporários de cada pedido ficam até expirar.
DATA_DIR = Path(os.environ.get("PUXA_DATA_DIR", Path(tempfile.gettempdir()) / "puxa"))

# Por quanto tempo um arquivo pronto fica disponível (segundos).
FILE_TTL_SECONDS = _int("PUXA_FILE_TTL", 30 * 60)

# Vídeos mais longos que isso são recusados (segundos). Padrão: 3 horas.
MAX_DURATION_SECONDS = _int("PUXA_MAX_DURATION", 3 * 60 * 60)

# Quantos downloads rodam ao mesmo tempo; os demais esperam na fila.
MAX_PARALLEL_JOBS = _int("PUXA_MAX_JOBS", 2)

# Cache das informações de um vídeo, para não consultar o YouTube a cada clique.
INFO_CACHE_SECONDS = _int("PUXA_INFO_CACHE", 10 * 60)

# Arquivo de cookies no formato Netscape, útil quando o YouTube pede verificação.
COOKIES_FILE = os.environ.get("PUXA_COOKIES_FILE") or None

# Modo demonstração: metadados reais, mídia gerada localmente (ver app/demo.py).
DEMO = os.environ.get("PUXA_DEMO", "").lower() in {"1", "true", "sim", "yes"}
