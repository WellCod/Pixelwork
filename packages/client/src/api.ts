import type { AvatarSpec, DeskDecor } from '@pixelwork/shared';

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
  orgId: string;
  orgName: string;
  role: 'admin' | 'member';
  orgRole: 'owner' | 'admin' | null;
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
  constructor(
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(code ?? `HTTP ${status}`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(response.status, typeof body?.error === 'string' ? body.error : null);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const api = {
  me: () => request<Me>('GET', '/me'),
  guest: () => request<Me>('POST', '/auth/guest', {}),
  logout: () => request<undefined>('POST', '/auth/logout', {}),
  spaces: () => request<SpaceSummary[]>('GET', '/spaces'),
  space: (id: string) => request<SpaceDetail>('GET', `/spaces/${encodeURIComponent(id)}`),
};

export interface StatusInput {
  status: 'available' | 'focus' | 'away';
  text: string | null;
  emoji: string | null;
}

const space = (id: string, path: string) => `/spaces/${encodeURIComponent(id)}${path}`;
const desk = (spaceId: string, deskKey: string) => space(spaceId, `/desks/${encodeURIComponent(deskKey)}`);

export const profileApi = {
  setAvatar: (avatar: AvatarSpec) => request<unknown>('PUT', '/me/avatar', avatar),
  setName: (name: string) => request<unknown>('PUT', '/me/name', { name }),
  setStatus: (spaceId: string, input: StatusInput) => request<unknown>('PUT', space(spaceId, '/me/status'), input),
  setTitle: (spaceId: string, title: string | null) => request<unknown>('PUT', space(spaceId, '/me/title'), { title }),
  claimDesk: (spaceId: string, deskKey: string) => request<unknown>('POST', `${desk(spaceId, deskKey)}/claim`, {}),
  setDecor: (spaceId: string, deskKey: string, decor: DeskDecor) =>
    request<unknown>('PUT', `${desk(spaceId, deskKey)}/decor`, decor),
  releaseDesk: (spaceId: string, deskKey: string) => request<unknown>('DELETE', desk(spaceId, deskKey), {}),
};

export interface InvitePreview {
  spaceId: string;
  spaceName: string;
  orgName: string;
  role: 'admin' | 'member';
  alreadyMember: boolean;
}

export const orgApi = {
  providers: () => request<{ github: boolean }>('GET', '/auth/providers'),
  templates: () => request<{ id: string; name: string }[]>('GET', '/templates'),
  createOrg: (name: string, slug: string) => request<{ id: string }>('POST', '/orgs', { name, slug }),
  createSpace: (orgId: string, name: string, slug: string, template: string) =>
    request<{ id: string }>('POST', `/orgs/${encodeURIComponent(orgId)}/spaces`, { name, slug, template }),
  createInvite: (spaceId: string, role: 'admin' | 'member', maxUses: number | null) =>
    request<{ url: string; expiresAt: string }>('POST', space(spaceId, '/invites'), { role, maxUses }),
  invite: (token: string) => request<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<{ spaceId: string }>('POST', `/invites/${encodeURIComponent(token)}/accept`, {}),
  removeMember: (spaceId: string, userId: string) =>
    request<undefined>('DELETE', space(spaceId, `/members/${encodeURIComponent(userId)}`), {}),
};
