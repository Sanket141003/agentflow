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
    await new Promise(r => setTimeout(r, 800));
    return `[STUBBED LLM RESPONSE] Processed: ${JSON.stringify(input).slice(0, 100)}`;
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
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
  if (!res.ok) throw new Error(`HTTP request failed: ${res.status}`);
  try { return await res.json(); } catch { return await res.text(); }
}

async function executeStep(stepType: string, config: Record<string, unknown>, input: unknown): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      if (stepType === 'llm_call') return await callLLM(config, input);
      if (stepType === 'http_request') return await callHTTP(config, input);
      if (stepType === 'conditional_branch') {
        const condition = config.condition as string;
        const matched = JSON.stringify(input).toLowerCase().includes((condition || '').toLowerCase());
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

  const { input, session_variables } = req.body as {
    input: { step_run_id: string; workflow_run_id: string };
    session_variables: Record<string, string>;
  };

  const userId = session_variables?.['x-hasura-user-id'];
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { step_run_id, workflow_run_id } = input;

  try {
    // Load step_run + run + org to verify approver's role
    const data = await adminQuery(`
      query GetStepRunForApproval($step_run_id: uuid!, $run_id: uuid!) {
        step_runs_by_pk(id: $step_run_id) {
          id status workflow_run_id output_data input_data
          workflow_step { id step_type config step_order workflow_id }
        }
        workflow_runs_by_pk(id: $run_id) {
          id status org_id workflow_id
          steps: workflow { 
            steps: workflow_steps(order_by: { step_order: asc }) {
              id step_order name step_type config
            }
          }
        }
      }
    `, { step_run_id, run_id: workflow_run_id }) as {
      step_runs_by_pk: { id: string; status: string; workflow_run_id: string; output_data: unknown; input_data: unknown; workflow_step: { id: string; step_type: string; config: Record<string, unknown>; step_order: number; workflow_id: string } };
      workflow_runs_by_pk: { id: string; status: string; org_id: string; workflow_id: string; steps: { steps: { id: string; step_order: number; name: string; step_type: string; config: Record<string, unknown> }[] } };
    };

    const stepRun = data.step_runs_by_pk;
    const workflowRun = data.workflow_runs_by_pk;

    if (!stepRun) return res.status(404).json({ message: 'Step run not found' });
    if (!workflowRun) return res.status(404).json({ message: 'Workflow run not found' });
    if (stepRun.status !== 'paused') return res.status(400).json({ message: 'Step is not awaiting approval' });
    if (workflowRun.status !== 'paused') return res.status(400).json({ message: 'Workflow run is not paused' });

    // Layer 2: verify approver is owner or editor in the org
    const memberData = await adminQuery(`
      query CheckMember($user_id: uuid!, $org_id: uuid!) {
        org_members(where: { user_id: { _eq: $user_id }, org_id: { _eq: $org_id } }) { role }
      }
    `, { user_id: userId, org_id: workflowRun.org_id }) as { org_members: { role: string }[] };

    const member = memberData.org_members[0];
    if (!member) return res.status(403).json({ message: 'Not a member of this org' });
    if (!['owner', 'editor'].includes(member.role)) return res.status(403).json({ message: 'Only owners/editors can approve steps' });

    // Mark step as approved + completed
    await adminQuery(`
      mutation ApproveStepRun($id: uuid!, $approved_by: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed",
          approved_by: $approved_by,
          approved_at: "now()",
          completed_at: "now()"
        }) { id }
      }
    `, { id: step_run_id, approved_by: userId });

    // Resume: set run back to running
    await adminQuery(`
      mutation ResumeRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running" }) { id }
      }
    `, { id: workflow_run_id });

    // Continue executing remaining steps after the approval_gate
    const allSteps = workflowRun.steps.steps;
    const approvedStepOrder = stepRun.workflow_step.step_order;
    const remainingSteps = allSteps.filter(s => s.step_order > approvedStepOrder);

    let previousOutput = stepRun.input_data || {};

    for (const step of remainingSteps) {
      // Create or get step_run
      const srData = await adminQuery(`
        query GetStepRun($run_id: uuid!, $step_id: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $run_id }, workflow_step_id: { _eq: $step_id } }) { id status }
        }
      `, { run_id: workflow_run_id, step_id: step.id }) as { step_runs: { id: string; status: string }[] };

      let stepRunId = srData.step_runs[0]?.id;
      if (!stepRunId) {
        const newSr = await adminQuery(`
          mutation CreateStepRun($workflow_run_id: uuid!, $workflow_step_id: uuid!, $step_order: Int!) {
            insert_step_runs_one(object: { workflow_run_id: $workflow_run_id, workflow_step_id: $workflow_step_id, step_order: $step_order, status: "pending" }) { id }
          }
        `, { workflow_run_id, workflow_step_id: step.id, step_order: step.step_order }) as { insert_step_runs_one: { id: string } };
        stepRunId = newSr.insert_step_runs_one.id;
      }

      await adminQuery(`
        mutation UpdateStepRun($id: uuid!, $input: jsonb) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running", input_data: $input, started_at: "now()", attempt_count: 1 }) { id }
        }
      `, { id: stepRunId, input: previousOutput });

      if (step.step_type === 'approval_gate') {
        await adminQuery(`
          mutation PauseAgain($run_id: uuid!, $step_run_id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $run_id }, _set: { status: "paused" }) { id }
            update_step_runs_by_pk(pk_columns: { id: $step_run_id }, _set: { status: "paused" }) { id }
          }
        `, { run_id: workflow_run_id, step_run_id: stepRunId });

        return res.json({ step_run_id, workflow_run_id, status: 'paused', message: `Paused at next approval_gate: ${step.name}` });
      }

      try {
        const output = await executeStep(step.step_type, step.config, previousOutput);
        await adminQuery(`
          mutation CompleteStep($id: uuid!, $output: jsonb) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", output_data: $output, completed_at: "now()" }) { id }
          }
        `, { id: stepRunId, output });
        previousOutput = output;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await adminQuery(`mutation FailStep($id: uuid!, $error: String!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id } }`, { id: stepRunId, error: errMsg });
        await adminQuery(`mutation FailRun($id: uuid!, $error: String!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: $error, completed_at: "now()" }) { id } }`, { id: workflow_run_id, error: errMsg });
        return res.json({ step_run_id, workflow_run_id, status: 'failed', message: errMsg });
      }
    }

    // All done
    await adminQuery(`mutation FinishRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id } }`, { id: workflow_run_id });

    // Increment quota
    await adminQuery(`
      query GetOrgId($run_id: uuid!) { workflow_runs_by_pk(id: $run_id) { org_id } }
    `, { run_id: workflow_run_id }).then(d => {
      const orgId = (d as { workflow_runs_by_pk: { org_id: string } }).workflow_runs_by_pk?.org_id;
      if (orgId) return adminQuery(`mutation IncrQuota($id: uuid!) { update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id } }`, { id: orgId });
    });

    return res.json({ step_run_id, workflow_run_id, status: 'completed', message: 'Workflow completed after approval' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('approveStep error:', msg);
    return res.status(500).json({ message: msg });
  }
}
