import { ISDK } from '../aws-auth';
import { ChangeHotswapImpact, ChangeHotswapResult, HotswapOperation, HotswappableResourceChange, establishHotswappableResourceName } from './common';
import { EvaluateCloudFormationTemplate } from './evaluate-cloudformation-template';

export async function isHotswappableStateMachineChange(
  logicalId: string, change: HotswappableResourceChange, evaluateCfnTemplate: EvaluateCloudFormationTemplate,
): Promise<ChangeHotswapResult> {
  const stateMachineDefinitionChange = await isStateMachineDefinitionOnlyChange(change, evaluateCfnTemplate);

  if ((stateMachineDefinitionChange === ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT) ||
      (stateMachineDefinitionChange === ChangeHotswapImpact.IRRELEVANT)) {
    return stateMachineDefinitionChange;
  }

  const machineNameInCfnTemplate = change.newValue?.Properties?.StateMachineName;
  const machineName = await establishHotswappableResourceName(logicalId, evaluateCfnTemplate, machineNameInCfnTemplate);

  if (!machineName) {
    return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
  }

  return new StateMachineHotswapOperation({
    logicalId: logicalId,
    definition: stateMachineDefinitionChange,
    stateMachineName: machineName,
  });
}

async function isStateMachineDefinitionOnlyChange(change: HotswappableResourceChange,
  evaluateCfnTemplate: EvaluateCloudFormationTemplate): Promise<string | ChangeHotswapImpact> {
  const newResourceType = change.newValue.Type;
  if (newResourceType !== 'AWS::StepFunctions::StateMachine') {
    return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
  }

  const propertyUpdates = change.propertyUpdates;

  for (const updatedPropName in propertyUpdates) {
    const updatedProp = propertyUpdates[updatedPropName];
    if (updatedProp.newValue === undefined) {
      return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
    }
  }

  // ensure that only changes to the definition string result in a hotswap
  for (const updatedPropName in propertyUpdates) {
    if (updatedPropName !== 'DefinitionString') {
      return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
    }
  }

  const definitionString = await evaluateCfnTemplate.evaluateCfnExpression(propertyUpdates.DefinitionString);

  return 'DefinitionString' in propertyUpdates ? definitionString.newValue : ChangeHotswapImpact.IRRELEVANT;
}

interface StateMachineResource {
  readonly logicalId: string;
  readonly stateMachineName: string;
  readonly definition: string;
}

class StateMachineHotswapOperation implements HotswapOperation {
  constructor(private readonly stepFunctionResource: StateMachineResource) {
  }

  public async apply(sdk: ISDK): Promise<any> {
    return sdk.stepFunctions().updateStateMachine({
      stateMachineArn: this.stepFunctionResource.stateMachineName,
      definition: this.stepFunctionResource.definition,
    }).promise();
  }
}
