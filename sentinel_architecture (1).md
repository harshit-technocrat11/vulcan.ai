# Sentinel --- System Architecture & Monorepo Structure

## 1. Purpose

Sentinel is a security-operations platform that:

-   receives security alerts from external security infrastructure,
-   normalizes and enriches those alerts,
-   processes asynchronous workloads through workers,
-   uses an AI/agentic layer for investigation and decision-making,
-   persists alerts, incidents, conversations, and agent state,
-   exposes a dashboard through a web application,
-   communicates with operators through external channels using Caspian.

The system is organized as a **Turborepo monorepo** containing
independently deployable applications and reusable packages.

------------------------------------------------------------------------

# 2. High-Level Architecture

``` text
                    ┌──────────────────────────┐
                    │     Security Sources     │
                    │                          │
                    │ Wazuh / Suricata / Zeek │
                    │ Other Security Systems   │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │        Ingestion         │
                    │       Node.js / TS       │
                    │                          │
                    │ Validate                 │
                    │ Normalize                │
                    │ Publish                  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                         ┌─────────────┐
                         │    Redis    │
                         │ Queue / Bus │
                         └──────┬──────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
        ┌─────────────────┐           ┌─────────────────┐
        │     Worker      │           │       AI        │
        │   Node.js / TS  │           │ Python / FastAPI│
        │                 │           │      / uv       │
        │ Async jobs      │           │                 │
        │ Enrichment      │           │ LangChain       │
        │ Correlation     │           │ Agents          │
        │ Notifications   │           │ Tools           │
        └────────┬────────┘           │ Memory          │
                 │                    │ Caspian         │
                 │                    └────────┬────────┘
                 │                             │
                 └──────────────┬──────────────┘
                                ▼
                         ┌─────────────┐
                         │ PostgreSQL  │
                         │ Persistence │
                         └──────┬──────┘
                                │
                                ▼
                       ┌────────────────┐
                       │   Express API  │
                       │    Node / TS   │
                       └───────┬────────┘
                               │
                               ▼
                       ┌────────────────┐
                       │   Next.js Web  │
                       │    Dashboard   │
                       └────────────────┘


                    AI / Communication Layer
                              │
                              ▼
                           Caspian
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                  Slack    Telegram   Discord
```

------------------------------------------------------------------------

# 3. Core Architectural Principle

The monorepo follows one simple rule:

> **`apps/` contains independently deployable services.**
>
> **`packages/` contains reusable libraries, domain modules, and shared
> infrastructure.**

Examples:

-   `apps/api` can be deployed independently.
-   `apps/ai` can be scaled independently.
-   `packages/db` is shared by services that need database access.
-   `packages/threat-intel` contains reusable threat-intelligence logic.

This keeps service boundaries clear while avoiding unnecessary
duplication.

------------------------------------------------------------------------

# 4. Monorepo Structure

``` text
sentinel/
│
├── apps/
│   │
│   ├── web/
│   │   └── Next.js dashboard
│   │
│   ├── api/
│   │   └── Express.js application API
│   │
│   ├── ai/
│   │   └── Python + FastAPI + uv + LangChain
│   │
│   ├── ingestion/
│   │   └── Node.js + TypeScript alert ingestion
│   │
│   └── worker/
│       └── Node.js + TypeScript background workers
│
├── packages/
│   │
│   ├── db/
│   │   └── PostgreSQL client, schema and repositories
│   │
│   ├── queue/
│   │   └── Redis / queue abstractions
│   │
│   ├── threat-intel/
│   │   └── Threat intelligence providers and normalization
│   │
│   ├── schemas/
│   │   └── Shared DTOs, event schemas and contracts
│   │
│   ├── auth/
│   │   └── Authentication / authorization utilities
│   │
│   ├── config/
│   │   └── Shared configuration conventions
│   │
│   └── logger/
│       └── Structured logging utilities
│
├── infrastructure/
│   ├── docker/
│   ├── postgres/
│   ├── redis/
│   └── monitoring/
│
├── docs/
│   ├── architecture/
│   ├── agents/
│   └── decisions/
│
├── scripts/
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

------------------------------------------------------------------------

# 5. Application Responsibilities

## 5.1 `apps/web` --- Dashboard

### Technology

-   Next.js
-   TypeScript
-   Tailwind / UI component library

### Responsibility

The web application is the operator-facing dashboard.

It should handle:

-   login UI,
-   alert views,
-   incident views,
-   investigation status,
-   threat intelligence information,
-   AI investigation results,
-   agent activity,
-   configuration,
-   operator actions.

### Communication

The browser communicates with the Express API.

``` text
Browser
   │
   ▼
