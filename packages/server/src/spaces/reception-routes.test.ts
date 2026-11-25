import { spaceMembers } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { loadDemoTemplate } from '../demo.ts';
import { api, loginGuest, startTestServer } from '../test/harness.ts';

describe('configuração por coworking da recepção', () => {
  it('tem default desligado e só um admin pode habilitar a configuração', async () => {
    const server = await startTestServer({ map: loadDemoTemplate() });
    try {
      const guest = await loginGuest(server);
      const path = `/spaces/${server.spaceId}/reception`;
      expect((await api(server, guest, 'GET', path)).status).toBe(403);
      expect((await api(server, guest, 'PUT', path, { enabled: true })).status).toBe(403);
      await server.db.update(spaceMembers).set({ role: 'admin' })
        .where(and(eq(spaceMembers.spaceId, server.spaceId), eq(spaceMembers.userId, guest.id)));
      expect((await api(server, guest, 'GET', path)).json).toEqual({ enabled: false, installationEnabled: false, hasMarker: true });
      expect((await api(server, guest, 'PUT', path, { enabled: 'true' })).status).toBe(400);
      expect((await api(server, guest, 'PUT', path, { enabled: true })).json).toEqual({ enabled: true, installationEnabled: false, hasMarker: true });
      expect((await api(server, guest, 'GET', path)).json).toEqual({ enabled: true, installationEnabled: false, hasMarker: true });
    } finally {
      await server.stop();
    }
  });
});
