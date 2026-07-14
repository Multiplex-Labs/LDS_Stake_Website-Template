# Root Makefile for building and running Docker services

GHCR_REPO ?= rc27122/lds_stake_website-template-2
DOCKER_COMPOSE ?= docker compose
DOCKER_BUILD_OPTS ?= --progress=plain

IMAGE_BACKEND := ghcr.io/$(GHCR_REPO)/backend:latest
IMAGE_FRONTEND := ghcr.io/$(GHCR_REPO)/frontend:latest
IMAGE_DOCS_SITE := ghcr.io/$(GHCR_REPO)/docs-site:latest
IMAGE_DISCORDBOT := ghcr.io/$(GHCR_REPO)/discordbot:latest

.PHONY: all build-all build-backend build-frontend build-docs-site build-discordbot \
	run-backend run-frontend run-docs-site run-discordbot \
	compose-up compose-up-discord compose-down compose-build compose-logs compose-ps \
	push-all push-backend push-frontend push-docs-site push-discordbot

all: build-all

build-all: build-backend build-frontend build-docs-site build-discordbot

build-backend:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build backend

build-frontend:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build frontend

build-docs-site:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build docs-site

build-discordbot:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build discordbot

run-backend:
	@echo "Running backend image on port 8000"
	docker run --rm --name lds-backend -p 8000:8000 $$(test -f backend/.env && echo --env-file backend/.env) $(IMAGE_BACKEND)

run-frontend:
	@echo "Running frontend image on port 3100"
	docker run --rm --name lds-frontend -p 3100:3100 $$(test -f frontend/.env && echo --env-file frontend/.env) $(IMAGE_FRONTEND)

run-docs-site:
	@echo "Running docs-site image on port 3400"
	docker run --rm --name lds-docs-site -p 3400:3400 $(IMAGE_DOCS_SITE)

run-discordbot:
	@echo "Running discordbot image on port 8001"
	docker run --rm --name lds-discordbot -p 8001:8001 $$(test -f discordbot/.env && echo --env-file discordbot/.env) $(IMAGE_DISCORDBOT)

compose-up:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) up --build

compose-up-discord:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) --profile discord up --build

compose-down:
	$(DOCKER_COMPOSE) down

compose-build:
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build

# Push images to registry (uses image names from docker-compose.yml).
# Falls back to `docker push` if `docker compose push` is not available.
push-backend:
	$(DOCKER_COMPOSE) push backend || docker push $(IMAGE_BACKEND)

push-frontend:
	$(DOCKER_COMPOSE) push frontend || docker push $(IMAGE_FRONTEND)

push-docs-site:
	$(DOCKER_COMPOSE) push docs-site || docker push $(IMAGE_DOCS_SITE)

push-discordbot:
	$(DOCKER_COMPOSE) push discordbot || docker push $(IMAGE_DISCORDBOT)

push-all: push-backend push-frontend push-docs-site push-discordbot

compose-logs:
	$(DOCKER_COMPOSE) logs -f

compose-ps:
	$(DOCKER_COMPOSE) ps
