import { ISDK } from '../aws-auth';
import { ChangeHotswapImpact, ChangeHotswapResult, HotswapOperation, HotswappableChangeCandidate, establishResourcePhysicalName } from './common';
import { EvaluateCloudFormationTemplate } from './evaluate-cloudformation-template';

export async function isHotswappableStateMachineChange(
  logicalId: string, change: HotswappableChangeCandidate, evaluateCfnTemplate: EvaluateCloudFormationTemplate,
): Promise<ChangeHotswapResult> {
  const stateMachineDefinitionChange = await isStateMachineDefinitionOnlyChange(change, evaluateCfnTemplate);
  if (stateMachineDefinitionChange === ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT ||
      stateMachineDefinitionChange === ChangeHotswapImpact.IRRELEVANT) {
    return stateMachineDefinitionChange;
  }

  const machineNameInCfnTemplate = change.newValue?.Properties?.StateMachineName;
  let machineArn;

  if (machineNameInCfnTemplate) {
    machineArn = await evaluateCfnTemplate.evaluateCfnExpression({
      'Fn::Sub': 'arn:${AWS::Partition}:states:${AWS::Region}:${AWS::AccountId}:stateMachine:' + machineNameInCfnTemplate,
    });
  } else {
    machineArn = await establishResourcePhysicalName(logicalId, machineNameInCfnTemplate, evaluateCfnTemplate);
  }

  if (!machineArn) {
    return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
  }

  return new StateMachineHotswapOperation({
    definition: stateMachineDefinitionChange,
    stateMachineArn: machineArn,
  });
}

async function isStateMachineDefinitionOnlyChange(
  change: HotswappableChangeCandidate, evaluateCfnTemplate: EvaluateCloudFormationTemplate,
): Promise<string | ChangeHotswapImpact> {
  const newResourceType = change.newValue.Type;
  if (newResourceType !== 'AWS::StepFunctions::StateMachine') {
    return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
  }

  const propertyUpdates = change.propertyUpdates;
  for (const updatedPropName in propertyUpdates) {
    // ensure that only changes to the definition string result in a hotswap
    if (updatedPropName !== 'DefinitionString') {
      return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
    }
  }

  return evaluateCfnTemplate.evaluateCfnExpression(propertyUpdates.DefinitionString.newValue);
}

interface StateMachineResource {
  readonly stateMachineArn: string;
  readonly definition: string;
}

class StateMachineHotswapOperation implements HotswapOperation {
  public readonly service = 'stepfunctions-state-machine';

  constructor(private readonly stepFunctionResource: StateMachineResource) {
  }

  public async apply(sdk: ISDK): Promise<any> {
    // not passing the optional properties leaves them unchanged
    return sdk.stepFunctions().updateStateMachine({
      stateMachineArn: this.stepFunctionResource.stateMachineArn,
      definition: this.stepFunctionResource.definition,
    }).promise();
  }
}
