import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from '../UpdatePrompt';

/**
 * `useRegisterSW` itself is vite-plugin-pwa's own client code (backed by
 * workbox-window and real service-worker events) — nothing this project
 * owns, and nothing a jsdom unit test can meaningfully exercise. What IS
 * this project's own code, and worth proving here, is what `UpdatePrompt`
 * does with the hook's `onNeedReload` callback: stays invisible until it
 * fires, then renders the Portuguese prompt and wires "recarregar" to an
 * actual reload — none of which `e2e/pwa-offline.spec.ts` (a real service
 * worker, but never an update) touches at all.
 */
let capturedOnNeedReload: (() => void) | null = null;
let capturedOnRegisteredSW: ((swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void) | null =
  null;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: {
    onNeedReload?: () => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  }) => {
    capturedOnNeedReload = options.onNeedReload ?? null;
    capturedOnRegisteredSW = options.onRegisteredSW ?? null;
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  capturedOnNeedReload = null;
  capturedOnRegisteredSW = null;
});

describe('UpdatePrompt', () => {
  it('renders nothing until the service worker reports a new version is ready', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the Portuguese update prompt once onNeedReload fires', () => {
    render(<UpdatePrompt />);
    expect(capturedOnNeedReload).toBeTypeOf('function');

    act(() => {
      capturedOnNeedReload?.();
    });

    expect(screen.getByText('Nova versão disponível')).toBeDefined();
    expect(screen.getByRole('button', { name: 'recarregar' })).toBeDefined();
  });

  it('reloads the page when "recarregar" is activated', () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    // jsdom's window.location.reload is a no-op that cannot be spied on
    // directly (it throws "Not implemented"); replacing the whole object is
    // the documented workaround.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    render(<UpdatePrompt />);
    act(() => {
      capturedOnNeedReload?.();
    });
    screen.getByRole('button', { name: 'recarregar' }).click();

    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  describe('periodic update check', () => {
    /**
     * Regression test for a real race found during this task's manual
     * play-test (see UpdatePrompt.tsx's own doc comment on
     * `onRegisteredSW`): vite-plugin-pwa's own `updatefound` listener only
     * attaches after its `register()` call resolves, so a server that is
     * ALREADY serving a newer service worker at that exact moment can
     * install and activate the update before anything is listening for it
     * — the reload prompt then silently never appears. Polling
     * `registration.update()` ourselves, on an interval started only once
     * registration has already succeeded, is what closes that gap for
     * every check after the first.
     */
    it('polls registration.update() periodically once registered', () => {
      vi.useFakeTimers();
      const update = vi.fn().mockResolvedValue(undefined);
      const registration = { update } as unknown as ServiceWorkerRegistration;

      render(<UpdatePrompt />);
      expect(capturedOnRegisteredSW).toBeTypeOf('function');

      act(() => {
        capturedOnRegisteredSW?.('/sw.js', registration);
      });
      expect(update).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(update).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(update).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('never polls when registration is undefined (registration failed)', () => {
      vi.useFakeTimers();
      render(<UpdatePrompt />);

      act(() => {
        capturedOnRegisteredSW?.('/sw.js', undefined);
      });
      // Nothing to assert a call count on — this just proves calling the
      // callback with `undefined` doesn't throw (e.g. from an interval set
      // up against a non-existent registration).
      expect(() => {
        vi.advanceTimersByTime(120_000);
      }).not.toThrow();

      vi.useRealTimers();
    });
  });
});
