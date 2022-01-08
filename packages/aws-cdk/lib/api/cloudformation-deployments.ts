import * as path from 'path';
import * as cxapi from '@aws-cdk/cx-api';
import { AssetManifest } from 'cdk-assets';
import * as fs from 'fs-extra';
import { ISDK } from '..';
import { GetStackResources } from '../api/list-stack-resources';
import { Tag } from '../cdk-toolkit';
import { debug } from '../logging';
import { publishAssets } from '../util/asset-publishing';
import { Mode, SdkProvider } from './aws-auth';
import { deployStack, DeployStackResult, destroyStack } from './deploy-stack';
import { ToolkitInfo } from './toolkit-info';
import { CloudFormationStack, Template } from './util/cloudformation';
import { StackActivityProgress } from './util/cloudformation/stack-activity-monitor';

/**
 * Replace the {ACCOUNT} and {REGION} placeholders in all strings found in a complex object.
 */
export async function replaceEnvPlaceholders<A extends { }>(object: A, env: cxapi.Environment, sdkProvider: SdkProvider): Promise<A> {
  return cxapi.EnvironmentPlaceholders.replaceAsync(object, {
    accountId: () => Promise.resolve(env.account),
    region: () => Promise.resolve(env.region),
    partition: async () => {
      // There's no good way to get the partition!
      // We should have had it already, except we don't.
      //
      // Best we can do is ask the "base credentials" for this environment for their partition. Cross-partition
      // AssumeRole'ing will never work anyway, so this answer won't be wrong (it will just be slow!)
      return (await sdkProvider.baseCredentialsPartition(env, Mode.ForReading)) ?? 'aws';
    },
  });
}


export interface DeployStackOptions {
  /**
   * Stack to deploy
   */
  stack: cxapi.CloudFormationStackArtifact;

  /**
   * Execution role for the deployment (pass through to CloudFormation)
   *
   * @default - Current role
   */
  roleArn?: string;

  /**
   * Topic ARNs to send a message when deployment finishes (pass through to CloudFormation)
   *
   * @default - No notifications
   */
  notificationArns?: string[];

  /**
   * Override name under which stack will be deployed
   *
   * @default - Use artifact default
   */
  deployName?: string;

  /**
   * Don't show stack deployment events, just wait
   *
   * @default false
   */
  quiet?: boolean;

  /**
   * Name of the toolkit stack, if not the default name
   *
   * @default 'CDKToolkit'
   */
  toolkitStackName?: string;

  /**
   * List of asset IDs which should NOT be built or uploaded
   *
   * @default - Build all assets
   */
  reuseAssets?: string[];

  /**
   * Stack tags (pass through to CloudFormation)
   */
  tags?: Tag[];

  /**
   * Stage the change set but don't execute it
   *
   * @default - false
   */
  execute?: boolean;

  /**
   * Optional name to use for the CloudFormation change set.
   * If not provided, a name will be generated automatically.
   */
  changeSetName?: string;

  /**
   * Force deployment, even if the deployed template is identical to the one we are about to deploy.
   * @default false deployment will be skipped if the template is identical
   */
  force?: boolean;

  /**
   * Extra parameters for CloudFormation
   * @default - no additional parameters will be passed to the template
   */
  parameters?: { [name: string]: string | undefined };

  /**
   * Use previous values for unspecified parameters
   *
   * If not set, all parameters must be specified for every deployment.
   *
   * @default true
   */
  usePreviousParameters?: boolean;

  /**
   * Display mode for stack deployment progress.
   *
   * @default - StackActivityProgress.Bar - stack events will be displayed for
   *   the resource currently being deployed.
   */
  progress?: StackActivityProgress;

  /**
   * Whether we are on a CI system
   *
   * @default false
   */
  readonly ci?: boolean;

  /**
   * Rollback failed deployments
   *
   * @default true
   */
  readonly rollback?: boolean;

  /*
   * Whether to perform a 'hotswap' deployment.
   * A 'hotswap' deployment will attempt to short-circuit CloudFormation
   * and update the affected resources like Lambda functions directly.
   *
   * @default - false for regular deployments, true for 'watch' deployments
   */
  readonly hotswap?: boolean;

