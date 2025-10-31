# Veridia Node SDK

Official Node.js SDK for integrating with [Veridia Platform](https://veridia.io).  
It provides an easy way to send user identification and tracking data, retrieve user segments, and integrate Veridia into your backend systems.

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

Identify a user and update their profile attributes. Provided attributes must match the Profile Attributes schema defined in the Veridia dashboard.

```ts
await client.identify('userId', '123', {
  email: 'user@example.com',
  country: 'US',
  plan: 'premium',
});
```

| Parameter        | Type                    | Description                  |
| ---------------- | ----------------------- | ---------------------------- |
| `identifierType` | `"userId"` \| `"email"` | How the user is identified.  |
| `identifierId`   | `string`                | The unique identifier value. |
| `attributes`     | `Record<string, any>`   | Arbitrary user attributes.   |

---

### `track(identifierType, identifierId, eventType, eventId, eventTime, properties)`

Track an event performed by a user. Provided attributes must match the event attributes schema defined in the Veridia dashboard.

```ts
await client.track('userId', '123', 'purchase', 'evt-001', new Date().toISOString(), {
  productId: 'A-1',
  price: 49.99,
});
```

| Parameter        | Type                    | Description                         |
| ---------------- | ----------------------- | ----------------------------------- |
| `identifierType` | `"userId"` \| `"email"` | How the user is identified.         |
| `identifierId`   | `string`                | Unique identifier for the user.     |
| `eventType`      | `string`                | Event type as in Veridia dashboard. |
| `eventId`        | `string`                | Unique event ID for idempotency.    |
| `eventTime`      | `string`                | ISO timestamp string.               |
| `properties`     | `Record<string, any>`   | Optional event properties.          |

---

### `getUserSegments(identifierType, identifierId)`

Fetches the list of segments the specified user currently belongs to.

```ts
const segments = await client.getUserSegments('userId', '123');
console.log(segments); // ['617090ac-a1f6-4c70-a79e-40830a367324', '67f2c139-850f-469f-9ca4-a1c58e6d84ea']
```

Returns:
`Promise<string[]>` — Array of segment identifiers.

---

### `flush()`

Immediately sends all queued identify and track data.

```ts
await client.flush();
```

### `close()`

Flushes all pending data and prepares the client for shutdown.
Call this before process exit in background workers or serverless functions.

```ts
await client.close();
```

---

## ⚙️ Configuration Options

| Option                     | Type            | Default                     | Description                            |
| -------------------------- | --------------- | --------------------------- | -------------------------------------- |
| `accessKeyId`              | `string`        | —                           | Veridia API access key ID              |
| `secretAccessKey`          | `string`        | —                           | Veridia API secret                     |
| `endpoint`                 | `string`        | `https://api.veridia.io/v1` | API base URL                           |
| `region`                   | `string`        | `"default"`                 | API region                             |
| `maxBufferSize`            | `number`        | `500`                       | Max number of items before auto-flush  |
| `maxBufferTimeMs`          | `number`        | `5000`                      | Max time before auto-flush             |
| `retries`                  | `number`        | `3`                         | Retry attempts on transient errors     |
| `timeoutMsGetUserSegments` | `number`        | `5000`                      | Timeout for `getUserSegments` requests |
| `timeoutMsFlush`           | `number`        | `30000`                     | Timeout for batch flush                |
| `logger`                   | `VeridiaLogger` | —                           | Custom logger implementation           |

---

## 🧾 Logger Interface

The SDK supports pluggable logging.
You can integrate your own logger (e.g. Pino, Winston, Bunyan) by providing the following interface:

```ts
interface VeridiaLogger {
  info(service: string, message: string, context?: unknown): void;
  warn(service: string, message: string, context?: unknown): void;
  error(service: string, message: string, context?: unknown): void;
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

The SDK ships with full `.d.ts` declarations and JSDoc for IntelliSense.
Hover over any method in VS Code to see inline documentation and parameter hints.

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
```

---

## 🧱 License

[MIT](./LICENSE) © Veridia
