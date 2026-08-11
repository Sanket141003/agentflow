'use client';
import { useState } from 'react';
import { Workflow, WorkflowStep, WorkflowTrigger, OrgRole } from '@/lib/types';
import { WorkflowBuilder } from './WorkflowBuilder';
import { useGQL } from '@/lib/graphql-hooks';
import { CREATE_WORKFLOW, UPDATE_WORKFLOW, UPSERT_WORKFLOW_STEPS, UPSERT_WORKFLOW_TRIGGER } from '@/lib/queries';

interface Props {
  workflow: Workflow | null; // null = create new
  orgId: string;
  role: OrgRole;
  onSave: () => void;
  onCancel: () => void;
}

export function WorkflowEditor({ workflow, orgId, role, onSave, onCancel }: Props) {
  const { query } = useGQL();
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow?.steps || []);
  const [trigger, setTrigger] = useState<WorkflowTrigger | null>(
    workflow?.triggers?.[0] || { id: '', trigger_type: 'manual', config: {}, is_active: true }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError('Name is required');
    setSaving(true);
    setError(null);
    try {
      let workflowId = workflow?.id;

      if (!workflowId) {
        const data = await query<{ insert_workflows_one: { id: string } }>(
          CREATE_WORKFLOW, { org_id: orgId, name, description }
        );
        workflowId = data.insert_workflows_one.id;
      } else {
        await query(UPDATE_WORKFLOW, { id: workflowId, name, description, is_active: true });
      }

      // Save steps
      const stepObjects = steps.map(s => ({
        workflow_id: workflowId,
        step_order: s.step_order,
        name: s.name,
        step_type: s.step_type,
        config: s.config,
      }));
      await query(UPSERT_WORKFLOW_STEPS, { workflow_id: workflowId, steps: stepObjects });

      // Save trigger
      if (trigger) {
        await query(UPSERT_WORKFLOW_TRIGGER, {
          workflow_id: workflowId,
          trigger_type: trigger.trigger_type,
          config: trigger.config,
        });
      }

      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{workflow ? 'Edit Workflow' : 'New Workflow'}</div>
        <button className="btn btn-secondary" onClick={onCancel}>✕ Cancel</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Workflow Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="My AI Workflow" />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this workflow do?" />
        </div>
      </div>

      <WorkflowBuilder
        steps={steps}
        trigger={trigger}
        role={role}
        onChange={(s, t) => { setSteps(s); setTrigger(t); }}
      />

      {error && (
        <div style={{ margin: '12px 0', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : '✓ Save Workflow'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
