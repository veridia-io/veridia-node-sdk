import { describe, it, expect, vi } from 'vitest';

describe('httpFetch', () => {
  it('resolves with a Response-like object', async () => {
    vi.resetModules();
    const originalFetch = globalThis.fetch;

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: { hello: 'name' },
        headers: { 'content-type': 'application/json' },
      }),
    } as const;
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { httpFetch } = await import('../src/http');

      const requestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'name' }),
      };

      const res = await httpFetch('https://example.com/post', requestInit);

      expect(res).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/post', requestInit);
      await expect(res.json()).resolves.toEqual({
        data: { hello: 'name' },
        headers: { 'content-type': 'application/json' },
      });
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, 'fetch');
      }
      vi.resetModules();
    }
  });

  it('falls back to node-fetch when global fetch is unavailable', async () => {
    vi.resetModules();
    const originalFetch = globalThis.fetch;
    const deleted = Reflect.deleteProperty(globalThis as Record<string, unknown>, 'fetch');
    if (!deleted) {
      (globalThis as Record<string, unknown>).fetch = undefined;
    }

    const nodeFetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.doMock('node-fetch', () => ({ default: nodeFetchMock }));

    try {
      const { httpFetch } = await import('../src/http');

      await httpFetch('https://example.com/path');

      expect(nodeFetchMock).toHaveBeenCalledWith('https://example.com/path', undefined);
    } finally {
      vi.doUnmock('node-fetch');
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else if (deleted) {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, 'fetch');
      } else {
        (globalThis as Record<string, unknown>).fetch = undefined;
      }
      vi.resetModules();
    }
  });
});
