import { NodeProvisionProvider, type Node } from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { PreviewHostIngressService } from "./PreviewHostIngressService";
import { Logger } from "../../Logger";

const logPreview = Logger.create("preview-host");

/**
 * Preview host provisioning result.
 */
export interface PreviewHostEnsureResult {
    nodeId: string;
    hostname: string;
    reused: boolean;
}

/**
 * Preview host naming derived from EVEN-* branches.
 */
export namespace PreviewHostService {
    /**
     * Converts a task branch into a stable host slug.
     *
     * @param branch Git branch (EVEN-1234)
     * @returns Slug (even-1234) or undefined when not a task branch
     */
    export function branchToSlug(branch: string): string | undefined {
        if (!branch.startsWith("EVEN-")) {
            return undefined;
        }

        return branch.toLowerCase();
    }

    /**
     * Builds the Incus/PM2 service name for a preview host.
     *
     * @param branch Git branch
     * @returns Service name lm-even-1234
     */
    export function serviceNameForBranch(branch: string): string {
        const slug = branchToSlug(branch) ?? branch.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        return `lm-${slug}`;
    }

    /**
     * Builds the public hostname for Traefik routing.
     *
     * @param branch Git branch
     * @param previewDomain Base preview domain (lm.local.arpa)
     * @returns Hostname even-1234.lm.local.arpa
     */
    export function hostnameForBranch(branch: string, previewDomain: string): string {
        const slug = branchToSlug(branch) ?? branch.toLowerCase();
        return `${slug}.${previewDomain}`;
    }

    /**
     * Finds an online node already tagged for a preview branch slug.
     *
     * @param nodes Registered cluster nodes
     * @param slug Lowercase EVEN-* slug
     * @returns Matching node when online, otherwise undefined
     */
    export function findOnlinePreviewNode(nodes: Node[], slug: string): Node | undefined {
        for (const node of nodes) {
            if (node.status !== "online") {
                continue;
            }

            const previewBranch = node.labels.preview_branch ?? node.labels["preview-branch"];

            if (previewBranch === slug) {
                return node;
            }
        }

        return undefined;
    }

    /**
     * Provisions or reuses a preview EC2 host for an EVEN-* branch.
     *
     * @param branch Git branch (EVEN-1234)
     * @param previewDomain Base preview domain (lm.local.arpa)
     * @returns Node id and public hostname
     */
    export async function ensurePreviewHost(
        branch: string,
        previewDomain: string
    ): Promise<PreviewHostEnsureResult> {
        const slug = branchToSlug(branch);

        if (!slug) {
            throw new Error(`Branch ${branch} is not a preview branch.`);
        }

        const hostname = hostnameForBranch(branch, previewDomain);
        const nodes = await ControlPlaneService.Store.listNodes();
        const existing = PreviewHostService.findOnlinePreviewNode(nodes, slug);

        if (existing) {
            logPreview.info("preview host reused branch=%s nodeId=%s", branch, existing.id);

            await PreviewHostIngressService.ensurePreviewRoute(
                hostname,
                existing.id,
                PreviewHostService.serviceNameForBranch(branch)
            );

            return {
                nodeId: existing.id,
                hostname,
                reused: true
            };
        }

        const provision = await ControlPlaneService.NodeProvision.provision({
            provider: NodeProvisionProvider.AWS,
            instanceType: process.env.NAULITE_PREVIEW_INSTANCE_TYPE ?? "t3.micro",
            amiId: process.env.NAULITE_PREVIEW_AMI_ID ?? "ami-0abcdef1234567890",
            region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
            count: 1,
            securityGroupIds: [],
            labels: {
                preview_branch: slug,
                role: "preview"
            },
            capabilities: ["docker"]
        });

        if (!provision.nodeId) {
            throw new Error("Provisioner did not return a node id.");
        }

        logPreview.info(
            "preview host provisioned branch=%s nodeId=%s provisionId=%s",
            branch,
            provision.nodeId,
            provision.id
        );

        await PreviewHostIngressService.ensurePreviewRoute(
            hostname,
            provision.nodeId,
            PreviewHostService.serviceNameForBranch(branch)
        );

        return {
            nodeId: provision.nodeId,
            hostname,
            reused: false
        };
    }

    /**
     * Tears down a preview host after branch delete webhook.
     *
     * @param branch Deleted branch name
     * @param previewDomain Preview domain from manifest vars
     * @returns Nothing.
     */
    export async function teardownBranch(branch: string, previewDomain: string): Promise<void> {
        const slug = branchToSlug(branch);

        if (!slug) {
            return;
        }

        logPreview.info("preview teardown requested branch=%s host=%s", branch, hostnameForBranch(branch, previewDomain));
    }
}
