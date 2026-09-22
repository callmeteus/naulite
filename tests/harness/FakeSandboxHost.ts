/**
 * In-memory counters for sandbox agent calls in unit tests.
 */
export namespace FakeSandboxHost {
    let cloneCount = 0;
    let destroyCount = 0;

    /**
     * Resets tracked sandbox agent calls.
     *
     * @returns Nothing.
     */
    export function reset(): void {
        cloneCount = 0;
        destroyCount = 0;
    }

    /**
     * Records a clone invocation.
     *
     * @returns Nothing.
     */
    export function recordClone(): void {
        cloneCount += 1;
    }

    /**
     * Records a destroy invocation.
     *
     * @returns Nothing.
     */
    export function recordDestroy(): void {
        destroyCount += 1;
    }

    /**
     * Returns how many clones were recorded.
     *
     * @returns Clone count
     */
    export function getCloneCount(): number {
        return cloneCount;
    }

    /**
     * Returns how many destroys were recorded.
     *
     * @returns Destroy count
     */
    export function getDestroyCount(): number {
        return destroyCount;
    }
}
