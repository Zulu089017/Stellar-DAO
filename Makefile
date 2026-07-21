# ═══════════════════════════════════════════════════════════════
# StellarDAO — Makefile
# ═══════════════════════════════════════════════════════════════
# Convenience commands for development, testing, and deployment.
# ═══════════════════════════════════════════════════════════════

SHELL := /bin/bash
.PHONY: help install dev build test lint typecheck clean contracts contracts-build contracts-test \
        contracts-deploy bindings docker-up docker-down docker-logs deploy-docs \
        setup pre-commit ci

# ── Help ──────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────────
install: ## Install all dependencies (Node + Rust)
	pnpm install
	rustup target add wasm32-unknown-unknown

setup: install contracts-build bindings ## Full project setup (install + build contracts + generate bindings)
	@echo "✅ Setup complete. Run 'make dev' to start."

# ── Development ───────────────────────────────────────────────
dev: ## Start all services in parallel (API + Web + Relayer)
	pnpm dev

dev-api: ## Start API only
	pnpm --filter @stellardao/api dev

dev-web: ## Start Web dashboard only
	pnpm --filter @stellardao/web dev

dev-relayer: ## Start Relayer only
	pnpm --filter @stellardao/relayer dev

# ── Build ─────────────────────────────────────────────────────
build: ## Build all packages and apps
	pnpm build

contracts-build: ## Compile Soroban smart contracts to WASM
	pnpm contracts:build

bindings: ## Generate TypeScript contract bindings
	pnpm bindings:generate

# ── Testing ───────────────────────────────────────────────────
test: ## Run all tests
	pnpm test

test-api: ## Run API tests only
	pnpm --filter @stellardao/api test

test-web: ## Run Web tests only
	pnpm --filter @stellardao/web test

test-contracts: ## Run Soroban contract tests
	pnpm contracts:test

test-watch: ## Run tests in watch mode
	pnpm --filter @stellardao/web test -- --watch

test-coverage: ## Run tests with coverage report
	pnpm --filter @stellardao/api test -- --coverage
	pnpm --filter @stellardao/web test -- --coverage

# ── Quality ───────────────────────────────────────────────────
lint: ## Lint all code
	pnpm lint

typecheck: ## Type-check all TypeScript code
	pnpm typecheck

format: ## Format code with Prettier
	pnpm format

format-check: ## Check formatting without changes
	pnpm format:check

pre-commit: lint typecheck test ## Run all quality checks (lint + typecheck + test)
	@echo "✅ All checks passed."

ci: pre-commit contracts-build ## Full CI pipeline (local)
	@echo "✅ CI checks passed."

# ── Docker ────────────────────────────────────────────────────
docker-up: ## Start all Docker services
	docker compose up -d

docker-down: ## Stop all Docker services
	docker compose down

docker-logs: ## Tail logs from all services
	docker compose logs -f

docker-build: ## Rebuild Docker images
	docker compose build

# ── Deployment ────────────────────────────────────────────────
contracts-deploy: ## Deploy Soroban contracts to configured network
	pnpm contracts:deploy

# ── Cleanup ───────────────────────────────────────────────────
clean: ## Remove all build artifacts and dependencies
	pnpm clean

clean-full: clean docker-down ## Full cleanup (artifacts + Docker)
	rm -rf node_modules .turbo
	find . -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name .next -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name dist -type d -prune -exec rm -rf {} + 2>/dev/null || true

# ── Utilities ─────────────────────────────────────────────────
changelog: ## Generate changelog from git history
	pnpm changelog

cli: ## Run the CLI tool
	pnpm cli
