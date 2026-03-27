/**
 * Config File Watcher — Hot Reload Support
 *
 * Watches the active config file for changes and emits a 'reload' event
 * so the gateway can apply new server registrations without restarting.
 *
 * @module config/watcher
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { loadConfig } from './loader.js';
import { GatewayConfig } from '../utils/types.js';

export class ConfigWatcher extends EventEmitter {
  private configPath: string;
  private logger: Logger;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;

  constructor(configPath: string, logger: Logger, debounceMs = 500) {
    super();
    this.configPath = path.resolve(configPath);
    this.logger = logger;
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = fs.watch(this.configPath, (eventType) => {
      if (eventType !== 'change') return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this._reload(), this.debounceMs);
    });

    this.watcher.on('error', (err) => {
      this.logger.warn(`Config watcher error: ${err.message}`);
    });

    this.logger.info(
      `Config hot-reload enabled — watching ${this.configPath}`,
    );
  }

  private async _reload(): Promise<void> {
    try {
      const newConfig: GatewayConfig = await loadConfig(this.configPath);
      this.logger.info('Config file changed — applying hot reload');
      this.emit('reload', newConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Config reload failed (keeping current config): ${msg}`);
      this.emit('reload-error', err);
    }
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.watcher?.close();
    this.watcher = null;
    this.logger.debug('Config watcher stopped');
  }
}
