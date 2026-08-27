'use client';

import { useState } from 'react';

export default function SafetyNotificationSettings({
  initialEnabled,
  hasUnder12 = false,
}: {
  initialEnabled: boolean;
  hasUnder12?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function update(value: boolean) {
    const previous = enabled;
    setEnabled(value);
    setIsSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/parent/safety-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: value }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        enabled?: boolean;
        error?: string;
      };
      if (!response.ok || typeof result.enabled !== 'boolean') {
        throw new Error(result.error ?? 'Innstillingen kunne ikke lagres.');
      }
      setEnabled(result.enabled);
      setMessage(
        result.enabled
          ? 'Nøytrale oppfølgingsvarsler er på.'
          : 'Oppfølgingsvarsler er av.',
      );
    } catch (error) {
      setEnabled(previous);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Innstillingen kunne ikke lagres.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card parent-settings-card safety-settings-card">
      <div>
        <strong>Trygge oppfølgingsvarsler</strong>
        <span>
          Mattis kan sende en nøytral e-post hvis en elev skriver noe som
          tydelig bør følges opp. E-posten inneholder ikke sitater, detaljer
          eller diagnoser.
        </span>
      </div>
      <label className="safety-toggle">
        <input
          checked={enabled}
          disabled={isSaving || hasUnder12}
          onChange={(event) => void update(event.target.checked)}
          type="checkbox"
        />
        <span>Jeg ønsker slike varsler på e-post</span>
      </label>
      {hasUnder12 ? (
        <p className="field-hint">
          Varsler for elever under 12 år er alltid på. De kan ikke slås av.
        </p>
      ) : null}
      <p className="field-hint">
        Dette er ikke en akuttjeneste. Ved umiddelbar fare: ring 113. Barn og
        unge kan kontakte Alarmtelefonen på 116 111.
      </p>
      {message ? (
        <p aria-live="polite" className="form-message">
          {message}
        </p>
      ) : null}
    </section>
  );
}
