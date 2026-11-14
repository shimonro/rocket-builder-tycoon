import { hasProgress, parseSave, type SaveData } from './save';

export interface SaveBackend {
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
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
