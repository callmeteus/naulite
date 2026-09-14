import { z } from "zod";
import type { Task, TaskModule } from "@naulite/shared";
import { TaskSchema } from "@naulite/shared";

/**
 * Zod validators for task modules (happy-path required fields).
 */
export namespace TaskModuleRegistry {
    const moduleSchemas: Record<TaskModule, z.ZodTypeAny> = {
        apt: z.object({
            packages: z.array(z.string().min(1)).min(1)
        }),
        sysctl: z.object({
            file: z.string().min(1),
            entries: z.record(z.string(), z.string()).refine((entries) => Object.keys(entries).length > 0)
        }),
        limits: z.object({
            domain: z.string().min(1),
            item: z.string().min(1),
            type: z.string().min(1),
            value: z.string().min(1)
        }),
        nvm: z.object({
            version: z.string().min(1)
        }),
        npm: z.object({
            name: z.string().min(1)
        }),
        copy: z.object({
            dest: z.string().min(1)
        }),
        file: z.object({
            path: z.string().min(1)
        }),
        unarchive: z.object({
            src: z.string().min(1),
            dest: z.string().min(1)
        }),
        stat: z.object({
            path: z.string().min(1)
        }),
        command: z.object({
            command: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        }),
        unit: z.object({
            name: z.string().min(1),
            state: z.string().min(1)
        }),
        pack: z.object({
            format: z.enum(["zip", "tarball"])
        }),
        s3: z.object({
            bucket: z.string().min(1),
            key: z.string().min(1)
        }),
        http: z.object({
            url: z.string().min(1)
        }),
        build: z.object({
            command: z.array(z.string().min(1)).min(1),
            outputs: z.array(z.string().min(1)).min(1)
        }),
        confirm: z.object({
            prompt: z.string().min(1)
        })
    };

    /**
     * Parses and validates a task for a specific module.
     *
     * @param task Raw task object
     * @returns Validated task
     */
    export function parseTask(task: unknown): Task {
        return TaskSchema.parse(task);
    }

    /**
     * Validates module-specific required fields.
     *
     * @param task Parsed task
     * @returns Nothing.
     * @throws {z.ZodError} {@link z.ZodError}
     */
    export function validateModuleFields(task: Task): void {
        const schema = moduleSchemas[task.module];
        schema.parse(task);
    }
}
