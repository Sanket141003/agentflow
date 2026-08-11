'use client';
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { OrgMember, OrgRole, Organization } from './types';
import { GET_MY_ORGS } from './queries';

interface OrgContextValue {
  orgs: OrgMember[];
  currentOrg: Organization | null;
  currentRole: OrgRole | null;
  setCurrentOrgId: (id: string) => void;
  refreshOrgs: () => Promise<void>;
  loading: boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

function getEndpoint() {
  return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [orgs, setOrgs] = useState<OrgMember[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrgs = useCallback(async () => {
    if (!token || !user) { setOrgs([]); return; }
    setLoading(true);
    try {
      const res = await fetch(getEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: GET_MY_ORGS }),
      });
      const json = await res.json() as { data?: { org_members: OrgMember[] } };
      const members: OrgMember[] = json.data?.org_members || [];
      setOrgs(members);
      if (members.length > 0) {
        setCurrentOrgId(prev => prev && members.find(m => m.org_id === prev) ? prev : members[0].org_id);
      }
    } catch (e) {
      console.error('Failed to fetch orgs', e);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const current = orgs.find(m => m.org_id === currentOrgId);

  return (
    <OrgContext.Provider value={{
      orgs,
      currentOrg: current?.organization ?? null,
      currentRole: (current?.role as OrgRole) ?? null,
      setCurrentOrgId,
      refreshOrgs: fetchOrgs,
      loading,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}
