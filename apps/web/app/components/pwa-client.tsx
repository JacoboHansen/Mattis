'use client';

import { useEffect } from 'react';

import { scheduleStoredReminder } from '../../lib/pwa-reminders';

export default function PwaClient() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').then(() => scheduleStoredReminder());
  }, []);

  return null;
}
