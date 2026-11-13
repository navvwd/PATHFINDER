# PathFinder AI API - production image
# Build from the repo root:  docker build -f infrastructure/docker/backend.Dockerfile -t pathfinder-api .
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

COPY backend/requirements.txt /srv/backend/requirements.txt
RUN pip install -r /srv/backend/requirements.txt

COPY ai-engine /srv/ai-engine
RUN pip install /srv/ai-engine

COPY backend /srv/backend
WORKDIR /srv/backend

RUN useradd --system --uid 10001 pathfinder \
 && mkdir -p /srv/backend/storage \
 && chown -R pathfinder /srv/backend/storage
USER pathfinder

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# Migrations run on start so a fresh database is always at head.
CMD ["sh", "-c", "python -m app.cli migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers ${WEB_CONCURRENCY:-2}"]
