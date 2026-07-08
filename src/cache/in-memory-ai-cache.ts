import { Injectable } from '@nestjs/common';
import type { AiCache } from './ai-cache.interface.js';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * Default in-process cache with optional per-entry TTL. Not shared across
 * processes — provide a distributed `AiCache` for production.
 */
@Injectable()
export class InMemoryAiCache implements AiCache {
  private readonly store = new Map<string, Entry>();

  async get(key: string): Promise<unknown | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs != null ? Date.now() + ttlMs : null,
    });
  }
}
