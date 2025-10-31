import { describe, it, expect, vi } from 'vitest';
import { VeridiaClient } from '../src/client';
import { httpFetch } from '../src/http';

vi.mock('../src/http', () => ({
  httpFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve('ok'),
    }),
  ),
}));

const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };

describe('Veridia Client', () => {
  it('buffers and flushes identify calls', async () => {
    const client = new VeridiaClient(credentials);

    client.identify('userId', 'u1', { email: 'a@b.com' });
    await client.flush();

    expect(httpFetch).toHaveBeenCalledWith(
      expect.stringContaining('/profiles'),
      expect.any(Object),
    );
  });

  it('buffers and flushes track calls', async () => {
    const client = new VeridiaClient(credentials);

    client.track('userId', 'u2', 'purchase', 'evt-1', new Date().toISOString(), { amount: 10 });
    await client.flush();

    expect(httpFetch).toHaveBeenCalledWith(expect.stringContaining('/events'), expect.any(Object));
  });
});