Express API
```

The frontend should **not directly call LangChain, LLM providers,
databases, or internal workers**.

------------------------------------------------------------------------

# 6. `apps/api` --- Main Application API

### Technology

-   Node.js
-   TypeScript
-   Express.js

### Responsibility

The API is the main synchronous application/control API.

It handles:

-   authentication,
-   authorization,
-   RBAC,
-   users,
-   alerts,
-   incidents,
-   dashboard data,
-   configuration,
-   AI job creation,
-   investigation status,
-   frontend-facing APIs.

Example routes:

``` text
POST   /auth/login
GET    /alerts
GET    /alerts/:id
GET    /incidents
GET    /incidents/:id
POST   /incidents/:id/investigate
GET    /investigations/:id
POST   /incidents/:id/actions
```

The API should not perform long-running AI investigations directly.

------------------------------------------------------------------------

# 7. `apps/ai` --- AI / Agentic Service

### Technology

-   Python
-   FastAPI
-   uv
-   LangChain
-   LLM providers
-   Caspian integration

This is the core agentic system.

### Responsibility

The AI service handles:

-   agent execution,
-   agent tools,
-   reasoning,
-   investigation workflows,
-   memory,
-   LLM calls,
-   AI-specific guardrails,
-   agent-specific middleware,
-   communication through Caspian.

Conceptually:

``` text
FastAPI
   │
   ▼
Agent Service
   │
   ├── Agents
   ├── Tools
   ├── Memory
   ├── Middleware
   ├── LLM Providers
   └── Caspian
```

### Important boundary

The AI service should not contain business logic for the entire
platform.

Instead, agents should use well-defined tools/services:

``` text
Agent
  │
  ├── get_alert()
  ├── query_events()
  ├── search_threat_intel()
  ├── create_incident()
  ├── update_incident()
  └── send_notification()
```

This keeps agents replaceable and testable.

------------------------------------------------------------------------

# 8. AI Service Structure

Recommended structure:

``` text
apps/ai/
│
├── app/
│   │
│   ├── main.py
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── agent.py
│   │   │   ├── incidents.py
│   │   │   └── health.py
│   │   └── dependencies.py
│   │
│   ├── agents/
│   │   ├── decision/
│   │   │   ├── agent.py
│   │   │   ├── prompts.py
│   │   │   └── tools.py
│   │   │
│   │   ├── triage/
│   │   │   ├── agent.py
│   │   │   ├── prompts.py
│   │   │   └── tools.py
│   │   │
│   │   ├── threat_intel/
│   │   │   ├── agent.py
│   │   │   └── tools.py
│   │   │
│   │   └── incident/
│   │       ├── agent.py
│   │       └── tools.py
│   │
│   ├── tools/
│   │   ├── alerts.py
│   │   ├── incidents.py
│   │   ├── threat_intel.py
│   │   ├── search.py
│   │   └── notifications.py
│   │
│   ├── memory/
│   │   ├── short_term.py
│   │   ├── long_term.py
│   │   └── store.py
│   │
│   ├── integrations/
│   │   ├── caspian/
│   │   │   ├── client.py
│   │   │   ├── handlers.py
│   │   │   └── channels.py
│   │   │
│   │   ├── llm/
│   │   │   ├── openai.py
│   │   │   ├── anthropic.py
│   │   │   └── google.py
│   │   │
│   │   └── redis/
│   │       └── client.py
│   │
│   ├── middleware/
│   │   ├── auth.py
│   │   ├── guardrails.py
│   │   └── logging.py
│   │
│   ├── services/
│   │   ├── agent_service.py
│   │   ├── incident_service.py
│   │   └── memory_service.py
│   │
│   └── config.py
│
├── tests/
├── pyproject.toml
└── uv.lock
```

------------------------------------------------------------------------

# 9. Why Caspian Is Inside `apps/ai`

Caspian is an external communication integration.

It should not be directly embedded inside every agent.

Bad:

``` text
Decision Agent
   └── Caspian SDK
