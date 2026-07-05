import { RunInstancesCommand, DescribeImagesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { describe, expect, it, vi } from "vitest";

import { AwsNodeProvisionerProvider } from "@naulite/plugin-aws-node-provisioner";

describe("AwsNodeProvisionerProvider", () => {
    it("launches instances with base64 userData via mocked EC2", async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof DescribeImagesCommand) {
                return { Images: [{ ImageId: "ami-123" }] };
            }

            if (command instanceof RunInstancesCommand) {
                expect(command.input.UserData).toBe(
                    Buffer.from("#!/bin/bash\necho hello", "utf8").toString("base64")
                );
                return {
                    Instances: [{
                        InstanceId: "i-abc123",
                        State: { Name: "pending" }
                    }]
                };
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        const provider = new AwsNodeProvisionerProvider({
            client: { send } as never
        });

        const machines = await provider.provision({
            instanceType: "t3.micro",
            imageId: "ami-123",
            labels: { role: "worker" },
            capabilities: ["docker"],
            userData: "#!/bin/bash\necho hello",
            region: "us-east-1"
        });

        expect(machines).toEqual([{
            cloudInstanceId: "i-abc123",
            status: "pending",
            region: "us-east-1",
            privateIp: undefined,
            publicIp: undefined
        }]);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("throws when the AMI does not exist", async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof DescribeImagesCommand) {
                return { Images: [] };
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        const provider = new AwsNodeProvisionerProvider({
            client: { send } as never
        });

        await expect(provider.provision({
            instanceType: "t3.micro",
            imageId: "ami-missing",
            labels: {},
            capabilities: [],
            userData: "#!/bin/bash"
        })).rejects.toThrow("AMI not found: ami-missing");
    });

    it("terminates instances via mocked EC2", async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof TerminateInstancesCommand) {
                expect(command.input.InstanceIds).toEqual(["i-terminate"]);
                return {};
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        const provider = new AwsNodeProvisionerProvider({
            client: { send } as never
        });

        await provider.terminate("i-terminate", "us-east-1");
        expect(send).toHaveBeenCalledTimes(1);
    });
});
