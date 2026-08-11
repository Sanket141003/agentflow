/**
 * Scheduled function — runs every minute via nhost cron.
 * Finds all workflows with a 'scheduled' trigger whose cron expression
 * matches the current time and fires them.
 *
 * Configure in nhost dashboard: Functions → Scheduled → Every minute
 * or add to nhost.toml once nhost supports it.
 */
import type { Request, Response } from 'express';

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const FUNCTIONS_URL = process.env.NHOST_FUNCTIONS_URL!;

async function adminQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as Record<string, unknown>;
}

function cronMatches(cron: string): boolean {
  // Simple cron check: "minute hour dom month dow"
  const now = new Date();
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [minute, hour, , , dow] = parts;
  const match = (field: string, value: number) =>
    field === '*' || parseInt(field) === value;
  return (
    match(minute, now.getUTCMinutes()) &&
    match(hour, now.getUTCHours()) &&
    match(dow, now.getUTCDay())
  );
}

export default async function handler(req: Request, res: Response) {
  // Verify this is called from nhost internal or a trusted source
  const secret = req.headers['x-nhost-webhook-secret'];
  if (secret !== process.env.NHOST_WEBHOOK_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const data = await adminQuery(`
      query GetScheduledWorkflows {
        workflow_triggers(where: { trigger_type: { _eq: "scheduled" }, is_active: { _eq: true } }) {
          id workflow_id config
          workflow { id org_id is_active }
        }
      }
    `) as { workflow_triggers: { id: string; workflow_id: string; config: Record<string, unknown>; workflow: { id: string; org_id: string; is_active: boolean } }[] };

    const triggered: string[] = [];

    for (const trigger of data.workflow_triggers) {
      if (!trigger.workflow.is_active) continue;
      const cron = trigger.config.cron as string;
      if (!cron || !cronMatches(cron)) continue;

      // Fire via the triggerWorkflowRun function with admin context
      const runRes = await adminQuery(`
        mutation CreateScheduledRun($workflow_id: uuid!, $org_id: uuid!) {
          insert_workflow_runs_one(object: {
            workflow_id: $workflow_id,
            org_id: $org_id,
            trigger_type: "scheduled",
            status: "pending",
            started_at: "now()"
          }) { id }
        }
      `, { workflow_id: trigger.workflow_id, org_id: trigger.workflow.org_id }) as { insert_workflow_runs_one: { id: string } };

      triggered.push(runRes.insert_workflow_runs_one.id);

      // Delegate to triggerWorkflowRun handler
      fetch(`${FUNCTIONS_URL}/triggerWorkflowRun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET },
        body: JSON.stringify({
          input: { workflow_id: trigger.workflow_id },
          session_variables: { 'x-hasura-role': 'admin', 'x-hasura-user-id': '00000000-0000-0000-0000-000000000000' },
        }),
      }).catch(console.error);
    }

    return res.json({ triggered: triggered.length, run_ids: triggered });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ message: msg });
  }
}
