'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient as createWSClient } from 'graphql-ws';
import { StatusBadge } from './StatusBadge';
import { StepRun, WorkflowRun } from '@/lib/types';
import { SUBSCRIBE_STEP_RUNS, SUBSCRIBE_WORKFLOW_RUN, APPROVE_STEP } from '@/lib/queries';
import { useAuth } from '@/lib/auth-context';

interface Props {
  runId: string;
  orgRole: string;
  onClose: () => void;
}

export function RunMonitor({ runId, orgRole, onClose }: Props) {
  const { token } = useAuth();
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const [runStatus, setRunStatus] = useState<string>('running');
  const [approving, setApproving] = useState<string | null>(null);
  const wsRef = useRef<ReturnType<typeof createWSClient> | null>(null);

  const ENDPOINT = typeof window !== 'undefined'
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`
    : '';
  const WS_ENDPOINT = typeof window !== 'undefined'
    ? `wss://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`
    : '';

  useEffect(() => {
    if (!token || !runId) return;

    const wsClient = createWSClient({
      url: WS_ENDPOINT,
      connectionParams: { headers: { Authorization: `Bearer ${token}` } },
    });
    wsRef.current = wsClient;

    // Subscribe to step_runs
    const unsubSteps = wsClient.subscribe(
      { query: SUBSCRIBE_STEP_RUNS, variables: { workflow_run_id: runId } },
      {
        next: (data) => {
          const d = data as { data?: { step_runs: StepRun[] } };
          if (d.data?.step_runs) setStepRuns(d.data.step_runs);
        },
        error: console.error,
        complete: () => {},
      }
    );

    // Subscribe to workflow run status
    const unsubRun = wsClient.subscribe(
      { query: SUBSCRIBE_WORKFLOW_RUN, variables: { id: runId } },
      {
        next: (data) => {
          const d = data as { data?: { workflow_runs_by_pk: WorkflowRun } };
          if (d.data?.workflow_runs_by_pk) setRunStatus(d.data.workflow_runs_by_pk.status);
        },
        error: console.error,
        complete: () => {},
      }
    );

    return () => {
      unsubSteps();
      unsubRun();
      wsClient.dispose();
    };
  }, [token, runId]);

  const approveStep = async (stepRunId: string) => {
    if (!token) return;
    setApproving(stepRunId);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: APPROVE_STEP, variables: { step_run_id: stepRunId, workflow_run_id: runId } }),
      });
      const json = await res.json() as { data?: { approveStep: { status: string; message: string } }; errors?: { message: string }[] };
      if (json.errors) alert(json.errors[0].message);
    } finally {
      setApproving(null);
    }
  };

  const statusColor: Record<string, string> = {
    completed: 'var(--green)', running: 'var(--blue)', paused: 'var(--yellow)',
    failed: 'var(--red)', pending: 'var(--muted)', skipped: 'var(--muted)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="card" style={{ width: 600, maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Live Run Monitor</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Run ID: {runId.slice(0, 8)}…</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusBadge status={runStatus} />
            <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {stepRuns.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            Waiting for steps to start…
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stepRuns.map((sr, idx) => (
            <div key={sr.id} style={{
              background: 'var(--bg)',
              border: `1px solid ${statusColor[sr.status] || 'var(--border)'}44`,
              borderLeft: `3px solid ${statusColor[sr.status] || 'var(--border)'}`,
              borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {idx + 1}. {sr.workflow_step?.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>({sr.workflow_step?.step_type})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {sr.attempt_count > 1 && <span style={{ fontSize: 11, color: 'var(--yellow)' }}>retry {sr.attempt_count}</span>}
                  <StatusBadge status={sr.status} />
                </div>
              </div>

              {sr.status === 'running' && (
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--blue)', width: '60%', animation: 'pulse 1s infinite' }} />
                </div>
              )}

              {sr.status === 'paused' && sr.workflow_step?.step_type === 'approval_gate' && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6 }}>
                  <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>⏸ Awaiting Approval</div>
                  {['owner', 'editor'].includes(orgRole) ? (
                    <button
                      className="btn btn-success"
                      disabled={!!approving}
                      onClick={() => approveStep(sr.id)}
                      style={{ fontSize: 13 }}
                    >
                      {approving === sr.id ? 'Approving…' : '✓ Approve & Continue'}
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>You need owner/editor role to approve this step.</div>
                  )}
                </div>
              )}

              {sr.output_data !== undefined && sr.output_data !== null && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>Output</summary>
                  <pre style={{ fontSize: 11, color: 'var(--text)', marginTop: 4, overflow: 'auto', maxHeight: 120, background: 'var(--bg)', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}>
                    {typeof sr.output_data === 'string' ? sr.output_data : JSON.stringify(sr.output_data as Record<string, unknown>, null, 2)}
                  </pre>
                </details>
              )}

              {sr.error && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '6px 8px', borderRadius: 4 }}>
                  Error: {sr.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {(runStatus === 'completed' || runStatus === 'failed') && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{runStatus === 'completed' ? '✅' : '❌'}</div>
            <div style={{ fontWeight: 600, color: runStatus === 'completed' ? 'var(--green)' : 'var(--red)' }}>
              Workflow {runStatus}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
