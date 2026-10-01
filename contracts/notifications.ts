export type NotificationAudience = 'unassigned' | 'design' | 'marketing';
export type NotificationCadence = 'daily' | 'six_hours' | 'hourly' | 'immediate';
export interface NotificationPreferences {
  audience: NotificationAudience;
  cadence: NotificationCadence;
  enabled: boolean;
  dailyTime: string;
  revision: number;
}
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  audience: 'unassigned', cadence: 'daily', enabled: true, dailyTime: '09:00', revision: 0,
};
export interface NotificationSettings {
  preferences: NotificationPreferences;
  sendingEnabled: boolean;
  lastEmail: { status: 'sent' | 'retry' | 'needs_review' | 'cancelled' | 'ready'; at: string } | null;
}
export interface NotificationItem {
  pieceId: string; sequence: number; client: string; title: string;
  format: string; plannedDate: string | null; kind: 'ready' | 'returned' | 'review'; reason: string;
}
export interface NotificationEmail { from: string; to: string[]; subject: string; html: string; text: string }
export interface NotificationBatch {
  id: string; lease: string; recipient: string; audience: 'design' | 'marketing';
  items: NotificationItem[]; payload: NotificationEmail | null; firstAttemptAt: string | null;
}
