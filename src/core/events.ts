/** Game-wide events. Engines stay decoupled: the app emits these and services (audio, analytics) listen. */
export type GameEvent =
  | { type: 'purchase'; itemId: string }
  | { type: 'sell'; itemId: string }
  | { type: 'equip'; partId: string }
  | { type: 'unlock'; levelId: number }
  | { type: 'launch'; levelId: number }
  | { type: 'turbo' }
  | { type: 'fire' }
  | { type: 'hoop' }
  | { type: 'hit'; damage: number }
  | { type: 'obstacleDestroyed' }
  | { type: 'targetReached' }
  | { type: 'flightEnded'; reason: string }
  | { type: 'payout'; amount: number }
  | { type: 'upgrade'; partId: string }
  | { type: 'coin' }
  | { type: 'fuelCan' }
  | { type: 'gem' }
  | { type: 'celebrate' }
  | { type: 'meteorShower' }
  | { type: 'guardianDefeated' }
  | { type: 'flightFinished'; levelId: number; distance: number; reason: string; targetReached: boolean }
  | { type: 'error'; message: string };

export type Listener<E> = (event: E) => void;

export interface EventBus<E> {
  on(listener: Listener<E>): () => void;
  emit(event: E): void;
}

export function createEventBus<E>(): EventBus<E> {
  const listeners = new Set<Listener<E>>();
  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
  };
}
