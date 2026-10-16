// Comportamento do formulário de diagnóstico no navegador.

import { attributionPayload, captureAttribution, safeLocalStorage } from '../lib/attribution';
import { completeSubmission, submitDiagnostico } from '../lib/diagnostico/submit';
import {
  errorsForStep,
  STEP_FIELDS,
  validateDiagnostico,
  type FieldErrors,
  type FieldName,
} from '../lib/diagnostico/validation';
import { createEventId, LEAD_EVENT_PARAMS, safeSessionStorage, saveLeadHandoff, track } from '../lib/tracking';

type Step = 1 | 2;

const STEP_LABELS: Record<Step, string> = {
  1: 'Etapa 1 de 2 · Contato e empresa',
  2: 'Etapa 2 de 2 · Sobre a sua marcenaria',
};

const ALL_FIELDS: readonly FieldName[] = [...STEP_FIELDS[1], ...STEP_FIELDS[2]];
const GROUP_FIELDS = new Set<FieldName>(['principal_objetivo', 'anuncia_atualmente']);

function stepOf(field: FieldName): Step {
  return (STEP_FIELDS[1] as readonly FieldName[]).includes(field) ? 1 : 2;
}

export function initDiagnosticForm(form: HTMLFormElement): void {
  const stepElements: Record<Step, HTMLFieldSetElement | null> = {
    1: form.querySelector<HTMLFieldSetElement>('fieldset[data-step="1"]'),
    2: form.querySelector<HTMLFieldSetElement>('fieldset[data-step="2"]'),
  };
  const progress = form.querySelector<HTMLElement>('[data-progress]');
  const progressLabel = form.querySelector<HTMLElement>('[data-progress-label]');
  const status = form.querySelector<HTMLElement>('[data-status]');
  const submitButton = form.querySelector<HTMLButtonElement>('[data-submit]');
  const submitLabel = form.querySelector<HTMLElement>('[data-submit-label]');
  const submitText = submitLabel?.textContent ?? '';

  const loadedAt = performance.now();
  let firstInteractionAt: number | null = null;
  let started = false;
  let submitting = false;
  let currentStep: Step = 1;

  // ---------- estado visual ----------

  function setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    if (!status) return;
    status.dataset['tone'] = tone;
    status.textContent = message;
  }

  function setBusy(busy: boolean): void {
    if (!submitButton) return;
    submitButton.disabled = busy;
    submitButton.setAttribute('aria-busy', String(busy));
    if (submitLabel) submitLabel.textContent = busy ? 'Enviando…' : submitText;
  }

  function goToStep(step: Step, focus = true): void {
    currentStep = step;
    for (const key of [1, 2] as const) {
      const element = stepElements[key];
      if (element) element.hidden = key !== step;
    }
    if (progress) progress.dataset['step'] = String(step);
    if (progressLabel) progressLabel.textContent = STEP_LABELS[step];
    if (focus) stepElements[step]?.focus();
  }

  // ---------- erros por campo ----------

  function fieldControl(field: FieldName): HTMLElement | null {
    const item = form.elements.namedItem(field);
    if (item instanceof RadioNodeList) {
      const first = item[0];
      return first instanceof HTMLElement ? first : null;
    }
    return item instanceof HTMLElement ? item : null;
  }

  function setFieldError(field: FieldName, message: string | undefined): void {
    const error = form.querySelector<HTMLElement>(`#dg-${field}-err`);
    if (error) {
      error.textContent = message ?? '';
      error.hidden = !message;
    }

    if (GROUP_FIELDS.has(field)) {
      const group = form.querySelector<HTMLElement>(`[data-group="${field}"]`);
      if (group) group.dataset['invalid'] = message ? 'true' : 'false';
      return;
    }

    const control = fieldControl(field);
    if (control) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
    if (field === 'consentimento_privacidade') {
      const consent = form.querySelector<HTMLElement>('[data-consent]');
      if (consent) consent.dataset['invalid'] = message ? 'true' : 'false';
    }
  }

  function showErrors(errors: FieldErrors, fields: readonly FieldName[]): FieldName | null {
    let first: FieldName | null = null;
    for (const field of fields) {
      const message = errors[field];
      setFieldError(field, message);
      if (message && !first) first = field;
    }
    return first;
  }

  function focusField(field: FieldName): void {
    const step = stepOf(field);
    if (step !== currentStep) goToStep(step, false);
    fieldControl(field)?.focus();
  }

  function announceErrors(errors: FieldErrors): void {
    const count = Object.keys(errors).length;
    setStatus(count === 1 ? 'Revise o campo destacado.' : `Revise os ${count} campos destacados.`, 'error');
  }

  // ---------- dados ----------

  function collectPayload(): Record<string, unknown> {
    const data = new FormData(form);
    const text = (name: string): string => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const attribution = attributionPayload(
      captureAttribution(safeLocalStorage(), new URL(window.location.href), Date.now()),
      window.location.pathname,
    );

    return {
      nome: text('nome'),
      whatsapp: text('whatsapp'),
      email: text('email'),
      empresa: text('empresa'),
      cidade_estado: text('cidade_estado'),
      instagram_url: text('instagram_url'),
      site_url: text('site_url'),
      principal_objetivo: text('principal_objetivo'),
      servico_prioritario: text('servico_prioritario'),
      anuncia_atualmente: text('anuncia_atualmente'),
      investimento_mensal: text('investimento_mensal'),
      capacidade_mensal: text('capacidade_mensal'),
      observacoes: text('observacoes'),
      consentimento_privacidade: data.get('consentimento_privacidade') === 'sim',
      hp_extra: text('hp_extra'),
      elapsed_ms: Math.round(performance.now() - (firstInteractionAt ?? loadedAt)),
      ...attribution,
    };
  }

  // ---------- eventos ----------

  form.addEventListener('focusin', () => {
    firstInteractionAt ??= performance.now();
  });

  const onFieldChange = (event: Event): void => {
    firstInteractionAt ??= performance.now();
    if (!started) {
      started = true;
      track('StartDiagnostic');
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      const name = target.name as FieldName;
      if (ALL_FIELDS.includes(name)) setFieldError(name, undefined);
    }
  };
  form.addEventListener('input', onFieldChange);
  form.addEventListener('change', onFieldChange);

  function advance(): void {
    const result = validateDiagnostico(collectPayload());
    const stepErrors = result.ok ? {} : errorsForStep(result.errors, 1);
    const first = showErrors(stepErrors, STEP_FIELDS[1]);
    if (first) {
      announceErrors(stepErrors);
      focusField(first);
      return;
    }
    setStatus('');
    goToStep(2);
  }

  form.querySelector('[data-action="next"]')?.addEventListener('click', advance);
  form.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    setStatus('');
    goToStep(1);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentStep === 1) {
      advance();
      return;
    }
    if (submitting) return;

    const payload = collectPayload();
    const result = validateDiagnostico(payload);
    if (!result.ok) {
      const first = showErrors(result.errors, ALL_FIELDS);
      announceErrors(result.errors);
      if (first) focusField(first);
      return;
    }

    submitting = true;
    setBusy(true);
    setStatus('Enviando seu diagnóstico…');

    const outcome = await submitDiagnostico(payload, (input, init) => window.fetch(input, init));

    if (outcome.kind === 'success') {
      setStatus('Diagnóstico enviado. Abrindo a página para escolher o horário…');
      completeSubmission(outcome, {
        createEventId,
        handoffLead: (eventId) => saveLeadHandoff(safeSessionStorage(), { eventId, at: Date.now() }),
        trackLead: (eventId) => {
          track('Lead', LEAD_EVENT_PARAMS, { eventID: eventId });
        },
        navigate: (path) => window.location.assign(path),
      });
      return;
    }

    submitting = false;
    setBusy(false);

    if (outcome.kind === 'validation') {
      const first = showErrors(outcome.fields, ALL_FIELDS);
      announceErrors(outcome.fields);
      if (first) focusField(first);
      return;
    }
    setStatus(outcome.message, 'error');
  });

  // Voltar do agendamento pelo botão do navegador restaura a página do cache: libera o botão.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      submitting = false;
      setBusy(false);
      setStatus('');
    }
  });
}
