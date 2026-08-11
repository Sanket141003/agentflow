'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { useGQL } from '@/lib/graphql-hooks';

const CREATE_ORG_AND_MEMBER = `
  mutation CreateOrgAndMember($name: String!, $user_id: uuid!, $quota: Int!) {
    insert_organizations_one(object: {
      name: $name,
      quota_limit: $quota,
      members: { data: [{ user_id: $user_id, role: "owner" }] }
    }) {
      id name
      members { id role }
    }
  }
`;

export default function OnboardingPage() {
  const { user } = useAuth();
  const { refreshOrgs, setCurrentOrgId } = useOrg();
  const { query } = useGQL();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [quota, setQuota] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await query<{ insert_organizations_one: { id: string } }>(
        CREATE_ORG_AND_MEMBER,
        { name: orgName, user_id: user.id, quota }
      );
      const orgId = data.insert_organizations_one.id;
      await refreshOrgs();
      setCurrentOrgId(orgId);
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create org');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏢</div>
          <h1 style={{ fontWeight: 700, fontSize: 22 }}>Create Your Organization</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            Workflows, members, and quota are scoped per organization.
          </p>
        </div>

        <div className="card">
          <form onSubmit={create}>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Organization Name *</label>
              <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Corp" required />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Monthly Run Quota</label>
              <input className="input" type="number" min={1} max={10000} value={quota} onChange={e => setQuota(Number(e.target.value))} />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Max workflow runs per month</div>
            </div>

            {error && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Creating…' : 'Create Organization'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
