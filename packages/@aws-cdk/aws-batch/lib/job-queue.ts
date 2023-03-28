import { IResource, Lazy, Resource } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { CfnJobQueue } from './batch.generated';
import { IComputeEnvironment } from './compute-environment-base';
import { ISchedulingPolicy } from './scheduling-policy';

export interface IJobQueue extends IResource {
  /**
   * The set of compute environments mapped to a job queue and their order relative to each other.
   * The job scheduler uses this parameter to determine which compute environment runs a specific job.
   * Compute environments must be in the VALID state before you can associate them with a job queue.
   * You can associate up to three compute environments with a job queue.
   * All of the compute environments must be either EC2 (EC2 or SPOT) or Fargate (FARGATE or FARGATE_SPOT);
   * EC2 and Fargate compute environments can't be mixed.
   *
   * *Note*: All compute environments that are associated with a job queue must share the same architecture.
   * AWS Batch doesn't support mixing compute environment architecture types in a single job queue.
   */
  readonly computeEnvironments: OrderedComputeEnvironment[]

  /**
   * The priority of the job queue.
   * Job queues with a higher priority are evaluated first when associated with the same compute environment.
   * Priority is determined in descending order.
   * For example, a job queue with a priority value of 10 is given scheduling preference over a job queue with a priority value of 1.
   */
  readonly priority: number

  /**
   * The name of the job queue. It can be up to 128 letters long.
   * It can contain uppercase and lowercase letters, numbers, hyphens (-), and underscores (_)
   *
   * @default - no name
   */
  readonly jobQueueName?: string

  /**
   * If the job queue is enabled, it is able to accept jobs.
   * Otherwise, new jobs can't be added to the queue, but jobs already in the queue can finish.
   *
   * @default true
   */
  readonly enabled?: boolean

  /**
   * The SchedulingPolicy for this JobQueue. Instructs the Scheduler how to schedule different jobs.
   */
  readonly schedulingPolicy?: ISchedulingPolicy

  /**
   * The ARN of this job queue
   *
   * @attribute
   */
  readonly jobQueueArn: string;
}

export interface JobQueueProps {
  /**
   * The set of compute environments mapped to a job queue and their order relative to each other.
   * The job scheduler uses this parameter to determine which compute environment runs a specific job.
   * Compute environments must be in the VALID state before you can associate them with a job queue.
   * You can associate up to three compute environments with a job queue.
   * All of the compute environments must be either EC2 (EC2 or SPOT) or Fargate (FARGATE or FARGATE_SPOT);
   * EC2 and Fargate compute environments can't be mixed.
   *
   * *Note*: All compute environments that are associated with a job queue must share the same architecture.
   * AWS Batch doesn't support mixing compute environment architecture types in a single job queue.
   */
  readonly computeEnvironments: OrderedComputeEnvironment[]

  /**
   * The priority of the job queue.
   * Job queues with a higher priority are evaluated first when associated with the same compute environment.
   * Priority is determined in descending order.
   * For example, a job queue with a priority value of 10 is given scheduling preference over a job queue with a priority value of 1.
   */
  readonly priority: number

  /**
   * The name of the job queue. It can be up to 128 letters long.
   * It can contain uppercase and lowercase letters, numbers, hyphens (-), and underscores (_)
   *
   * @default - no name
   */
  readonly jobQueueName?: string

  /**
   * If the job queue is enabled, it is able to accept jobs.
   * Otherwise, new jobs can't be added to the queue, but jobs already in the queue can finish.
   *
   * @default true
   */
  readonly enabled?: boolean

  /**
   * The SchedulingPolicy for this JobQueue. Instructs the Scheduler how to schedule different jobs.
   */
  readonly schedulingPolicy?: ISchedulingPolicy
}

export interface OrderedComputeEnvironment {
  readonly computeEnvironment: IComputeEnvironment;
  readonly order: number;
}

export class JobQueue extends Resource implements IJobQueue {
  public static fromJobQueueArn(scope: Construct, id: string, jobQueueArn: string): IJobQueue {
    class Import extends Resource implements IJobQueue {
      public readonly computeEnvironments = [];
      public readonly priority = 0;
      public readonly jobQueueArn = jobQueueArn;
    }

    return new Import(scope, id);
  }

  readonly computeEnvironments: OrderedComputeEnvironment[]
  readonly priority: number
  readonly jobQueueName?: string
  readonly enabled?: boolean
  readonly schedulingPolicy?: ISchedulingPolicy

  public readonly jobQueueArn: string;

  constructor(scope: Construct, id: string, props: JobQueueProps) {
    super(scope, id, {
      physicalName: props.jobQueueName,
    });

    this.computeEnvironments = props.computeEnvironments;
    this.priority = props.priority;
    this.jobQueueName = props.jobQueueName;
    this.enabled = props.enabled;
    this.schedulingPolicy = props.schedulingPolicy;

    const resource = new CfnJobQueue(this, id, {
      computeEnvironmentOrder: Lazy.any({
        produce: () => this.computeEnvironments.map((ce) => {
          return {
            computeEnvironment: ce.computeEnvironment.computeEnvironmentArn,
            order: ce.order,
          };
        }),
      }),
      priority: this.priority,
      jobQueueName: this.jobQueueName,
      state: this.enabled === undefined ? 'ENABLED' : (props.enabled ? 'ENABLED' : 'DISABLED'),
      schedulingPolicyArn: this.schedulingPolicy?.schedulingPolicyArn,
    });

    this.jobQueueArn = this.getResourceArnAttribute(resource.attrJobQueueArn, {
      service: 'batch',
      resource: 'job-queue',
      resourceName: this.physicalName,
    });

    this.node.addValidation({ validate: () => validateOrderedComputeEnvironments(this.computeEnvironments) });
  }

  addComputeEnvironment(computeEnvironment: IComputeEnvironment, order: number): void {
    this.computeEnvironments.push({
      computeEnvironment,
      order,
    });
  }
}

function validateOrderedComputeEnvironments(computeEnvironments: OrderedComputeEnvironment[]): string[] {
  const seenOrders: number[] = [];

  for (const ce of computeEnvironments) {
    if (seenOrders.includes(ce.order)) {
      return ['assigns the same order to different ComputeEnvironments'];
    }
    seenOrders.push(ce.order);
  }

  return [];
}
