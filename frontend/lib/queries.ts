export const GET_ORG_WORKFLOWS = `
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }, order_by: { created_at: desc }) {
      id name description is_active created_at updated_at
      steps: workflow_steps(order_by: { step_order: asc }) {
        id step_order name step_type config
      }
      triggers: workflow_triggers {
        id trigger_type config is_active
      }
      runs: workflow_runs(limit: 1, order_by: { created_at: desc }) {
        id status created_at completed_at
      }
    }
  }
`;

export const GET_WORKFLOW_RUNS = `
  query GetWorkflowRuns($workflow_id: uuid!) {
    workflow_runs(where: { workflow_id: { _eq: $workflow_id } }, order_by: { created_at: desc }, limit: 20) {
      id status trigger_type started_at completed_at created_at error
      step_runs(order_by: { step_order: asc }) {
        id step_order status input_data output_data error attempt_count approved_by approved_at started_at completed_at
        workflow_step { id name step_type }
      }
    }
  }
`;

export const SUBSCRIBE_STEP_RUNS = `
  subscription SubscribeStepRuns($workflow_run_id: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflow_run_id } }
      order_by: { step_order: asc }
    ) {
      id step_order status input_data output_data error attempt_count approved_by approved_at started_at completed_at updated_at
      workflow_step { id name step_type }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUN = `
  subscription SubscribeWorkflowRun($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id status started_at completed_at error updated_at
    }
  }
`;

export const GET_ORG_USAGE = `
  query GetOrgUsage($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id name quota_limit quota_used quota_period_start
    }
  }
`;

export const GET_MY_ORGS = `
  query GetMyOrgs {
    org_members {
      role org_id
      organization { id name quota_limit quota_used }
    }
  }
`;

export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($org_id: uuid!, $name: String!, $description: String) {
    insert_workflows_one(object: { org_id: $org_id, name: $name, description: $description }) {
      id name
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $name: String!, $description: String, $is_active: Boolean) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description, is_active: $is_active }) {
      id
    }
  }
`;

export const DELETE_WORKFLOW = `
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) { id }
  }
`;

export const UPSERT_WORKFLOW_STEPS = `
  mutation ReplaceSteps($workflow_id: uuid!, $steps: [workflow_steps_insert_input!]!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflow_id } }) { affected_rows }
    insert_workflow_steps(objects: $steps) { returning { id } }
  }
`;

export const UPSERT_WORKFLOW_TRIGGER = `
  mutation UpsertTrigger($workflow_id: uuid!, $trigger_type: String!, $config: jsonb!) {
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflow_id } }) { affected_rows }
    insert_workflow_triggers_one(object: { workflow_id: $workflow_id, trigger_type: $trigger_type, config: $config, is_active: true }) { id }
  }
`;

export const TRIGGER_WORKFLOW = `
  mutation TriggerWorkflow($workflow_id: uuid!, $input_data: jsonb) {
    triggerWorkflowRun(workflow_id: $workflow_id, input_data: $input_data) {
      workflow_run_id status message
    }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($step_run_id: uuid!, $workflow_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id, workflow_run_id: $workflow_run_id) {
      step_run_id workflow_run_id status message
    }
  }
`;

export const GET_ORG_MEMBERS = `
  query GetOrgMembers($org_id: uuid!) {
    org_members(where: { org_id: { _eq: $org_id } }) {
      id user_id role created_at
    }
  }
`;

export const ADD_ORG_MEMBER = `
  mutation AddOrgMember($org_id: uuid!, $user_id: uuid!, $role: String!) {
    insert_org_members_one(object: { org_id: $org_id, user_id: $user_id, role: $role }) { id }
  }
`;
