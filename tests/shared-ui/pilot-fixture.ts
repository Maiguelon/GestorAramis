import { expect, type BrowserContext } from '@playwright/test';

/** Existing internal-flow fixtures now include the read-only header visibility lookup. */
export async function installEmptyClientPilot(context: BrowserContext) {
  await context.route('**/api/client-pilot/staff', route => {
    const payload = route.request().postDataJSON();
    expect(payload.action).toBe('staff-view');
    return route.fulfill({ json: {
      client: { id: payload.clientId, name: 'Cliente de prueba', initials: 'CP', color: '#1b2a41' },
      pieces: [], requests: [], linkActive: false,
    } });
  });
}
