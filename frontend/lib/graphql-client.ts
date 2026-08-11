'use client';
import { createClient, fetchExchange, subscriptionExchange } from 'urql';
import { createClient as createWSClient } from 'graphql-ws';

let wsClient: ReturnType<typeof createWSClient> | null = null;
let gqlClient: ReturnType<typeof createClient> | null = null;

export function getGraphQLClient(token: string | null) {
  const wsUrl = `wss://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
  const httpUrl = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  wsClient = createWSClient({
    url: wsUrl,
    connectionParams: { headers },
  });

  gqlClient = createClient({
    url: httpUrl,
    fetchOptions: { headers },
    exchanges: [
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(request) {
          const input = { ...request, query: request.query || '' };
          return {
            subscribe(sink) {
              const unsubscribe = wsClient!.subscribe(input, sink);
              return { unsubscribe };
            },
          };
        },
      }),
    ],
  });

  return gqlClient;
}
