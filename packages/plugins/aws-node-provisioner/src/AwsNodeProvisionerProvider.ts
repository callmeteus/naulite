import {
    DescribeImagesCommand,
    DescribeInstancesCommand,
    EC2Client,
    RunInstancesCommand,
    TerminateInstancesCommand,
    type EC2ClientConfig
} from "@aws-sdk/client-ec2";

import type {
    MachineStatus,
    NodeProvisionerProvider,
    ProvisionedMachine,
    ProvisionSpec
} from "@naulite/shared";

/**
 * Options for the AWS EC2 node provisioner.
 */
export interface AwsNodeProvisionerProviderOptions {
    client?: EC2Client;
    defaultClientConfig?: EC2ClientConfig;
}

/**
 * AWS EC2 node provisioner backed by @aws-sdk/client-ec2.
 */
export class AwsNodeProvisionerProvider implements NodeProvisionerProvider {
    readonly id = "AWS";
    private readonly injectedClient?: EC2Client;
    private readonly defaultClientConfig?: EC2ClientConfig;

    /**
     * Creates an AWS node provisioner provider.
     *
     * @param options Optional injected EC2 client or default client configuration
     */
    constructor(options: AwsNodeProvisionerProviderOptions = {}) {
        this.injectedClient = options.client;
        this.defaultClientConfig = options.defaultClientConfig;
    }

    /**
     * Launches EC2 instances for the given provisioning specification.
     *
     * @param spec Provisioning specification including rendered userData
     * @returns Launched machine metadata
     */
    async provision(spec: ProvisionSpec): Promise<ProvisionedMachine[]> {
        const client = this.resolveClient(spec.region);
        await this.validateImage(client, spec.imageId);

        const count = spec.count ?? 1;
        console.debug(
            "[plugin-aws-node-provisioner] provision region=%s ami=%s type=%s count=%d",
            spec.region ?? "-",
            spec.imageId,
            spec.instanceType,
            count
        );

        const response = await client.send(new RunInstancesCommand({
            ImageId: spec.imageId,
            InstanceType: spec.instanceType as never,
            MinCount: count,
            MaxCount: count,
            UserData: Buffer.from(spec.userData, "utf8").toString("base64"),
            SubnetId: spec.subnetId,
            SecurityGroupIds: spec.securityGroupIds?.length ? spec.securityGroupIds : undefined,
            IamInstanceProfile: spec.iamInstanceProfile
                ? { Name: spec.iamInstanceProfile }
                : undefined,
            KeyName: spec.keyName,
            TagSpecifications: [{
                ResourceType: "instance",
                Tags: [{ Key: "platform:managed", Value: "true" }]
            }]
        }));

        const instances = response.Instances ?? [];

        return instances.map((instance) => ({
            cloudInstanceId: instance.InstanceId ?? "",
            status: mapEc2State(instance.State?.Name),
            region: spec.region,
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress
        }));
    }

    /**
     * Returns the current EC2 instance lifecycle status.
     *
     * @param cloudInstanceId EC2 instance identifier
     * @param region Optional AWS region override
     * @returns Current machine status
     */
    async getStatus(cloudInstanceId: string, region?: string): Promise<MachineStatus> {
        const client = this.resolveClient(region);
        const response = await client.send(new DescribeInstancesCommand({
            InstanceIds: [cloudInstanceId]
        }));
        const instance = response.Reservations?.[0]?.Instances?.[0];
        console.debug(
            "[plugin-aws-node-provisioner] getStatus instanceId=%s state=%s",
            cloudInstanceId,
            instance?.State?.Name ?? "-"
        );

        return mapEc2State(instance?.State?.Name);
    }

    /**
     * Terminates an EC2 instance.
     *
     * @param cloudInstanceId EC2 instance identifier
     * @param region Optional AWS region override
     * @returns Nothing.
     */
    async terminate(cloudInstanceId: string, region?: string): Promise<void> {
        const client = this.resolveClient(region);
        console.debug("[plugin-aws-node-provisioner] terminate instanceId=%s", cloudInstanceId);
        await client.send(new TerminateInstancesCommand({
            InstanceIds: [cloudInstanceId]
        }));
    }

    /**
     * Resolves an EC2 client for the requested region.
     *
     * @param region Optional AWS region override
     * @returns Configured EC2 client
     */
    private resolveClient(region?: string): EC2Client {
        if (this.injectedClient) {
            return this.injectedClient;
        }

        return new EC2Client({
            region: region ?? process.env.AWS_REGION ?? "us-east-1",
            ...this.defaultClientConfig
        });
    }

    /**
     * Validates that the AMI exists in the target region.
     *
     * @param client EC2 client
     * @param imageId AMI identifier
     * @returns Nothing.
     */
    private async validateImage(client: EC2Client, imageId: string): Promise<void> {
        const response = await client.send(new DescribeImagesCommand({
            ImageIds: [imageId]
        }));

        if (!response.Images?.length) {
            throw new Error(`AMI not found: ${imageId}`);
        }
    }
}

/**
 * Maps EC2 instance state names to platform machine status values.
 *
 * @param state EC2 instance state name
 * @returns Naulite machine status
 */
function mapEc2State(state: string | undefined): MachineStatus {
    switch (state) {
        case "pending":
            return "pending";
        case "running":
            return "running";
        case "stopping":
        case "stopped":
            return "stopped";
        case "shutting-down":
        case "terminated":
            return "terminated";
        default:
            return "failed";
    }
}

/**
 * Default AWS node provisioner provider instance.
 */
export const awsNodeProvisionerProvider = new AwsNodeProvisionerProvider();

export const awsNodeProvisionerPluginRegistration = {
    id: "AWS",
    type: "nodeProvisioner" as const,
    version: "0.1.0",
    nodeProvisionerProvider: awsNodeProvisionerProvider
};

/**
 * Default plugin export for auto-discovery.
 */
export default awsNodeProvisionerPluginRegistration;

/**
 * Creates an AWS node provisioner provider.
 *
 * @param options Optional injected EC2 client or default client configuration
 * @returns Configured AWS node provisioner provider
 */
export function createAwsNodeProvisionerProvider(
    options?: AwsNodeProvisionerProviderOptions
): AwsNodeProvisionerProvider {
    return new AwsNodeProvisionerProvider(options);
}
