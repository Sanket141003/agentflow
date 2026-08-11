# AgentFlow — AI Agent Workflow Builder

A full-stack AI workflow builder (mini n8n) built with Next.js, nhost, Hasura, PostgreSQL, and GraphQL.

## Live Demo

Deployed at: **[https://agentflow-ai.vercel.app](https://agentflow-ai.vercel.app)** *(update after deploy)*

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind |
| Auth | nhost Auth (email/password) |
| Database | PostgreSQL via nhost |
| GraphQL API | Hasura (queries, mutations, subscriptions) |
| Backend Functions | nhost Functions (TypeScript/Node 18) |
| LLM | Groq API (llama3-8b-8192) — stubbed if no key |
| Hosting | Vercel (frontend) + nhost cloud (backend) |

---

## Local Setup

### Prerequisites

- Node.js 18+
- [nhost CLI](https://docs.nhost.io/development/cli/getting-started): `npm install -g nhost`
- A free [nhost project](https://app.nhost.io)
- A free [Groq API key](https://console.groq.com) *(optional — falls back to stub)*

### 1. Clone & install

```bash
git clone <repo-url>
cd ai-workflow-builder
cd frontend && npm install
```

### 2. Configure environment

Copy and fill in `frontend/.env.local`:

```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=<your-subdomain>
NEXT_PUBLIC_NHOST_REGION=<your-region>   # e.g. eu-central-1
```

Find these in your nhost dashboard → Project → Settings.

### 3. Set up nhost (cloud)

1. Create a project at [app.nhost.io](https://app.nhost.io)
2. In your project dashboard, go to **Database → SQL** and run `nhost/migrations/default/1_init/up.sql`
3. Go to **Hasura Console → Data → Track all tables** and track all tables
4. Apply the metadata from `nhost/metadata/` via Hasura CLI or manually configure permissions in the console following the YAML files
5. Add your Actions (`triggerWorkflowRun`, `approveStep`, `webhookTriggerWorkflow`) in Hasura Console → Actions

### 4. Deploy functions

```bash
# From repo root
nhost up          # starts local nhost stack
# or push to nhost cloud via nhost CLI
nhost deploy
```

Set these secrets in nhost dashboard → Secrets:
- `GROQ_API_KEY` — your Groq key (or leave blank to use stub)

### 5. Run frontend locally

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Running with Local nhost (Docker)

```bash
# Install nhost CLI
npm install -g nhost

# Start full local stack (Postgres + Hasura + Auth + Functions)
nhost up

# In another terminal
cd frontend && npm run dev
```

With local nhost, update `.env.local`:
```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=localhost
NEXT_PUBLIC_NHOST_REGION=local
```

---

## Deploying to Vercel

```bash
cd frontend
npx vercel --prod
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_NHOST_SUBDOMAIN`
- `NEXT_PUBLIC_NHOST_REGION`

---

## LLM API Note

The app uses **Groq** (free tier) for `llm_call` steps. If `GROQ_API_KEY` is not set in nhost secrets, the function returns a clearly labeled stub response with an 800ms artificial delay so the flow still works end-to-end.

To get a Groq key: [console.groq.com](https://console.groq.com) → API Keys → Create.

---

## Testing the Final Scenario

1. **Create two organizations** (Org A, Org B) each with different users and roles
2. **In Org A**, build a workflow with: `llm_call` → `conditional_branch` → `http_request` → `approval_gate`
3. **Add a webhook trigger** with a secret — test it with:
   ```bash
   curl -X POST https://<nhost-functions-url>/webhookTriggerWorkflow \
     -H "Content-Type: application/json" \
     -d '{"input": {"workflow_id": "<id>", "secret": "<your-secret>", "input_data": {}}}'
   ```
4. **Run manually** — watch live step-by-step status stream, approve the gate
5. **Log in as Org B user** — verify no Org A data is visible or accessible

---

## Project Structure

```
.
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Root redirect
│   │   ├── login/page.tsx     # Auth page
│   │   ├── dashboard/page.tsx # Main workflow dashboard
│   │   ├── onboarding/page.tsx# Create first org
│   │   └── settings/page.tsx  # Org settings + members
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── WorkflowCard.tsx   # Run button + live run link
│   │   ├── WorkflowEditor.tsx # Create/edit workflow
│   │   ├── WorkflowBuilder.tsx# Drag-drop step builder
│   │   ├── StepConfigForm.tsx # Per-step-type config UI
│   │   ├── RunMonitor.tsx     # Live subscription + approve UI
│   │   ├── QuotaBar.tsx       # Usage indicator
│   │   └── StatusBadge.tsx
│   └── lib/
│       ├── nhost.ts           # nhost client
│       ├── auth-context.tsx   # Auth state
│       ├── org-context.tsx    # Org/role state
│       ├── graphql-hooks.ts   # Typed fetch wrapper
│       ├── queries.ts         # All GQL operations
│       └── types.ts
├── nhost/
│   ├── migrations/default/1_init/up.sql   # Full schema
│   ├── metadata/                           # Hasura tables + permissions
│   │   ├── actions.yaml
│   │   └── databases/default/tables/
│   ├── functions/
│   │   ├── triggerWorkflowRun.ts  # Main Action handler
│   │   ├── approveStep.ts         # Approval gate Action
│   │   ├── webhookTriggerWorkflow.ts
│   │   └── scheduledWorkflows.ts
│   └── nhost.toml
└── README.md
```
