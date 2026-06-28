import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planFormFill } from '../workers/form-apply.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'simple-form.html');

describe('form apply boundary', () => {
  it('builds fill plan from static HTML form', () => {
    const html = readFileSync(fixture, 'utf8');
    const plan = planFormFill(
      html,
      { contact: { email: 'test@example.com', telegram: '@ilyayaya27' } },
      'Hello cover letter',
    );
    expect(plan.ok).toBe(true);
    const byName = Object.fromEntries(plan.fields.map((f) => [f.name, f.value]));
    expect(byName.applicant_name).toBeTruthy();
    expect(byName.email).toBe('test@example.com');
    expect(byName.telegram).toBe('ilyayaya27');
    expect(byName.cover_letter).toBe('Hello cover letter');
  });
});
