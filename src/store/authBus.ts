// Tiny event bus so Account (logout / number change) can tell RootNavigator
// to re-check the login gate. No dependencies, no re-renders by itself.
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeAuthChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyAuthChanged(): void {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}
