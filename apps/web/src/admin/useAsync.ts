import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly reload: () => void;
  readonly set: (data: T) => void;
}

/** Loads `load()` on mount / when `key` changes; exposes reload + optimistic set. */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    load().then(
      (d) => active && setData(d),
      (e: unknown) => active && setError(errorText(e)),
    );
    return (): void => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the load
  }, [key, tick]);

  const reload = useCallback((): void => setTick((t) => t + 1), []);
  return { data, error, reload, set: setData };
}

/** Message for a caught error (ApiError carries the server's message). */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
