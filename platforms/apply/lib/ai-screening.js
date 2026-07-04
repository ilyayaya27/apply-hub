/**
 * AI-ответы на скрининговые вопросы в формах заявок.
 * Использует OpenRouter или Groq через OpenAI-совместимый API (нативный fetch).
 * Ключи читаются из credentials.env через config.js.
 */

import { config } from './config.js';

export function buildAiConfig() {
  if (config.openrouterApiKey) {
    return {
      apiKey: config.openrouterApiKey,
      baseURL: config.openrouterBaseUrl,
      model: config.openrouterModel,
    };
  }
  if (config.groqApiKey) {
    return {
      apiKey: config.groqApiKey,
      baseURL: config.groqBaseUrl,
      model: config.groqModel,
    };
  }
  return null;
}

/** @param {{ tag: string, key?: string }} field */
export function isScreeningField(field) {
  return field.tag === 'textarea' && !field.key;
}

/**
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 */
function buildResumeContext(profile, letter) {
  const role = profile.role ?? 'разработчик';
  const keywords = Array.isArray(profile.keywords) ? profile.keywords.join(', ') : '';
  const letterSnippet = typeof letter === 'string' ? letter.slice(0, 800) : '';
  return `Роль: ${role}\nНавыки: ${keywords}\n\n${letterSnippet}`;
}

/**
 * @param {{ apiKey: string, baseURL: string, model: string }} cfg
 * @param {{ question: string, vacancyTitle: string, company: string, context: string, name: string, role: string }} opts
 */
async function callLlm(cfg, { question, vacancyTitle, company, context, name, role }) {
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 250,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `Ты — ${name || 'соискатель'}, ${role}. Отвечай на вопрос анкеты кратко (2–4 предложения), по-русски, без воды. Опирайся только на факты из резюме. Не выдумывай проекты или опыт.`,
        },
        {
          role: 'user',
          content: `Компания: ${company || ''}\nВакансия: ${vacancyTitle || ''}\nВопрос: ${question}\n\nРезюме (краткое):\n${context}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * Обогащает plan.fields AI-ответами для textarea без распознанного key.
 * Мутирует поля на месте (field.value, field.aiGenerated).
 *
 * @param {{ fields: Array<{ tag: string, key?: string, label?: string, selector?: string, name?: string, value: string, aiGenerated?: boolean }> }} plan
 * @param {{ title?: string, company?: string }} vacancy
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 */
export async function enrichPlanWithAiAnswers(plan, vacancy, profile, letter) {
  const screeningFields = plan.fields.filter(isScreeningField);
  if (!screeningFields.length) return plan;

  const cfg = buildAiConfig();
  if (!cfg) {
    console.warn(
      '[ai-screening] Нет OPENROUTER_API_KEY или GROQ_API_KEY — скрининговые вопросы пропускаются',
    );
    return plan;
  }

  const context = buildResumeContext(profile, letter);
  const name = String(profile.name ?? profile.contact?.name ?? '');
  const role = String(profile.role ?? 'Frontend Developer');
  const vacancyTitle = vacancy.title ?? '';
  const company = vacancy.company ?? '';

  for (const field of screeningFields) {
    const question = field.label ?? field.selector ?? field.name ?? '';
    if (!question) continue;
    try {
      const answer = await callLlm(cfg, { question, vacancyTitle, company, context, name, role });
      if (answer) {
        field.value = answer;
        field.aiGenerated = true;
      }
    } catch (err) {
      console.warn(`[ai-screening] Ошибка для "${question}": ${err.message}`);
    }
  }

  return plan;
}
