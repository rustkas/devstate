# Техническое задание: Доработка beamline_store с PostgreSQL JSONB + ETS TTL Cache

## 📋 **Обзор проекта**

### **Цель:**
Создать надежное и высокопроизводительное хранилище политик с read-through ETS кэшем и PostgreSQL JSONB как источником истины. **Решение планируется опубликовать как Open Source расширение для TRAE IDE** для сообщества Erlang/OTP разработчиков.

### **Open Source для TRAE IDE:**
- **Уникальность**: Анализ TRAE marketplace показал отсутствие специализированных Erlang + PostgreSQL cache решений
- **Ценность для сообщества**: Первый Open Source read-through cache фасад для Erlang/OTP с PostgreSQL JSONB
- **Интеграция с TRAE**: MCP-совместимое расширение для seamless интеграции с AI assistant
- **Публикация**: GitHub repository + TRAE extension store + VS Code marketplace

### **ТЭО обоснование:**
- **Минимальные изменения**: Использование существующей архитектуры beamline_store
- **Зрелая связка**: Erlang/OTP + PostgreSQL - проверенное решение
- **Совместимость**: Полная интеграция с Router, RBAC, Audit компонентами
- **Стоимость**: Низкая - команда владеет BEAM stack
- **Надежность**: Высокая - PG HA, репликации, ETS resilience
- **Open Source потенциал**: Уникальное решение для Erlang сообщества

## 🏗️ **Архитектурное решение**

### **Core Architecture:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Router/       │    │   beamline_     │    │   PostgreSQL    │
│   Gateway       │───▶│   store         │───▶│   JSONB         │
│                 │    │                 │    │                 │
│ • Policy CRUD   │    │ • ETS Cache     │    │ • Source of     │
│ • RBAC Checks   │    │ • TTL 5-10 min  │    │   Truth         │
│ • Audit Log     │    │ • Read-through  │    │ • GIN Index     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **Data Flow:**
1. **Request** → Router/Gateway
2. **Cache Check** → ETS read-through cache
3. **Cache Miss** → PostgreSQL JSONB query
4. **Cache Update** → Insert into ETS with TTL
5. **Response** → Return to caller

## 🌍 **Open Source требования для TRAE IDE**

### **Анализ существующих решений:**
- **TRAE Marketplace**: Отсутствуют специализированные Erlang + PostgreSQL cache решения
- **VS Code Marketplace**: Базовые PostgreSQL клиенты, но без Erlang/OTP интеграции
- **Open Source ландшафт**: Существуют отдельные компоненты (epgsql, pgo), но нет комплексного cache фасада

### **Уникальное предложение:**
- **Первый read-through cache фасад** для Erlang/OTP с PostgreSQL JSONB
- **MCP-совместимость** для интеграции с TRAE AI assistant
- **Production-ready решение** с ETS TTL и background sweeper
- **Комплексная документация** и примеры использования

### **TRAE Extension структура:**
```
beamline-store-extension/
├── package.json                 # Extension manifest
├── src/extension.js            # TRAE extension API
├── src/mcp-server.js           # MCP server for AI integration
├── erlang/                     # Erlang/OTP modules
│   ├── beamline_cache.erl
│   ├── beamline_pg_connection.erl
│   └── beamline_policy_store.erl
├── sql/                        # Database schemas
├── docs/                       # Documentation
├── examples/                   # Usage examples
└── tests/                      # Test suites
```

### **MCP интеграция:**
```javascript
// MCP server для TRAE AI assistant
const BeamlineStoreMCPServer = {
  name: "beamline-store",
  version: "1.0.0",
  tools: [
    {
      name: "get_policy",
      description: "Get policy from cache or database",
      inputSchema: {
        type: "object",
        properties: {
          tenant_id: { type: "string" },
          policy_id: { type: "string" }
        }
      }
    },
    {
      name: "put_policy", 
      description: "Store policy with cache update",
      inputSchema: {
        type: "object",
        properties: {
          tenant_id: { type: "string" },
          policy_id: { type: "string" },
          policy_data: { type: "object" }
        }
      }
    }
  ]
};
```

