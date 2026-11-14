import { hasProgress, parseSave, type SaveData } from './save';

export interface SaveBackend {
  load(): Promise<SaveData | null>;
  /**
   * `base` is the updatedAt of the copy this device last loaded or wrote (null: no copy yet). When the stored
   * copy changed since, for example on another device, the save fails with SaveConflictError instead of
   * overwriting it. Omit `base` to overwrite unconditionally.
   */
  save(data: SaveData, base?: number | null): Promise<void>;
  clear(): Promise<void>;
}

export class SaveConflictError extends Error {
  constructor(readonly remote: SaveData) {
    super('Your progress changed on another device.');
  }
}

export type SyncDecision = 'in-sync' | 'adopt-remote' | 'conflict';

/**
 * Compares the stored copy with what this device last synced (`base`):
 * unchanged → in sync; changed elsewhere while this device has no unsaved changes → adopt it; both changed → conflict.
 */
export function decideSync(localUpdatedAt: number, base: number | null, remote: SaveData | null): SyncDecision {
  if (!remote || remote.updatedAt === base) return 'in-sync';
  return localUpdatedAt === base ? 'adopt-remote' : 'conflict';
}

export const GUEST_SAVE_KEY = 'rocket-builder-tycoon.save.v1';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Guest saves live in localStorage (or any Storage-like object). */
export function createGuestBackend(storage: KeyValueStorage, key = GUEST_SAVE_KEY): SaveBackend {
  return {
    async load() {
      const text = storage.getItem(key);
      if (text === null) return null;
      try {
        return parseSave(JSON.parse(text));
      } catch {
        return null;
      }
    },
    async save(data) {
      storage.setItem(key, JSON.stringify(data));
    },
    async clear() {
      storage.removeItem(key);
    },
  };
}

/** What to do with the guest save when a player signs in. */
export type MigrationDecision = 'offer-import' | 'use-remote' | 'fresh';

/**
 * First sign-in (no cloud save yet) with a guest save that has progress → offer to import it.
 * An existing cloud save always wins, so a shared device cannot overwrite someone's account.
 */
export function decideMigration(guest: SaveData | null, remote: SaveData | null): MigrationDecision {
  if (remote) return 'use-remote';
  return guest && hasProgress(guest) ? 'offer-import' : 'fresh';
}