```

Better:

``` text
Agent
   │
   ▼
Notification Service
   │
   ▼
Caspian Adapter
   │
   ▼
Caspian
   │
   ├── Slack
   ├── Telegram
   └── Discord
```

This means the agent only knows:

``` python
await notification_service.send(...)
```

It does not need to know which communication provider is being used.

This also makes replacing Caspian easier later.

------------------------------------------------------------------------

# 10. `apps/ingestion` --- Security Alert Ingestion

### Technology

-   Node.js
-   TypeScript

### Responsibility

The ingestion service is responsible for receiving alerts from external
security infrastructure.

Potential sources:

``` text
Wazuh
Suricata
Zeek
Other security systems
```

Flow:

``` text
Security Source
      │
      ▼
Ingestion Service
      │
      ├── Validate
      ├── Normalize
      └── Publish
      │
      ▼
Redis
```

Recommended structure:

``` text
apps/ingestion/
│
├── src/
│   ├── sources/
│   │   ├── wazuh/
│   │   ├── suricata/
│   │   └── zeek/
│   │
│   ├── normalizer/
│   ├── validators/
│   ├── publisher/
│   └── main.ts
│
├── tests/
└── package.json
```

The ingestion service should remain lightweight.

It should not perform expensive AI processing.

------------------------------------------------------------------------

# 11. `apps/worker` --- Background Processing

### Technology

-   Node.js
-   TypeScript
-   Redis-backed queue

The worker is for asynchronous and retryable work.

Examples:

-   alert enrichment,
-   alert correlation,
-   threat intelligence lookups,
-   scheduled jobs,
-   notification delivery,
-   cleanup jobs,
-   retries,
-   background processing.

Recommended structure:

``` text
apps/worker/
│
├── src/
│   ├── consumers/
│   │   ├── alert.consumer.ts
│   │   ├── incident.consumer.ts
│   │   └── notification.consumer.ts
│   │
│   ├── jobs/
│   │   ├── enrich-alert.job.ts
│   │   ├── correlate-alert.job.ts
│   │   ├── threat-intel.job.ts
│   │   └── notification.job.ts
│   │
│   └── main.ts
│
├── tests/
└── package.json
```

### Important rule

`worker` means **asynchronous execution**.

It should not become a folder for random backend logic.

------------------------------------------------------------------------

# 12. `packages/threat-intel`

Threat intelligence should initially be a reusable domain package rather
than its own application.

``` text
packages/threat-intel/
│
├── providers/
│   ├── virustotal.ts
│   ├── abuseipdb.ts
│   ├── mitre.ts
│   └── cve.ts
│
├── normalizer.ts
├── service.ts
└── types.ts
```

The AI agent should not directly call four different external APIs.

Instead:

``` text
AI Agent
   │
   ▼
Threat Intelligence Tool
   │
   ▼
Threat Intelligence Service
   │
   ├── VirusTotal
   ├── AbuseIPDB
   ├── MITRE ATT&CK
   └── CVE
