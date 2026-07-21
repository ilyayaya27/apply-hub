/**
 * Авторазбор ручной очереди — цель: ноль ручной работы.
 *
 * Сканирует и needs_human, и застрявшие queued|manual посты (их dequeueNext
 * никогда не берёт при AUTO_APPLY, поэтому без триажа они лежат вечно).
 *
 * 1. Чужие #резюме-посты → status 'skipped' (мусор из харвеста)
 * 2. Реальные вакансии: достаём контакт (regex + LLM fallback через OpenRouter)
 *    → email найден  → route 'email', обратно в очередь (авто-отправка)
 *    → career-URL    → route 'form', обратно в очередь
 *    → t.me/@username → route 'telegram' + status queued (DM-воркер)
 * 3. Контакта нет → 'skipped' (no_contact)
 *
 * Каждый пост выходит из бакета 'manual' навсегда (в email/form/telegram или skipped),
 * поэтому повторных LLM-вызовов на тех же постах не происходит.
 *
 * Run: node cli.js triage [--dry-run]
 */
import { config } from '../lib/config.js';
import { getDb } from '../lib/db.js';
import { isCandidateResumePost } from '../lib/resume-post.js';
import { classifyApplyRoute } from '../lib/router.js';

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Реальный DM-хэндл: t.me/user (не пост t.me/channel/123) или @user в тексте
const TG_USER_RE = /(?:^|\s)@([a-z0-9_]{4,32})\b|(?:https?:\/\/)?t\.me\/([a-z0-9_]{4,32})(?![/\w])/i;

async function llmExtractContact(rawText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  if (!apiKey) return null;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Ты извлекаешь контакты для отклика из текста вакансии. ' +
              'Верни JSON: {"is_vacancy": bool, "email": string|null, "telegram": string|null (username без @), ' +
              '"apply_url": string|null, "company": string|null, "role": string|null}. ' +
              'is_vacancy=false если это резюме кандидата, а не вакансия работодателя.',
          },
          { role: 'user', content: rawText.slice(0, 3000) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
  } catch {
    return null;
  }
}

// Сколько раз можно вернуть form/email-заявку в очередь после needs_human, прежде
// чем сдаться окончательно. Без потолка застрявший URL (капча, битая разметка)
// гоняется по кругу вечно: apply-next валит его в needs_human → следующий триаж
// тем же регэкспом находит ту же ссылку и снова кладёт в queued. Нашли живой
// пример: telegram:easy_frontend_jobs:2268 — 26 попыток за неделю, каждые ~2ч.
const MAX_REQUEUE_ATTEMPTS = 2;

export async function runTriage({ dryRun = false } = {}) {
  const db = getDb(config.dbPath);
  const rows = db
    .prepare(
      `SELECT id, route, url, title, company, raw_text FROM vacancies
       WHERE status = 'needs_human'
          OR (status = 'queued' AND route = 'manual')`,
    )
    .all();

  const setStatus = db.prepare(
    `UPDATE vacancies SET status = ?, route = ?, url = COALESCE(?, url), updated_at = datetime('now') WHERE id = ?`,
  );
  const countAttempts = db.prepare(
    `SELECT COUNT(*) AS c FROM applications WHERE vacancy_id = ? AND method = 'needs_human'`,
  );

  const out = { total: rows.length, resumeSkipped: 0, requeued: [], noContact: 0, llmCalls: 0, gaveUp: 0 };

  for (const row of rows) {
    const text = row.raw_text ?? '';

    // 1. Чужие резюме — в архив
    if (isCandidateResumePost(text)) {
      out.resumeSkipped++;
      if (!dryRun) setStatus.run('skipped', row.route, null, row.id);
      continue;
    }

    // 2. Существующий классификатор мог уже знать маршрут (например form по URL)
    const { route: reRoute, primaryUrl } = classifyApplyRoute({ text, links: row.url ? [row.url] : [] });

    let target = null;
    const tgMatch = TG_USER_RE.exec(text);
    if (reRoute === 'email' || (EMAIL_RE.test(text) && reRoute !== 'hh' && reRoute !== 'linkedin')) {
      target = { route: 'email', url: primaryUrl ?? row.url };
    } else if (reRoute === 'form') {
      target = { route: 'form', url: primaryUrl ?? row.url };
    } else if (reRoute === 'telegram') {
      target = { route: 'telegram', url: primaryUrl ?? row.url };
    } else if (tgMatch) {
      // Реальный @handle из текста — строим t.me/<handle>, не ссылку на пост канала
      const handle = tgMatch[1] ?? tgMatch[2];
      target = { route: 'telegram', url: `https://t.me/${handle}` };
    }

    // 3. LLM fallback — когда regex ничего не дал (в dry-run не тратим деньги на API)
    if (!target && !dryRun) {
      out.llmCalls++;
      const ai = await llmExtractContact(text);
      if (ai && ai.is_vacancy === false) {
        out.resumeSkipped++;
        if (!dryRun) setStatus.run('skipped', row.route, null, row.id);
        continue;
      }
      if (ai?.email) target = { route: 'email', url: `mailto:${ai.email}` };
      else if (ai?.apply_url) target = { route: 'form', url: ai.apply_url };
      else if (ai?.telegram) target = { route: 'telegram', url: `https://t.me/${ai.telegram}` };
    }

    // Для общей harvest-очереди telegram-контакты не обрабатываем: отдельного
    // DM-сендера нет и решили не делать (ban-risk + нулевая конверсия по воронке).
    // Верифицированных HR ведёт itptitsa-воркер напрямую из форум-топика.
    if (target?.route === 'telegram') {
      out.telegramArchived = (out.telegramArchived ?? 0) + 1;
      if (!dryRun) setStatus.run('skipped', row.route, null, row.id);
      continue;
    }

    if (target) {
      const priorAttempts = countAttempts.get(row.id).c;
      if (priorAttempts >= MAX_REQUEUE_ATTEMPTS) {
        out.gaveUp++;
        console.log(`[triage] give up ${row.id} — ${priorAttempts} failed needs_human попыток, форма/письмо не работает`);
        if (!dryRun) setStatus.run('skipped', row.route, null, row.id);
        continue;
      }
      out.requeued.push({ id: row.id, route: target.route, url: target.url });
      console.log(`[triage] requeue ${row.id} → ${target.route} (${(target.url ?? '').slice(0, 60)})`);
      if (!dryRun) setStatus.run('queued', target.route, target.url, row.id);
    } else {
      out.noContact++;
      if (!dryRun) setStatus.run('skipped', row.route, null, row.id);
    }
  }

  console.log(
    `[triage] done: total=${out.total} resume_skipped=${out.resumeSkipped} requeued=${out.requeued.length} gave_up=${out.gaveUp} tg_archived=${out.telegramArchived ?? 0} no_contact=${out.noContact} llm=${out.llmCalls}${dryRun ? ' [dry-run]' : ''}`,
  );
  return { ok: true, telegramArchived: 0, ...out };
}
