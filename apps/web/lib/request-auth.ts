import { cookies } from 'next/headers';

import { ACCESS_COOKIE } from './auth-cookies';
import { getAuthUser, SupabaseHttpError, type AuthUser } from './supabase-http';
import { createTutorDataClient, type TutorDataClient } from './supabase/data';

export class RequestAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 503,
  ) {
    super(message);
    this.name = 'RequestAuthError';
  }
}

export async function getAuthenticatedTutorData(): Promise<{
  accessToken: string;
  user: AuthUser;
  data: TutorDataClient;
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) throw new RequestAuthError('Du må være innlogget.', 401);
  try {
    const user = await getAuthUser(accessToken);
    return {
      accessToken,
      user,
      data: createTutorDataClient({ accessToken, userId: user.id }),
    };
  } catch (error) {
    if (error instanceof SupabaseHttpError && error.status === 401) {
      throw new RequestAuthError('Innloggingen er utløpt.', 401);
    }
    throw new RequestAuthError('Innlogging kunne ikke bekreftes.', 503);
  }
}
