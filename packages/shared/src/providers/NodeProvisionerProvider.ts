import type { ClusterLabels } from "../types/ClusterLabels";

/**
 * Cloud machine lifecycle status reported by a node provisioner.
 */
export type MachineStatus = "pending" | "launching" | "running" | "stopped" | "terminated" | "failed";

/**
 * Base specification for provisioning one or more cloud machines.
 */
export interface ProvisionSpec {
    instanceType: string;
    imageId: string;
    labels: ClusterLabels;
    capabilities: string[];
    count?: number;
    userData: string;
    region?: string;
    subnetId?: string;
    securityGroupIds?: string[];
    iamInstanceProfile?: string;
    keyName?: string;
}

/**
 * Machine metadata returned after a successful cloud launch.
 */
export interface ProvisionedMachine {
    cloudInstanceId: string;
    status: MachineStatus;
    region?: string;
    privateIp?: string;
    publicIp?: string;
}

/**
 * Optional filters for listing machines managed by a provisioner.
 */
export interface ListMachinesFilters {
    region?: string;
    status?: MachineStatus;
}

/**
 * Node provisioner contract for launching and terminating cloud VMs.
 */
export interface NodeProvisionerProvider {
    /**
     * Provider identifier registered without the plugin- directory prefix.
     */
    readonly id: string;

    /**
     * Launches one or more cloud machines from the given specification.
     *
     * @param spec Provisioning specification including rendered userData
     * @returns Launched machine metadata
     */
    provision(spec: ProvisionSpec): Promise<ProvisionedMachine[]>;

    /**
     * Returns the current lifecycle status for a cloud instance.
     *
     * @param cloudInstanceId Cloud provider instance identifier
     * @param region Optional cloud region override
     * @returns Current machine status
     */
    getStatus(cloudInstanceId: string, region?: string): Promise<MachineStatus>;

    /**
     * Terminates a cloud instance.
     *
     * @param cloudInstanceId Cloud provider instance identifier
     * @param region Optional cloud region override
     * @returns Nothing.
     */
    terminate(cloudInstanceId: string, region?: string): Promise<void>;

    /**
     * Lists machines managed by the provider when supported.
     *
     * @param filters Optional listing filters
     * @returns Matching machine metadata
     */
    listMachines?(filters?: ListMachinesFilters): Promise<ProvisionedMachine[]>;
}
