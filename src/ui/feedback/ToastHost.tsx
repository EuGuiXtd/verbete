import { Toast } from './Toast';

export interface ToastItem {
  readonly id: number;
  readonly text: string;
}

export interface ToastHostProps {
  readonly toasts: readonly ToastItem[];
  readonly onDismiss: (id: number) => void;
}

/**
 * One `aria-live` region holding every active toast, oldest on top. A stack
 * rather than a single slot: a fast typist who trips several rejections in
 * a row (too-short, then not-in-dictionary, then already-guessed) sees each
 * reason in turn instead of one silently replacing the last.
 */
export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  return (
    <div
      // Positioned against Shell's `<main>` (the nearest `relative`
      // ancestor, since this renders inside the `board` slot), not
      // viewport-fixed — a fixed position at either the top or the bottom
      // of the screen would sit on top of the header or the keyboard on at
      // least some viewport heights, and at the bottom specifically, on top
      // of "enviar"/"apagar", blocking the very keys a player needs to
      // react to the rejection.
      className="pointer-events-none absolute inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast id={toast.id} message={toast.text} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
