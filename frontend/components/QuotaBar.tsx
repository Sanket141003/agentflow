'use client';
import { useEffect, useState } from 'react';
import { useOrg } from '@/lib/org-context';
import { useGQL } from '@/lib/graphql-hooks';
import { GET_ORG_USAGE } from '@/lib/queries';

export function QuotaBar() {
  const { currentOrg, refreshOrgs } = useOrg();
  const { query } = useGQL();
  const [data, setData] = useState<{ quota_limit: number; quota_used: number } | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    query<{ organizations_by_pk: { quota_limit: number; quota_used: number } }>(
      GET_ORG_USAGE, { org_id: currentOrg.id }
    ).then(d => setData(d.organizations_by_pk)).catch(() => null);
  }, [currentOrg, query]);

  if (!data) return null;

  const pct = Math.min((data.quota_used / data.quota_limit) * 100, 100);
  const color = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>Quota</span>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, minWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.quota_used}/{data.quota_limit}</span>
    </div>
  );
}