### **Open Source лицензирование:**
- **License**: Apache 2.0 (позволяет коммерческое использование)
- **Code of Conduct**: Contributor Covenant
- **Contributing Guidelines**: Подробные инструкции для контрибьюторов
- **Security Policy**: Отчетность об уязвимостях

### **Публикация и дистрибуция:**
1. **GitHub Repository**: Основной исходный код и документация
2. **TRAE Extension Store**: Публикация в официальном магазине
3. **VS Code Marketplace**: Расширение аудитории через VS Code совместимость
4. **Hex.pm**: Публикация Erlang пакетов
5. **Docker Hub**: Контейнеры с PostgreSQL и примерами

## 🎯 **Технические требования**

### **1. PostgreSQL Integration**

#### **Database Schema:**
```sql
-- Policies table with JSONB
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    policy_id VARCHAR(128) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(128),
    updated_by VARCHAR(128),
    
    UNIQUE(tenant_id, policy_id, version)
);

-- GIN index for JSONB queries
CREATE INDEX idx_policies_data_gin ON policies USING GIN (data);

-- Partial indexes for active policies
CREATE INDEX idx_policies_active ON policies (tenant_id, policy_id) WHERE is_active = true;
CREATE INDEX idx_policies_tenant_active ON policies (tenant_id) WHERE is_active = true;

-- Audit log table
CREATE TABLE policy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    policy_id VARCHAR(128) NOT NULL,
    action VARCHAR(32) NOT NULL, -- CREATE, UPDATE, DELETE, ACTIVATE, DEACTIVATE
    actor VARCHAR(128) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RBAC tables
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL, -- admin, operator, viewer
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(tenant_id, user_id)
);

-- Quotas table
CREATE TABLE tenant_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL UNIQUE,
    max_policies INTEGER DEFAULT 10,
    max_rules_per_policy INTEGER DEFAULT 50,
    max_providers_per_policy INTEGER DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **Docker Configuration:**
```yaml
# docker-compose.postgres.yml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: beamline_postgres
    environment:
      POSTGRES_DB: beamline_store
      POSTGRES_USER: beamline_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U beamline_user -d beamline_store"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

### **2. ETS Cache Enhancement**

#### **Cache Schema:**
```erlang
% Cache tables
-define(POLICY_CACHE, beamline_policy_cache).
-define(RBAC_CACHE, beamline_rbac_cache).
-define(QUOTA_CACHE, beamline_quota_cache).
-define(AUDIT_CACHE, beamline_audit_cache).

% Cache records
-record(policy_cache_entry, {
    key = {tenant_id, policy_id, version},
    data,
    expires_at,
    loaded_at,
    source = pg  % pg, fixture
}).

-record(rbac_cache_entry, {
    key = {tenant_id, user_id},
    roles,
    permissions,
    expires_at,
    loaded_at
}).

-record(quota_cache_entry, {
    key = tenant_id,
    max_policies,
    max_rules_per_policy,
    max_providers_per_policy,
    current_policies,
    expires_at,
    loaded_at
}).
```

#### **Cache Configuration:**
```erlang
% Default TTL settings
-define(POLICY_CACHE_TTL, 600).        % 10 minutes
-define(RBAC_CACHE_TTL, 300).          % 5 minutes
-define(QUOTA_CACHE_TTL, 900).         % 15 minutes
-define(AUDIT_CACHE_TTL, 1800).        % 30 minutes
```

### **3. Core Modules Development**

#### **A. PostgreSQL Connection Module**
```erlang
% beamline_pg_connection.erl
-export([connect/0, disconnect/0, query/2, transaction/1]).

connect() ->
    % Connect to PostgreSQL with connection pool
    % Handle connection failures and retries
    % Monitor connection health

disconnect() ->
    % Graceful connection cleanup

query(Sql, Params) ->
    % Execute parameterized queries
    % Handle timeouts and errors
    % Return structured results

transaction(Fun) ->
    % Execute transaction with rollback on error
    % Handle deadlock and retry logic
```

