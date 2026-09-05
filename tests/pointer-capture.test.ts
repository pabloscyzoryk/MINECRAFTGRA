import test from "node:test";
import assert from "node:assert/strict";
import { requestRawPointerLock } from "../lib/pointer-capture";
import { PointerMotion } from "../lib/pointer-motion";

test("Raw pointer input is requested first and does not smooth genuine fast diagonal strokes", async () => {
  const options: any[] = [];
  const raw = await requestRawPointerLock(
    {
      requestPointerLock: async (option) => {
        options.push(option);
      },
    },
    () => true,
  );
  assert.equal(raw, true);
  assert.deepEqual(options, [{ unadjustedMovement: true }]);
  const motion = new PointerMotion();
  motion.raw = raw;
  motion.lock(100);
  motion.sample({ movementX: 100, movementY: 900 }, 100);
  for (let i = 0; i < 8; i++) motion.sample({ movementX: 20, movementY: 1 }, 108 + i * 8);
  assert.deepEqual(motion.sample({ movementX: 20, movementY: -900 }, 180), { x: 20, y: -900 });
});
test("Unsupported raw input retries once with normal pointer lock", async () => {
  const options: any[] = [];
  const raw = await requestRawPointerLock(
    {
      requestPointerLock: async (option) => {
        options.push(option);
        if (option) throw new DOMException("unsupported", "NotSupportedError");
      },
    },
    () => true,
  );
  assert.equal(raw, false);
  assert.deepEqual(options, [{ unadjustedMovement: true }, undefined]);
});
test("A refusal or stale cancelled capture never starts another pointer-lock request", async () => {
  for (const [name, current] of [
    ["NotAllowedError", true],
    ["NotSupportedError", false],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      requestRawPointerLock(
        {
          requestPointerLock: async () => {
            calls++;
            throw new DOMException("cancelled", name);
          },
        },
        () => current,
      ),
    );
    assert.equal(calls, 1);
  }
});
test("Legacy void-returning pointer lock stays compatible without assuming raw support", async () => {
  let calls = 0;
  assert.equal(
    await requestRawPointerLock(
      {
        requestPointerLock() {
          calls++;
        },
      },
      () => true,
    ),
    false,
  );
  assert.equal(calls, 1);
});
