import * as ec2 from '@aws-cdk/aws-ec2';
import { ArnFormat, Lazy, Stack } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { CfnJobDefinition } from './batch.generated';
import { IEcsContainerDefinition } from './ecs-container-definition';
import { Compatibility } from './ecs-job-definition';
import { IJobDefinition, JobDefinitionBase, JobDefinitionProps } from './job-definition-base';


interface IMultiNodeJobDefinition extends IJobDefinition {
  /**
   * The containers that this multinode job will run.
   *
   * @see: https://aws.amazon.com/blogs/compute/building-a-tightly-coupled-molecular-dynamics-workflow-with-multi-node-parallel-jobs-in-aws-batch/
   */
  readonly containers: MultiNodeContainer[];

  /**
   * The instance type that this job definition will run
   */
  readonly instanceType: ec2.InstanceType;

  /**
   * The index of the main node in this job.
   * The main node is responsible for orchestration.
   *
   * @default 0
   */
  readonly mainNode?: number;

}

/**
 * Runs the container on nodes [startNode, endNode]
 */
export interface MultiNodeContainer {
  /**
   * The index of the first node to run this container
   *
   * The container is run on all nodes in the range [startNode, endNode] (inclusive)
   */
  readonly startNode: number;

  /**
   * The index of the last node to run this container.
   *
   * The container is run on all nodes in the range [startNode, endNode] (inclusive)
   */
  readonly endNode: number;

  /**
   * The container that this node range will run
   */
  readonly container: IEcsContainerDefinition;
}

export interface MultiNodeJobDefinitionProps extends JobDefinitionProps {
  /**
   * The containers that this multinode job will run.
   *
   * @see: https://aws.amazon.com/blogs/compute/building-a-tightly-coupled-molecular-dynamics-workflow-with-multi-node-parallel-jobs-in-aws-batch/
   */
  readonly containers: MultiNodeContainer[];

  /**
   * The index of the main node in this job.
   * The main node is responsible for orchestration.
   *
   * @default 0
   */
  readonly mainNode?: number;

  /**
   * The instance type that this job definition
   * will run.
   */
  readonly instanceType: ec2.InstanceType;
}

/**
 * A JobDefinition that uses Ecs orchestration to run multiple containers
 *
 * @resource AWS::Batch::JobDefinition
 */
export class MultiNodeJobDefinition extends JobDefinitionBase implements IMultiNodeJobDefinition {
  public static fromJobDefinitionArn(scope: Construct, id: string, jobDefinitionArn: string): IJobDefinition {
    const stack = Stack.of(scope);
    const jobDefinitionName = stack.splitArn(jobDefinitionArn, ArnFormat.SLASH_RESOURCE_NAME).resourceName!;

    class Import extends JobDefinitionBase implements IJobDefinition {
      public readonly jobDefinitionArn = jobDefinitionArn;
      public readonly jobDefinitionName = jobDefinitionName;
      public readonly enabled = true;
    }

    return new Import(scope, id);
  }

  readonly containers: MultiNodeContainer[];
  readonly instanceType: ec2.InstanceType;
  readonly mainNode?: number;

  public readonly jobDefinitionArn: string;

  constructor(scope: Construct, id: string, props: MultiNodeJobDefinitionProps) {
    super(scope, id, props);

    this.containers = props.containers;
    this.mainNode = props.mainNode;
    this.instanceType = props.instanceType;

    const resource = new CfnJobDefinition(this, 'Resource', {
      ...this.resourceProps,
      type: 'multinode',
      nodeProperties: {
        mainNode: this.mainNode ?? 0,
        nodeRangeProperties: Lazy.any({
          produce: () => this.containers.map((container) => ({
            targetNodes: container.startNode + ':' + container.endNode,
            container: {
              ...container.container.renderContainerDefinition(),
              instanceType: this.instanceType.toString(),
            },
          })),
        }),
        numNodes: Lazy.number({
          produce: () => computeNumNodes(this.containers),
        }),
      },
      platformCapabilities: [Compatibility.EC2],
    });
    this.jobDefinitionArn = this.getResourceArnAttribute(resource.ref, {
      service: 'batch',
      resource: 'job-definition',
      resourceName: this.physicalName,
    });
  }

  public addContainer(container: MultiNodeContainer) {
    this.containers.push(container);
  }
}

function computeNumNodes(containers: MultiNodeContainer[]) {
  let result = 0;

  for (const container of containers) {
    result += container.endNode - container.startNode + 1;
  }

  return result;
}