#### **B. Policy Store Module**
```erlang
% beamline_policy_store_pg.erl
-export([get_policy/2, put_policy/3, list_policies/2, 
         delete_policy/2, activate_policy/2, deactivate_policy/2]).

get_policy(TenantId, PolicyId) ->
    % Check ETS cache first
    % Load from PostgreSQL on miss
    % Cache with TTL
    % Handle version conflicts

put_policy(TenantId, PolicyId, PolicyData) ->
    % Validate policy data
    % Check quotas
    % Store in PostgreSQL
    % Update ETS cache
    % Log audit trail

list_policies(TenantId, Filters) ->
    % Query PostgreSQL with filters
    % Cache results
    % Handle pagination
```

#### **C. RBAC Module**
```erlang
% beamline_rbac_pg.erl
-export([get_user_roles/2, check_permission/3, 
         assign_role/3, revoke_role/3]).

get_user_roles(TenantId, UserId) ->
    % Cache user roles and permissions
    % Load from PostgreSQL on cache miss
    % Handle role expiration

check_permission(TenantId, UserId, Action) ->
    % Check cached permissions
    % Load from database if needed
    % Return boolean result
```

#### **D. Audit Module**
```erlang
% beamline_audit_pg.erl
-export([log_action/5, get_audit_log/3, 
         cleanup_old_logs/1]).

log_action(TenantId, PolicyId, Action, Actor, Details) ->
    % Write to PostgreSQL
    % Cache recent audit entries
    % Handle async writes

get_audit_log(TenantId, PolicyId, Filters) ->
    % Query audit log with filters
    % Cache frequent queries
    % Handle time range queries
```

### **4. Performance Requirements**

#### **Throughput Targets:**
- **Policy Reads**: 10K+ ops/sec (cache hit)
- **Policy Writes**: 1K+ ops/sec (database write)
- **RBAC Checks**: 50K+ ops/sec (cache hit)
- **Audit Logs**: 5K+ writes/sec (async)

#### **Latency Targets:**
- **Cache Hit**: < 1ms (99th percentile)
- **Cache Miss**: < 50ms (database query)
- **Policy Write**: < 100ms (database commit)
- **RBAC Check**: < 2ms (cache hit)

#### **Memory Requirements:**
- **Policy Cache**: < 1GB для 100K политик
- **RBAC Cache**: < 100MB для 10K пользователей
- **Audit Cache**: < 500MB для последних логов
- **Total Memory**: < 2GB для cache layer

## 🧪 **Тестирование и бенчмаркинг**

### **1. Database Performance Tests**
```bash
# pgbench configuration
pgbench -i -s 50 beamline_store  # Initialize with 50M scale
pgbench -c 50 -j 10 -T 300 beamline_store  # 50 clients, 10 threads, 5 minutes

# Custom workload scripts
pgbench -f scripts/policy_read_workload.sql -c 100 -j 20 -T 600 beamline_store
pgbench -f scripts/policy_write_workload.sql -c 20 -j 5 -T 300 beamline_store
```

### **2. API Performance Tests**
```bash
# wrk configuration for HTTP API
wrk -t12 -c400 -d30s --script=scripts/policy_api.lua http://localhost:8080

# k6 configuration for load testing
k6 run --vus 100 --duration 5m scripts/policy_load_test.js
```

### **3. ETS Cache Profiling**
```erlang
% Performance profiling module
beamline_cache_profiler:profile_cache_operations().
beamline_cache_profiler:memory_usage().
beamline_cache_profiler:concurrent_access_test().
```

### **4. Integration Tests**
```erlang
% End-to-end test scenarios
beamline_integration_SUITE:policy_crud_workflow().
beamline_integration_SUITE:rbac_enforcement().
beamline_integration_SUITE:audit_log_completeness().
beamline_integration_SUITE:cache_consistency().
```

## 📊 **Мониторинг и метрики**

### **1. Database Metrics**
```sql
-- PostgreSQL performance queries
SELECT 
    schemaname,
    tablename,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables;

-- Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes;
```

### **2. Cache Metrics**
```erlang
% ETS cache statistics
beamline_cache_metrics:get_policy_cache_stats().
beamline_cache_metrics:get_rbac_cache_stats().
beamline_cache_metrics:get_quota_cache_stats().
```

### **3. Application Metrics**
```erlang
% Overall system metrics
beamline_store_metrics:get_throughput_stats().
beamline_store_metrics:get_latency_stats().
beamline_store_metrics:get_error_rates().
```

