import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeridiaClient } from '../src/client';
import { httpFetch } from '../src/http';

vi.mock('../src/http', () => ({
  httpFetch: vi.fn(),
}));

const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };

describe('Veridia Client', () => {
  beforeEach(() => {
    vi.mocked(httpFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: [] }),
    } as any);
  });

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

  describe('getUserSegments', () => {
    const segmentCredentials = {
      ...credentials,
      logger: { error: vi.fn() },
    };

    beforeEach(() => {
      segmentCredentials.logger.error = vi.fn();
      vi.clearAllMocks();
      vi.mocked(httpFetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: ['seg-1', 'seg-2'] }),
      } as any);
    });

    it('returns the segments when the API responds with success', async () => {
      const client = new VeridiaClient(segmentCredentials);

      const result = await client.getUserSegments('userId', 'user-123');

      expect(result).toEqual(['seg-1', 'seg-2']);
      expect(httpFetch).toHaveBeenCalled();
      expect(segmentCredentials.logger.error).not.toHaveBeenCalled();
    });

    it('logs and returns empty array when response is not ok', async () => {
      vi.mocked(httpFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123')).resolves.toEqual([]);

      expect(segmentCredentials.logger.error).toHaveBeenCalledWith(
        'segments',
        'getUserSegments API call failed',
        { status: 500 },
      );
    });

    it('logs invalid payloads and returns empty array', async () => {
      vi.mocked(httpFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'oops' }),
      } as any);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123')).resolves.toEqual([]);

      expect(segmentCredentials.logger.error).toHaveBeenCalledWith(
        'segments',
        'getUserSegments API returned invalid response',
        { data: { status: 'oops' } },
      );
    });

    it('returns empty array when fetch rejects and logs the error', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      vi.mocked(httpFetch).mockRejectedValueOnce(abortError);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123')).resolves.toEqual([]);

      expect(segmentCredentials.logger.error).toHaveBeenCalledWith(
        'segments',
        'getUserSegments encountered an error',
        { error: abortError },
      );
    });
  });
});