```

This creates one clean abstraction around threat intelligence.

If the threat-intelligence subsystem later becomes large enough to
require independent scaling, it can be promoted to its own application.

------------------------------------------------------------------------

# 13. `packages/db`

The database package owns common PostgreSQL access.

``` text
packages/db/
│
├── schema/
│   ├── users
│   ├── alerts
│   ├── incidents
│   ├── threat_intel
│   ├── conversations
│   ├── messages
│   └── agent_runs
│
├── repositories/
│   ├── alert.repository
│   ├── incident.repository
│   └── conversation.repository
│
├── client
└── migrations
```

Potential persisted entities:

``` text
User
Alert
Incident
ThreatIntelResult
Investigation
AgentRun
Conversation
Message
Notification
```

The exact schema should evolve with the domain.

------------------------------------------------------------------------

# 14. `packages/queue`

All Redis/queue access should have a consistent abstraction.

``` text
packages/queue/
│
├── client
├── producers
├── consumers
├── events
└── types
```

Example events:

``` text
alert.created
alert.enrich
alert.enriched
incident.created
incident.investigate
investigation.completed
notification.send
```

The goal is to avoid every service implementing its own Redis
conventions.

------------------------------------------------------------------------

# 15. `packages/schemas`

This package contains shared contracts.

Examples:

``` text
AlertCreatedEvent
IncidentCreatedEvent
InvestigationRequestedEvent
InvestigationCompletedEvent
NotificationRequestedEvent
```

Example:

``` json
{
  "event": "alert.created",
  "alertId": "alert_123",
  "source": "wazuh",
  "severity": 9,
  "timestamp": "..."
}
```

These contracts are important because multiple services communicate
asynchronously.

------------------------------------------------------------------------

# 16. End-to-End Alert Flow

## Step 1 --- Security alert arrives

``` text
Wazuh / Suricata / Zeek
          │
          ▼
      Ingestion
```

The ingestion service validates and normalizes the incoming event.

------------------------------------------------------------------------

## Step 2 --- Publish event

``` text
Ingestion
    │
    ▼
Redis
    │
    └── alert.created
```

The ingestion service does not perform expensive processing.

------------------------------------------------------------------------

## Step 3 --- Worker consumes event

``` text
Redis
  │
  ▼
Worker
  │
  ├── enrich
  ├── correlate
  └── threat intelligence
```

------------------------------------------------------------------------

## Step 4 --- Persist alert

``` text
Worker
   │
   ▼
PostgreSQL
```

The normalized alert is now available to the rest of the system.

------------------------------------------------------------------------

## Step 5 --- Trigger investigation

If the alert requires AI investigation:

``` text
Worker / API
     │
     ▼
Redis
     │
     └── investigation.requested
```

The AI service consumes or receives the investigation request.

------------------------------------------------------------------------

# 17. AI Investigation Flow

``` text
Investigation Request
        │
        ▼
    FastAPI AI
        │
        ▼
     Agent
        │
        ├── get_alert()
        │
        ├── query_events()
        │
        ├── search_threat_intel()
        │
        ├── analyze()
        │
        └── create/update incident
        │
        ▼
    PostgreSQL
```

The agent is responsible for deciding which tools to use and in what
order.

The tools are responsible for actually performing operations.

This separation is critical.

------------------------------------------------------------------------

# 18. Agent vs Tool

## Agent

Responsible for:

-   reasoning,
-   deciding the next action,
-   selecting tools,
-   interpreting results,
-   producing conclusions.

## Tool

Responsible for:

-   querying a database,
-   calling an API,
-   retrieving an alert,
-   searching threat intelligence,
-   creating an incident,
-   sending a notification.

Example:

``` text
Agent
  │
  ├── "I need information about this IP."
  │
  ▼
search_threat_intel()
  │
  ▼
Threat Intelligence Service
  │
  ▼
Result
  │
  ▼
Agent interprets result
```

------------------------------------------------------------------------

# 19. AI Memory

There are two different memory concepts.

## Short-term memory

Conversation/thread-level context.

``` text
User
  │
  ▼