## 🔧 **Конфигурация и развертывание**

### **1. Environment Configuration**
```yaml
# config/beamline_store.yaml
database:
  host: localhost
  port: 5432
  database: beamline_store
  username: beamline_user
  password: ${POSTGRES_PASSWORD}
  pool_size: 20
  max_overflow: 10
  connection_timeout: 5000

cache:
  policy_ttl: 600
  rbac_ttl: 300
  quota_ttl: 900
  audit_ttl: 1800
  sweep_interval: 60
  max_cache_size: 2000000000  % 2GB

monitoring:
  metrics_enabled: true
  health_check_interval: 30
  slow_query_threshold: 100
```

### **2. Migration Scripts**
```erlang
% Database migrations
beamline_migrations:run_all().
beamline_migrations:create_indexes().
beamline_migrations:populate_initial_data().
```

### **3. Backup and Recovery**
```bash
# Automated backup scripts
scripts/backup_database.sh
scripts/restore_database.sh
scripts/verify_backup_integrity.sh
```

## 📈 **Критерии успеха**

### **Functional Requirements:**
- ✅ Полная замена fixture-based хранилища
- ✅ Read-through ETS кэш с TTL 5-10 минут
- ✅ PostgreSQL JSONB как источник истины
- ✅ RBAC и квоты интегрированы
- ✅ Audit logging для всех операций

### **Performance Requirements:**
- ✅ 10K+ reads/sec (cache hit)
- ✅ 1K+ writes/sec (database)
- ✅ < 1ms latency (cache hit)
- ✅ < 50ms latency (cache miss)
- ✅ 99.9% uptime

### **Reliability Requirements:**
- ✅ Automatic failover for PostgreSQL
- ✅ Cache consistency guarantees
- ✅ Data integrity validation
- ✅ Backup and recovery procedures

### **Integration Requirements:**
- ✅ Seamless integration with Router
- ✅ Backward compatibility with existing APIs
- ✅ Support for existing RBAC system
- ✅ Audit trail integration

## 🚀 **План реализации**

### **Phase 1: Foundation (2 недели)**
1. PostgreSQL Docker setup
2. Database schema and migrations
3. Connection pool implementation
4. Basic CRUD operations

**Доставляемые артефакты:**
- `docker-compose.postgres.yml`
- `sql/init.sql` с полной схемой
- `beamline_pg_connection.erl`
- `beamline_migrations.erl`
- Unit тесты для подключения

### **Phase 2: Cache Integration (1 неделя)**
1. ETS cache enhancement
2. Read-through pattern implementation
3. TTL и sweeper configuration
4. Cache invalidation hooks

**Доставляемые артефакты:**
- Обновленный `beamline_cache.erl` с PG интеграцией
- `beamline_policy_store_pg.erl`
- Cache invalidation hooks
- Интеграционные тесты

### **Phase 3: RBAC & Audit (1 неделя)**
1. RBAC PostgreSQL integration
2. Audit logging implementation
3. Quota management
4. Security hardening

**Доставляемые артефакты:**
- `beamline_rbac_pg.erl`
- `beamline_audit_pg.erl`
- `beamline_quota_pg.erl`
- Security тесты

### **Phase 4: Performance & Testing (1 неделя)**
1. Performance optimization
2. Load testing and benchmarking
3. Monitoring and metrics
4. Documentation completion

**Доставляемые артефакты:**
- `scripts/policy_read_workload.sql`
- `scripts/policy_write_workload.sql`
- `beamline_cache_profiler.erl`
- Performance отчет

### **Phase 5: Open Source & TRAE Extension (1 неделя)**
1. TRAE extension development
2. MCP server implementation
3. Open Source packaging
4. Documentation and examples

**Доставляемые артефакты:**
- `package.json` - TRAE extension manifest
- `src/extension.js` - TRAE extension API
- `src/mcp-server.js` - MCP server для AI assistant
- `CONTRIBUTING.md` - инструкции для контрибьюторов
- `LICENSE` - Apache 2.0 лицензия
- `CODE_OF_CONDUCT.md` - кодекс поведения

# ТЗ для внедрения MCP DevState (DB как SoT) и план для текущего решения

