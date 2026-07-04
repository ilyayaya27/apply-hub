/**
 * Персонализация сопроводительного письма под конкретную вакансию через LLM.
 *
 * Режимы (config.letterMode / LETTER_MODE):
 *   'static' — всегда базовое letter.txt (по умолчанию)
 *   'llm'    — всегда персонализированное (fallback на базовое при ошибке)
 *   'ab'     — 50/50 случайно, для замера reply-rate по вариантам (см. cli.js funnel)
 *
 * Персонализация ТРУТ: модели запрещено выдумывать опыт/компании/цифры —
 * только переупаковка фактов из базового письма под вакансию.
 */
import { config } from './config.js';
import { buildAiConfig } from './ai-screening.js';

/**
 * @param {{ vacancy: object, profile: Record<string, unknown>, baseLetter: string }} args
 * @returns {Promise<{ text: string, variant: 'static' | 'llm' }>}
 */
export async function resolveLetter({ vacancy, profile, baseLetter }) {
  const mode = (config.letterMode ?? 'static').toLowerCase();

  // dry-run не тратит деньги на LLM; static — тоже без вызовов
  if (config.dryRun || mode === 'static') return { text: baseLetter, variant: 'static' };

  const useLlm = mode === 'llm' || (mode === 'ab' && Math.random() < 0.5);
  if (!useLlm) return { text: baseLetter, variant: 'static' };

  const personalized = await personalizeLetter({ vacancy, profile, baseLetter }).catch(() => null);
  if (personalized && personalized.length > 40) return { text: personalized, variant: 'llm' };
  return { text: baseLetter, variant: 'static' }; // fallback — не рискуем пустым письмом
}

/**
 * @param {{ vacancy: object, profile: Record<string, unknown>, baseLetter: string }} args
 * @returns {Promise<string>}
 */
export async function personalizeLetter({ vacancy, profile, baseLetter }) {
  const cfg = buildAiConfig();
  if (!cfg) return '';

  const name = profile.name_ru ?? profile.name ?? profile.name_en ?? 'соискатель';
  const role = profile.role ?? 'разработчик';
  const company = vacancy.company ?? '';
  const title = vacancy.title ?? '';
  const vacancyText = String(vacancy.rawText ?? vacancy.raw_text ?? '').slice(0, 1200);

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 400,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            `Ты — ${name}, ${role}. Напиши короткое сопроводительное письмо (3–5 предложений) ` +
            `под конкретную вакансию. Пиши на том же языке, что и базовое письмо. ` +
            `Тон — дружелюбный, по делу, без канцелярита и воды. ` +
            `КРИТИЧНО: опирайся ТОЛЬКО на факты из базового письма — не выдумывай опыт, ` +
            `компании, технологии или цифры, которых там нет. Верни только текст письма, без преамбул.`,
        },
        {
          role: 'user',
          content:
            `Компания: ${company}\nВакансия: ${title}\n` +
            `Описание вакансии:\n${vacancyText}\n\n` +
            `Базовое письмо (мои реальные факты):\n${baseLetter}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) throw new Error(`letter LLM ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}
