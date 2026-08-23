'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const INSTALL_DISMISSED_KEY = 'mattis:pwa-install-dismissed-until';
const INSTALL_DISMISSED_MS = 14 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isInstallDismissed() {
  try {
    return Number(localStorage.getItem(INSTALL_DISMISSED_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now() + INSTALL_DISMISSED_MS));
  } catch {
    // Local storage may be unavailable in private browsing.
  }
}

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (
      pathname !== '/home' ||
      !deferredPrompt ||
      isVisible ||
      isStandaloneMode() ||
      isInstallDismissed()
    ) {
      return;
    }

    const timeout = window.setTimeout(() => setIsVisible(true), 4500);
    return () => window.clearTimeout(timeout);
  }, [deferredPrompt, isVisible, pathname]);

  function dismiss() {
    rememberDismissal();
    setIsVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
        rememberDismissal();
      }
      setIsVisible(false);
      setDeferredPrompt(null);
    } finally {
      setIsInstalling(false);
    }
  }

  if (!isVisible) return null;

  return (
    <aside className="pwa-install-prompt" role="dialog" aria-labelledby="pwa-install-title">
      <span className="mattis-glyph pwa-install-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div className="pwa-install-copy">
        <strong id="pwa-install-title">Legg Mattis på hjemskjermen?</strong>
        <p>Da åpner Mattis som en egen app uten adressefelt.</p>
      </div>
      <button
        className="pwa-install-dismiss"
        type="button"
        aria-label="Ikke nå"
        onClick={dismiss}
      >
        ×
      </button>
      <button
        className="setup-option pwa-install-button"
        type="button"
        disabled={isInstalling}
        onClick={() => void install()}
      >
        {isInstalling ? 'Installerer …' : 'Installer'}
      </button>
    </aside>
  );
}