## План по варианту B: DB как Source of Truth + файловый экспорт/импорт

Выбрано:  DB — источник истины для `.trae/state` и `.trae/history`.

Файлы остаются совместимым экспортом/импортом для CI и репозитория.

Точки записи строго через MCP DevState server (атомарность, HMAC-инварианты, schema-валидация).

### Архитектура

- PostgreSQL (SoT):
  - `state_current(id=1, json jsonb, checksum text, updated_at timestamptz)`
  - `history_entries(id bigserial, ts timestamptz, actor text, action text, cp_from text, cp_to text, state_checksum text, hmac_prev text, hmac text, metadata jsonb)`
  - Политика append-only для history (триггеры/правила запрета UPDATE/DELETE).

- MCP DevState server:
  - Доменные методы вместо «сырого» SQL, чтобы сохранить инварианты.
  - Транзакции: `append_history` и (опционально) `update_state` в одном `BEGIN`.

- Экспорт/импорт:
  - `export_files()` → генерирует точные `.trae/state.json` и `.trae/history.json` из БД.
  - `import_files()` → валидирует JSON Schema + HMAC цепочку, затем вносит в БД.

### Контракты MCP DevState (минимально необходимое)

- `get_state() -> {json, checksum}`
- `update_state(patch) -> {ok, new_checksum}`
  - Валидация по `docs/STATE.schema.json`, пересчет checksum.
- `append_history(entry) -> {ok, new_hmac}`
  - Автоматически проставляет `hmac_prev`, считает `hmac` из `BEAMLINE_HMAC_SECRET`.
- `verify_hmac_chain() -> {ok | {error, pos}}`
- `export_files() -> {ok, files_written}`
- `import_files() -> {ok | {error, reason}}`
- `lock_state(scope, ttl) / unlock_state(lock_id)` — защита от гонок.
- `search_history(filters) -> [entries]` — удобство в IDE.

### TRAE config (пример)

```json
{
  "mcpServers": {
    "DevState": {
      "command": "node",
      "args": ["mcp/devstate-server.js"],
      "env": {
        "DATABASE_URL": "postgres://user:[MASKED]@localhost:5432/devstate",
        "BEAMLINE_HMAC_SECRET": "[MASKED]"
      }
    }
  }
}
```

### Потоки

- IDE/агенты: читают и пишут через MCP DevState.
- CI: либо читает файлы (экспорт перед CI), либо вызывает `verify_hmac_chain()` через CLI/MCP.
- Миграция: `import_files()` единоразово переносит текущие `.trae/*` → БД; включаем экспорт перед коммитам.

Ниже — короткое ТЗ по варианту B и конкретные действия с текущим репо `@apps/otp/beamline_store`. Полная версия добавлена в файл:

- `apps/otp/beamline_store/docs/TECHNICAL_SPECIFICATION.md`
- Раздел: “MCP DevState (DB SoT) — Техническое задание и план миграции”

## Цели

- DB = Source of Truth для `.trae/state.json` и `.trae/history.json`.
- MCP DevState в TRAE: атомарные операции (append-only history, transactional `update_state`) с валидацией Schema/HMAC.
- Совместимость: экспорт/импорт файлов для CI и репозитория.

## Что делать с текущим решением (beamline_store)

- Сохранить ETS-кэш и все текущие API без изменений.
- Добавить подпакет `mcp_devstate` (сервер MCP, SQL-схема, CLI-обертки).
- Не вносить изменения в существующие модули, кроме регистрации вспомогательных скриптов/документации.

## Область работ

- Создать `mcp_devstate`:
  - `mcp/devstate-server.js` (MCP server)
  - `sql/init_devstate.sql` (schema + immutability триггеры)
  - `scripts/devstate_export.sh`, `scripts/devstate_verify.sh` (CLI для CI)
  - `docs/DEVSTATE_MCP.md` (руководство)
- Интеграция в TRAE:
  - Добавить `mcpServers.DevState` (command=node, args=[mcp/devstate-server.js])
  - ENV: `DATABASE_URL`, `BEAMLINE_HMAC_SECRET`

## Схема БД

