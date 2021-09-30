import { ISDK } from '../aws-auth';
import { CloudFormationExecutableTemplate } from './cloudformation-executable-template';
import { assetMetadataChanged, ChangeHotswapImpact, ChangeHotswapResult, HotswapOperation, HotswappableResourceChange /*ListStackResources?*/ } from './common';

/**
 * Returns `false` if the change cannot be short-circuited,
 * `true` if the change is irrelevant from a short-circuit perspective
 * (like a change to CDKMetadata),
 * or a LambdaFunctionResource if the change can be short-circuited.
 */
//export function isHotswappableLambdaFunctionChange(
//  logicalId: string, change: cfn_diff.ResourceDifference, assetParamsWithEnv: { [key: string]: string },
//): ChangeHotswapResult {

export function isHotswappableLambdaFunctionChange(
  logicalId: string, change: HotswappableResourceChange,
): ChangeHotswapResult {
  const lambdaCodeChange = isLambdaFunctionCodeOnlyChange(change);
  if (typeof lambdaCodeChange === 'string') {
    return lambdaCodeChange;
  } else {
    // verify that the Asset changed - otherwise,
    // it's a Code property-only change,
    // but not to an asset change
    // (for example, going from Code.fromAsset() to Code.fromInline())
    if (!assetMetadataChanged(change)) {
      return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
    }

    return new LambdaFunctionHotswapOperation({
      logicalId,
      physicalName: change.newValue?.Properties?.FunctionName,
      code: lambdaCodeChange,
    });
  }
}

/**
 * Returns `ChangeHotswapImpact.IRRELEVANT` if the change is not for a AWS::Lambda::Function,
 * but doesn't prevent short-circuiting
 * (like a change to CDKMetadata resource),
 * `ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT` if the change is to a AWS::Lambda::Function,
 * but not only to its Code property,
 * or a LambdaFunctionCode if the change is to a AWS::Lambda::Function,
 * and only affects its Code property.
 */
function isLambdaFunctionCodeOnlyChange(
  change: HotswappableResourceChange,
): LambdaFunctionCode | ChangeHotswapImpact {
  // if we see a different resource type, it will be caught by isNonHotswappableResourceChange()
  // this also ignores Metadata changes
  const newResourceType = change.newValue.Type;
  if (newResourceType !== 'AWS::Lambda::Function') {
    // TODO: test case that hits this?
    return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
  }

  /*
   * On first glance, we would want to initialize these using the "previous" values (change.oldValue),
   * in case only one of them changed, like the key, and the Bucket stayed the same.
   * However, that actually fails for old-style synthesis, which uses CFN Parameters!
   * Because the names of the Parameters depend on the hash of the Asset,
   * the Parameters used for the "old" values no longer exist in `assetParams` at this point,
   * which means we don't have the correct values available to evaluate the CFN expression with.
   * Fortunately, the diff will always include both the s3Bucket and s3Key parts of the Lambda's Code property,
   * even if only one of them was actually changed,
   * which means we don't need the "old" values at all, and we can safely let these be uninitialized.
   */
  let s3Bucket: any, s3Key: any;
  let foundCodeDifference = false;
  // Make sure only the code in the Lambda function changed
  const propertyUpdates = change.propertyUpdates;
  for (const updatedPropName in propertyUpdates) {
    const updatedProp = propertyUpdates[updatedPropName];
    if (updatedProp.newValue === undefined) {
      return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
    }
    for (const newPropName in updatedProp.newValue) {
      switch (newPropName) {
        case 'S3Bucket':
          foundCodeDifference = true;
          s3Bucket = updatedProp.newValue[newPropName];
          break;
        case 'S3Key':
          foundCodeDifference = true;
          s3Key = updatedProp.newValue[newPropName];
          break;
        default:
          return ChangeHotswapImpact.REQUIRES_FULL_DEPLOYMENT;
      }
    }
  }

  return foundCodeDifference
    ? {
      s3Bucket,
      s3Key,
    }
    : ChangeHotswapImpact.IRRELEVANT;
}

interface LambdaFunctionCode {
  readonly s3Bucket: any;
  readonly s3Key: any;
}

interface LambdaFunctionResource {
  readonly logicalId: string;
  readonly physicalName?: any;
  readonly code: LambdaFunctionCode;
}

class LambdaFunctionHotswapOperation implements HotswapOperation {
  constructor(private readonly lambdaFunctionResource: LambdaFunctionResource) {
  }

  public async apply(sdk: ISDK, cfnExectuableTemplate: CloudFormationExecutableTemplate): Promise<any> {
    const functionPhysicalName = await this.establishFunctionPhysicalName(cfnExectuableTemplate);
    if (!functionPhysicalName) {
      return;
    }
    const codeS3Bucket = await cfnExectuableTemplate.evaluateCfnExpression(this.lambdaFunctionResource.code.s3Bucket);
    const codeS3Key = await cfnExectuableTemplate.evaluateCfnExpression(this.lambdaFunctionResource.code.s3Key);

    return sdk.lambda().updateFunctionCode({
      FunctionName: functionPhysicalName,
      S3Bucket: codeS3Bucket,
      S3Key: codeS3Key,
    }).promise();
  }

  private async establishFunctionPhysicalName(cfnExectuableTemplate: CloudFormationExecutableTemplate): Promise<string | undefined> {
    if (this.lambdaFunctionResource.physicalName) {
      try {
        return await cfnExectuableTemplate.evaluateCfnExpression(this.lambdaFunctionResource.physicalName);
      } catch (e) {
        // If we can't evaluate the function's name CloudFormation expression,
        // just look it up in the currently deployed Stack
      }
    }
    return cfnExectuableTemplate.findPhysicalNameFor(this.lambdaFunctionResource.logicalId);
  }
}
