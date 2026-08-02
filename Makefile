# Root Makefile for building and running Docker services

DOCKERHUB_REPO ?= joshuamcc/lds_stake_website_template_
DOCKER_COMPOSE ?= docker compose
DOCKER_BUILD_OPTS ?= --progress=plain

IMAGE_BACKEND := $(DOCKERHUB_REPO)backend:latest
IMAGE_FRONTEND := $(DOCKERHUB_REPO)frontend:latest
IMAGE_DOCS_SITE := $(DOCKERHUB_REPO)docs-site:latest
IMAGE_DISCORDBOT := $(DOCKERHUB_REPO)discordbot:latest

.PHONY: all help build-all build-backend build-frontend build-docs-site build-discordbot \
	run-backend run-frontend run-docs-site run-discordbot \
	compose-up compose-up-discord compose-down compose-build compose-logs compose-ps \
	push-all push-backend push-frontend push-docs-site push-discordbot

all: build-all

help: ## Show this help message
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build-all: build-backend build-frontend build-docs-site build-discordbot ## Build all Docker images

build-backend: ## Build the backend Docker image
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build backend

build-frontend: ## Build the frontend Docker image
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build frontend

build-docs-site: ## Build the docs-site Docker image
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build docs-site

build-discordbot: ## Build the discordbot Docker image
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build discordbot

run-backend: ## Run the backend image standalone (port 8000)
	@echo "Running backend image on port 8000"
	docker run --rm --name lds-backend -p 8000:8000 $$(test -f backend/.env && echo --env-file backend/.env) $(IMAGE_BACKEND)

run-frontend: ## Run the frontend image standalone (port 3100)
	@echo "Running frontend image on port 3100"
	docker run --rm --name lds-frontend -p 3100:3100 $$(test -f frontend/.env && echo --env-file frontend/.env) $(IMAGE_FRONTEND)

run-docs-site: ## Run the docs-site image standalone (port 3400)
	@echo "Running docs-site image on port 3400"
	docker run --rm --name lds-docs-site -p 3400:3400 $(IMAGE_DOCS_SITE)

run-discordbot: ## Run the discordbot image standalone (port 8001)
	@echo "Running discordbot image on port 8001"
	docker run --rm --name lds-discordbot -p 8001:8001 $$(test -f discordbot/.env && echo --env-file discordbot/.env) $(IMAGE_DISCORDBOT)

compose-up: ## Build and start all services via docker compose
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) up --build

compose-up-discord: ## Build and start all services, including the discordbot profile
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) --profile discord up --build

compose-down: ## Stop and remove docker compose services
	$(DOCKER_COMPOSE) down

compose-build: ## Build all docker compose services
	DOCKER_BUILDKIT=1 $(DOCKER_COMPOSE) build

# Push images to registry (uses image names from docker-compose.yml).
# Falls back to `docker push` if `docker compose push` is not available.
push-backend: ## Push the backend image to the registry
	$(DOCKER_COMPOSE) push backend || docker push $(IMAGE_BACKEND)

push-frontend: ## Push the frontend image to the registry
	$(DOCKER_COMPOSE) push frontend || docker push $(IMAGE_FRONTEND)

push-docs-site: ## Push the docs-site image to the registry
	$(DOCKER_COMPOSE) push docs-site || docker push $(IMAGE_DOCS_SITE)

push-discordbot: ## Push the discordbot image to the registry
	$(DOCKER_COMPOSE) push discordbot || docker push $(IMAGE_DISCORDBOT)

push-all: push-backend push-frontend push-docs-site push-discordbot ## Push all images to the registry

compose-logs: ## Tail logs from all docker compose services
	$(DOCKER_COMPOSE) logs -f

compose-ps: ## List running docker compose services
