declare module 'chrome-remote-interface' {
  interface CDPOptions {
    port?: number;
    host?: string;
    target?: (targets: unknown[]) => unknown;
  }
  function CDP(options?: CDPOptions): Promise<unknown>;
  export = CDP;
}
