import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { httpFetch as fetch } from './http.js';
import {
  IdentifierPayload,
  IdentifyPayload,
  TrackPayload,
  VeridiaClientCredentials,
  VeridiaClientOptions,
  VeridiaLogger,
} from './types.js';
import { SDK_VERSION } from './version.js';

export class VeridiaClient {
  private trackBuffer: TrackPayload[] = [];
  private identifyBuffer: IdentifyPayload[] = [];
  private flushTimer?: NodeJS.Timeout;

  private readonly logger: VeridiaLogger | undefined;
  private readonly credentials: VeridiaClientCredentials;
  private readonly baseUrl: string;
  private readonly region: string;
  private readonly autoFlush: boolean;
  private readonly maxBufferSize: number;
  private readonly maxBufferTimeMs: number;
  private readonly retries: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMsGetUserSegments: number;
  private readonly timeoutMsFlush: number;

  constructor(options: VeridiaClientOptions) {
    this.baseUrl = options.endpoint ?? 'https://api.veridia.io/v1';
    this.region = options.region ?? 'default';
    this.autoFlush = options.autoFlush ?? true;
    this.maxBufferSize = options.maxBufferSize ?? 500;
    this.maxBufferTimeMs = options.maxBufferTimeMs ?? 5000;
    this.retries = options.retries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.timeoutMsGetUserSegments = options.timeoutMsGetUserSegments ?? 5_000;
    this.timeoutMsFlush = options.timeoutMsFlush ?? 30_000;
    this.logger = options.logger;
    this.credentials = options.credentials;
  }

  /**
   * Queues a user identification update to be flushed in batch.
   *
   * @param identifierType - The type of user identifier ("userId" | "email").
   * @param identifierId - The unique ID or email.
   * @param attributes - Key/value map of user attributes.
   */
  public identify(
    identifierType: IdentifierPayload['type'],
    identifierId: IdentifierPayload['id'],
    attributes: IdentifyPayload['attributes'],
  ): void {
    this.identifyBuffer.push({
      identifier: {
        type: identifierType,
        id: identifierId,
      },
      attributes,
    });

    if (this.autoFlush) this.scheduleFlushIfNeeded('profiles', this.identifyBuffer);
  }

  /**
   * Sends a tracking event for the given user.
   *
   * @param identifierType - The type of user identifier ("userId" | "email").
   * @param identifierId - The unique ID or email.
   * @param eventType - Logical name of the event.
   * @param eventId - Unique ID for idempotency.
   * @param eventTime - ISO timestamp string.
   * @param properties - Arbitrary event properties.
   */
  public track(
    identifierType: IdentifierPayload['type'],
    identifierId: IdentifierPayload['id'],
    eventType: TrackPayload['eventType'],
    eventId: TrackPayload['eventId'],
    eventTime: TrackPayload['eventTime'],
    properties: TrackPayload['properties'],
  ): void {
    this.trackBuffer.push({
      identifier: { type: identifierType, id: identifierId },
      eventId,
      eventType,
      eventTime,
      properties,
    });

    if (this.autoFlush) this.scheduleFlushIfNeeded('events', this.trackBuffer);
  }

  /**
   * Retrieves the current segments for the given user.
   *
   * @param identifierType - The type of user identifier ("userId" | "email").
   * @param identifierId - The unique ID or email.
   * @param [noSegmentsOnError=true] - Whether to throw an error or to return empty array of segments. Defaults to true.
   * @returns A list of segment identifiers the user currently belongs to.
   */
  public async getUserSegments(
    identifierType: IdentifierPayload['type'],
    identifierId: string,
    noSegmentsOnError = true,
  ): Promise<string[]> {
    try {
      const path = `/segments/${identifierType}/${encodeURIComponent(identifierId)}`;
      const url = new URL(`${this.baseUrl}${path}`);

      const signer = new SignatureV4({
        credentials: this.credentials,
        region: this.region,
        service: 'segments',
        sha256: Sha256,
      });

      const signed = await signer.sign({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port !== '' ? +url.port : undefined,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        method: 'GET',
        headers: { Host: url.host, 'User-Agent': `veridia-node-sdk/${SDK_VERSION}` },
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMsGetUserSegments);

      const res = await fetch(url.toString(), {
        method: signed.method,
        headers: signed.headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        this.logger?.error('segments', 'getUserSegments API call failed', { status: res.status });

        if (noSegmentsOnError) return [];
        else throw new Error(`getUserSegments API call failed: ${res.status}`);
      }

      const data = (await res.json()) as { status: string; data: string[] };
      if (data.status === 'success' && Array.isArray(data.data)) {
        return data.data;
      }

      this.logger?.error('segments', 'getUserSegments API returned invalid response', {
        data: data,
      });

      if (noSegmentsOnError) return [];
      else
        throw new Error(`getUserSegments API returned invalid response: ${JSON.stringify(data)}`);
    } catch (err) {
      this.logger?.error('segments', 'getUserSegments encountered an error', {
        error: err,
      });

      if (noSegmentsOnError) return [];
      else throw err;
    }
  }

  /**
   * Sends all queued identify and track data to the Veridia API immediately.
   * Automatically called when buffers reach their limit or after the configured time interval.
   */
  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flushBatch('profiles', this.identifyBuffer);
    await this.flushBatch('events', this.trackBuffer);
  }

  /**
   * Flushes all pending data and prepares the client for shutdown.
   * Should be called before application exit to ensure all data is sent.
   */
  public async close(): Promise<void> {
    await this.flush();
  }

  private scheduleFlushIfNeeded(service: string, buffer: unknown[]): void {
    if (buffer.length >= this.maxBufferSize) {
      this.flush().catch((error) => {
        this.logger?.error('flush', 'automatic flush failed', { error });
      });
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch((error) => {
          this.logger?.error('flush', 'automatic flush failed', { error });
        });
      }, this.maxBufferTimeMs);
    }
  }

  private async flushBatch<T>(service: string, buffer: T[]): Promise<void> {
    if (buffer.length === 0) return;

    const batch = [...buffer];
    buffer.length = 0; // clear buffer safely

    const urlObj = new URL(this.baseUrl + '/' + service);

    const signer = new SignatureV4({
      credentials: this.credentials,
      region: this.region,
      service,
      sha256: Sha256,
    });

    const signed = await signer.sign({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port !== '' ? +urlObj.port : undefined,
      path: urlObj.pathname,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      method: 'POST',
      headers: {
        Host: urlObj.host,
        'Content-Type': 'application/json',
        'User-Agent': `veridia-node-sdk/${SDK_VERSION}`,
      },
      body: JSON.stringify({ [service]: batch }),
    });

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMsFlush);

        const res = await fetch(urlObj.toString(), {
          method: signed.method,
          headers: signed.headers,
          body: signed.body,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
          throw new Error(`${service} flush failed: ${res.status}`);
        }

        if (this.logger?.info)
          this.logger.info(service, 'flush completed', { batchSize: batch.length });

        return;
      } catch (err) {
        if (this.logger?.warn)
          this.logger.warn(service, `flush attempt ${attempt} failed`, { error: err });

        if (attempt === this.retries) {
          this.logger?.error(service, `flush failed after max retries`, { error: err });

          throw err;
        }

        await new Promise((r) => setTimeout(r, this.retryBaseDelayMs * 2 ** (attempt - 1))); // backoff
      }
    }
  }
}
