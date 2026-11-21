import { dispatchNotifications, type NotificationEnv } from './notifications';
import { closeStatisticsMonth } from './statistics-scheduler';
// A dedicated Worker is needed: Pages requests alone don't execute on a schedule.
export default {
  scheduled(_event: unknown, env: NotificationEnv, context: {waitUntil(task: Promise<unknown>):void}) {
    context.waitUntil(dispatchNotifications(env).catch(() => { console.warn('notification_dispatch_failed'); }));
    context.waitUntil(closeStatisticsMonth(env).catch(() => { console.warn('statistics_capture_failed'); }));
  },
};
