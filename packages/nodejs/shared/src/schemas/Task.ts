import { z } from "zod";

import { TaskSandboxSchema, type TaskSandbox } from "./TaskSandbox";

/**
 * Supported task module identifiers.
 */
export const TaskModuleSchema = z.enum([
    "build",
    "copy",
    "pack",
    "s3",
    "confirm",
    "command",
    "unit",
    "http",
    "apt",
    "sysctl",
    "limits",
    "nvm",
    "npm",
    "unarchive",
    "file",
    "stat"
]);

export type TaskModule = z.infer<typeof TaskModuleSchema>;

/**
 * Task execution scope across target group members.
 */
export const TaskRunModeSchema = z.enum(["once", "all", "rolling"]);

export type TaskRunMode = z.infer<typeof TaskRunModeSchema>;

/**
 * SSH / Warpgate connection options on a task or service.
 */
export const TaskConnectSchema = z.object({
    connect: z.enum(["agent", "ssh"]).optional(),
    username: z.string().min(1).optional(),
    chdir: z.string().min(1).optional(),
    warpgate: z.object({
        enabled: z.boolean().optional(),
        host: z.string().min(1).optional(),
        port: z.number().int().positive().optional(),
        targetName: z.string().min(1).optional(),
        base: z.string().optional()
    }).optional()
});

/**
 * Inline task import via extends file reference.
 */
export const TaskExtendsSchema = z.object({
    extends: z.object({
        file: z.string().min(1)
    })
});

/**
 * Playbook task definition (CI/CD step).
 */
export type Task = {
    name: string;
    module: TaskModule;
    when?: string;
    run?: TaskRunMode;
    become?: boolean;
    connect?: "agent" | "ssh";
    target?: string;
    targetGroup?: string;
    service?: string;
    register?: string;
    ignoreErrors?: boolean;
    rescue?: Task[];
    chdir?: string;
    env?: Record<string, string>;
    username?: string;
    warpgate?: z.infer<typeof TaskConnectSchema>["warpgate"];
    command?: string | string[];
    outputs?: string[];
    prompt?: string;
    default?: boolean;
    packages?: string[];
    state?: string;
    updateCache?: boolean;
    file?: string;
    entries?: Record<string, string>;
    reload?: boolean;
    domain?: string;
    item?: string;
    type?: string;
    value?: string;
    version?: string;
    nvmVersion?: string;
    alias?: string;
    global?: boolean;
    path?: string;
    dest?: string;
    src?: string;
    content?: string;
    mode?: string;
    remoteSrc?: boolean;
    bucket?: string;
    key?: string;
    region?: string;
    action?: string;
    acl?: string | boolean;
    retention?: number;
    url?: string;
    method?: string;
    expectedStatus?: number[];
    headers?: Record<string, string>;
    body?: string;
    timeout?: string;
    validateCerts?: boolean;
    format?: "zip" | "tarball";
    from?: string[];
    failIfMissing?: boolean;
    recurse?: boolean;
    kind?: "pm2" | "systemd";
    sandbox?: TaskSandbox;
};

/**
 * Zod validator for {@link Task}, including nested rescue blocks.
 */
export const TaskSchema: z.ZodType<Task> = z.lazy(() =>
    z.object({
        name: z.string().min(1),
        module: TaskModuleSchema,
        when: z.string().optional(),
        run: TaskRunModeSchema.optional(),
        become: z.boolean().optional(),
        connect: z.enum(["agent", "ssh"]).optional(),
        target: z.string().min(1).optional(),
        targetGroup: z.string().min(1).optional(),
        service: z.string().min(1).optional(),
        register: z.string().min(1).optional(),
        ignoreErrors: z.boolean().optional(),
        rescue: z.array(TaskSchema).optional(),
        chdir: z.string().min(1).optional(),
        env: z.record(z.string(), z.string()).optional(),
        username: z.string().min(1).optional(),
        warpgate: TaskConnectSchema.shape.warpgate.optional(),
        command: z.union([z.string(), z.array(z.string())]).optional(),
        outputs: z.array(z.string().min(1)).optional(),
        prompt: z.string().optional(),
        default: z.boolean().optional(),
        packages: z.array(z.string().min(1)).optional(),
        state: z.string().optional(),
        updateCache: z.boolean().optional(),
        file: z.string().optional(),
        entries: z.record(z.string(), z.string()).optional(),
        reload: z.boolean().optional(),
        domain: z.string().optional(),
        item: z.string().optional(),
        type: z.string().optional(),
        value: z.string().optional(),
        version: z.string().optional(),
        nvmVersion: z.string().optional(),
        alias: z.string().optional(),
        global: z.boolean().optional(),
        path: z.string().optional(),
        dest: z.string().optional(),
        src: z.string().optional(),
        content: z.string().optional(),
        mode: z.string().optional(),
        remoteSrc: z.boolean().optional(),
        bucket: z.string().optional(),
        key: z.string().optional(),
        region: z.string().optional(),
        action: z.string().optional(),
        acl: z.union([z.string(), z.boolean()]).optional(),
        retention: z.number().int().positive().optional(),
        url: z.string().optional(),
        method: z.string().optional(),
        expectedStatus: z.array(z.number().int()).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.string().optional(),
        timeout: z.string().optional(),
        validateCerts: z.boolean().optional(),
        format: z.enum(["zip", "tarball"]).optional(),
        from: z.array(z.string()).optional(),
        failIfMissing: z.boolean().optional(),
        recurse: z.boolean().optional(),
        kind: z.enum(["pm2", "systemd"]).optional(),
        sandbox: TaskSandboxSchema.optional()
    }).superRefine((task, ctx) => {
        if (task.target && task.targetGroup) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Task cannot declare both target and targetGroup.",
                path: ["targetGroup"]
            });
        }

        if (task.module === "build" && task.sandbox && !task.sandbox.parent) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "sandbox.parent is required when sandbox is set on a build task.",
                path: ["sandbox", "parent"]
            });
        }
    })
);
