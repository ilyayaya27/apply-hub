import { config } from './config.js';
import {
  canApplyToday,
  canApplyRouteToday,
  markApplied,
  markFailed,
  markNeedsHuman,
  releaseProcessing,
  releaseStaleProcessing,
  dequeueNext,
  countAppliedToday,
  listQueue,
} from './store.js';
import { applyViaForm } from '../workers/form-apply.js';
import { applyViaEmail } from '../workers/email-apply.js';
import { sendTelegramNotify, formatApplyNotify } from './notify-telegram.js';

const AUTO_ROUTES = new Set(['form', 'email']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const randomDelay = async () => {
  const min = config.applyDelayMsMin ?? 30_000;
  const max = config.applyDelayMsMax ?? 120_000;
  const ms = min + Math.floor(Math.random() * Math.max(0, max - min));
  await sleep(ms);
};

/**
 * @param {object} vacancy
 */
export async function dispatchApply(vacancy) {
  if (!config.autoApply) {
    markNeedsHuman(vacancy.key, 'AUTO_APPLY=false');
    return { ok: false, status: 'needs_human', error: 'auto_apply_off' };
  }

  if (!canApplyToday()) {
    releaseProcessing(vacancy.key, 'queued');
    return { ok: false, status: 'skipped', error: 'daily_limit' };
  }

  if (!canApplyRouteToday(vacancy.route)) {
    markNeedsHuman(vacancy.key, `route limit: ${vacancy.route}`);
    return { ok: false, status: 'needs_human', error: 'route_limit' };
  }

  if (!AUTO_ROUTES.has(vacancy.route)) {
    markNeedsHuman(vacancy.key, `route ${vacancy.route} — ручной отклик`);
    return { ok: false, status: 'needs_human', error: `manual_route_${vacancy.route}` };
  }

  await randomDelay();

  let result;
  if (vacancy.route === 'form') result = await applyViaForm(vacancy);
  else if (vacancy.route === 'email') result = await applyViaEmail(vacancy);
  else {
    markNeedsHuman(vacancy.key, `unsupported ${vacancy.route}`);
    return { ok: false, status: 'needs_human' };
  }

  if (result.status === 'dry_run' || result.status === 'fill_only') {
    releaseProcessing(vacancy.key, 'queued');
    return result;
  }

  if (result.ok) {
    markApplied(vacancy.key, { method: vacancy.route, note: result.note });
    await sendTelegramNotify(
      formatApplyNotify({ title: vacancy.title, route: vacancy.route, ok: true, note: result.note }),
      { kind: 'applied' },
    );
    return result;
  }

  if (result.status === 'needs_human') {
    markNeedsHuman(vacancy.key, result.error ?? 'needs_human');
    await sendTelegramNotify(
      formatApplyNotify({
        title: vacancy.title,
        route: vacancy.route,
        ok: false,
        note: result.error,
      }),
      { kind: 'needs_human' },
    );
    return result;
  }

  markFailed(vacancy.key, result.error ?? 'failed');
  await sendTelegramNotify(
    formatApplyNotify({ title: vacancy.title, route: vacancy.route, ok: false, error: result.error }),
    { kind: 'failed' },
  );
  return result;
}

export async function applyNext() {
  releaseStaleProcessing(15);
  const vacancy = dequeueNext();
  if (!vacancy) return null;
  try {
    const result = await dispatchApply(vacancy);
    return { vacancy, result };
  } catch (err) {
    releaseProcessing(vacancy.key, 'queued');
    throw err;
  }
}

export function getApplyStats() {
  return {
    appliedToday: countAppliedToday(),
    queueLeft: listQueue().length,
  };
}