- `state_current(id=1, json jsonb, checksum text, updated_at timestamptz)`
- `history_entries(id bigserial, ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata jsonb)`
- Индексы: `ts`, `actor`, `action`
- Триггеры: запрет UPDATE/DELETE в `history_entries` (append-only), проверка цепочки `hmac_prev`→`hmac`

## Контракты MCP (tools)

- `get_state() -> {json, checksum}`
- `update_state(patch) -> {ok, new_checksum}` + JSON Schema validation
- `append_history(entry) -> {ok, new_hmac}` + hmac_prev/hmac расчёт
- `verify_hmac_chain() -> {ok | {error, pos}}`
- `export_files() / import_files()`
- `lock_state(scope, ttl) / unlock_state(lock_id)`
- `search_history(filters) -> [entries]`

## Миграция

1. `import_files()`: импорт текущих `.trae/*` → БД с полной верификацией HMAC.
2. TRAE включает MCP DevState (read/write).
3. Включить on-write экспорт: каждый успешный `append`/`update` вызывает `export_files()`.
4. CI-пайплайн: `devstate_verify` (или `verify_hmac_chain`), при необходимости `devstate_export`.
5. Откат: при недоступности БД — IDE read-only, CI читает экспортированные файлы; после восстановления — ресинхронизация.

## Безопасность

- Секреты только через ENV (см. `docs/ENVIRONMENT.md`), маскирование `[MASKED]`.
- Проверка Schema до записи, аудит MCP-операций.
- Бэкапы БД и регулярный тест восстановления.

## Этапы и артефакты

- Этап 1: `sql/init_devstate.sql` (схема, триггеры)
- Этап 2: `mcp/devstate-server.js` + тесты
- Этап 3: `scripts/devstate_export.sh`, `scripts/devstate_verify.sh`
- Этап 4: Интеграция в TRAE settings, IDE playbooks
- Этап 5: Миграция, on-write экспорт, мониторинг

## Критерии приёмки

- Импорт текущей истории/state успешен, `verify_hmac_chain()` — OK.
- p95 транзакций MCP < 50 мс; экспорт — байтово идентичные `.trae/*`.
- Append-only сохранён; секреты не попадают в VCS.
- CI проходит верификацию через MCP/CLI; доки обновлены.

## Recommended Actions

- [design] Подтвердить схему БД и контракты MCP (раздел уже добавлен в ТЗ).
- [impl] Реализовать MCP сервер и CLI-обертки.
- [ops] Настроить экспорт on-write и алерты на расхождения checksum/HMAC.
- [ci] Включить `devstate_verify` в pipeline.
- [docs] Завести `docs/DEVSTATE_MCP.md` и пример конфигурации TRAE.

Статус: раздел ТЗ добавлен в TECHNICAL_SPECIFICATION.md; TODO по MCP DevState заведены и один завершен (spec). Готов продолжить с реализацией схемы/сервером MCP.
- `examples/` - примеры использования
- `README.md` - comprehensive documentation

### **Phase 6: Publication & Distribution (1 неделя)**
1. GitHub repository setup
2. TRAE Extension Store submission
3. VS Code Marketplace publication
4. Hex.pm package release

**Доставляемые артефакты:**
- GitHub repository с CI/CD
- TRAE extension package (.vsix)
- VS Code extension listing
- Hex.pm package publication
- Docker Hub images

**Общая оценка: 7 недель при полной загрузке команды (включая Open Source подготовку).**

## 💰 **Оценка стоимости и рисков**

### **Стоимость:**
- **Разработка**: 7 недель × 2 разработчика = 14 человеко-недель
- **Инфраструктура**: PostgreSQL HA (минимальные затраты)
- **Open Source подготовка**: +1 неделя для licensing и documentation
- **Тестирование**: Включено в разработку
- **Обучение**: Не требуется (команда владеет BEAM)
- **Публикация**: Минимальные затраты (GitHub, Docker Hub бесплатны)

### **Open Source ценность:**
- **Уникальное решение**: Первый Erlang/OTP + PostgreSQL cache фасад
- **TRAE интеграция**: MCP-совместимое расширение для AI assistant
- **Сообщество**: Привлечение Erlang разработчиков к проекту
- **Коммерческий потенциал**: Enterprise поддержка и консалтинг

