import type { AvatarSpec } from '@pixelwork/shared';

export interface Me {
  id: string;
  name: string;
  avatar: AvatarSpec;
  isGuest: boolean;
}

export interface SpaceSummary {
  id: string;
  name: string;
  slug: string;
  orgName: string;
  role: 'admin' | 'member';
}

export interface SpaceDetail {
  id: string;
  name: string;
  slug: string;
  map: unknown;
  mapVersion: number;
  role: 'admin' | 'member';
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const api = {
  me: () => request<Me>('GET', '/me'),
  guest: () => request<Me>('POST', '/auth/guest', {}),
  logout: () => request<undefined>('POST', '/auth/logout', {}),
  spaces: () => request<SpaceSummary[]>('GET', '/spaces'),
  space: (id: string) => request<SpaceDetail>('GET', `/spaces/${encodeURIComponent(id)}`),
};
