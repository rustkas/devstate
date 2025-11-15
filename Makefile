DEVSTATE_COMPOSE := docker-compose.yml

.PHONY: devstate-up devstate-down devstate-logs devstate-init devstate-health devstate-verify devstate-export devstate-ci

devstate-up:
	@echo "Starting DevState standalone stack (ports: HTTP 3180, PG 55432)"
	docker compose -f $(DEVSTATE_COMPOSE) up -d

devstate-down:
	@echo "Stopping DevState standalone stack"
	docker compose -f $(DEVSTATE_COMPOSE) down

devstate-logs:
	@echo "Tailing DevState logs"
	docker compose -f $(DEVSTATE_COMPOSE) logs -f

devstate-init:
	@echo "Initializing DevState database schema"
	@docker cp sql/init_devstate.sql devstate-db:/init_devstate.sql >/dev/null
	@docker compose -f $(DEVSTATE_COMPOSE) exec -T db psql -U devstate -d devstate -f /init_devstate.sql

devstate-health:
	@curl -fsS http://localhost:3180/health || curl -fsS http://localhost:3080/health

devstate-verify:
	@curl -fsS 'http://localhost:3180/v1/devstate/verify?limit=0' || curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0'

devstate-export:
	@bash scripts/devstate_export.sh

devstate-ci:
	@$(MAKE) devstate-up
	@$(MAKE) devstate-init
	@$(MAKE) devstate-health
	@$(MAKE) devstate-verify
	@$(MAKE) devstate-export