import { describe, it, expect } from 'vitest';
import { planFormFillFormlessFromHtml } from '../adapters/forms/html-form.js';

const OZON_MODAL_SNIPPET = `
<div class="modal">
  <input id="ln" placeholder="Фамилия" type="text" />
  <input placeholder="Имя" type="text" />
  <input placeholder="Email" type="email" />
  <input placeholder="Telegram" type="text" />
  <input type="file" />
</div>
`;

describe('planFormFillFormlessFromHtml', () => {
  it('plans Ozon-like modal fields by placeholder (no <form>)', () => {
    const plan = planFormFillFormlessFromHtml(
      OZON_MODAL_SNIPPET,
      {
        name: 'Ilya Silkin',
        contact: { email: 'test@example.com', telegram: '@user' },
      },
      'Hello',
    );
    expect(plan.ok).toBe(true);
    expect(plan.formless).toBe(true);
    expect(plan.fields.length).toBeGreaterThanOrEqual(3);
    const placeholders = plan.fields.map((f) => f.selector);
    expect(placeholders.some((s) => s.includes('Email'))).toBe(true);
    expect(plan.fields.find((f) => f.key === 'firstName')?.value).toBe('Ilya');
    expect(plan.fields.find((f) => f.key === 'lastName')?.value).toBe('Silkin');
  });

  it('returns no_form when nothing mappable', () => {
    const plan = planFormFillFormlessFromHtml('<div><input type="hidden" name="x" /></div>', {}, '');
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('no_form');
  });
});