Conversation
  │
  ▼
Agent State
  │
  ▼
Persistent Checkpoint
```

This allows the agent to continue an existing
investigation/conversation.

## Long-term memory

Information that should survive across different conversations.

Examples:

``` text
Operator preferences
Past investigation context
Known organizational facts
Persistent agent memories
```

Conceptually:

``` text
User
  │
  ├── Conversation A
  ├── Conversation B
  └── Long-term Memory
```

Memory and persistence should be treated as separate architectural
concepts:

> Memory = information available to the agent.

> Persistence = mechanism that allows that information to survive
> process execution.

------------------------------------------------------------------------

# 20. Why API and AI Are Separate

The Express API is the application/control plane.

The FastAPI AI service is the agent execution plane.

``` text
                 Web
                  │
                  ▼
             Express API
             /         \
            /           \
           ▼             ▼
      PostgreSQL       AI Service
                         │
                      LangChain
                         │
                 ┌───────┼───────┐
                 ▼       ▼       ▼
               Tools   Memory    LLM
```

The frontend should never directly communicate with the AI model
provider.

This separation allows the AI service to be:

-   deployed independently,
-   scaled independently,
-   upgraded independently,
-   tested independently,
-   protected with AI-specific controls.

------------------------------------------------------------------------

# 21. Why FastAPI + Node.js Is Fine

The system intentionally uses different technologies for different
responsibilities.

``` text
TypeScript / Node.js
    ├── API
    ├── Ingestion
    └── Worker

Python
    └── AI / LangChain / FastAPI
```

Communication between Node.js and Python occurs through network APIs
and/or Redis.

The language boundary itself is not expected to be the main source of
latency.

For AI requests, the dominant latency will usually come from:

``` text
LLM calls
External APIs
Multiple tool calls
Agent reasoning
```

rather than:

``` text
Express → FastAPI
```

------------------------------------------------------------------------

# 22. Fast vs Long-Running Requests

Not every AI operation should use the same execution model.

## Short AI operation

Example:

> Summarize this alert.

Flow:

``` text
Web
 │
 ▼
Express API
 │
 ▼
FastAPI AI
 │
 ▼
LangChain Agent
 │
 ▼
LLM
 │
 ▼
Response
```

------------------------------------------------------------------------

## Long-running investigation

Example:

> Investigate this incident using threat intelligence and determine the
> likely attack technique.

Flow:

``` text
Web
 │
 ▼
Express API
 │
 ▼
Create Investigation Job
 │
 ▼
Redis
 │
 ▼
Worker / AI Service
 │
 ▼
LangChain Agent
 │
 ├── Tool
 ├── LLM
 ├── Tool
 ├── LLM
 └── Analysis
 │
 ▼
PostgreSQL
```

The API immediately returns:

``` json
{
  "investigationId": "inv_123",
  "status": "queued"
}
```

The frontend can then receive status updates through SSE/WebSocket or
poll the investigation status endpoint.

------------------------------------------------------------------------

# 23. Why We Need Redis

Redis acts as the asynchronous backbone.

It decouples services.

Without a queue:

``` text
Ingestion
   │
   ▼
Worker
   │
   ▼
AI
```

Everything becomes tightly coupled.

With Redis:

``` text
Ingestion
   │
   ▼
Redis
   │
   ├── Worker
   ├── AI
   └── Other consumers
```

This provides:

-   buffering,
-   asynchronous processing,
-   retry mechanisms,
-   decoupling,
-   horizontal worker scaling,
-   event-driven communication.

------------------------------------------------------------------------

# 24. Example Long-Running Investigation

Suppose an operator clicks:

> Investigate Incident #123

### Request

``` text
Web
 ↓
Express
 ↓
POST /incidents/123/investigate
```

### API

The API creates an investigation record:

``` text
investigation_id = inv_123
status = queued
```

Then publishes:

``` text
investigation.requested
```

### Worker / AI

The AI service starts:

``` text
inv_123
   │
   ▼
