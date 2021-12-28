import { CloudFormation } from 'aws-sdk';
import { ISDK } from '../aws-auth';

export async function findPhysicalNameForNestedStack(logicalId: string, parentStackName: string, sdk: ISDK): Promise<string | undefined> {
  if (!parentStackName) {
    return undefined;
  }
  const stackResources = await listNestedStackResources(parentStackName, sdk);
  return stackResources.find(sr => sr.LogicalResourceId === logicalId)?.PhysicalResourceId;
}

async function listNestedStackResources(parentStackName: string, sdk: ISDK): Promise<CloudFormation.StackResourceSummary[]> {
  const ret = new Array<CloudFormation.StackResourceSummary>();
  let nextToken: string | undefined;
  do {
    const stackResourcesResponse = await sdk.cloudFormation().listStackResources({
      StackName: parentStackName,
      NextToken: nextToken,
    }).promise();
    ret.push(...(stackResourcesResponse.StackResourceSummaries ?? []));
    nextToken = stackResourcesResponse.NextToken;
  } while (nextToken);
  return ret;
}