### **Риски:**
- **Производительность**: Низкий (проверенная связка)
- **Совместимость**: Низкий (минимальные изменения)
- **Надежность**: Низкий (PostgreSQL HA)
- **Сложность**: Средний (JSONB требует оптимизации)

### **Митигация рисков:**
- Тщательное тестирование производительности
- Постепенная миграция с fallback
- Мониторинг и метрики
- Регулярные бэкапы и тесты восстановления

## 📋 **Checklist для исполнителя**

### **Перед началом работ:**
- [ ] Изучить существующую архитектуру beamline_store
- [ ] Настроить PostgreSQL development окружение
- [ ] Создать ветку `feature/postgres-jsonb-integration`
- [ ] Обновить rebar.config с PostgreSQL зависимостями

### **Phase 1 deliverables:**
- [ ] Docker compose конфигурация для PostgreSQL
- [ ] Полная SQL схема с индексами
- [ ] Модуль подключения к PostgreSQL
- [ ] Миграции и начальные данные
- [ ] Unit тесты для подключения

### **Phase 2 deliverables:**
- [ ] Read-through cache реализация
- [ ] Policy store с PostgreSQL бэкендом
- [ ] Cache invalidation hooks
- [ ] Интеграционные тесты

### **Phase 3 deliverables:**
- [ ] RBAC модуль с PostgreSQL
- [ ] Audit logging система
- [ ] Quota management
- [ ] Security тесты

### **Phase 4 deliverables:**
- [ ] Performance тесты и бенчмарки
- [ ] pgbench workload скрипты
- [ ] Cache профилировщик
- [ ] Оптимизация производительности

### **Phase 5 deliverables:**
- [ ] TRAE extension package (.vsix)
- [ ] MCP server для AI assistant интеграции
- [ ] Open Source лицензирование (Apache 2.0)
- [ ] Contributing guidelines и Code of Conduct
- [ ] Примеры использования и документация
- [ ] README.md с comprehensive documentation

### **Phase 6 deliverables:**
- [ ] GitHub repository с CI/CD pipeline
- [ ] TRAE Extension Store публикация
- [ ] VS Code Marketplace листинг
- [ ] Hex.pm package релиз
- [ ] Docker Hub images с PostgreSQL
- [ ] Community engagement план

### **Open Source критерии приемки:**
- [ ] Apache 2.0 лицензия и legal review пройден
- [ ] MCP совместимость с TRAE AI assistant
- [ ] Полная документация для разработчиков
- [ ] Примеры использования и tutorials
- [ ] CI/CD pipeline для автоматического тестирования
- [ ] Security scanning и vulnerability checks
- [ ] Community guidelines и contribution process
- [ ] TRAE extension certification пройден

### **Критерии приемки:**
- [ ] Все тесты проходят (unit, integration, performance)
- [ ] Performance targets достигнуты
- [ ] Documentation полная и актуальная
- [ ] Security audit пройден
- [ ] Production ready конфигурация
   - [ ] Open Source публикация завершена
   - [ ] TRAE extension сертифицирован
   - [ ] Community engagement начат

## MCP DevState (DB SoT) — Техническое задание и план миграции

### Цели
- Перенести источник истины для `.trae/state.json` и `.trae/history.json` в PostgreSQL (DB SoT).
- Предоставить в TRAE IDE безопасные и атомарные операции через MCP DevState server.
- Сохранить полную совместимость с файловой моделью через экспорт/импорт.

### Область работ (влияние на `apps/otp/beamline_store`)
- Не ломать существующий ETS‑кэш и текущие API модуля beamline_store.
- Добавить подпакет `apps/otp/beamline_store/mcp_devstate/` с MCP‑сервером и SQL‑схемой.
- Добавить CLI‑обертки для CI: `scripts/devstate_export.sh`, `scripts/devstate_verify.sh`.
- Интеграция в TRAE (settings → mcpServers) без хардкода секретов.

