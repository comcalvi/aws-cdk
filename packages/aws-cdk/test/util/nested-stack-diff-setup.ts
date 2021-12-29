import { CloudFormation } from 'aws-sdk';
import { MockSdkProvider } from './mock-sdk';

let nestedDiffMockSdkProvider: NestedDiffMockSdkProvider;
let currentCfnStackResources: { [key: string]: CloudFormation.StackResourceSummary[] };

export function setupNestedDiffTests() {
  jest.resetAllMocks();
  currentCfnStackResources = {};
  nestedDiffMockSdkProvider = new NestedDiffMockSdkProvider();

  return nestedDiffMockSdkProvider;
}

export class NestedDiffMockSdkProvider {
  public readonly mockSdkProvider: MockSdkProvider;

  constructor() {
    this.mockSdkProvider = new MockSdkProvider({ realSdk: false });

    this.mockSdkProvider.stubCloudFormation({
      listStackResources: ({ StackName: stackName }) => {
        return {
          StackResourceSummaries: currentCfnStackResources[stackName],
        };
      },
    });
  }
}

export function pushStackResourceSummaries(stackName: string, ...items: CloudFormation.StackResourceSummary[]) {
  if (!currentCfnStackResources[stackName]) {
    currentCfnStackResources[stackName] = [];
  }

  currentCfnStackResources[stackName].push(...items);
}

export function stackSummaryOf(logicalId: string, resourceType: string, physicalResourceId: string): CloudFormation.StackResourceSummary {
  return {
    LogicalResourceId: logicalId,
    PhysicalResourceId: physicalResourceId,
    ResourceType: resourceType,
    ResourceStatus: 'CREATE_COMPLETE',
    LastUpdatedTimestamp: new Date(),
  };
}
