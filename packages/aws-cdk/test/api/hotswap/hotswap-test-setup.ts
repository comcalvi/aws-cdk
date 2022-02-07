import * as cxapi from '@aws-cdk/cx-api';
import { CloudFormation } from 'aws-sdk';
import * as AWS from 'aws-sdk';
import * as codebuild from 'aws-sdk/clients/codebuild';
import * as lambda from 'aws-sdk/clients/lambda';
import * as stepfunctions from 'aws-sdk/clients/stepfunctions';
import { DeployStackResult } from '../../../lib/api';
import * as deployments from '../../../lib/api/hotswap-deployments';
import { CloudFormationStack, Template } from '../../../lib/api/util/cloudformation';
import { testStack, TestStackArtifact } from '../../util';
import { MockSdkProvider, SyncHandlerSubsetOf } from '../../util/mock-sdk';
import { FakeCloudformationStack } from '../fake-cloudformation-stack';
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';

export const STACK_NAME = 'withouterrors'; // TODO: need to make it LambdaRoot for our first test, but we need to provide a way of configuring it (optional param to all methods that use it)
export const STACK_ID = 'stackId';

let hotswapMockSdkProvider: HotswapMockSdkProvider;
let currentCfnStack: FakeCloudformationStack;
const currentCfnStackResources: CloudFormation.StackResourceSummary[] = [];
let stackTemplates: {[key:string]: any};
let currentNestedCfnStackResources: { [key: string]: CloudFormation.StackResourceSummary[] };

export function setupHotswapTests() {
  jest.resetAllMocks();
  // clear the array
  currentCfnStackResources.splice(0);
  hotswapMockSdkProvider = new HotswapMockSdkProvider();
  currentCfnStack = new FakeCloudformationStack({
    stackName: STACK_NAME,
    stackId: STACK_ID,
  });

  return hotswapMockSdkProvider;
}

export function setupHotswapNestedStackTests(rootStackName: string) {
  jest.resetAllMocks();
  currentNestedCfnStackResources = {};
  hotswapMockSdkProvider = new HotswapMockSdkProvider(rootStackName);
  currentCfnStack = new FakeCloudformationStack({
    stackName: rootStackName,
    stackId: STACK_ID,
  });
  stackTemplates = {};
  CloudFormationStack.lookup = async (_: CloudFormation, stackName: string) => {
    currentCfnStack.template = async () => stackTemplates[stackName];

    return currentCfnStack;
  };

  return hotswapMockSdkProvider;
}

export function cdkStackArtifactOf(testStackArtifact: Partial<TestStackArtifact> = {}): cxapi.CloudFormationStackArtifact {
  return testStack({
    stackName: STACK_NAME,
    ...testStackArtifact,
  });
}

export function pushStackResourceSummaries(...items: CloudFormation.StackResourceSummary[]) {
  currentCfnStackResources.push(...items);
}

export function pushNestedStackResourceSummaries(stackName: string, ...items: CloudFormation.StackResourceSummary[]) {
  if (!currentNestedCfnStackResources[stackName]) {
    currentNestedCfnStackResources[stackName] = [];
  }

  currentNestedCfnStackResources[stackName].push(...items);
}

export function setCurrentCfnStackTemplate(template: Template) {
  const templateDeepCopy = JSON.parse(JSON.stringify(template)); // deep copy the template, so our tests can mutate one template instead of creating two
  currentCfnStack.setTemplate(templateDeepCopy);
}

export function addTemplateToCloudFormationLookupMock(stackArtifact: CloudFormationStackArtifact) {
  stackTemplates[stackArtifact.stackName] = stackArtifact.template;
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

export class HotswapMockSdkProvider {
  public readonly mockSdkProvider: MockSdkProvider;

  constructor(rootStackName?: string) {
    this.mockSdkProvider = new MockSdkProvider({ realSdk: false });

    this.mockSdkProvider.stubCloudFormation({
      listStackResources: ({ StackName: stackName }) => {
        if (stackName !== (rootStackName ?? STACK_NAME)) {
          throw new Error(`Expected Stack name in listStackResources() call to be: '${rootStackName ?? STACK_NAME}', but received: ${stackName}'`);
        }
        return {
          StackResourceSummaries: rootStackName ? currentNestedCfnStackResources[stackName] : currentCfnStackResources,
        };
      },
    });
  }

  public setUpdateStateMachineMock(
    mockUpdateMachineDefinition: (input: stepfunctions.UpdateStateMachineInput) => stepfunctions.UpdateStateMachineOutput,
  ) {
    this.mockSdkProvider.stubStepFunctions({
      updateStateMachine: mockUpdateMachineDefinition,
    });
  }

  public stubLambda(
    stubs: SyncHandlerSubsetOf<AWS.Lambda>,
    serviceStubs?: SyncHandlerSubsetOf<AWS.Service>,
    additionalProperties: { [key: string]: any } = {},
  ): void {
    this.mockSdkProvider.stubLambda(stubs, {
      api: {
        waiters: {},
      },
      makeRequest() {
        return {
          promise: () => Promise.resolve({}),
          response: {},
          addListeners: () => {},
        };
      },
      ...serviceStubs,
      ...additionalProperties,
    });
  }

  public getLambdaApiWaiters(): { [key: string]: any } {
    return (this.mockSdkProvider.sdk.lambda() as any).api.waiters;
  }

  public setUpdateProjectMock(mockUpdateProject: (input: codebuild.UpdateProjectInput) => codebuild.UpdateProjectOutput) {
    this.mockSdkProvider.stubCodeBuild({
      updateProject: mockUpdateProject,
    });
  }

  public setInvokeLambdaMock(mockInvokeLambda: (input: lambda.InvocationRequest) => lambda.InvocationResponse) {
    this.mockSdkProvider.stubLambda({
      invoke: mockInvokeLambda,
    });
  }

  public stubEcs(stubs: SyncHandlerSubsetOf<AWS.ECS>, additionalProperties: { [key: string]: any } = {}): void {
    this.mockSdkProvider.stubEcs(stubs, additionalProperties);
  }

  public stubGetEndpointSuffix(stub: () => string) {
    this.mockSdkProvider.stubGetEndpointSuffix(stub);
  }

  public tryHotswapDeployment(
    stackArtifact: cxapi.CloudFormationStackArtifact,
    assetParams: { [key: string]: string } = {},
  ): Promise<DeployStackResult | undefined> {
    return deployments.tryHotswapDeployment(this.mockSdkProvider, assetParams, currentCfnStack, stackArtifact);
  }
}
