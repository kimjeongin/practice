# Makefile for System Trading

.PHONY: help install dev lint format typecheck test test-cov clean build run-api run-engine run-all docker-build docker-up docker-down

# Default target
help: ## Show this help message
	@echo "System Trading Development Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Installation
install: ## Install dependencies
	uv sync

dev: ## Install development dependencies
	uv sync --dev

# Code Quality
lint: ## Run linting checks
	uv run ruff check .

format: ## Format code
	uv run ruff format .
	uv run ruff check --fix .

typecheck: ## Run type checking
	uv run mypy .

# Testing
test: ## Run tests
	uv run pytest

test-cov: ## Run tests with coverage
	uv run pytest --cov=system_trading --cov-report=html --cov-report=term

test-watch: ## Run tests in watch mode
	uv run pytest-watch

# Quality checks
check: lint typecheck test ## Run all quality checks

# Cleaning
clean: ## Clean up temporary files
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .coverage htmlcov/ .pytest_cache/

# Build
build: ## Build Docker image
	docker build -t system-trading .

# Running
run-api: ## Run API server only
	uv run python main.py api

run-engine: ## Run trading engine only
	uv run python main.py engine

run-all: ## Run both API and engine
	uv run python main.py

run-dev: ## Run in development mode with auto-reload
	uv run uvicorn system_trading.api.main:app --reload --host 127.0.0.1 --port 8000

# Docker
docker-build: ## Build Docker image
	docker build -t system-trading .

docker-up: ## Start services with Docker Compose
	docker-compose up -d

docker-down: ## Stop Docker Compose services
	docker-compose down

docker-logs: ## Show Docker logs
	docker-compose logs -f

# Database
db-init: ## Initialize database
	docker-compose up -d postgres
	sleep 5
	docker-compose exec postgres psql -U postgres -d trading_db -f /docker-entrypoint-initdb.d/init.sql

# Utilities
logs: ## Show application logs
	tail -f logs/trading.log

backup-env: ## Backup .env file
	cp .env .env.backup.$(shell date +%Y%m%d_%H%M%S)

# Development shortcuts
dev-setup: install ## Setup development environment
	cp .env.example .env
	@echo "Please edit .env file with your API keys"

dev-check: format typecheck test ## Quick development check

# Production
prod-check: ## Check if ready for production
	@echo "Running production readiness checks..."
	uv run ruff check .
	uv run mypy .
	uv run pytest
	@echo "✅ All checks passed!"

# Documentation
docs: ## Generate documentation (placeholder)
	@echo "Documentation generation not implemented yet"

# Data management
download-data: ## Download sample data for backtesting
	uv run python -c "from system_trading.backtesting.data_manager import BacktestDataManager; dm = BacktestDataManager(); dm.download_bulk_data(['BTC/USDT', 'ETH/USDT'], 'binance', ['1h'], 30)"

# Performance
profile: ## Run performance profiling
	uv run python -m cProfile -o profile.stats main.py
	uv run python -c "import pstats; p = pstats.Stats('profile.stats'); p.sort_stats('cumulative').print_stats(20)"

# Git hooks (optional)
install-hooks: ## Install git pre-commit hooks
	pre-commit install

# Show current configuration
show-config: ## Show current configuration
	@echo "Python version: $(shell python --version)"
	@echo "UV version: $(shell uv --version)"
	@echo "Current directory: $(shell pwd)"
	@echo "Git branch: $(shell git branch --show-current 2>/dev/null || echo 'Not a git repo')"
	@echo "Environment file exists: $(shell test -f .env && echo 'Yes' || echo 'No')"