  /**
   * The extra string to append to the User-Agent header when performing AWS SDK calls.
   *
   * @default - nothing extra is appended to the User-Agent header
   */
  readonly extraUserAgent?: string;
}

export interface DestroyStackOptions {
  stack: cxapi.CloudFormationStackArtifact;
  deployName?: string;
  roleArn?: string;
  quiet?: boolean;
  force?: boolean;
}

export interface StackExistsOptions {
  stack: cxapi.CloudFormationStackArtifact;
  deployName?: string;
}

export interface ProvisionerProps {
  sdkProvider: SdkProvider;
}

/**
 * Helper class for CloudFormation deployments
 *
 * Looks us the right SDK and Bootstrap stack to deploy a given
 * stack artifact.
 */
export class CloudFormationDeployments {
  private readonly sdkProvider: SdkProvider;

  constructor(props: ProvisionerProps) {
    this.sdkProvider = props.sdkProvider;
  }

  public async readCurrentTemplate(stackArtifact: cxapi.CloudFormationStackArtifact): Promise<Template> {
    return this.readCurrentStackTemplate(stackArtifact, stackArtifact.stackName);
  }

  public async readCurrentTemplateWithNestedStacks(rootStackArtifact: cxapi.CloudFormationStackArtifact) {
    const deployedTemplate = await this.readCurrentTemplate(rootStackArtifact);
    await this.replaceNestedStacksInRootStack(rootStackArtifact, deployedTemplate);

    return deployedTemplate;
  }

  public async deployStack(options: DeployStackOptions): Promise<DeployStackResult> {
    const { stackSdk, resolvedEnvironment, cloudFormationRoleArn } = await this.prepareSdkFor(options.stack, options.roleArn);

    const toolkitInfo = await ToolkitInfo.lookup(resolvedEnvironment, stackSdk, options.toolkitStackName);

    // Publish any assets before doing the actual deploy
    await this.publishStackAssets(options.stack, toolkitInfo);

    // Do a verification of the bootstrap stack version
    await this.validateBootstrapStackVersion(
      options.stack.stackName,
      options.stack.requiresBootstrapStackVersion,
      options.stack.bootstrapStackVersionSsmParameter,
      toolkitInfo);

    return deployStack({
      stack: options.stack,
      resolvedEnvironment,
      deployName: options.deployName,
      notificationArns: options.notificationArns,
      quiet: options.quiet,
      sdk: stackSdk,
      sdkProvider: this.sdkProvider,
      roleArn: cloudFormationRoleArn,
      reuseAssets: options.reuseAssets,
      toolkitInfo,
      tags: options.tags,
      execute: options.execute,
      changeSetName: options.changeSetName,
      force: options.force,
      parameters: options.parameters,
      usePreviousParameters: options.usePreviousParameters,
      progress: options.progress,
      ci: options.ci,
      rollback: options.rollback,
      hotswap: options.hotswap,
      extraUserAgent: options.extraUserAgent,
    });
  }

  public async destroyStack(options: DestroyStackOptions): Promise<void> {
    const { stackSdk, cloudFormationRoleArn: roleArn } = await this.prepareSdkFor(options.stack, options.roleArn);

    return destroyStack({
      sdk: stackSdk,
      roleArn,
      stack: options.stack,
      deployName: options.deployName,
      quiet: options.quiet,
    });
  }

  public async stackExists(options: StackExistsOptions): Promise<boolean> {
    const { stackSdk } = await this.prepareSdkFor(options.stack, undefined, Mode.ForReading);
    const stack = await CloudFormationStack.lookup(stackSdk.cloudFormation(), options.deployName ?? options.stack.stackName);
    return stack.exists;
  }

  private async readCurrentNestedTemplate(stackArtifact: cxapi.CloudFormationStackArtifact, nestedStackName: string, sdk: ISDK): Promise<Template> {
    return this.readCurrentStackTemplate(stackArtifact, nestedStackName, sdk);
  }

