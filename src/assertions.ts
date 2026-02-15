/**
 * Simple assertion library (expect-style API).
 * Similar to Jest/Cypress expect — extend later with matchers.
 */

export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly expected?: unknown,
    public readonly actual?: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
    Object.setPrototypeOf(this, AssertionError.prototype);
  }
}

export interface ExpectApi {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toThrow(expectedMessage?: string | RegExp): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  toContain(item: unknown): void;
  toHaveLength(n: number): void;
  not: ExpectApi;
}

function assert(condition: boolean, message: string, actual?: unknown, expected?: unknown): void {
  if (!condition) {
    throw new AssertionError(message, expected, actual);
  }
}

function expectApi(actual: unknown, negate: boolean = false): ExpectApi {
  const wrap = (pass: boolean, failMessage: string, passMessage?: string) => {
    const ok = negate ? !pass : pass;
    const msg = ok ? (negate ? failMessage : passMessage || failMessage) : (negate ? passMessage || failMessage : failMessage);
    assert(ok, msg, actual);
  };

  const api: ExpectApi = {
    toBe(expected) {
      wrap(
        Object.is(actual, expected),
        `Expected ${String(actual)} to be ${String(expected)}`,
        `Expected not to be ${String(expected)}`
      );
    },
    toEqual(expected) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      wrap(
        pass,
        `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
        `Expected not to equal ${JSON.stringify(expected)}`
      );
    },
    toBeTruthy() {
      wrap(!!actual, `Expected ${String(actual)} to be truthy`, `Expected ${String(actual)} to be falsy`);
    },
    toBeFalsy() {
      wrap(!actual, `Expected ${String(actual)} to be falsy`, `Expected ${String(actual)} to be truthy`);
    },
    toBeNull() {
      wrap(actual === null, `Expected ${String(actual)} to be null`, `Expected not to be null`);
    },
    toBeDefined() {
      wrap(actual !== undefined, `Expected value to be defined`, `Expected value to be undefined`);
    },
    toBeUndefined() {
      wrap(actual === undefined, `Expected value to be undefined`, `Expected value to be defined`);
    },
    toThrow(expectedMessage?: string | RegExp) {
      if (typeof actual !== 'function') {
        throw new AssertionError('Expected value to be a function', undefined, actual);
      }
      let threw = false;
      let thrown: unknown;
      try {
        (actual as () => void)();
      } catch (e) {
        threw = true;
        thrown = e;
      }
      wrap(threw, 'Expected function to throw', 'Expected function not to throw');
      if (expectedMessage !== undefined && threw) {
        const msg = thrown instanceof Error ? thrown.message : String(thrown);
        const match = typeof expectedMessage === 'string'
          ? msg === expectedMessage
          : expectedMessage.test(msg);
        assert(match, `Expected throw message to match, got: ${msg}`, msg, expectedMessage);
      }
    },
    toBeGreaterThan(n: number) {
      const val = Number(actual);
      wrap(!Number.isNaN(val) && val > n, `Expected ${actual} to be greater than ${n}`, `Expected ${actual} not to be greater than ${n}`);
    },
    toBeLessThan(n: number) {
      const val = Number(actual);
      wrap(!Number.isNaN(val) && val < n, `Expected ${actual} to be less than ${n}`, `Expected ${actual} not to be less than ${n}`);
    },
    toContain(item: unknown) {
      const isArray = Array.isArray(actual);
      const isString = typeof actual === 'string';
      const has = isArray
        ? (actual as unknown[]).includes(item)
        : isString
          ? (actual as string).includes(String(item))
          : false;
      wrap(
        has,
        `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`,
        `Expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(item)}`
      );
    },
    toHaveLength(n: number) {
      const len = (actual as { length?: number })?.length;
      wrap(
        len === n,
        `Expected length ${len ?? 'undefined'} to be ${n}`,
        `Expected length not to be ${n}`
      );
    },
    get not() {
      return expectApi(actual, true);
    },
  };

  return api;
}

/**
 * Expect API — use in tests: expect(value).toBe(3), expect(fn).toThrow(), etc.
 */
export function expect(actual: unknown): ExpectApi {
  return expectApi(actual);
}
