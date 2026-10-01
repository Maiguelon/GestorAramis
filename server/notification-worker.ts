import { dispatchNotifications, type NotificationEnv } from './notifications';
// A dedicated Worker is needed: Pages requests alone don't execute on a schedule.
export default {
  scheduled(_event: unknown, env: NotificationEnv, context: {waitUntil(task: Promise<unknown>):void}) {
    context.waitUntil(dispatchNotifications(env).catch(() => { console.warn('notification_dispatch_failed'); }));
  },
};
