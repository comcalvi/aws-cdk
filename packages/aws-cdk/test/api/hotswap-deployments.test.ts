import { Lambda, StepFunctions } from 'aws-sdk';
import { tryHotswapDeployment } from '../../lib/api/hotswap-deployments';
import * as setup from './hotswap-test-setup';

let mockUpdateLambdaCode: (params: Lambda.Types.UpdateFunctionCodeRequest) => Lambda.Types.FunctionConfiguration;
let mockUpdateMachineDefinition: (params: StepFunctions.Types.UpdateStateMachineInput) => StepFunctions.Types.UpdateStateMachineOutput;

beforeEach(() => {
  setup.setupHotswapTests();
  mockUpdateLambdaCode = jest.fn();
  setup.mockSdkProvider.stubLambda({
    updateFunctionCode: mockUpdateLambdaCode,
  });
  mockUpdateMachineDefinition = jest.fn();
  setup.mockSdkProvider.stubStepFunctions({
    updateStateMachine: mockUpdateMachineDefinition,
  });
});

test('returns a deployStackResult with noOp=true when it receives an empty set of changes', async () => {
  // WHEN
  const deployStackResult = await tryHotswapDeployment(setup.mockSdkProvider, {}, setup.currentCfnStack, setup.cdkStackArtifactOf());

  // THEN
  expect(deployStackResult).not.toBeUndefined();
  expect(deployStackResult?.noOp).toBeTruthy();
  expect(deployStackResult?.stackArn).toEqual(setup.STACK_ID);
});

test('Resources that are not lambdas or step functions result in a full deployment', async () => {
  // GIVEN
  setup.currentCfnStack.setTemplate({
    Resources: {
      Machine: {
        Type: 'AWS::CloudFormation::SomethingElse',
        Properties: {
          Prop: 'old-value',
        },
      },
    },
  });
  const cdkStackArtifact = setup.cdkStackArtifactOf({
    template: {
      Resources: {
        Machine: {
          Type: 'AWS::CloudFormation::SomethingElse',
          Properties: {
            Prop: 'new-value',
          },
        },
      },
    },
  });

  // WHEN
  const deployStackResult = await tryHotswapDeployment(setup.mockSdkProvider, {}, setup.currentCfnStack, cdkStackArtifact);

  // THEN
  expect(deployStackResult).toBeUndefined();
  expect(mockUpdateMachineDefinition).not.toHaveBeenCalled();
  expect(mockUpdateLambdaCode).not.toHaveBeenCalled();
});

test('changes to CDK::Metadata result in a noOp', async () => {
  // GIVEN
  setup.currentCfnStack.setTemplate({
    Resources: {
      MetaData: {
        Type: 'AWS::CDK::MetaData',
        Properties: {
          Prop: 'old-value',
        },
      },
    },
  });
  const cdkStackArtifact = setup.cdkStackArtifactOf({
    template: {
      Resources: {
        MetaData: {
          Type: 'AWS::CDK::Metadata',
          Properties: {
            Prop: 'new-value',
          },
        },
      },
    },
  });

  // WHEN
  const deployStackResult = await tryHotswapDeployment(setup.mockSdkProvider, {}, setup.currentCfnStack, cdkStackArtifact);

  // THEN
  expect(deployStackResult).not.toBeUndefined();
  expect(deployStackResult?.noOp).toEqual(true);
  expect(mockUpdateMachineDefinition).not.toHaveBeenCalled();
  expect(mockUpdateLambdaCode).not.toHaveBeenCalled();
});

test('resource deletions require full deployments', async () => {
  // GIVEN
  setup.currentCfnStack.setTemplate({
    Resources: {
      Machine: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          DefinitionString: {
            'Fn::Join': [
              '',
              [
                '{ "Prop" : "old-value", "AnotherProp" : "another-old-value" }',
              ],
            ],
          },
          StateMachineName: 'my-machine',
        },
      },
    },
  });
  const cdkStackArtifact = setup.cdkStackArtifactOf({
    template: {
      Resources: {
      },
    },
  });

  // WHEN
  const deployStackResult = await tryHotswapDeployment(setup.mockSdkProvider, {}, setup.currentCfnStack, cdkStackArtifact);

  // THEN
  expect(deployStackResult).toBeUndefined();
  expect(mockUpdateLambdaCode).not.toHaveBeenCalled();
  expect(mockUpdateMachineDefinition).not.toHaveBeenCalled();
});

test('can correctly reference AWS::Partition in hotswappable changes', async () => {
  // GIVEN
  setup.currentCfnStack.setTemplate({
    Resources: {
      Func: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'current-bucket',
            S3Key: 'current-key',
          },
          FunctionName: {
            'Fn::Join': [
              '',
              [
                { Ref: 'AWS::Partition' },
                '-',
                'my-function',
              ],
            ],
          },
        },
        Metadata: {
          'aws:asset:path': 'new-path',
        },
      },
    },
  });
  const cdkStackArtifact = setup.cdkStackArtifactOf({
    template: {
      Resources: {
        Func: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: 'current-bucket',
              S3Key: 'new-key',
            },
            FunctionName: {
              'Fn::Join': [
                '',
                [
                  { Ref: 'AWS::Partition' },
                  '-',
                  'my-function',
                ],
              ],
            },
          },
          Metadata: {
            'aws:asset:path': 'new-path',
          },
        },
      },
    },
  });

  // WHEN
  const deployStackResult = await tryHotswapDeployment(setup.mockSdkProvider, {}, setup.currentCfnStack, cdkStackArtifact);

  // THEN
  expect(deployStackResult).not.toBeUndefined();
  expect(mockUpdateLambdaCode).toHaveBeenCalledWith({
    FunctionName: 'aws-my-function',
    S3Bucket: 'current-bucket',
    S3Key: 'new-key',
  });
});