Load incident
   │
   ▼
Load related alerts
   │
   ▼
Query threat intelligence
   │
   ▼
Analyze evidence
   │
   ▼
Determine severity / technique
   │
   ▼
Create recommendation
   │
   ▼
Persist result
```

### Dashboard

The frontend sees:

``` text
Investigation #123

✓ Incident loaded
✓ Related alerts analyzed
✓ Threat intelligence checked
⟳ Generating assessment
```

Then:

``` text
✓ Investigation completed

Severity: HIGH
Likely Technique: ...
Confidence: ...
Recommendation: ...
```

------------------------------------------------------------------------

# 25. External Communication Through Caspian

The AI system may need to communicate with operators through external
channels.

The abstraction should be:

``` text
Agent
  │
  ▼
Notification Service
  │
  ▼
Caspian Adapter
  │
  ▼
Caspian
  │
  ├── Slack
  ├── Telegram
  └── Discord
```

Example use cases:

``` text
Critical incident detected
        ↓
AI / Incident Service
        ↓
Notification Service
        ↓
Caspian
        ↓
Operator channel
```

Caspian remains an integration detail rather than becoming part of the
core agent logic.

------------------------------------------------------------------------

# 26. Scaling Strategy

Initially:

``` text
1 × API
1 × AI
1 × Worker
1 × Ingestion
1 × PostgreSQL
1 × Redis
```

As load increases:

``` text
                Load Balancer
                     │
              ┌──────┼──────┐
              ▼      ▼      ▼
             API    API    API
                     │
                   Redis
                     │
             ┌───────┼────────┐
             ▼       ▼        ▼
            AI      AI       AI
```

Workers can scale independently:

``` text
Redis
 │
 ├── Worker 1
 ├── Worker 2
 ├── Worker 3
 └── Worker 4
```

The AI service can also scale independently from the API.

------------------------------------------------------------------------

# 27. What Should NOT Happen

## Do not put everything in the API

Bad:

``` text
Express
 ├── API
 ├── AI
 ├── Queue processing
 ├── Threat intelligence
 └── Long-running jobs
```

This makes the API difficult to scale and maintain.

------------------------------------------------------------------------

## Do not put everything in the worker

Bad:

``` text
Worker
 ├── API logic
 ├── AI logic
 ├── Database logic
 ├── Notifications
 └── Random utilities
```

The worker should primarily execute asynchronous jobs.

------------------------------------------------------------------------

## Do not put Caspian inside every agent

Bad:

``` text
Agent
 └── Caspian SDK
```

Use:

``` text
Agent
 └── Notification Service
       └── Caspian Adapter
```

------------------------------------------------------------------------

## Do not make the frontend call the AI service directly

Bad:

``` text
Web → FastAPI AI
```

Preferred:

``` text
Web → Express API → AI Service
```

This gives the API ownership of authentication, authorization and
application-level access control.

------------------------------------------------------------------------

# 28. Communication Rules

Use the following conventions:

### HTTP

Use for:

-   synchronous API requests,
-   frontend APIs,
-   service-to-service operations where immediate response is required.

``` text
Web → API
API → AI
```

### Redis / Queue

Use for:

-   asynchronous work,
-   events,
-   background jobs,
-   retries,
-   long-running investigations.

``` text
Ingestion → Redis → Worker
API → Redis → AI
```

### PostgreSQL

Use for:

-   durable application state,
-   alerts,
-   incidents,
-   investigations,
-   users,
-   conversations,
-   agent state/memory where appropriate.

### SSE / WebSocket

Use for:

-   real-time investigation progress,
-   agent activity,
-   dashboard updates,
-   live status.

------------------------------------------------------------------------

# 29. Development Environment

The recommended local environment should run:

``` text
Docker Compose
│
├── PostgreSQL
├── Redis
└── Supporting infrastructure
```

Applications can run locally during development:

``` text
pnpm dev

