import { z } from "zod";

/**
 * Minimal Gitea push webhook payload (fields used for GitOps routing).
 */
const GiteaPushWebhookSchema = z.object({
    ref: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    repository: z.object({
        clone_url: z.string().url().optional(),
        html_url: z.string().optional(),
        ssh_url: z.string().optional(),
        full_name: z.string().optional(),
        name: z.string().optional()
    }).optional()
}).passthrough();

export type GiteaPushWebhook = z.infer<typeof GiteaPushWebhookSchema>;

/**
 * Normalized GitOps webhook body produced from a Gitea push hook.
 */
export interface GiteaMappedGitOpsWebhook {
    repositoryUrl: string;
    branch: string;
    commitSha: string;
    repositoryFullName?: string;
    deliveryId?: string;
    deleted?: boolean;
    event?: "push" | "delete";
    manifestPath: string;
    overlayPaths: string[];
}

const EMPTY_GIT_SHA = "0000000000000000000000000000000000000000";

/**
 * Maps Gitea push webhook JSON into the control plane GitOps webhook contract.
 */
export namespace GiteaWebhookMapper {
    /**
     * Parses and maps a Gitea webhook body.
     *
     * @param payload Raw JSON body from Gitea
     * @param options Mapping options (manifest path, delivery id)
     * @returns GitOps webhook fields
     */
    export function map(
        payload: unknown,
        options: {
            manifestPath: string;
            deliveryId?: string;
            overlayPaths?: string[];
        }
    ): GiteaMappedGitOpsWebhook {
        const parsed = GiteaPushWebhookSchema.parse(payload);
        const branch = branchFromRef(parsed.ref);
        const commitSha = parsed.after?.trim() || parsed.before?.trim() || "";
        const repositoryUrl = resolveRepositoryUrl(parsed);

        if (!repositoryUrl) {
            throw new Error("Gitea webhook is missing repository clone URL.");
        }

        if (!commitSha) {
            throw new Error("Gitea webhook is missing commit SHA.");
        }

        const deleted = commitSha === EMPTY_GIT_SHA;

        return {
            repositoryUrl,
            branch,
            commitSha: deleted ? (parsed.before ?? commitSha) : commitSha,
            repositoryFullName: parsed.repository?.full_name,
            deliveryId: options.deliveryId,
            deleted,
            event: deleted ? "delete" : "push",
            manifestPath: options.manifestPath,
            overlayPaths: options.overlayPaths ?? []
        };
    }

    /**
     * Extracts branch name from a Gitea ref.
     *
     * @param ref Refs/heads/branch or undefined
     * @returns Branch name
     */
    function branchFromRef(ref?: string): string {
        if (!ref) {
            return "main";
        }

        const prefix = "refs/heads/";

        if (ref.startsWith(prefix)) {
            return ref.slice(prefix.length);
        }

        return ref;
    }

    /**
     * Resolves the git clone URL from repository metadata.
     *
     * @param payload Parsed Gitea payload
     * @returns Clone URL or undefined
     */
    function resolveRepositoryUrl(payload: GiteaPushWebhook): string | undefined {
        const repo = payload.repository;

        if (!repo) {
            return undefined;
        }

        return repo.clone_url ?? repo.html_url ?? repo.ssh_url;
    }
}
