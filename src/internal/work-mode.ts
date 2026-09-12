export type WorkMode = 'management' | 'design';

// Presentation preference only. Never used to authorize data or commands.
export function workModeKey(mode: string, workspaceId: string, memberId: string) {
  return `aramis.work-mode.v1:${mode}:${workspaceId}:${memberId}`;
}
export function readWorkMode(key: string): WorkMode {
  try { return localStorage.getItem(key) === 'design' ? 'design' : 'management'; }
  catch { return 'management'; }
}
