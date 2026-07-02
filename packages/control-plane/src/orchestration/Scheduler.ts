import type { ManifestService, Node, Service } from "@platform/shared";

/**
 * Node score computed by the scheduler.
 */
export interface NodeScore {
    node: Node;
    score: number;
    matchedLabels: string[];
    matchedCapabilities: string[];
}

/**
 * Scheduler placement result for a service.
 */
export interface ScheduleResult {
    service: Service;
    node: Node;
    score: NodeScore;
}

/**
 * Scores cluster nodes and selects the best placement for services.
 */
export class Scheduler {
    /**
     * Selects the best node for a service using CPU, memory, disk, labels, and capabilities.
     * 
     * @param service Service to schedule
     * @param manifestService Manifest service definition used for placement constraints
     * @param nodes Candidate nodes
     * @returns Best schedule result or null when no node qualifies
     */
    schedule(
        service: Service,
        manifestService: ManifestService | undefined,
        nodes: Node[]
    ): ScheduleResult | null {
        const eligibleNodes = nodes.filter((node) => node.status === "online" || node.status === "registering");

        if (eligibleNodes.length === 0) {
            return null;
        }

        const scores = eligibleNodes
            .map((node) => Scheduler.scoreNode(node, service, manifestService))
            .filter((score): score is NodeScore => score !== null)
            .sort((left, right) => right.score - left.score);

        const best = scores[0];

        if (!best) {
            return null;
        }

        return {
            service,
            node: best.node,
            score: best
        };
    }

    /**
     * Scores all eligible nodes for a service.
     * 
     * @param service Service to schedule
     * @param manifestService Manifest service definition
     * @param nodes Candidate nodes
     * @returns Node scores sorted descending
     */
    scoreAll(
        service: Service,
        manifestService: ManifestService | undefined,
        nodes: Node[]
    ): NodeScore[] {
        return nodes
            .map((node) => Scheduler.scoreNode(node, service, manifestService))
            .filter((score): score is NodeScore => score !== null)
            .sort((left, right) => right.score - left.score);
    }

    /**
     * Scores a single node for service placement.
     * 
     * @param node Candidate node
     * @param service Service to schedule
     * @param manifestService Manifest service definition
     * @returns Node score or null when constraints fail
     */
    private static scoreNode(
        node: Node,
        service: Service,
        manifestService: ManifestService | undefined
    ): NodeScore | null {
        const requiredLabels = {
            ...service.cluster?.labels,
            ...manifestService?.cluster?.labels
        };
        const requiredCapabilities = [
            ...new Set([
                ...service.capabilities,
                ...(manifestService?.capabilities ?? [])
            ])
        ];

        const matchedLabels = Object.entries(requiredLabels).filter(([key, value]) => {
            return node.labels[key] === value;
        }).map(([key]) => key);

        if (matchedLabels.length !== Object.keys(requiredLabels).length) {
            return null;
        }

        const matchedCapabilities = requiredCapabilities.filter((capability) => {
            return node.capabilities.includes(capability);
        });

        if (matchedCapabilities.length !== requiredCapabilities.length) {
            return null;
        }

        const cpuFree = node.resources.cpuMillisTotal - node.resources.cpuMillisUsed;
        const memoryFree = node.resources.memoryMbTotal - node.resources.memoryMbUsed;
        const diskFree = node.resources.diskMbTotal - node.resources.diskMbUsed;

        if (cpuFree <= 0 || memoryFree <= 0 || diskFree <= 0) {
            return null;
        }

        const cpuScore = cpuFree / Math.max(node.resources.cpuMillisTotal, 1);
        const memoryScore = memoryFree / Math.max(node.resources.memoryMbTotal, 1);
        const diskScore = diskFree / Math.max(node.resources.diskMbTotal, 1);
        const capabilityBonus = matchedCapabilities.length * 0.05;
        const labelBonus = matchedLabels.length * 0.02;
        const score = cpuScore * 0.4 + memoryScore * 0.4 + diskScore * 0.2 + capabilityBonus + labelBonus;

        return {
            node,
            score,
            matchedLabels,
            matchedCapabilities
        };
    }
}
