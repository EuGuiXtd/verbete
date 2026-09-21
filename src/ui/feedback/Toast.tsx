import { useEffect } from 'react';

/**
 * How long a rejection toast stays up before dismissing itself. Not a
 * design token: this is reading time, not motion, and it is unaffected by
 * prefers-reduced-motion — a player who wants less animation still needs
 * long enough to read "Essa palavra não está no dicionário".
 */
const DISPLAY_MS = 2600;

export interface ToastProps {
  readonly id: number;
  readonly message: string;
  readonly onDismiss: (id: number) => void;
}

/**
 * One rejection notice. Owns its own dismiss timer so ToastHost only has to
 * render whatever list it is given — it never manages timing itself.
 */
export function Toast({ id, message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, DISPLAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [id, onDismiss]);

  return <div className="aviso">{message}</div>;
}
