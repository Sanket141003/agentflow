'use client';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { QuotaBar } from './QuotaBar';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { orgs, currentOrg, currentRole, setCurrentOrgId } = useOrg();

  return (
    <nav style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)', marginRight: 8 }}>
        🤖 AgentFlow
      </div>

      {orgs.length > 0 && (
        <select
          className="select"
          style={{ width: 'auto', minWidth: 160 }}
          value={currentOrg?.id || ''}
          onChange={e => setCurrentOrgId(e.target.value)}
        >
          {orgs.map(m => (
            <option key={m.org_id} value={m.org_id}>
              {m.organization.name} ({m.role})
            </option>
          ))}
        </select>
      )}

      <div style={{ flex: 1 }} />

      {currentOrg && <QuotaBar />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {currentRole && (
          <span style={{ fontSize: 12, padding: '3px 8px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 4, fontWeight: 600 }}>
            {currentRole}
          </span>
        )}
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{user?.email}</span>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={signOut}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
