# AgentFlow — Design Write-Up

## Schema Reasoning

### Core relationships

```
organizations
  └── org_members (user_id, org_id, role)
  └── workflows
        └── workflow_steps   (ordered, typed, JSONB config)
        └── workflow_triggers (type + config)
        └── workflow_runs
              └── step_runs  (one per step per run)
```

**organizations** holds the quota counters (`quota_used`, `quota_limit`, `quota_period_start`). The period resets on the first run of a new calendar month — checked inside the Action handler rather than a cron, keeping it simple and correct without requiring a separate job.

**workflow_steps** uses a JSONB `config` field rather than one table per step type. This keeps the schema stable as step types evolve and avoids sparse nullable columns. The `step_type` enum constrains valid values at the DB level.

**step_runs** stores both `input_data` and `output_data` as JSONB. This gives the live subscription enough to render every step's result without a separate query, and lets the `conditional_branch` step inspect the previous output by simply receiving it as `input_data`.

**workflow_runs** has an explicit `paused` status distinct from `running`. This is load-bearing: the subscription filter on status lets the frontend know to show the approve button without polling.

---

## Two Permission Layers

### Layer 1 — Hasura row-level permissions (org + role scoping)

Every table's `select`, `insert`, `update`, and `delete` permissions include a filter that cross-checks `org_members`:

```yaml
filter:
  org_id:
    _in:
      _select:
        table: org_members
        column: org_id
        where:
          user_id: { _eq: X-Hasura-User-Id }
```

This means **role alone is not enough** — a user can only see or mutate rows that belong to an org they are a member of. An editor in Org A literally cannot query Org B data even if they know the UUID, because the row filter returns no rows.

For write operations, an additional role check is applied:
```yaml
where:
  _and:
    - user_id: { _eq: X-Hasura-User-Id }
    - role: { _in: [owner, editor] }
```

Viewers never match the `_in: [owner, editor]` filter, so they are locked out of mutations at the database layer — not just hidden in the UI.

### Layer 2 — Action handler step-level gating

Layer 1 handles *who can see and modify data*. Layer 2 handles *which steps can be used and who can act on them at runtime*.

**Owner-only step types** (`db_write`, `notify`) and trigger types (`webhook`, `database_event`) are enforced inside `triggerWorkflowRun` **before** the run is created:

```typescript
const ownerOnlyTypes = ['db_write', 'notify'];
for (const step of workflow.steps) {
  if (ownerOnlyTypes.includes(step.step_type) && member.role !== 'owner') {
    return res.status(403).json({ message: `Only owners can run workflows with ${step.step_type} steps` });
  }
}
```

This is enforced in the Action handler — not in Hasura permissions — because a `db_write` step's *presence* in the config doesn't mean running it should be blocked by a row filter. The permission is about the *act of executing* that step type.

**Approval gate** is the clearest example of why Layer 2 must live in code and not the DB. When `approveStep` is called:

1. It loads the step_run and workflow_run
2. It queries `org_members` for the caller's role in that specific org
3. It rejects `viewer` role with a 403 — even though the step_run row is *readable* by the viewer
4. Only then does it mark the step approved and resume execution

A DB permission could prevent a viewer from *writing* the `approved_by` field, but it cannot stop them from calling the Action with a fabricated payload and having the Action resume the run. The check must be in the handler.

---

## Approval Gate Pause/Resume

When the executor hits an `approval_gate` step:

1. The step_run status is set to `paused`
2. The workflow_run status is set to `paused`
3. The Action returns immediately with `{ status: 'paused', workflow_run_id }`

The frontend's GraphQL subscription (`subscription on step_runs where workflow_run_id = X`) receives the update within milliseconds. The `RunMonitor` component sees `status === 'paused'` on a step of type `approval_gate` and renders the Approve button — only shown if the viewer's role is `owner` or `editor`.

When `approveStep` is called:

1. Role check (Layer 2) — reject if viewer
2. Mark the specific step_run as `completed` with `approved_by` + `approved_at`
3. Set workflow_run back to `running`
4. Continue executing remaining steps in the same function call
5. If another `approval_gate` is encountered, pause again and return

This means the approval flow supports multiple gates in a single workflow. Each pause is a clean stop — no background jobs, no polling. The subscription keeps the frontend in sync throughout.

---

## Retry and Quota

**Retries**: `llm_call` and `http_request` steps retry up to 2 times with exponential backoff (500ms, 1000ms). The `attempt_count` on the step_run is incremented each attempt so the UI can show "retry 2" live via the subscription.

**Quota**: Checked at run start against `quota_used >= quota_limit`. Incremented only on successful run completion. Period resets automatically at the start of each calendar month, detected lazily on the next run attempt.
