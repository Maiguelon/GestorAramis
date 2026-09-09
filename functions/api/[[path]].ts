import worker, { type WorkerEnv } from '../../server/index';

/** Pages Functions runs the same Worker API alongside the static UI, under /api/*. */
export const onRequest = (context: { request: Request; env: WorkerEnv }) => worker.fetch(context.request, context.env);
