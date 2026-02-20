/**
 * API testing — Rest-Assured style fluent request and assertions.
 * Use with the same test runner: describe/it/expect.
 */

import * as http from 'http';
import * as https from 'https';
import { AssertionError } from './assertions';

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /** Raw body string before JSON parse */
  rawBody: string;
}

function request(
  method: string,
  url: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const headers: Record<string, string> = {
      ...options.headers,
    };
    if (body !== undefined && body !== null) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data, 'utf8').toString();
    }
    const reqOptions: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers,
      timeout: options.timeout ?? 30000,
    };
    const req = lib.request(reqOptions, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const outHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') outHeaders[k.toLowerCase()] = v;
          else if (Array.isArray(v) && v[0]) outHeaders[k.toLowerCase()] = v[0];
        }
        let parsed: unknown = raw;
        const ct = outHeaders['content-type'] ?? '';
        if (ct.includes('application/json') && raw.trim()) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            // leave as string
          }
        }
        resolve({
          status: res.statusCode ?? 0,
          headers: outHeaders,
          body: parsed,
          rawBody: raw,
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body !== undefined && body !== null) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(data);
    }
    req.end();
  });
}

/** Get a value from an object by dot path, e.g. "user.name" or "items[0].id" */
function getByPath(obj: unknown, path: string): unknown {
  const normalized = path.replace(/^\$\.?/, '').trim();
  if (!normalized) return obj;
  const parts = normalized.split(/\.(?![^\[]*\])/);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const key = match[1];
      const index = parseInt(match[2], 10);
      current = (current as Record<string, unknown>)[key];
      current = Array.isArray(current) ? current[index] : undefined;
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    throw new AssertionError(message, expected, actual);
  }
}

/**
 * Fluent response wrapper — chain .expectStatus(), .expectHeader(), .expectBody(), .expectJson().
 */
export class ResponseAssertions {
  constructor(private readonly res: ApiResponse) {}

  expectStatus(status: number): this {
    if (this.res.status !== status) {
      throw new AssertionError(
        `Expected status ${status}, got ${this.res.status}. Body: ${this.res.rawBody.slice(0, 200)}`,
        status,
        this.res.status
      );
    }
    return this;
  }

  expectHeader(name: string, value: string | RegExp): this {
    const key = name.toLowerCase();
    const actual = this.res.headers[key];
    if (actual === undefined) {
      throw new AssertionError(`Expected header "${name}" to be present`, value, undefined);
    }
    if (typeof value === 'string') {
      assertEqual(actual, value, `Expected header "${name}" to be ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`);
    } else {
      if (!value.test(actual)) {
        throw new AssertionError(`Expected header "${name}" to match ${value}, got ${actual}`, value, actual);
      }
    }
    return this;
  }

  expectBody(expected: unknown): this {
    assertEqual(
      this.res.body,
      expected,
      `Expected body ${JSON.stringify(expected)}, got ${JSON.stringify(this.res.body)}`
    );
    return this;
  }

  /** Expect a JSON path value, e.g. expectJson('user.name', 'John') or expectJson('$.items[0].id', 1) */
  expectJson(path: string, value: unknown): this {
    const actual = getByPath(this.res.body, path);
    assertEqual(
      actual,
      value,
      `Expected body at "${path}" to be ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`
    );
    return this;
  }

  /** Return the underlying response for custom assertions with expect() */
  getResponse(): ApiResponse {
    return this.res;
  }
}

function fluent(method: string, url: string, body?: unknown, options?: RequestOptions): Promise<ResponseAssertions> {
  return request(method, url, body, options).then((res) => new ResponseAssertions(res));
}

/**
 * Rest-Assured style API request object.
 * - request.get(url), request.post(url, body), request.put(url, body), request.patch(url, body), request.delete(url)
 * - Chain: .expectStatus(200), .expectHeader('content-type', /json/), .expectBody({...}), .expectJson('path', value)
 * - Or use .getResponse() and expect(response.status).toBe(200), expect(response.body).toEqual(...)
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Single function for all methods: send request and verify only status code.
 * Returns the response for further use if needed.
 */
async function verifyStatus(
  method: HttpMethod,
  url: string,
  expectedStatus: number,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse> {
  const res = await request(method, url, body, options);
  if (res.status !== expectedStatus) {
    throw new AssertionError(
      `Expected status ${expectedStatus}, got ${res.status}. Body: ${res.rawBody.slice(0, 200)}`,
      expectedStatus,
      res.status
    );
  }
  return res;
}

export const requestApi = {
  get: (url: string, options?: RequestOptions) => fluent('GET', url, undefined, options),
  post: (url: string, body?: unknown, options?: RequestOptions) => fluent('POST', url, body, options),
  put: (url: string, body?: unknown, options?: RequestOptions) => fluent('PUT', url, body, options),
  patch: (url: string, body?: unknown, options?: RequestOptions) => fluent('PATCH', url, body, options),
  delete: (url: string, options?: RequestOptions) => fluent('DELETE', url, undefined, options),

  /**
   * One function for all methods — verify only status code.
   * request.verifyStatus('GET', url, 200)
   * request.verifyStatus('POST', url, 201, body)
   * request.verifyStatus('DELETE', url, 204)
   */
  verifyStatus,

  /** Raw request (no fluent assertions). Use when you want full control with expect(). */
  async request(method: string, url: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
    return request(method, url, body, options);
  },
};
