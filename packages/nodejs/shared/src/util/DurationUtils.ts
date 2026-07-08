export namespace DurationUtils {
    const durationRegex = /^(\d+)(s|m|h)$/;

    /**
     * Parse a duration string to milliseconds.
     * @param value The duration string (e.g. "30s", "1m", "2h").
     * @returns The duration in milliseconds.
     * @throws If the duration is invalid.
     */
    export function parseToMs(value: string): number {
        const match = durationRegex.exec(value);

        if (!match) {
            throw new Error(`Invalid duration: ${value}`);
        }

        const amount = Number(match[1]);
        const unit = match[2];

        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
            throw new Error(`Invalid duration amount: ${value}`);
        }

        const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000;
        return amount * multiplier;
    }

    export const parse = parseToMs;
}
