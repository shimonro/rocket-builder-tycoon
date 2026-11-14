import { abortJourney, createJourney, stepJourney, FIXED_STEP, type JourneyContext, type JourneyInput, type JourneyState } from './journey';

const FLAGS = ['forward', 'backward', 'turbo', 'fire'] as const;

/**
 * Packs one step's input into a small integer: steer in tenths (-10…10) and four button bits.
 * The live game feeds the decoded value to the simulation, so a replay sees exactly the same input.
 */
export function encodeInput(input: JourneyInput): number {
  const steer = Math.round(Math.max(-1, Math.min(1, input.steer)) * 10) + 10;
  return FLAGS.reduce((code, flag, bit) => (input[flag] ? code | (1 << bit) : code), steer << 4);
}

export function decodeInput(code: number): JourneyInput {
  const bit = (i: number) => (code & (1 << i)) !== 0;
  return { steer: ((code >> 4) - 10) / 10, forward: bit(0), backward: bit(1), turbo: bit(2), fire: bit(3) };
}

/** Run-length log of step inputs: [code, count, code, count, …]. Appends in place for speed. */
export function appendInput(log: number[], code: number): void {
  if (log.length > 0 && log[log.length - 2] === code) log[log.length - 1] += 1;
  else log.push(code, 1);
}

export function isValidLog(log: unknown, maxSteps: number): log is number[] {
  if (!Array.isArray(log) || log.length % 2 !== 0) return false;
  let steps = 0;
  for (let i = 0; i < log.length; i += 2) {
    const [code, count] = [log[i], log[i + 1]];
    if (!Number.isInteger(code) || code < 0 || code >= 21 << 4) return false;
    if (!Number.isInteger(count) || count < 1) return false;
    steps += count;
  }
  return steps <= maxSteps;
}

/** Re-runs a recorded flight step by step. `aborted` ends it the way the pause menu does. */
export function replayJourney(ctx: JourneyContext, log: readonly number[], aborted: boolean): JourneyState {
  let state = createJourney(ctx);
  for (let i = 0; i < log.length && state.status !== 'ended'; i += 2) {
    const input = decodeInput(log[i]);
    for (let n = 0; n < log[i + 1] && state.status !== 'ended'; n++) state = stepJourney(state, input, FIXED_STEP, ctx).state;
  }
  return aborted ? abortJourney(state) : state;
}