apps/web
apps/api
apps/ingestion
apps/worker
```

AI:

``` text
cd apps/ai
uv sync
uv run fastapi dev app/main.py
```

Turborepo can orchestrate the overall development workflow while `uv`
manages Python dependencies inside `apps/ai`.

------------------------------------------------------------------------

# 30. Final Responsibility Map

  Component        Technology              Responsibility
  ---------------- ----------------------- ---------------------------------
  `web`            Next.js / TS            Dashboard
  `api`            Express / TS            Main application API
  `ingestion`      Node / TS               Security alert ingestion
  `worker`         Node / TS               Async/background jobs
  `ai`             FastAPI / Python / uv   Agentic AI system
  `db`             PostgreSQL              Persistent data
  `queue`          Redis                   Async messaging/jobs
  `threat-intel`   TS package              Threat intelligence abstraction
  `schemas`        Shared                  Service contracts
  `auth`           Shared                  Auth/RBAC utilities
  `Caspian`        External integration    Agent/operator communication

------------------------------------------------------------------------

# 31. Final Architecture

``` text
                         ┌──────────────────────┐
                         │   Security Sources   │
                         │                      │
                         │ Wazuh / Suricata     │
                         │ Zeek / Other SIEM    │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │      INGESTION       │
                         │      Node / TS       │
                         └──────────┬───────────┘
                                    │
                                    ▼
                              ┌───────────┐
                              │   REDIS   │
                              │ Queue/Bus │
                              └─────┬─────┘
                                    │
                 ┌──────────────────┴─────────────────┐
                 │                                    │
                 ▼                                    ▼
        ┌──────────────────┐                 ┌──────────────────┐
        │      WORKER      │                 │       AI         │
        │    Node / TS     │                 │ Python / FastAPI │
        │                  │                 │      + uv         │
        │ Enrichment       │                 │                  │
        │ Correlation      │                 │ LangChain        │
        │ Background Jobs  │                 │ Agents           │
        │ Notifications    │                 │ Tools            │
        └────────┬─────────┘                 │ Memory           │
                 │                           │ Guardrails       │
                 │                           │ Caspian          │
                 │                           └────────┬─────────┘
                 │                                    │
                 └────────────────┬───────────────────┘
                                  ▼
                           ┌─────────────┐
                           │ PostgreSQL  │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │ Express API │
                           │   Node / TS │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │  Next.js    │
                           │  Dashboard  │
                           └─────────────┘


                         AI Communication
                               │
                               ▼
                            Caspian
                               │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
                Slack       Telegram      Discord
```

------------------------------------------------------------------------

# 32. Design Goals

The architecture should optimize for:

1.  **Clear service boundaries**
2.  **Independent scaling**
3.  **Asynchronous processing**
4.  **Persistent state**
5.  **Replaceable AI providers**
6.  **Replaceable external integrations**
7.  **Observable agent execution**
8.  **Reliable background processing**
9.  **Secure API boundaries**
10. **Easy future expansion**

The system should start as a manageable monorepo but preserve the
ability to evolve into independently scaled services.

------------------------------------------------------------------------

# 33. V1 Implementation Order

Recommended implementation sequence:

``` text
Phase 1
├── Turborepo
├── Web
├── Express API
├── PostgreSQL
└── Authentication

Phase 2
├── Ingestion
├── Redis
├── Worker
└── Alert pipeline

Phase 3
├── Threat Intelligence
├── Alert enrichment
└── Incident creation

Phase 4
├── FastAPI AI service
├── LangChain
├── First agent
└── AI tools

Phase 5
├── Agent memory
├── Persistent investigation state
├── Streaming
└── Guardrails

Phase 6
├── Caspian integration
├── Slack/Telegram/Discord communication
└── Operator interaction

Phase 7
├── Observability
├── Metrics
├── Tracing
├── Evaluation
└── Production deployment
```

This allows the team to build the system incrementally without
prematurely splitting every component into a separate service.
