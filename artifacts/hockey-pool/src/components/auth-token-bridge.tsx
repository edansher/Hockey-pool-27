import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAdminAccessQueryKey, getGetAdminParticipantEmailsQueryKey, setAuthTokenGetter } from '@workspace/api-client-react';

/** API requests carry Clerk's signed session, never a client-declared email/role. */
export function AuthTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, userId } = useAuth();
  const client = useQueryClient();
  const identity = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    // Any identity change (sign-out, other account, guest to signed-in) drops cached private data and refetches.
    if (isLoaded) {
      const next = userId ?? null;
      if (identity.current !== next && (identity.current !== undefined || next !== null)) void client.resetQueries();
      identity.current = next;
    }
    setAuthTokenGetter(isLoaded && userId ? () => getToken() : null);
    client.removeQueries({ queryKey: getGetAdminParticipantEmailsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() });
    return () => setAuthTokenGetter(null);
  }, [client, getToken, isLoaded, userId]);
  return children;
}