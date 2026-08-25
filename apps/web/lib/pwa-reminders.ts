'use client';

const REMINDER_KEY = 'mattis:scheduled-reminder';

type StoredReminder = {
  at: string;
};

function readReminder(): StoredReminder | null {
  try {
    const raw = window.localStorage.getItem(REMINDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReminder>;
    return typeof parsed.at === 'string' ? { at: parsed.at } : null;
  } catch {
    return null;
  }
}

async function showReminder() {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Mattis', {
    body: 'Matteøkten din er klar.',
    tag: 'mattis-session',
    icon: '/icons/mattis-icon.svg',
    badge: '/icons/mattis-icon.svg',
    data: { url: '/home' },
  });
  window.localStorage.removeItem(REMINDER_KEY);
}

export function scheduleLocalPwaReminder(plannedAt: string) {
  try {
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify({ at: plannedAt }));
  } catch {
    return;
  }
  void scheduleStoredReminder();
}

export async function requestPwaReminder(plannedAt: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unavailable' as const;
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') return permission;
  if (!('serviceWorker' in navigator)) return 'unavailable' as const;
  scheduleLocalPwaReminder(plannedAt);
  return 'granted' as const;
}

export async function scheduleStoredReminder() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const reminder = readReminder();
  if (!reminder) return;
  const at = Date.parse(reminder.at);
  if (!Number.isFinite(at)) {
    window.localStorage.removeItem(REMINDER_KEY);
    return;
  }
  const delay = at - Date.now();
  if (delay <= 0) {
    if ('Notification' in window && Notification.permission === 'granted') await showReminder();
    return;
  }
  window.setTimeout(() => void scheduleStoredReminder(), Math.min(delay, 2_147_000_000));
}
