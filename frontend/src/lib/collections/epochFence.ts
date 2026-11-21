/**
 * Guards a write that happens after an `await` against a session or collection
 * change in between.
 *
 * Collection writes (live-event patches, writes after an API call) resolve
 * against whichever collections are active when the response arrives, not the
 * ones active when the work started. Sign-out resets the collections and a new
 * collection can replace the old one, so a response that belongs to the
 * previous session must be dropped instead of written into the replacement
 * state. Call `capture()` before the request and check the returned function
 * before writing; `advance()` is called on every reset or registration change.
 */
export interface EpochFence {
  /** Invalidates every capture taken so far. */
  advance(): void;
  /** Returns a check that stays true only until the next `advance()`. */
  capture(): () => boolean;
}

export function createEpochFence(): EpochFence {
  let epoch = 0;
  return {
    advance() {
      epoch += 1;
    },
    capture() {
      const captured = epoch;
      return () => captured === epoch;
    },
  };
}
