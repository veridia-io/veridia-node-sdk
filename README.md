# Veridia Node SDK

[![npm version](https://img.shields.io/npm/v/@veridia/node-sdk.svg)](https://www.npmjs.com/package/@veridia/node-sdk)

Official Node.js SDK for integrating with the [Veridia Platform](https://veridia.io).  
It provides an easy way to identify users, send tracking events, retrieve user segments, and manage batching with retries and timeouts — all from your backend.

---

## 🚀 Installation

```bash
npm install @veridia/node-sdk
```

or with Yarn:

```bash
yarn add @veridia/node-sdk
```

---

## 📦 Usage

### ESM

```ts
import { VeridiaClient } from '@veridia/node-sdk';

const client = new VeridiaClient({
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  logger: {
    error: (service, msg, ctx) => console.error(`[ERROR] ${service}: ${msg}`, ctx),
    warn: (service, msg, ctx) => console.warn(`[WARN] ${service}: ${msg}`, ctx),
    info: (service, msg, ctx) => console.log(`[INFO] ${service}: ${msg}`, ctx),
  },
});
```

### CommonJS

```js
const { VeridiaClient } = require('@veridia/node-sdk');

const client = new VeridiaClient({
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  logger: { error: console.error },
});
```

---

## 🧠 API Reference

### `identify(identifierType, identifierId, attributes)`

Identify a user and update their profile attributes.
Provided attributes must match the Profile Attributes schema defined in your Veridia dashboard.

```ts
await client.identify('userId', '123', {
  email: 'user@example.com',
  country: 'US',
  plan: 'premium',
});
```

| Parameter        | Type                    | Description                 |
| ---------------- | ----------------------- | --------------------------- |
| `identifierType` | `"userId"` \| `"email"` | How the user is identified. |
| `identifierId`   | `string`                | Unique identifier value.    |
| `attributes`     | `Record<string, any>`   | Arbitrary user attributes.  |

---

### `track(identifierType, identifierId, eventType, eventId, eventTime, properties)`

Track an event performed by a user.
Provided attributes must match the event attributes schema defined in your Veridia dashboard.

```ts
await client.track('userId', '123', 'purchase', 'evt-001', new Date().toISOString(), {
  productId: 'A-1',
  price: 49.99,
});
```

| Parameter        | Type                    | Description                      |
| ---------------- | ----------------------- | -------------------------------- |
| `identifierType` | `"userId"` \| `"email"` | How the user is identified.      |
| `identifierId`   | `string`                | Unique user identifier.          |
| `eventType`      | `string`                | Logical name of the event.       |
| `eventId`        | `string`                | Unique event ID for idempotency. |
| `eventTime`      | `string`                | ISO timestamp string.            |
| `properties`     | `Record<string, any>`   | Optional event properties.       |

---

### `getUserSegments(identifierType, identifierId, [noSegmentsOnError=true])`

Fetches the list of segments the specified user currently belongs to.
If the API call fails and `noSegmentsOnError` is set to `false`, it will throw an error.
Otherwise, it will return an empty array.

```ts
const segments = await client.getUserSegments('userId', '123');
console.log(segments); // ['617090ac-a1f6-4c70-a79e-40830a367324', '67f2c139-850f-469f-9ca4-a1c58e6d84ea']
```

| Parameter           | Type       | Default   | Description                                         |
| ------------------- | ---------- | --------- | --------------------------------------------------- | ------------------------ |
| `identifierType`    | `"userId"` | `"email"` | —                                                   | Type of user identifier. |
| `identifierId`      | `string`   | —         | Unique user ID or email.                            |
| `noSegmentsOnError` | `boolean`  | `true`    | If true, returns `[]` instead of throwing an error. |

Returns:
`Promise<string[]>` — Array of segment identifiers.

---

### `flush()`

Immediately sends all queued identify and track data.
Automatically called when buffers reach their configured limits or after the flush interval.

```ts
await client.flush();
```

### `close()`

Flushes any remaining buffered data and closes the client gracefully.
Call this before application exit in workers or serverless environments.

```ts
await client.close();
```

---

## ⚙️ Configuration Options

| Option                     | Type            | Default                     | Description                                   |
| -------------------------- | --------------- | --------------------------- | --------------------------------------------- |
| `accessKeyId`              | `string`        | —                           | Veridia API access key ID.                    |
| `secretAccessKey`          | `string`        | —                           | Veridia API secret.                           |
| `endpoint`                 | `string`        | `https://api.veridia.io/v1` | API base URL.                                 |
| `region`                   | `string`        | `"default"`                 | API region.                                   |
| `autoFlush`                | `boolean`       | `true`                      | Whether to automatically flush buffered data. |
| `maxBufferSize`            | `number`        | `500`                       | Max number of items before auto-flush.        |
| `maxBufferTimeMs`          | `number`        | `5000`                      | Max time (ms) before auto-flush.              |
| `retries`                  | `number`        | `3`                         | Retry attempts on transient network errors.   |
| `retryBaseDelayMs`         | `number`        | `500`                       | Base delay (ms) for exponential backoff.      |
| `timeoutMsGetUserSegments` | `number`        | `5000`                      | Timeout (ms) for `getUserSegments` calls.     |
| `timeoutMsFlush`           | `number`        | `30000`                     | Timeout (ms) for batch flush requests.        |
| `logger`                   | `VeridiaLogger` | —                           | Custom logger implementation.                 |

---

## 🧾 Logger Interface

You can integrate your own logger (e.g. Pino, Winston, Bunyan) by providing the following interface:

```ts
interface VeridiaLogger {
  info?(service: string, message: string, context?: VeridiaLogContext): void;
  warn?(service: string, message: string, context?: VeridiaLogContext): void;
  error(service: string, message: string, context?: VeridiaLogContext): void;
}

interface VeridiaLogContext {
  status?: number;
  error?: unknown;
  data?: unknown;
  [key: string]: unknown;
}
```

Example:

```ts
import pino from 'pino';
const log = pino();

const client = new VeridiaClient({
  accessKeyId: '...',
  secretAccessKey: '...',
  logger: {
    info: (s, m, c) => log.info({ service: s, context: c }, m),
    warn: (s, m, c) => log.warn({ service: s, context: c }, m),
    error: (s, m, c) => log.error({ service: s, context: c }, m),
  },
});
```

---

## 🧩 TypeScript Support

The SDK ships with full `.d.ts` declarations and JSDoc documentation.
Hover over any method in VS Code to see inline descriptions and parameter hints.

---

## 🧪 Example Usage

```ts
import { VeridiaClient } from '@veridia/node-sdk';

const client = new VeridiaClient({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  logger: { error: console.error },
});

await client.identify('userId', '123', { plan: 'gold' });
await client.track('userId', '123', 'purchase', 'evt-123', new Date().toISOString());
await client.flush();

const segments = await client.getUserSegments('userId', '123');
console.log('Segments:', segments);
```

---

## 🧱 License

[MIT](./LICENSE) © Veridia
