# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

WORKDIR /tmp

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./

RUN uv export --frozen --no-dev -o requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY --from=builder /tmp/requirements.txt .

RUN uv pip install --no-cache-dir -r requirements.txt --system

COPY . .

RUN mkdir -p /app/data /app/static/profile_images

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

ENV PORT=8000 \
    DEV=false \
    DB_ENGINE=sqlite \
    DATABASE_PATH=/app/data/database.db \
    SSL_ENABLED=false \
    SP_APPROVAL_THRESHOLD=2 \
    HC_APPROVAL_THRESHOLD=3

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

CMD ["python", "main.py"]
