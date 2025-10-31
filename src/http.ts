let _fetch: typeof fetch | undefined;

async function getFetch(): Promise<typeof fetch> {
  if (_fetch) return _fetch;

  if (typeof globalThis.fetch === 'function') {
    _fetch = globalThis.fetch.bind(globalThis);
  } else {
    const mod = await import('node-fetch');
    _fetch = (mod.default ?? mod) as any;
  }

  return _fetch!;
}

export async function httpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const f = await getFetch();
  return f(input, init);
}
