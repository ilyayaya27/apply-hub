/**
 * Воронка откликов: source → matched → applied → reply.
 * Показывает, какой канал реально конвертит в ответы работодателей.
 *
 * Данные: vacancies (harvested/applied по source и route),
 *         applications (успешные отклики), email_replies (ответы из inbox-check).
 */
import { config } from './config.js';
import { getDb } from './db.js';

const APPLIED_FILTER = `error IS NULL AND method != 'needs_human'`;

export function buildFunnelReport() {
  const db = getDb(config.dbPath);

  const num = (row, key = 'c') => Number(row?.[key] ?? 0);

  const harvested = num(db.prepare(`SELECT COUNT(*) AS c FROM vacancies`).get());
  const statusRows = db.prepare(`SELECT status, COUNT(*) AS c FROM vacancies GROUP BY status`).all();
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, num(r)]));

  const applied = num(
    db.prepare(`SELECT COUNT(*) AS c FROM applications WHERE ${APPLIED_FILTER}`).get(),
  );
  const replies = num(db.prepare(`SELECT COUNT(*) AS c FROM email_replies`).get());
  const directReplies = num(
    db.prepare(`SELECT COUNT(*) AS c FROM email_replies WHERE matched_vacancy_id IS NOT NULL`).get(),
  );

  const byRoute = db
    .prepare(
      `SELECT route,
              COUNT(*) AS total,
              SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END) AS applied
       FROM vacancies GROUP BY route ORDER BY total DESC`,
    )
    .all()
    .map((r) => ({ route: r.route ?? '—', total: num(r, 'total'), applied: num(r, 'applied') }));

  const repliesBySource = Object.fromEntries(
    db
      .prepare(
        `SELECT v.source AS source, COUNT(*) AS c
         FROM email_replies r JOIN vacancies v ON v.id = r.matched_vacancy_id
         GROUP BY v.source`,
      )
      .all()
      .map((r) => [r.source, num(r)]),
  );

  const bySource = db
    .prepare(
      `SELECT source,
              COUNT(*) AS total,
              SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END) AS applied
       FROM vacancies GROUP BY source ORDER BY total DESC LIMIT 20`,
    )
    .all()
    .map((r) => ({
      source: r.source ?? '—',
      total: num(r, 'total'),
      applied: num(r, 'applied'),
      replies: repliesBySource[r.source] ?? 0,
    }));

  const recentReplies = db
    .prepare(
      `SELECT from_addr, from_name, subject, priority, received_at, matched_vacancy_id
       FROM email_replies ORDER BY received_at DESC LIMIT 10`,
    )
    .all();

  const replyRatePct = applied > 0 ? Math.round((replies / applied) * 1000) / 10 : 0;

  return {
    overall: {
      harvested,
      queued: byStatus.queued ?? 0,
      applied,
      skipped: byStatus.skipped ?? 0,
      needsHuman: byStatus.needs_human ?? 0,
      replies,
      directReplies,
      replyRatePct,
    },
    byRoute,
    bySource,
    recentReplies,
  };
}

export function formatFunnelReport(r) {
  const o = r.overall;
  const lines = [];
  lines.push('📊 Воронка откликов');
  lines.push('');
  lines.push(`Найдено:      ${o.harvested}`);
  lines.push(`В очереди:     ${o.queued}`);
  lines.push(`Откликнулись:  ${o.applied}`);
  lines.push(`Пропущено:     ${o.skipped}`);
  lines.push(`Ответов:       ${o.replies} (прямых: ${o.directReplies})`);
  lines.push(`Reply-rate:    ${o.replyRatePct}% (ответы / отклики)`);
  lines.push('');
  lines.push('По маршрутам (total → applied):');
  for (const x of r.byRoute) lines.push(`  ${x.route.padEnd(10)} ${x.total} → ${x.applied}`);
  lines.push('');
  lines.push('По источникам (total | applied | replies):');
  for (const x of r.bySource) {
    lines.push(`  ${String(x.source).padEnd(28)} ${x.total} | ${x.applied} | ${x.replies}`);
  }
  if (r.recentReplies.length) {
    lines.push('');
    lines.push('Последние ответы:');
    for (const rep of r.recentReplies) {
      const mark = rep.priority === 'reply' ? '🔥' : '✉️';
      const who = rep.from_name || rep.from_addr;
      const link = rep.matched_vacancy_id ? ' ↳ привязан' : '';
      lines.push(`  ${mark} ${who} — ${String(rep.subject ?? '').slice(0, 50)}${link}`);
    }
  }
  return lines.join('\n');
}
