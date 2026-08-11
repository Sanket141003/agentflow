export type StepType = 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'database_event';
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type OrgRole = 'owner' | 'editor' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
  quota_period_start?: string;
}

export interface OrgMember {
  id: string;
  user_id: string;
  org_id: string;
  role: OrgRole;
  organization: Organization;
}

export interface WorkflowStep {
  id: string;
  workflow_id?: string;
  step_order: number;
  name: string;
  step_type: StepType;
  config: Record<string, unknown>;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id?: string;
  trigger_type: TriggerType;
  config: Record<string, unknown>;
  is_active: boolean;
}

export interface WorkflowRun {
  id: string;
  status: RunStatus;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error?: string | null;
  step_runs?: StepRun[];
}

export interface StepRun {
  id: string;
  step_order: number;
  status: RunStatus | 'skipped';
  input_data?: unknown;
  output_data?: unknown;
  error?: string | null;
  attempt_count: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string;
  workflow_step: { id: string; name: string; step_type: StepType };
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  runs: WorkflowRun[];
}

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  llm_call: '🤖 LLM Call',
  http_request: '🌐 HTTP Request',
  db_write: '💾 DB Write',
  notify: '🔔 Notify',
  conditional_branch: '🔀 Conditional Branch',
  approval_gate: '✋ Approval Gate',
};

export const STEP_TYPE_COLORS: Record<StepType, string> = {
  llm_call: '#6366f1',
  http_request: '#3b82f6',
  db_write: '#10b981',
  notify: '#f59e0b',
  conditional_branch: '#8b5cf6',
  approval_gate: '#ef4444',
};

export const OWNER_ONLY_STEPS: StepType[] = ['db_write', 'notify'];
export const OWNER_ONLY_TRIGGERS: TriggerType[] = ['webhook', 'database_event'];
