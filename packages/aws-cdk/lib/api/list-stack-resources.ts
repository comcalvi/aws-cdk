import { CloudFormation } from 'aws-sdk';
import { ISDK } from '..';

export class GetStackResources {
  private stackResources: { [key:string]: CloudFormation.StackResourceSummary[] | undefined };
  constructor(private readonly sdk: ISDK) {
    this.stackResources = {};
  }

  public async findPhysicalNameFor(logicalId: string, stackName: string | undefined): Promise<string | undefined> {
    if (!stackName) {
      return undefined;
    }
    const stackResources = await this.listStackResources(stackName);
    return stackResources ? stackResources.find(sr => sr.LogicalResourceId === logicalId)?.PhysicalResourceId : undefined;
  }

  public async listStackResources(stackName: string): Promise<CloudFormation.StackResourceSummary[] | undefined> {
    if (!this.stackResources[stackName]) {
      this.stackResources[stackName] = await this.getStackResources(stackName);
    }
    return this.stackResources[stackName];
  }

  private async getStackResources(stackName: string): Promise<CloudFormation.StackResourceSummary[] | undefined> {
    const ret = new Array<CloudFormation.StackResourceSummary>();
    let nextToken: string | undefined;
    do {
      let stackResourcesResponse;
      try {
        stackResourcesResponse = await this.sdk.cloudFormation().listStackResources({
          StackName: stackName,
          NextToken: nextToken,
        }).promise();
      } catch (e) {
        if (e.message === `Stack with id ${stackName} does not exist`) {
          return undefined;
        }

        throw e;
      }
      ret.push(...(stackResourcesResponse.StackResourceSummaries ?? []));
      nextToken = stackResourcesResponse.NextToken;
    } while (nextToken);
    return ret;
  }
}