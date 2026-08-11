'use client';
import { useState } from 'react';
import { Workflow, OrgRole, STEP_TYPE_LABELS } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { RunMonitor } from './RunMonitor';
import { useAuth } from '@/lib/auth-context';
import { TRIGGER_WORKFLOW } from '@/lib/queries';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  workflow: Workflow;
  role: OrgRole;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}

export function WorkflowCard({ workflow, role, onEdit, onDelete, onRefresh }: Props) {
  const { token } = useAuth();
  const [triggering, setTriggering] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ENDPOINT = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  const latestRun = workflow.runs?.[0];
  const canRun = role === 'owner' || role === 'editor';
  const webhookTrigger = workflow.triggers?.find(t => t.trigger_type === 'webhook');

  const triggerRun = async () => {
    if (!token) return;
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: TRIGGER_WORKFLOW, variables: { workflow_id: workflow.id } }),
      });
      const json = await res.json() as { data?: { triggerWorkflowRun: { workflow_run_id: string; status: string; message: string } }; errors?: { message: string }[] };
      if (json.errors) {
        setError(json.errors[0].message);
      } else {
        const { workflow_run_id } = json.data!.triggerWorkflowRun;
        setActiveRunId(workflow_run_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <>
      <div className="card" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{workflow.name}</div>
              {!workflow.is_active && <span className="badge badge-failed">inactive</span>}
            </div>
            {workflow.description && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{workflow.description}</div>}

            {/* Steps summary */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {workflow.steps?.map(step => (
                <span key={step.id} style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--muted)' }}>
                  {STEP_TYPE_LABELS[step.step_type]}
                </span>
              ))}
            </div>

            {/* Trigger badge */}
            {workflow.triggers?.map(t => (
              <span key={t.id} style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 4, marginRight: 4 }}>
                ⚡ {t.trigger_type}
              </span>
            ))}

            {/* Last run */}
            {latestRun && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Last run:</span>
                <StatusBadge status={latestRun.status} />
                <span>{formatDistanceToNow(new Date(latestRun.created_at), { addSuffix: true })}</span>
                <button
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setActiveRunId(latestRun.id)}
                >
                  View →
                </button>
              </div>
            )}

            {webhookTrigger && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Webhook: POST /api/action/webhookTriggerWorkflow — secret: <code>{String(webhookTrigger.config.secret || 'not set')}</code>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {canRun && (
              <button className="btn btn-primary" onClick={triggerRun} disabled={triggering} style={{ minWidth: 80 }}>
                {triggering ? '⏳' : '▶ Run'}
              </button>
            )}
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 13 }} onClick={onEdit}>Edit</button>
            {role === 'owner' && (
              <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: 13 }} onClick={onDelete}>Delete</button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
            {error}
          </div>
        )}
      </div>

      {activeRunId && (
        <RunMonitor
          runId={activeRunId}
          orgRole={role}
          onClose={() => { setActiveRunId(null); onRefresh(); }}
        />
      )}
    </>
  );
}
