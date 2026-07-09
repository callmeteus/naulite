import { Logger } from "../../Logger";

const logLogRotation = Logger.create("log-rotation");

/**
 * Evaluates five-field cron expressions against a timestamp.
 */
export class CronEvaluator {
    /**
     * Determines whether a cron schedule is due at the provided time.
     * 
     * @param schedule Five-field cron expression
     * @param now Current evaluation timestamp
     * @returns Whether the schedule matches the timestamp
     */
    static isDue(schedule: string, now: Date): boolean {
        const fields = schedule.trim().split(/\s+/);

        if (fields.length !== 5) {
            logLogRotation.debug("cron invalid fieldCount=%d schedule=%s", fields.length, schedule);
            return false;
        }

        const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
        const matches = [
            CronEvaluator.matchesField(minute, now.getUTCMinutes(), 0, 59),
            CronEvaluator.matchesField(hour, now.getUTCHours(), 0, 23),
            CronEvaluator.matchesField(dayOfMonth, now.getUTCDate(), 1, 31),
            CronEvaluator.matchesField(month, now.getUTCMonth() + 1, 1, 12),
            CronEvaluator.matchesField(dayOfWeek, now.getUTCDay(), 0, 6)
        ];

        const due = matches.every(Boolean);
        logLogRotation.debug("cron schedule=%s due=%s", schedule, due);
        return due;
    }

    /**
     * Checks whether a cron field matches a concrete value.
     * 
     * @param field Cron field expression
     * @param value Value to test
     * @param min Minimum allowed value for the field
     * @param max Maximum allowed value for the field
     * @returns Whether the field matches the value
     */
    private static matchesField(field: string, value: number, min: number, max: number): boolean {
        if (field === "*") {
            return true;
        }

        return field.split(",").some((part) => {
            if (part.includes("/")) {
                const [base, stepText] = part.split("/");
                const step = Number(stepText);
                const start = base === "*" ? min : Number(base);
                return step > 0 && value >= start && (value - start) % step === 0;
            }

            if (part.includes("-")) {
                const [startText, endText] = part.split("-");
                const start = Number(startText);
                const end = Number(endText);
                return value >= start && value <= end;
            }

            return Number(part) === value && value >= min && value <= max;
        });
    }
}
