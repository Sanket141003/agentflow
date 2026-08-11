'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { useGQL } from '@/lib/graphql-hooks';
import { Navbar } from '@/components/Navbar';
import { GET_ORG_MEMBERS, ADD_ORG_MEMBER } from '@/lib/queries';

interface OrgMemberRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

const REMOVE_MEMBER = `
  mutation RemoveMember($id: uuid!) {
    delete_org_members_by_pk(id: $id) { id }
  }
`;

const UPDATE_ORG = `
  mutation UpdateOrg($id: uuid!, $name: String!, $quota: Int!) {
    update_organizations_by_pk(pk_columns: { id: $id }, _set: { name: $name, quota_limit: $quota }) { id }
  }
`;

export default function SettingsPage() {
  const { user } = useAuth();
  const { currentOrg, currentRole, refreshOrgs } = useOrg();
  const { query } = useGQL();
  const router = useRouter();

  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [quotaLimit, setQuotaLimit] = useState(100);
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    if (currentRole !== 'owner') { router.replace('/dashboard'); return; }
    if (currentOrg) {
      setOrgName(currentOrg.name);
      setQuotaLimit(currentOrg.quota_limit);
    }
  }, [currentRole, currentOrg, router]);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) return;
    const data = await query<{ org_members: OrgMemberRow[] }>(GET_ORG_MEMBERS, { org_id: currentOrg.id });
    setMembers(data.org_members || []);
  }, [currentOrg, query]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !newUserId.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await query(ADD_ORG_MEMBER, { org_id: currentOrg.id, user_id: newUserId.trim(), role: newRole });
      setNewUserId('');
      fetchMembers();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (id: string, memberId: string) => {
    if (memberId === user?.id) { alert("You can't remove yourself."); return; }
    if (!confirm('Remove this member?')) return;
    await query(REMOVE_MEMBER, { id });
    fetchMembers();
  };

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSavingOrg(true);
    try {
      await query(UPDATE_ORG, { id: currentOrg.id, name: orgName, quota: quotaLimit });
      await refreshOrgs();
    } finally {
      setSavingOrg(false);
    }
  };

  if (!currentOrg || currentRole !== 'owner') return null;

  return (
    <>
      <Navbar />
      <div style={{ padding: '32px 24px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => router.push('/dashboard')}>← Dashboard</button>
          <h1 style={{ fontWeight: 700, fontSize: 22 }}>Organization Settings</h1>
        </div>

        {/* Org details */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Organization Details</div>
          <form onSubmit={saveOrg}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label className="label">Name</label>
                <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="label">Monthly Quota</label>
                <input className="input" type="number" min={1} value={quotaLimit} onChange={e => setQuotaLimit(Number(e.target.value))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingOrg}>{savingOrg ? 'Saving…' : 'Save Changes'}</button>
          </form>
        </div>

        {/* Members */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Members ({members.length})</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--muted)' }}>{m.user_id}</div>
                </div>
                <span style={{ fontSize: 12, padding: '2px 8px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 4, fontWeight: 600 }}>
                  {m.role}
                </span>
                {m.user_id !== user?.id && (
                  <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => removeMember(m.id, m.user_id)}>Remove</button>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={addMember}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add Member by User ID</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 2, minWidth: 200 }}
                value={newUserId}
                onChange={e => setNewUserId(e.target.value)}
                placeholder="User UUID from nhost Auth"
              />
              <select className="select" style={{ flex: 1, minWidth: 120 }} value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add'}</button>
            </div>
            {addError && <div style={{ marginTop: 8, fontSize: 13, color: '#f87171' }}>{addError}</div>}
          </form>
        </div>

        {/* Org ID for reference */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Organization ID</div>
          <code style={{ fontSize: 12, color: 'var(--muted)' }}>{currentOrg.id}</code>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Share this with other users so they can request access, or use it as the org reference in webhook calls.
          </div>
        </div>
      </div>
    </>
  );
}
