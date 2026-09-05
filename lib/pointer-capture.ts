type LockTarget = {
  requestPointerLock(options?: { unadjustedMovement: boolean }): Promise<void> | void;
};

/** Raw input avoids OS acceleration/warps; unsupported platforms retain standard lock. */
export async function requestRawPointerLock(target: LockTarget, current: () => boolean) {
  try {
    const result = target.requestPointerLock({ unadjustedMovement: true });
    await result;
    // Legacy implementations may ignore the options and return no promise.
    return result !== undefined;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (!current() || (name !== "NotSupportedError" && name !== "TypeError")) throw error;
    await target.requestPointerLock();
    return false;
  }
}
