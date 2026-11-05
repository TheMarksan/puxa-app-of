"""Erros com mensagens legíveis para quem usa o site, em vez de rastros de pilha."""

from __future__ import annotations


class PuxaError(Exception):
    """Erro de domínio com código estável (para o frontend) e mensagem em português."""

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status

    def as_dict(self) -> dict:
        return {"code": self.code, "message": self.message}


# Cada regra: trechos que aparecem nas mensagens do yt-dlp → (código, mensagem, status HTTP).
_RULES: list[tuple[tuple[str, ...], str, str, int]] = [
    (
        ("private video",),
        "private",
        "Este vídeo é privado. Só quem foi convidado pelo canal consegue assistir, então não dá para baixar.",
        403,
    ),
    (
        ("confirm your age", "age-restricted", "inappropriate for some users"),
        "age_restricted",
        "O YouTube pede login para vídeos com restrição de idade, e este servidor não usa conta. Escolha outro vídeo.",
        403,
    ),
    (
        ("not a bot", "sign in to confirm"),
        "bot_check",
        "O YouTube pediu uma verificação a este servidor. Espere alguns minutos e tente de novo.",
        429,
    ),
    (
        ("members-only", "join this channel", "members only"),
        "members_only",
        "Este vídeo é exclusivo para membros do canal e não pode ser baixado.",
        403,
    ),
    (
        ("not available in your country", "blocked it in your country", "geo restrict"),
        "region_blocked",
        "Este vídeo não está liberado na região onde o servidor fica. Escolha outro vídeo.",
        403,
    ),
    (
        ("live event will begin", "premieres in", "is_upcoming"),
        "upcoming",
        "Este vídeo ainda não foi ao ar. Volte depois que a estreia ou transmissão terminar.",
        409,
    ),
    (
        ("video unavailable", "has been removed", "does not exist", "no longer available", "account associated"),
        "unavailable",
        "Vídeo indisponível. Ele pode ter sido removido, ou o link está incompleto. Confira o link e tente de novo.",
        404,
    ),
    (
        ("http error 403", "forbidden"),
        "blocked",
        "O YouTube recusou entregar este arquivo ao servidor. Tente de novo em alguns minutos; se continuar, "
        "quem mantém o site precisa configurar cookies ou um provedor de PO token (veja o README).",
        502,
    ),
    (
        ("unable to download webpage", "timed out", "connection", "temporary failure", "network is unreachable"),
        "network",
        "O servidor não conseguiu falar com o YouTube agora. Tente de novo em instantes.",
        502,
    ),
    (
        ("requested format is not available", "no video formats"),
        "format_unavailable",
        "Essa qualidade não está disponível para este vídeo. Escolha outra e tente de novo.",
        409,
    ),
]


def from_ytdlp(exc: Exception) -> PuxaError:
    """Traduz uma exceção do yt-dlp para um PuxaError com instrução de recuperação."""
    text = str(exc).lower()
    for needles, code, message, status in _RULES:
        if any(n in text for n in needles):
            return PuxaError(code, message, status)
    return PuxaError(
        "unknown",
        "O YouTube recusou o pedido para este vídeo. Tente de novo; se continuar, teste com outro link.",
        502,
    )
