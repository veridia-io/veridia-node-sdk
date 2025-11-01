import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VeridiaClient } from '../src/client';
import { httpFetch } from '../src/http';
import type { VeridiaLogger } from '../src/types';

vi.mock('../src/http', () => ({
  httpFetch: vi.fn(),
}));

const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };

describe('Veridia Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('automatic flushing', () => {
    const smallBufferOptions = {
      ...credentials,
      maxBufferSize: 1,
      maxBufferTimeMs: 25,
    } as const;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(httpFetch).mockReset();
      vi.mocked(httpFetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: [] }),
      } as any);
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    it('flushes automatically when the buffer size limit is reached', async () => {
      const client = new VeridiaClient(smallBufferOptions);

      client.track('userId', 'auto-size', 'auto-event', 'evt-auto', new Date().toISOString(), {
        amount: 1,
      });

      await vi.advanceTimersByTimeAsync(5);

      expect(httpFetch).toHaveBeenCalledTimes(1);
      expect(httpFetch).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.any(Object),
      );
    });

    it('flushes automatically once the buffer timer elapses', async () => {
      const client = new VeridiaClient({
        ...smallBufferOptions,
        maxBufferSize: 2,
      });

      client.identify('userId', 'timer-user', { email: 'timer@example.com' });

      expect(httpFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(25);

      expect(httpFetch).toHaveBeenCalledTimes(1);
      expect(httpFetch).toHaveBeenCalledWith(
        expect.stringContaining('/profiles'),
        expect.any(Object),
      );
    });

    it('no automatic flush when the buffer size limit is reached', async () => {
      const client = new VeridiaClient({ ...smallBufferOptions, autoFlush: false });

      client.track('userId', 'auto-size', 'auto-event', 'evt-auto', new Date().toISOString(), {
        amount: 1,
      });

      expect(httpFetch).not.toHaveBeenCalled();
    });

    it('no automatic flush once the buffer timer elapses', async () => {
      const client = new VeridiaClient({
        ...smallBufferOptions,
        autoFlush: false,
        maxBufferSize: 2,
      });

      client.identify('userId', 'timer-user', { email: 'timer@example.com' });

      expect(httpFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(25);

      expect(httpFetch).not.toHaveBeenCalled();
    });

    it('logs automatic flush errors when triggered by buffer size', async () => {
      const logger: VeridiaLogger = { error: vi.fn() };
      const client = new VeridiaClient({ ...smallBufferOptions, logger });
      const failure = new Error('buffer auto flush failed');
      const flushSpy = vi.spyOn(client as any, 'flush').mockRejectedValue(failure);

      client.track(
        'userId',
        'buffer-failure',
        'auto-event',
        'evt-auto-fail',
        new Date().toISOString(),
        {
          amount: 1,
        },
      );

      const flushPromise = flushSpy.mock.results[0]?.value as Promise<unknown> | undefined;
      expect(flushPromise).toBeInstanceOf(Promise);
      await flushPromise!.catch(() => {});

      expect(logger.error).toHaveBeenCalledWith('flush', 'automatic flush failed', {
        error: failure,
      });

      flushSpy.mockRestore();
    });

    it('logs automatic flush errors when triggered by timer', async () => {
      const logger: VeridiaLogger = { error: vi.fn() };
      const client = new VeridiaClient({
        ...smallBufferOptions,
        logger,
        maxBufferSize: 2,
      });
      const failure = new Error('timer auto flush failed');
      const flushSpy = vi.spyOn(client as any, 'flush').mockRejectedValue(failure);

      client.identify('userId', 'timer-failure', { email: 'timer@example.com' });

      await vi.advanceTimersByTimeAsync(25);

      const flushPromise = flushSpy.mock.results[0]?.value as Promise<unknown> | undefined;
      expect(flushPromise).toBeInstanceOf(Promise);
      await flushPromise!.catch(() => {});

      expect(logger.error).toHaveBeenCalledWith('flush', 'automatic flush failed', {
        error: failure,
      });

      flushSpy.mockRestore();
    });
  });

  it('retries flushes, logs failures, and only flushes newly queued data after recovery', async () => {
    vi.useFakeTimers();

    const logger: VeridiaLogger = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    const client = new VeridiaClient({
      ...credentials,
      retries: 2,
      retryBaseDelayMs: 50,
      logger,
    });

    const terminalError = new Error('terminal failure');
    vi.mocked(httpFetch).mockRejectedValue(terminalError);

    try {
      client.track('userId', 'u3', 'signup', 'evt-1', '2024-01-01T00:00:00.000Z', {
        plan: 'basic',
      });

      const flushPromise = client.flush();
      const rejectionAssertion = expect(flushPromise).rejects.toBe(terminalError);

      await vi.runAllTimersAsync();

      await rejectionAssertion;

      expect(logger.error).toHaveBeenCalledWith('events', 'flush failed after max retries', {
        error: terminalError,
      });

      vi.mocked(httpFetch).mockClear();
      vi.mocked(httpFetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      } as any);

      client.track('userId', 'u3', 'signup', 'evt-2', '2024-01-02T00:00:00.000Z', { plan: 'pro' });

      await client.flush();

      expect(vi.mocked(httpFetch)).toHaveBeenCalledTimes(1);
      const [, requestInit] = vi.mocked(httpFetch).mock.calls[0];
      const parsedBody = JSON.parse((requestInit as RequestInit).body as string);

      expect(parsedBody.events).toEqual([
        expect.objectContaining({ eventId: 'evt-2', properties: { plan: 'pro' } }),
      ]);
    } finally {
      vi.useRealTimers();
      vi.mocked(httpFetch).mockReset();
      vi.clearAllMocks();
    }
  });

  describe('flush', () => {
    it('throws when the API responds with a non-ok status', async () => {
      vi.mocked(httpFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const client = new VeridiaClient({ ...credentials, autoFlush: false, retries: 1 });

      client.track(
        'userId',
        'flush-failure',
        'signup',
        'evt-flush-failure',
        new Date().toISOString(),
        {},
      );

      await expect(client.flush()).rejects.toThrow('events flush failed: 500');
    });

    it('logs successful flushes when an info logger is provided', async () => {
      const logger: VeridiaLogger = { info: vi.fn(), error: vi.fn() };
      const client = new VeridiaClient({ ...credentials, autoFlush: false, logger });

      client.track(
        'userId',
        'flush-success',
        'signup',
        'evt-flush-success',
        new Date().toISOString(),
        {},
      );

      await client.flush();

      expect(logger.info).toHaveBeenCalledWith('events', 'flush completed', { batchSize: 1 });
    });
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

    it('logs and throws an error when response is not ok', async () => {
      vi.mocked(httpFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123', false)).rejects.toThrow();
    });

    it('logs invalid payloads and throws an error', async () => {
      vi.mocked(httpFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'oops' }),
      } as any);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123', false)).rejects.toThrow();
    });

    it('throws an error when fetch rejects and logs the error', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      vi.mocked(httpFetch).mockRejectedValueOnce(abortError);

      const client = new VeridiaClient(segmentCredentials);

      await expect(client.getUserSegments('userId', 'user-123', false)).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('flushes pending identify and track buffers', async () => {
      const client = new VeridiaClient({ ...credentials, maxBufferTimeMs: 60_000 });

      client.identify('userId', 'u-close-1', { email: 'close@example.com' });
      client.track(
        'userId',
        'u-close-1',
        'purchase',
        'evt-close-1',
        new Date('2024-01-01T00:00:00.000Z').toISOString(),
        { amount: 42 },
      );

      await client.close();

      expect(httpFetch).toHaveBeenCalledWith(
        expect.stringContaining('/profiles'),
        expect.any(Object),
      );
      expect(httpFetch).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.any(Object),
      );
      expect(httpFetch).toHaveBeenCalledTimes(2);
    });

    it('clears any pending flush timer when closing', async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const client = new VeridiaClient({ ...credentials, maxBufferTimeMs: 60_000 });

      client.identify('userId', 'u-close-2', { email: 'close2@example.com' });

      const scheduledTimer = setTimeoutSpy.mock.results[0]?.value as NodeJS.Timeout;
      expect(scheduledTimer).toBeTruthy();

      await client.close();

      expect(clearTimeoutSpy.mock.calls.map(([timer]) => timer)).toContain(scheduledTimer);

      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('propagates errors when a flush fails during close', async () => {
      const error = new Error('network down');
      vi.mocked(httpFetch).mockRejectedValueOnce(error);

      const client = new VeridiaClient({
        ...credentials,
        maxBufferTimeMs: 60_000,
        retries: 1,
      });

      client.track(
        'userId',
        'u-close-3',
        'purchase',
        'evt-close-3',
        new Date('2024-01-01T00:00:00.000Z').toISOString(),
        { amount: 99 },
      );

      await expect(client.close()).rejects.toThrow(error);
    });
  });
});
