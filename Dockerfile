FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Deno: runtime de JavaScript que o yt-dlp usa para liberar todos os formatos do YouTube.
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app app
# Inclui static/demo, o pacote pronto da demo (gerado em demo/ com `npm run build`)
COPY static static

ENV PUXA_DATA_DIR=/tmp/puxa \
    PYTHONUNBUFFERED=1
EXPOSE 8000
# Railway, Render e afins informam a porta em $PORT; localmente fica 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
