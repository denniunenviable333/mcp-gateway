/**
 * Async Mutex
 *
 * Bug fix (v0.1.0): the server registry could attempt to restart the same
 * MCP server process multiple times concurrently when several requests
 * arrived simultaneously during a restart window, causing duplicate processes.
 * This lightweight mutex serialises critical sections without external deps.
 *
 * @module utils/mutex
 */

export class Mutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this._locked) {
          this._locked = true;
          resolve(this._release.bind(this));
        } else {
          this._queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private _release(): void {
    this._locked = false;
    const next = this._queue.shift();
    if (next) next();
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
