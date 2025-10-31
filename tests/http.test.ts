import { describe, it, expect } from 'vitest';
import { httpFetch } from '../src/http';

describe('httpFetch', () => {
  it('resolves with a Response-like object', async () => {
    const res = await httpFetch('https://postman-echo.com/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'name' }),
    });
    expect(res).toBeDefined();
    expect(typeof res.ok).toBe('boolean');

    const json = await res.json();
    expect(typeof json).toBe('object');
    expect(typeof json.data).toBe('object');
    expect(json.data.hello).toBe('name');
    expect(typeof json.headers).toBe('object');
    expect(json.headers['content-type']).toBe('application/json');
  });
});