### База данных (DB SoT)
- Таблица `state_current (id smallint primary key default 1, json jsonb not null, checksum text not null, updated_at timestamptz not null default now())`.
- Таблица `history_entries (id bigserial primary key, ts timestamptz not null default now(), actor text not null, action text not null, cp_from text, cp_to text, state_checksum text not null, hmac_prev text not null, hmac text not null, metadata jsonb)`.
- Индексы: `create index on history_entries(ts)`, `create index on history_entries(actor)`, `create index on history_entries(action)`.
- Ограничения/триггеры: запрет UPDATE/DELETE в `history_entries` (append‑only), проверка непрерывности `hmac_prev`→`hmac` на вставке.

### MCP DevState — контракты (tools)
- `get_state() -> {json, checksum}`
- `update_state(patch) -> {ok, new_checksum}` — валидация по `docs/STATE.schema.json`, пересчет checksum.
- `append_history(entry) -> {ok, new_hmac}` — автозаполнение `hmac_prev`, расчет `hmac` c `BEAMLINE_HMAC_SECRET` (ENV).
- `verify_hmac_chain() -> {ok | {error, position}}`
- `export_files() -> {ok, written_paths}`
- `import_files() -> {ok | {error, reason}}` — валидация schema + chain, отказ при несоответствии.
- `lock_state(scope, ttl)` / `unlock_state(lock_id)` — защита от гонок.
- `search_history(filters) -> [entries]` — быстрый поиск/фильтрация.

Пример конфигурации TRAE (settings):
```json
{
  "mcpServers": {
    "DevState": {
      "command": "node",
      "args": ["mcp/devstate-server.js"],
      "env": {
        "DATABASE_URL": "postgres://user:[MASKED]@localhost:5432/devstate",
        "BEAMLINE_HMAC_SECRET": "[MASKED]"
      }
    }
  }
}
```

### Миграция
1. One‑shot импорт текущих `.trae/state.json` и `.trae/history.json` в БД: `import_files()` → полная верификация HMAC‑цепочки.
2. Включить MCP DevState в TRAE (read/write). Файлы остаются артефактами экспорта.
3. Включить экспорт on‑write: каждая успешная транзакция `append_history`/`update_state` вызывает `export_files()`.
4. В CI добавить шаги: `devstate_verify` (или `verify_hmac_chain()`) и, при необходимости, `devstate_export` перед сборкой.
5. План отката: при недоступности БД — read‑only режим в IDE + использование экспортированных файлов в CI; последующая ресинхронизация.

### Безопасность и комплаенс
- Секреты только через ENV (см. `docs/ENVIRONMENT.md`); маскирование в логах ([MASKED]).
- Валидация schema (`docs/STATE.schema.json`) до записи.
- Политика append‑only; аудит всех операций MCP.
- Бэкапы БД + тест восстановления.

### Интеграция с текущим решением
- ETS‑кэш и policy‑store остаются без изменений.
- Добавляются новые скрипты/команды `scripts/devstate/*` и документация `docs/DEVSTATE_MCP.md`.
- `beamline_store_sup` может запускать MCP DevState server отдельным узлом/процессом (опционально) либо управляться внешне.

### Этапы и артефакты
- Этап 1: Схема БД, миграции, триггеры (`sql/init_devstate.sql`).
- Этап 2: MCP server (`mcp/devstate-server.js`) с контрактами и тестами.
- Этап 3: CLI‑обертки (`scripts/devstate_export.sh`, `scripts/devstate_verify.sh`).
- Этап 4: Интеграция с TRAE settings; IDE playbooks.
- Этап 5: Миграция и включение on‑write экспорта; мониторинг.

### Критерии приемки
- Успешный импорт текущей истории и state; `verify_hmac_chain()` → OK.
- Транзакционные операции MCP p95 < 50 мс; экспорт формирует байтово идентичные `.trae/*`.
- Запрет изменений истории (append‑only) соблюдается; секреты не попадают в VCS.
- CI проходит с верификацией цепочки через MCP/CLI; документация обновлена.

## 📞 **Контакты и поддержка**

**Technical Lead:** [Имя/Контакт]
**Project Manager:** [Имя/Контакт]
**DevOps:** [Имя/Контакт]

**Ежедневные стендапы:** 10:00 UTC
**Weekly review:** Пятница 16:00 UTC
**Emergency contact:** [Slack/Phone]

---

**Документ версия:** 1.0  
**Дата создания:** 2025-11-13  
**Статус:** Ready for implementation  
**Следующий review:** 2025-11-20
