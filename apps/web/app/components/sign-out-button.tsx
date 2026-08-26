'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setIsSigningOut(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error('Utloggingen kunne ikke fullføres.');
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Utloggingen kunne ikke fullføres.');
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <button
        className="button ghost sign-out-button"
        disabled={isSigningOut}
        onClick={() => void signOut()}
        type="button"
      >
        {isSigningOut ? 'Logger ut …' : 'Logg ut'}
      </button>
      {error ? (
        <p className="form-message" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
