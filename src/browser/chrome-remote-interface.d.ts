declare module 'chrome-remote-interface' {
  interface CDPOptions {
    port?: number;
    host?: string;
    /** WebSocket URL, target id, or function to select from targets list. */
    target?: string | ((targets: unknown[]) => unknown);
    /** Use bundled protocol (skip fetching /json/protocol). Required for Firefox. */
    local?: boolean;
  }
  function CDP(options?: CDPOptions): Promise<unknown>;
  export = CDP;
}