  private async replaceNestedStacksInRootStack(rootStackArtifact: cxapi.CloudFormationStackArtifact, deployedTemplate: any) {
    if (!this.stackHasNestedStacks(rootStackArtifact)) {
      return;
    }

    const sdk = await this.prepareSdk(rootStackArtifact);
    const getStackResources = new GetStackResources(sdk);
    await this.replaceNestedStacksInParentTemplate(
      rootStackArtifact, rootStackArtifact.template, deployedTemplate, rootStackArtifact.stackName, getStackResources, sdk,
    );
  }

  private stackHasNestedStacks(stackArtifact: cxapi.CloudFormationStackArtifact): boolean {
    return Object.values(stackArtifact.template.Resources ?? {}).some((resource: any) => resource.Type === 'AWS::CloudFormation::Stack');
  }

  // TODO: Remove this method once Cory adds the lookup role, and use that instead.
  private async prepareSdk(rootStackArtifact: cxapi.CloudFormationStackArtifact): Promise<ISDK> {
    const resolvedEnv = await this.sdkProvider.resolveEnvironment(rootStackArtifact.environment);
    const sdk = await this.sdkProvider.forEnvironment(resolvedEnv, Mode.ForReading);

    return sdk;
  }

  private async replaceNestedStacksInParentTemplate(
    rootStackArtifact: cxapi.CloudFormationStackArtifact, generatedParentTemplate: any, deployedParentTemplate: any,
    parentStackName: string | undefined, getStackResources: GetStackResources, sdk: ISDK,
  ) {
    for (const [nestedStackLogicalId, resource] of Object.entries(generatedParentTemplate.Resources ?? {})
      .filter(entry => this.isNestedStackResource(entry[1]))
    ) {
      let nestedStackResource = resource as any;
      const assetPath = nestedStackResource.Metadata['aws:asset:path'];
      const nestedStackTemplates = await this.getNestedStackTemplates(
        rootStackArtifact, assetPath, nestedStackLogicalId, parentStackName, getStackResources, sdk,
      );

      generatedParentTemplate.Resources[nestedStackLogicalId] = nestedStackTemplates.generatedNestedTemplate;
      generatedParentTemplate.Resources[nestedStackLogicalId].Type = 'AWS::CloudFormation::Stack';

      if (deployedParentTemplate.Resources) {
        deployedParentTemplate.Resources[nestedStackLogicalId] = nestedStackTemplates.deployedNestedStackTemplate;
        deployedParentTemplate.Resources[nestedStackLogicalId].Type = 'AWS::CloudFormation::Stack';
      }

      await this.replaceNestedStacksInParentTemplate(
        rootStackArtifact, generatedParentTemplate.Resources[nestedStackLogicalId],
        (deployedParentTemplate.Resources ?? {})[nestedStackLogicalId] ?? {},
        nestedStackTemplates.nestedStackName, getStackResources, sdk,
      );
    }
  }

  private async getNestedStackTemplates(
    rootStackArtifact: cxapi.CloudFormationStackArtifact, nestedTemplateAssetPath: string, nestedStackLogicalId: string,
    parentStackName: string | undefined, getStackResources: GetStackResources, sdk: ISDK,
  ): Promise<NestedStackTemplates> {
    const nestedTemplatePath = path.join(rootStackArtifact.assembly.directory, nestedTemplateAssetPath);
    // CFN generates the nested stack name in the form `ParentStackName-NestedStackLogicalID-SomeHashWeCan'tCompute,
    // so we get the ARN and manually extract the name.
    const nestedStackArn = await getStackResources.findPhysicalNameFor(nestedStackLogicalId, parentStackName);
    const nestedStackName = nestedStackArn?.slice(nestedStackArn.indexOf('/') + 1, nestedStackArn.lastIndexOf('/'));
    console.log('-----------------------------------------------')
    console.log(nestedStackLogicalId)
    console.log(nestedStackArn)
    console.log(nestedTemplatePath)
    console.log('-----------------------------------------------')

    return {
      generatedNestedTemplate: JSON.parse(fs.readFileSync(nestedTemplatePath, 'utf-8')),
      deployedNestedStackTemplate: nestedStackName
        ? await this.readCurrentNestedTemplate(rootStackArtifact, nestedStackName, sdk) : { Resources: {} },
      nestedStackName,
    };
  }

