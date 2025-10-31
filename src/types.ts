export interface VeridiaLogContext {
  status?: number;
  error?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

export type VeridiaLogger = {
  /**
   * Logs informational messages.
   * @param service - Service called the logger.
   * @param message - Human-readable message.
   * @param context - Optional structured data or additional info.
   */
  info?: (service: string, message: string, context?: VeridiaLogContext) => void;

  /**
   * Logs warnings.
   * @param service - Service called the logger.
   * @param message - Human-readable message.
   * @param context - Optional structured data or additional info.
   */
  warn?: (service: string, message: string, context?: VeridiaLogContext) => void;

  /**
   * Logs errors.
   * @param service - Service called the logger.
   * @param message - Human-readable message.
   * @param context - Optional structured data or additional info.
   */
  error: (service: string, message: string, context?: VeridiaLogContext) => void;
};

export type VeridiaClientOptions = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // default: https://api.veridia.io/v1
  region?: string; // default: "default"
  maxBufferSize?: number; // default: 500
  maxBufferTimeMs?: number; // default: 5000
  retries?: number; // default: 3
  retryBaseDelayMs?: number; // default: 500
  timeoutMsGetUserSegments?: number; // default 5000
  timeoutMsFlush?: number; // default 30000
  logger?: VeridiaLogger;
};

export type IdentifierPayload = {
  type: 'userId' | 'email';
  id: string;
};

export type IdentifyPayload = {
  identifier: IdentifierPayload;
  attributes: any;
};

export type TrackPayload = {
  identifier: IdentifierPayload;
  eventId: string;
  eventType: string;
  eventTime: string;
  properties: any;
};
