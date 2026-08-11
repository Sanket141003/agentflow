import type { Request, Response } from 'express';

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MAX_RETRIES = 2;

async function adminQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as Record<string, unknown>;
}

async function callLLM(config: Record<string, unknown>, input: unknown): Promise<string> {
  const prompt = (config.prompt as string) || 'Summarize: ' + JSON.stringify(input);
  if (!GROQ_API_KEY) {
    await new Promise(r => setTimeout(r, 800));
    return `[STUBBED LLM] Processed: ${JSON.stringify(input).slice(0, 100)}`;
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama3-8b-8192', messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
  });
  if (!res.ok) throw new Error(`LLM error: ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

async function executeStep(stepType: string, config: Record<string, unknown>, input: unknown): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      if (stepType === 'llm_call') return await callLLM(config, input);
      if (stepType === 'http_request') {
        const url = config.url as string;
        const method = (config.method as string) || 'GET';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method !== 'GET' ? JSON.stringify(input) : undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        try { return await res.json(); } catch { return await res.text(); }
      }
      if (stepType === 'conditional_branch') {
        const matched = JSON.stringify(input).toLowerCase().includes(((config.condition as string) || '').toLowerCase());
        return { branch: matched ? 'true' : 'false', matched };
      }
      return { completed: true };
    } catch (err) {
      lastError = err as Error;
      if (attempt <= MAX_RETRIES) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { input } = req.body as {
    input: { workflow_id: string; secret: string; input_data?: unknown };
  };

  const { workflow_id, secret, input_data } = input;

  try {
    // Load workflow + webhook trigger to verify secret
    const wData = await adminQuery(`
      query GetWorkflowWebhook($id: uuid!) {
        workflows_by_pk(id: $id) {
          id org_id is_active
          organization { id quota_limit quota_used }
          steps: workflow_steps(order_by: { step_order: asc }) { id step_order name step_type config }
          triggers: workflow_triggers(where: { trigger_type: { _eq: "webhook" }, is_active: { _eq: true } }) {
            config
          }
        }
      }
    `, { id: workflow_id }) as { workflows_by_pk: { id: string; org_id: string; is_active: boolean; organization: { id: string; quota_limit: number; quota_used: number }; steps: { id: string; step_order: number; name: string; step_type: string; config: Record<string, unknown> }[]; triggers: { config: Record<string, unknown> }[] } };

    const workflow = wData.workflows_by_pk;
    if (!workflow || !workflow.is_active) return res.status(404).json({ message: 'Workflow not found or inactive' });

    const webhookTrigger = workflow.triggers[0];
    if (!webhookTrigger) return res.status(400).json({ message: 'No webhook trigger configured' });

    // Verify secret
    if (webhookTrigger.config.secret !== secret) {
      return res.status(401).json({ message: 'Invalid webhook secret' });
    }

    // Check quota
    const org = workflow.organization;
    if (org.quota_used >= org.quota_limit) {
      return res.status(429).json({ message: 'Org quota exhausted' });
    }

    // Create workflow_run
    const runData = await adminQuery(`
      mutation CreateRun($workflow_id: uuid!, $org_id: uuid!, $input_data: jsonb) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id, org_id: $org_id, trigger_type: "webhook",
          status: "running", input_data: $input_data, started_at: "now()"
        }) { id }
      }
    `, { workflow_id, org_id: workflow.org_id, input_data: input_data || null }) as { insert_workflow_runs_one: { id: string } };

    const runId = runData.insert_workflow_runs_one.id;

    // Create step_runs
    for (const step of workflow.steps) {
      await adminQuery(`
        mutation CreateStepRun($workflow_run_id: uuid!, $workflow_step_id: uuid!, $step_order: Int!) {
          insert_step_runs_one(object: { workflow_run_id: $workflow_run_id, workflow_step_id: $workflow_step_id, step_order: $step_order, status: "pending" }) { id }
        }
      `, { workflow_run_id: runId, workflow_step_id: step.id, step_order: step.step_order });
    }

    let previousOutput: unknown = input_data || {};

    for (const step of workflow.steps) {
      const srData = await adminQuery(`
        query GetSR($run_id: uuid!, $step_id: uuid!) { step_runs(where: { workflow_run_id: { _eq: $run_id }, workflow_step_id: { _eq: $step_id } }) { id } }
      `, { run_id: runId, step_id: step.id }) as { step_runs: { id: string }[] };

      const stepRunId = srData.step_runs[0]?.id;
      if (!stepRunId) continue;

      await adminQuery(`mutation UpdateSR($id: uuid!, $input: jsonb) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running", input_data: $input, started_at: "now()", attempt_count: 1 }) { id } }`, { id: stepRunId, input: previousOutput });

      if (step.step_type === 'approval_gate') {
        await adminQuery(`
          mutation Pause($run_id: uuid!, $sr_id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $run_id }, _set: { status: "paused" }) { id }
            update_step_runs_by_pk(pk_columns: { id: $sr_id }, _set: { status: "paused" }) { id }
          }
        `, { run_id: runId, sr_id: stepRunId });
        return res.json({ workflow_run_id: runId, status: 'paused', message: 'Paused at approval_gate' });
      }

      try {
        const output = await executeStep(step.step_type, step.config, previousOutput);
        await adminQuery(`mutation CompleteSR($id: uuid!, $output: jsonb) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", output_data: $output, completed_at: "now()" }) { id } }`, { id: stepRunId, output });
        previousOutput = output;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await adminQuery(`mutation FailSR($id: uuid!, $error: String!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id } }`, { id: stepRunId, error: errMsg });
        await adminQuery(`mutation FailRun($id: uuid!, $error: String!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id } }`, { id: runId, error: errMsg });
        return res.json({ workflow_run_id: runId, status: 'failed', message: errMsg });
      }
    }

    await adminQuery(`mutation FinishRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id } }`, { id: runId });
    await adminQuery(`mutation IncrQuota($id: uuid!) { update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id } }`, { id: org.id });

    return res.json({ workflow_run_id: runId, status: 'completed', message: 'Webhook workflow completed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ message: msg });
  }
}
