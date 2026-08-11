'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { useGQL } from '@/lib/graphql-hooks';
import { Workflow } from '@/lib/types';
import { Navbar } from '@/components/Navbar';
import { WorkflowCard } from '@/components/WorkflowCard';
import { WorkflowEditor } from '@/components/WorkflowEditor';
import { GET_ORG_WORKFLOWS, DELETE_WORKFLOW } from '@/lib/queries';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, currentRole, orgs, loading: orgLoading } = useOrg();
  const { query } = useGQL();
  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWF, setLoadingWF] = useState(false);
  const [editing, setEditing] = useState<Workflow | null | 'new'>( null);
  const [showSetupBanner, setShowSetupBanner] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!orgLoading && orgs.length === 0 && user) setShowSetupBanner(true);
    else setShowSetupBanner(false);
  }, [orgs, orgLoading, user]);

  const fetchWorkflows = useCallback(async () => {
    if (!currentOrg) return;
    setLoadingWF(true);
    try {
      const data = await query<{ workflows: Workflow[] }>(GET_ORG_WORKFLOWS, { org_id: currentOrg.id });
      setWorkflows(data.workflows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWF(false);
    }
  }, [currentOrg, query]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow and all its runs?')) return;
    await query(DELETE_WORKFLOW, { id });
    fetchWorkflows();
  };

  if (authLoading || orgLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }

  if (editing !== null) {
    return (
      <>
        <Navbar />
        <div style={{ padding: '32px 24px', maxWidth: 780, margin: '0 auto' }}>
          <WorkflowEditor
            workflow={editing === 'new' ? null : editing}
            orgId={currentOrg!.id}
            role={currentRole!}
            onSave={() => { setEditing(null); fetchWorkflows(); }}
            onCancel={() => setEditing(null)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>

        {showSetupBanner && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.05)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>👋 Welcome to AgentFlow</div>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
              You don't belong to any organization yet. Create one to start building workflows.
            </p>
            <a href="/onboarding" className="btn btn-primary">Create Organization →</a>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: 24 }}>
              {currentOrg ? `${currentOrg.name} — Workflows` : 'Workflows'}
            </h1>
            {currentOrg && (
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
                {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} · {currentRole} access
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {currentRole === 'owner' && (
              <a href="/settings" className="btn btn-secondary" style={{ fontSize: 13 }}>⚙ Org Settings</a>
            )}
            {(currentRole === 'owner' || currentRole === 'editor') && currentOrg && (
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                + New Workflow
              </button>
            )}
          </div>
        </div>

        {loadingWF ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            Loading workflows…
          </div>
        ) : workflows.length === 0 && currentOrg ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>No workflows yet</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Build your first AI agent workflow with steps, triggers, and live execution.
            </p>
            {(currentRole === 'owner' || currentRole === 'editor') && (
              <button className="btn btn-primary" onClick={() => setEditing('new')}>Create First Workflow</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {workflows.map(wf => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                role={currentRole!}
                onEdit={() => setEditing(wf)}
                onDelete={() => deleteWorkflow(wf.id)}
                onRefresh={fetchWorkflows}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
