# Multi-stage build for FastAPI backend
# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

WORKDIR /tmp

# Install uv (ultra-fast Python package installer)
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml .

# Build the lockfile and prepare dependencies
RUN uv pip compile pyproject.toml -o requirements.txt --python-version 3.11

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Install uv for runtime dependency management
RUN pip install --no-cache-dir uv

# Copy compiled requirements from builder
COPY --from=builder /tmp/requirements.txt .

# Install production dependencies using uv
RUN uv pip install --no-cache-dir -r requirements.txt --system

# Copy application code
COPY . .

# Ensure data and static directories exist for volume mounts
RUN mkdir -p /app/data src/static/profile_images

# Expose FastAPI port
EXPOSE 8000

# ============================================================================
# REQUIRED ENVIRONMENT VARIABLES (set these when running the container)
# ============================================================================
# PORT=8000                          # Port for FastAPI server (default: 8000)
# DEV=false                          # Development mode (default: false for production)
# DB_ENGINE=sqlite                   # Database engine (default: sqlite)
# DATABASE_PATH=/app/data/database.db # Path to SQLite database file
# JWT_SECRET_KEY=your-secret-key     # REQUIRED: JWT signing secret (generate a random string)
# INITIAL_ADMIN_PASSWORD=password123 # REQUIRED on first run only (creates admin user)
# SSL_ENABLED=false                  # Enable SSL (default: false)
# SP_APPROVAL_THRESHOLD=2            # Stake Presidency approval threshold
# HC_APPROVAL_THRESHOLD=3            # High Council approval threshold
#
# ============================================================================
# VOLUME MOUNTS (persistent data storage)
# ============================================================================
# /app/data                          # SQLite database directory (mount a named volume or host path)
# /app/src/static/profile_images     # User profile images storage
# /app/wards.csv                     # Ward configuration (optional: for custom wards)
# /app/speaking_schedule.csv         # Speaking schedule (optional: for custom schedule)
#
# ============================================================================
# EXAMPLE USAGE (docker run)
# ============================================================================
# docker run -d \
#   --name fastapi-backend \
#   -p 8000:8000 \
#   -e PORT=8000 \
#   -e DEV=false \
#   -e DB_ENGINE=sqlite \
#   -e DATABASE_PATH=/app/data/database.db \
#   -e JWT_SECRET_KEY=$(openssl rand -hex 32) \
#   -e INITIAL_ADMIN_PASSWORD=admin123 \
#   -e SP_APPROVAL_THRESHOLD=2 \
#   -e HC_APPROVAL_THRESHOLD=3 \
#   -v backend-data:/app/data \
#   -v backend-images:/app/src/static/profile_images \
#   -v $(pwd)/wards.csv:/app/wards.csv:ro \
#   lds-stake-backend
#
# Or with docker-compose, use the services.backend section with:
#   environment:
#     - JWT_SECRET_KEY=your-generated-secret
#     - INITIAL_ADMIN_PASSWORD=admin123
#   volumes:
#     - backend-data:/app/data
#     - backend-images:/app/src/static/profile_images
#
# ============================================================================

# Set default environment variables (can be overridden at runtime)
ENV PORT=8000 \
    DEV=false \
    DB_ENGINE=sqlite \
    DATABASE_PATH=/app/data/database.db \
    SSL_ENABLED=false \
    SP_APPROVAL_THRESHOLD=2 \
    HC_APPROVAL_THRESHOLD=3

# Health check to ensure the API is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

# Run the FastAPI application via uvicorn
CMD ["python", "main.py"]
