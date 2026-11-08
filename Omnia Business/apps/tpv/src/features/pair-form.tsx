'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from '@/components/ui';
import { pairTerminal } from '@/server/actions';

export function PairForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const shown = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;

  return (
    <form
      className="flex flex-col gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await pairTerminal(clean);
          if (result.ok) router.replace('/');
          else setError(result.error);
        });
      }}
    >
      <label htmlFor="code" className="text-[13px] font-medium text-ink-2">
        Código de vinculación
      </label>
      <input
        id="code"
        value={shown}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        className="h-16 rounded-[14px] px-4 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-center font-mono text-3xl font-bold tracking-[0.2em] uppercase"
        autoFocus
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" variant="primary" size="lg" disabled={clean.length !== 8 || pending}>
        {pending ? 'Vinculando…' : 'Vincular'}
      </Button>
    </form>
  );
}
