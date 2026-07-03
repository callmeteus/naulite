import type { DatabaseProvider } from "../database/DatabaseProvider";
import { ControlPlaneLeaderModel } from "../database/models/index";

const DEFAULT_LEASE_KEY = "control-plane";
const DEFAULT_LEASE_TTL_MS = 15_000;
const DEFAULT_RENEW_INTERVAL_MS = 5_000;

/**
 * PostgreSQL lease-based leader election for HA control plane deployments.
 */
export class LeaderElection {
    private renewHandle: NodeJS.Timeout | null = null;
    private leaderInstanceId: string | null = null;
    private isCurrentLeader = false;

    /**
     * Creates a leader election service.
     *
     * @param databaseProvider Connected database provider
     * @param instanceId Unique control plane instance id
     * @param leaseTtlMs Lease duration in milliseconds
     * @param renewIntervalMs Lease renewal interval in milliseconds
     */
    constructor(
        private readonly databaseProvider: DatabaseProvider,
        private readonly instanceId: string,
        private readonly leaseTtlMs: number = DEFAULT_LEASE_TTL_MS,
        private readonly renewIntervalMs: number = DEFAULT_RENEW_INTERVAL_MS
    ) {}

    /**
     * Starts leader election when PostgreSQL is configured.
     *
     * @returns Nothing.
     */
    start(): void {
        if (this.databaseProvider.getDialect() !== "postgresql" || this.renewHandle) {
            this.isCurrentLeader = true;
            this.leaderInstanceId = this.instanceId;
            return;
        }

        this.renewHandle = setInterval(() => {
            void this.renewLease().catch(() => undefined);
        }, this.renewIntervalMs);

        void this.renewLease().catch(() => undefined);
    }

    /**
     * Stops leader election renewal.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (this.renewHandle) {
            clearInterval(this.renewHandle);
            this.renewHandle = null;
        }
    }

    /**
     * Returns whether this instance currently holds the leader lease.
     *
     * @returns Whether this instance is the elected leader
     */
    isLeader(): boolean {
        if (this.databaseProvider.getDialect() !== "postgresql") {
            return true;
        }

        return this.isCurrentLeader;
    }

    /**
     * Returns the current leader instance id when known.
     *
     * @returns Leader instance id
     */
    getLeaderId(): string {
        return this.leaderInstanceId ?? this.instanceId;
    }

    /**
     * Throws when this instance is not the elected leader.
     *
     * @returns Nothing.
     */
    requireLeader(): void {
        if (!this.isLeader()) {
            throw new Error("This control plane instance is not the cluster leader.");
        }
    }

    /**
     * Attempts to acquire or renew the leader lease.
     *
     * @returns Nothing.
     */
    async renewLease(): Promise<void> {
        if (this.databaseProvider.getDialect() !== "postgresql") {
            this.isCurrentLeader = true;
            this.leaderInstanceId = this.instanceId;
            return;
        }

        const now = Date.now();
        const expiresAt = new Date(now + this.leaseTtlMs).toISOString();
        const updatedAt = new Date(now).toISOString();
        const existing = await ControlPlaneLeaderModel.findByPk(DEFAULT_LEASE_KEY);
        const leaseExpired = !existing || Date.parse(existing.expiresAt) <= now;

        if (!existing) {
            try {
                await ControlPlaneLeaderModel.create({
                    leaseKey: DEFAULT_LEASE_KEY,
                    leaderInstanceId: this.instanceId,
                    expiresAt,
                    updatedAt
                });
                this.isCurrentLeader = true;
                this.leaderInstanceId = this.instanceId;
                console.debug("[leader] acquired lease instanceId=%s", this.instanceId);
                return;
            } catch {
                this.isCurrentLeader = false;
            }
        } else if (leaseExpired || existing.leaderInstanceId === this.instanceId) {
            const [affectedCount] = await ControlPlaneLeaderModel.update(
                {
                    leaderInstanceId: this.instanceId,
                    expiresAt,
                    updatedAt
                },
                {
                    where: leaseExpired
                        ? { leaseKey: DEFAULT_LEASE_KEY }
                        : {
                            leaseKey: DEFAULT_LEASE_KEY,
                            leaderInstanceId: this.instanceId
                        }
                }
            );

            if (affectedCount > 0) {
                this.isCurrentLeader = true;
                this.leaderInstanceId = this.instanceId;
                console.debug("[leader] renewed lease instanceId=%s", this.instanceId);
                return;
            }
        }

        const current = await ControlPlaneLeaderModel.findByPk(DEFAULT_LEASE_KEY);
        this.isCurrentLeader = current?.leaderInstanceId === this.instanceId
            && current !== null
            && Date.parse(current.expiresAt) > now;
        this.leaderInstanceId = current?.leaderInstanceId ?? this.instanceId;
        console.debug(
            "[leader] follower instanceId=%s leaderId=%s isLeader=%s",
            this.instanceId,
            this.leaderInstanceId,
            this.isCurrentLeader
        );
    }
}
