---
title: AWS node provisioner
description: IAM permissions and EC2 provisioning flow for cloud agent nodes.
---

# AWS node provisioner

Platform can launch EC2 worker nodes through the `@platform/plugin-aws-node-provisioner` plugin. The control plane renders cloud-init userData that embeds `bootstrap/agent-install.sh` and registers the node with a provision-scoped NetBird setup key.

## End-to-end flow

```
Operator/UI ──POST /nodes/provision──> NodeProvisionService
                                              │
                                              ├─ create provision record (pending)
                                              ├─ create NetBird setup key (provision-scoped)
                                              ├─ render userData (agent-install.sh + env)
                                              └─ AwsNodeProvisionerProvider.provision()
                                                      │
                                                      └─ EC2 RunInstances
                                                              │
                                                              v
                                                    cloud-init runs agent install
                                                              │
                                                              v
                                                    POST /nodes/register (agent online)
```

### Provision request fields

| Field | Purpose |
|-------|---------|
| `provider` | Must be `aws` |
| `instanceType` | EC2 instance type (e.g. `t3.medium`) |
| `amiId` | AMI in the target region |
| `region` | AWS region override |
| `subnetId` | VPC subnet for the instance |
| `securityGroupIds` | Security groups attached at launch |
| `iamInstanceProfile` | Instance profile name for the EC2 IAM role |
| `keyName` | Optional SSH key pair |
| `labels` | Node labels for manifest scheduling |
| `capabilities` | Capability list (e.g. `builder`, `runtime`) |
| `count` | Number of instances (default 1) |

### Provision status lifecycle

| Status | Meaning |
|--------|---------|
| `pending` | Record saved, EC2 launch not started |
| `launching` | `RunInstances` returned an instance id |
| `bootstrapping` | Instance running; cloud-init executing agent install |
| `online` | Agent registered and heartbeating |
| `failed` | Launch or bootstrap error |
| `terminated` | Instance terminated by operator |

Use the dashboard Provision view or `GET /nodes/provisions` for history.

## IAM requirements

The control plane process (or the IAM role behind your SDK credentials) needs EC2 API permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:RunInstances",
                "ec2:TerminateInstances",
                "ec2:DescribeInstances",
                "ec2:DescribeImages"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:aws:iam::<account-id>:role/<ec2-instance-profile-role>",
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": "ec2.amazonaws.com"
                }
            }
        }
    ]
}
```

### EC2 instance profile (worker role)

Instances launched for agents should allow:

- Outbound HTTPS to the control plane public URL
- Outbound to self-hosted NetBird management
- Docker installation via cloud-init (default userData installs Docker when missing)

Attach an instance profile whose role grants only what the workload needs (SSM, ECR pull, etc.) - not control plane EC2 permissions.

## Network and security groups

Minimum security group rules for a worker:

| Direction | Port | Purpose |
|-----------|------|---------|
| Outbound | 443 | Control plane API and NetBird |
| Inbound | 9470/tcp (or your `AGENT_PORT`) | Control plane to agent HTTP dispatch |
| Outbound | 443 | Image registry pulls |

Restrict agent ingress to the control plane security group or NetBird mesh CIDR.

## UserData contents

`NodeProvisionUserDataTemplate` injects:

- `PLATFORM_CP_URL`, `PLATFORM_SETUP_KEY`, `PLATFORM_PROVISION_ID`, `PLATFORM_NODE_ID`
- `PLATFORM_LABELS`, `PLATFORM_CAPABILITIES` as JSON
- Embedded `agent-install.sh` executed after optional Docker install

## Termination

The provisioner plugin calls `TerminateInstances` when an operator terminates a provision from the UI. Verify EBS volumes and ENIs are cleaned per your retention policy.

## Configuration

The AWS SDK client resolves region from the provision request or `AWS_REGION` (default `us-east-1`). Standard AWS credential chain applies (`AWS_ACCESS_KEY_ID`, instance role, etc.).

Enable the plugin in control plane config (`CP_PLUGINS` includes the aws provisioner when wired in your deployment image).

## Related

- [Install](/get-started/install/) - manual agent bootstrap without EC2
- [Bootstrap](/bootstrap/) - setup keys and enrollment routes
