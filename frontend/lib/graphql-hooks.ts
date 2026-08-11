'use client';
import { useCallback } from 'react';
import { useAuth } from './auth-context';

function getEndpoint() {
  return `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
}

export function useGQL() {
  const { token } = useAuth();

  const query = useCallback(async <T>(q: string, variables?: Record<string, unknown>): Promise<T> => {
    const res = await fetch(getEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query: q, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(', '));
    return json.data as T;
  }, [token]);

  return { query };
}