  private isNestedStackResource(stackResource: any): boolean {
    return stackResource.Type === 'AWS::CloudFormation::Stack' && stackResource.Metadata && stackResource.Metadata['aws:asset:path'];
  }

  private async readCurrentStackTemplate(stackArtifact: cxapi.CloudFormationStackArtifact, stackName: string, sdk?: ISDK) : Promise<Template> {
    // if `stackName !== stackArtifact.stackName`, then `stackArtifact` is an ancestor to a nested stack with name `stackName`.
    debug(`Reading existing template for stack ${stackArtifact.displayName}.`);
    const stackSdk = sdk ?? (await this.prepareSdkFor(stackArtifact, undefined, Mode.ForReading)).stackSdk;
    const cfn = stackSdk.cloudFormation();

    const stack = await CloudFormationStack.lookup(cfn, stackName);
    return stack.template();
  }

  /**
   * Get the environment necessary for touching the given stack
   *
   * Returns the following:
   *
   * - The resolved environment for the stack (no more 'unknown-account/unknown-region')
   * - SDK loaded with the right credentials for calling `CreateChangeSet`.
   * - The Execution Role that should be passed to CloudFormation.
   */
  private async prepareSdkFor(stack: cxapi.CloudFormationStackArtifact, roleArn?: string, mode = Mode.ForWriting) {
    if (!stack.environment) {
      throw new Error(`The stack ${stack.displayName} does not have an environment`);
    }

    const resolvedEnvironment = await this.sdkProvider.resolveEnvironment(stack.environment);

    // Substitute any placeholders with information about the current environment
    const arns = await replaceEnvPlaceholders({
      assumeRoleArn: stack.assumeRoleArn,

      // Use the override if given, otherwise use the field from the stack
      cloudFormationRoleArn: roleArn ?? stack.cloudFormationExecutionRoleArn,
    }, resolvedEnvironment, this.sdkProvider);

    const stackSdk = await this.sdkProvider.forEnvironment(resolvedEnvironment, mode, {
      assumeRoleArn: arns.assumeRoleArn,
      assumeRoleExternalId: stack.assumeRoleExternalId,
    });

    return {
      stackSdk,
      resolvedEnvironment,
      cloudFormationRoleArn: arns.cloudFormationRoleArn,
    };
  }

  /**
   * Publish all asset manifests that are referenced by the given stack
   */
  private async publishStackAssets(stack: cxapi.CloudFormationStackArtifact, toolkitInfo: ToolkitInfo) {
    const stackEnv = await this.sdkProvider.resolveEnvironment(stack.environment);
    const assetArtifacts = stack.dependencies.filter(isAssetManifestArtifact);

    for (const assetArtifact of assetArtifacts) {
      await this.validateBootstrapStackVersion(
        stack.stackName,
        assetArtifact.requiresBootstrapStackVersion,
        assetArtifact.bootstrapStackVersionSsmParameter,
        toolkitInfo);

      const manifest = AssetManifest.fromFile(assetArtifact.file);
      await publishAssets(manifest, this.sdkProvider, stackEnv);
    }
  }

  /**
   * Validate that the bootstrap stack has the right version for this stack
   */
  private async validateBootstrapStackVersion(
    stackName: string,
    requiresBootstrapStackVersion: number | undefined,
    bootstrapStackVersionSsmParameter: string | undefined,
    toolkitInfo: ToolkitInfo) {

    if (requiresBootstrapStackVersion === undefined) { return; }

    try {
      await toolkitInfo.validateVersion(requiresBootstrapStackVersion, bootstrapStackVersionSsmParameter);
    } catch (e) {
      throw new Error(`${stackName}: ${e.message}`);
    }
  }
}

function isAssetManifestArtifact(art: cxapi.CloudArtifact): art is cxapi.AssetManifestArtifact {
  return art instanceof cxapi.AssetManifestArtifact;
}

interface NestedStackTemplates {
  readonly generatedNestedTemplate: any,
  readonly deployedNestedStackTemplate: any,
  readonly nestedStackName: string | undefined,
}
