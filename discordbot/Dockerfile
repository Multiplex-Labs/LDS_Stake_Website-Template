# Multi-stage Dockerfile for the Discord bot service

FROM python:3.13-slim AS builder
WORKDIR /tmp

# Install uv to manage Python dependencies in the build stage
RUN pip install --no-cache-dir uv

# Copy dependency manifests
COPY pyproject.toml uv.lock ./

# Compile a requirements.txt from pyproject.toml for reproducible installs
RUN uv pip compile pyproject.toml -o requirements.txt --python-version 3.13

# Runtime image
FROM python:3.13-slim
WORKDIR /app

# Install uv for any future dependency management if needed
RUN pip install --no-cache-dir uv

# Copy compiled requirements and install them
COPY --from=builder /tmp/requirements.txt ./

RUN uv pip install --no-cache-dir -r requirements.txt --system

# Copy the application code
COPY . .

# Ensure a writable directory exists for the SQLite database
RUN mkdir -p /app/data

# Expose the Discord bot HTTP/service port
EXPOSE 8001

# Required environment variables
# DISCORD_TOKEN=<your discord bot token>
# BACKEND_URL=http://backend:8000
# BACKEND_TOKEN=<shared backend bot password>
#
# Optional environment variables
# PORT=8001
# DEV=false
# DATABASE_PATH=/app/data/database.db
#
# Volume mounts
# /app/data                      # SQLite file storage
# /app/.env                      # Optional .env file mount for local dev
#
# Example usage:
# docker run -d \
#   --name discordbot \
#   -e DISCORD_TOKEN=your_token \
#   -e BACKEND_URL=http://localhost:8000 \
#   -e BACKEND_TOKEN=secret \
#   -e DATABASE_PATH=/app/data/database.db \
#   -v discordbot-data:/app/data \
#   lds-stake-discordbot

ENV PORT=8001 \
    DEV=false \
    DATABASE_PATH=/app/data/database.db \
    BACKEND_URL=http://localhost:8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/hello')" || exit 1

CMD ["python", "main.py"]
