import type { Request, Response } from 'express';

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MAX_RETRIES = 2;

async function adminQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as Record<string, unknown>;
}

async function callLLM(config: Record<string, unknown>, input: unknown): Promise<string> {
  const prompt = (config.prompt as string) || 'Summarize the following: ' + JSON.stringify(input);
  if (!GROQ_API_KEY) {
    await new Promise(r => setTimeout(r, 800)); // stubbed delay
    return `[STUBBED LLM RESPONSE] Processed: ${JSON.stringify(input).slice(0, 100)}`;
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: (config.model as string) || 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`LLM API error: ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

async function callHTTP(config: Record<string, unknown>, input: unknown): Promise<unknown> {
  const url = config.url as string;
  const method = (config.method as string) || 'GET';
  const headers = (config.headers as Record<string, string>) || {};
  const body = method !== 'GET' ? JSON.stringify({ ...(config.body as object || {}), input }) : undefined;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body });
  if (!res.ok) throw new Error(`HTTP request failed: ${res.status} ${res.statusText}`);
  try { return await res.json(); } catch { return await res.text(); }
}

async function executeStepWithRetry(
  stepType: string,
  config: Record<string, unknown>,
  input: unknown,
  maxRetries: number
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (stepType === 'llm_call') return await callLLM(config, input);
      if (stepType === 'http_request') return await callHTTP(config, input);
      if (stepType === 'db_write') {
        const table = config.table as string;
        const data = { ...(config.data as object || {}), input };
        await adminQuery(`mutation DbWrite($obj: ${table}_insert_input!) { insert_${table}_one(object: $obj) { id } }`, { obj: data });
        return { written: true, table };
      }
      if (stepType === 'notify') {
        const webhookUrl = config.webhook_url as string;
        if (webhookUrl) await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: config.message, input }) });
        return { notified: true };
      }
      if (stepType === 'conditional_branch') {
        const condition = config.condition as string;
        const inputStr = JSON.stringify(input);
        const matched = inputStr.toLowerCase().includes((condition || '').toLowerCase());
        return { branch: matched ? 'true' : 'false', matched };
      }
      return { completed: true };
    } catch (err) {
      lastError = err as Error;
      if (attempt <= maxRetries) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { input, session_variables } = req.body as {
    input: { workflow_id: string; input_data?: unknown };
    session_variables: Record<string, string>;
  };

  const userId = session_variables?.['x-hasura-user-id'];
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { workflow_id, input_data } = input;

  try {
    // 1. Load workflow + verify caller is owner/editor in the org
    const workflowData = await adminQuery(`
      query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          id org_id name is_active
          steps: workflow_steps(order_by: { step_order: asc }) {
            id step_order name step_type config
          }
          organization {
            id quota_limit quota_used quota_period_start
          }
        }
      }
    `, { id: workflow_id }) as { workflows_by_pk: { id: string; org_id: string; name: string; is_active: boolean; steps: { id: string; step_order: number; name: string; step_type: string; config: Record<string, unknown> }[]; organization: { id: string; quota_limit: number; quota_used: number; quota_period_start: string } } };

    const workflow = workflowData.workflows_by_pk;
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });

    // Verify membership + role
    const memberData = await adminQuery(`
      query CheckMember($user_id: uuid!, $org_id: uuid!) {
        org_members(where: { user_id: { _eq: $user_id }, org_id: { _eq: $org_id } }) {
          role
        }
      }
    `, { user_id: userId, org_id: workflow.org_id }) as { org_members: { role: string }[] };

    const member = memberData.org_members[0];
    if (!member) return res.status(403).json({ message: 'Not a member of this org' });
    if (!['owner', 'editor'].includes(member.role)) return res.status(403).json({ message: 'Viewers cannot trigger runs' });

    // 2. Check quota
    const org = workflow.organization;
    // Reset quota if new period
    const periodStart = new Date(org.quota_period_start);
    const now = new Date();
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (periodStart < currentPeriodStart) {
      await adminQuery(`
        mutation ResetQuota($id: uuid!) {
          update_organizations_by_pk(pk_columns: { id: $id }, _set: { quota_used: 0, quota_period_start: "${currentPeriodStart.toISOString()}" }) { id }
        }
      `, { id: org.id });
      org.quota_used = 0;
    }
    if (org.quota_used >= org.quota_limit) {
      return res.status(429).json({ message: 'Org quota exhausted for this period' });
    }

    // Layer 2: check for owner-only step types
    const ownerOnlyTypes = ['db_write', 'notify'];
    const webhookTriggerPresent = false;
    for (const step of workflow.steps) {
      if (ownerOnlyTypes.includes(step.step_type) && member.role !== 'owner') {
        return res.status(403).json({ message: `Only owners can run workflows with ${step.step_type} steps` });
      }
    }

    // 3. Create workflow_run
    const runData = await adminQuery(`
      mutation CreateRun($workflow_id: uuid!, $org_id: uuid!, $triggered_by: uuid!, $input_data: jsonb) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id,
          org_id: $org_id,
          triggered_by: $triggered_by,
          trigger_type: "manual",
          status: "running",
          input_data: $input_data,
          started_at: "now()"
        }) { id }
      }
    `, { workflow_id, org_id: workflow.org_id, triggered_by: userId, input_data: input_data || null }) as { insert_workflow_runs_one: { id: string } };

    const runId = runData.insert_workflow_runs_one.id;

    // Create step_runs
    for (const step of workflow.steps) {
      await adminQuery(`
        mutation CreateStepRun($workflow_run_id: uuid!, $workflow_step_id: uuid!, $step_order: Int!) {
          insert_step_runs_one(object: {
            workflow_run_id: $workflow_run_id,
            workflow_step_id: $workflow_step_id,
            step_order: $step_order,
            status: "pending"
          }) { id }
        }
      `, { workflow_run_id: runId, workflow_step_id: step.id, step_order: step.step_order });
    }

    // 4. Execute steps in order
    let previousOutput: unknown = input_data || {};

    for (const step of workflow.steps) {
      // Get step_run id
      const srData = await adminQuery(`
        query GetStepRun($run_id: uuid!, $step_id: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $run_id }, workflow_step_id: { _eq: $step_id } }) { id }
        }
      `, { run_id: runId, step_id: step.id }) as { step_runs: { id: string }[] };

      const stepRunId = srData.step_runs[0]?.id;
      if (!stepRunId) continue;

      // Mark step as running
      await adminQuery(`
        mutation UpdateStepRun($id: uuid!, $status: String!, $input_data: jsonb) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status, input_data: $input_data, started_at: "now()", attempt_count: 1 }) { id }
        }
      `, { id: stepRunId, status: 'running', input_data: previousOutput });

      // approval_gate: pause and stop
      if (step.step_type === 'approval_gate') {
        await adminQuery(`
          mutation PauseRun($run_id: uuid!, $step_run_id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $run_id }, _set: { status: "paused" }) { id }
            update_step_runs_by_pk(pk_columns: { id: $step_run_id }, _set: { status: "paused" }) { id }
          }
        `, { run_id: runId, step_run_id: stepRunId });

        return res.json({
          workflow_run_id: runId,
          status: 'paused',
          message: `Run paused at approval_gate step: ${step.name}`,
        });
      }

      try {
        const output = await executeStepWithRetry(step.step_type, step.config, previousOutput, MAX_RETRIES);

        await adminQuery(`
          mutation CompleteStepRun($id: uuid!, $output: jsonb) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", output_data: $output, completed_at: "now()" }) { id }
          }
        `, { id: stepRunId, output });

        // conditional_branch: skip remaining if branch is false and config says so
        if (step.step_type === 'conditional_branch') {
          const result = output as { branch: string };
          if (result.branch === 'false' && step.config.stop_on_false) {
            await adminQuery(`
              mutation FinishRun($id: uuid!) {
                update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id }
              }
            `, { id: runId });
            await adminQuery(`mutation IncrQuota($id: uuid!) { update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id } }`, { id: org.id });
            return res.json({ workflow_run_id: runId, status: 'completed', message: 'Workflow completed (branch stopped)' });
          }
        }

        previousOutput = output;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await adminQuery(`
          mutation FailStepRun($id: uuid!, $error: String!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id }
          }
        `, { id: stepRunId, error: errMsg });
        await adminQuery(`
          mutation FailRun($id: uuid!, $error: String!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id }
          }
        `, { id: runId, error: errMsg });
        return res.json({ workflow_run_id: runId, status: 'failed', message: errMsg });
      }
    }

    // 5. All steps done
    await adminQuery(`
      mutation FinishRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id }
      }
    `, { id: runId });

    // 6. Increment quota
    await adminQuery(`
      mutation IncrQuota($id: uuid!) {
        update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id }
      }
    `, { id: org.id });

    return res.json({ workflow_run_id: runId, status: 'completed', message: 'Workflow completed successfully' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('triggerWorkflowRun error:', msg);
    return res.status(500).json({ message: msg });
  }
}
