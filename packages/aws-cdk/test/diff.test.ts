import { Writable } from 'stream';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';
//import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';
//import { CloudFormation } from 'aws-sdk';
import { CloudFormationDeployments } from '../lib/api/cloudformation-deployments';
import { CdkToolkit } from '../lib/cdk-toolkit';
import { instanceMockFrom, MockCloudExecutable } from './util';

import * as setup from '../test/api/hotswap/hotswap-test-setup';

let cloudExecutable: MockCloudExecutable;
let cloudFormation: jest.Mocked<CloudFormationDeployments>;
let toolkit: CdkToolkit;

/*
describe('non-nested stacks', () => {
  beforeEach(() => {
    cloudExecutable = new MockCloudExecutable({
      stacks: [{
        stackName: 'A',
        template: { resource: 'A' },
      },
      {
        stackName: 'B',
        depends: ['A'],
        template: { resource: 'B' },
      },
      {
        stackName: 'C',
        depends: ['A'],
        template: { resource: 'C' },
        metadata: {
          '/resource': [
            {
              type: cxschema.ArtifactMetadataEntryType.ERROR,
              data: 'this is an error',
            },
          ],
        },
      },
      {
        stackName: 'D',
        template: { resource: 'D' },
      }],
    });

    cloudFormation = instanceMockFrom(CloudFormationDeployments);

    toolkit = new CdkToolkit({
      cloudExecutable,
      cloudFormation,
      configuration: cloudExecutable.configuration,
      sdkProvider: cloudExecutable.sdkProvider,
    });

    // Default implementations
    cloudFormation.readCurrentTemplate.mockImplementation((stackArtifact: CloudFormationStackArtifact) => {
      if (stackArtifact.stackName === 'D') {
        return Promise.resolve({ resource: 'D' });
      }
      return Promise.resolve({});
    });
    cloudFormation.deployStack.mockImplementation((options) => Promise.resolve({
      noOp: true,
      outputs: {},
      stackArn: '',
      stackArtifact: options.stack,
    }));
  });

  test('diff can diff multiple stacks', async () => {
    // GIVEN
    const buffer = new StringWritable();

    // WHEN
    const exitCode = await toolkit.diff({
      stackNames: ['B'],
      stream: buffer,
    });

    // THEN
    const plainTextOutput = buffer.data.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
    expect(plainTextOutput).toContain('Stack A');
    expect(plainTextOutput).toContain('Stack B');

    expect(exitCode).toBe(0);
  });

  test('exits with 1 with diffs and fail set to true', async () => {
    // GIVEN
    const buffer = new StringWritable();

    // WHEN
    const exitCode = await toolkit.diff({
      stackNames: ['A'],
      stream: buffer,
      fail: true,
    });

    // THEN
    expect(exitCode).toBe(1);
  });

  test('throws an error if no valid stack names given', async () => {
    const buffer = new StringWritable();

    // WHEN
    await expect(() => toolkit.diff({
      stackNames: ['X', 'Y', 'Z'],
      stream: buffer,
    })).rejects.toThrow('No stacks match the name(s) X,Y,Z');
  });

  test('exits with 1 with diff in first stack, but not in second stack and fail set to true', async () => {
    // GIVEN
    const buffer = new StringWritable();

    // WHEN
    const exitCode = await toolkit.diff({
      stackNames: ['A', 'D'],
      stream: buffer,
      fail: true,
    });

    // THEN
    expect(exitCode).toBe(1);
  });

  test('throws an error during diffs on stack with error metadata', async () => {
    const buffer = new StringWritable();

    // WHEN
    await expect(() => toolkit.diff({
      stackNames: ['C'],
      stream: buffer,
    })).rejects.toThrow(/Found errors/);
  });
});
*/

describe('nested stacks', () => {
  beforeEach(() => {
    cloudExecutable = new MockCloudExecutable({
      stacks: [{
        stackName: 'Parent',
        assets: [
          {
            path: 'diff-A.nested.template.json',
            s3BucketParameter: 'bucket-param',
            packaging: 'file',
            s3KeyParameter: 'key-param',
            artifactHashParameter: 'hash-param',
            id: 'nested-template-A',
            sourceHash: 'templateSourceHash',
          },
          {
            path: 'diff-B.nested.template.json',
            s3BucketParameter: 'bucket-param',
            packaging: 'file',
            s3KeyParameter: 'key-param',
            artifactHashParameter: 'hash-param',
            id: 'nested-template-B',
            sourceHash: 'templateSourceHash',
          },
        ],
        template: {
          Resources:
          {
            NestedStackA: {
              Type: 'AWS::CloudFormation::Stack',
              Metadata: {
                'aws:asset:path': 'diff-A.nested.template.json',
              },
            },
            NestedStackB: {
              Type: 'AWS::CloudFormation::Stack',
              Metadata: {
                'aws:asset:path': 'diff-B.nested.template.json',
              },
            },
          },
        },
      },
      {
        stackName: 'GrandParent',
        assets: [
          {
            path: 'diff-A.nested.template.json',
            s3BucketParameter: 'bucket-param',
            packaging: 'file',
            s3KeyParameter: 'key-param',
            artifactHashParameter: 'hash-param',
            id: 'nested-template-A',
            sourceHash: 'templateSourceHash',
          },
        ],
        template: {
          Resources:
          {
            ChildStack: {
              Type: 'AWS::CloudFormation::Stack',
              Metadata: {
                'aws:asset:path': 'diff-child.nested.template.json',
              },
            },
          },
        },
      }],
    });

    cloudFormation = instanceMockFrom(CloudFormationDeployments);

    const mockSdkProvider = setup.setupHotswapTests('Parent');

    toolkit = new CdkToolkit({
      cloudExecutable,
      cloudFormation,
      configuration: cloudExecutable.configuration,
      sdkProvider: mockSdkProvider.mockSdkProvider,
    });

    cloudFormation.readCurrentTemplate.mockImplementation((stackArtifact: CloudFormationStackArtifact) => {
      stackArtifact.stackName;

      return Promise.resolve({
        Resources: {
          NestedStackA: {
            Type: 'AWS::CloudFormation::Stack',
          },
        },
      });
    });
    cloudFormation.readCurrentNestedTemplate.mockImplementation((stackArtifact: CloudFormationStackArtifact, nestedStackName: string) => {
      stackArtifact;
      if (nestedStackName === 'Parent-NestedStackA') {
        return Promise.resolve({
          Resources: {
            NestedResourceA: {
              Type: 'AWS::Something',
              Properties: {
                Property: 'old-value',
              },
            },
          },
        });
      }

      return Promise.resolve({
        Resources: {
          NestedResourceB: {
            Type: 'AWS::Something',
            Properties: {
              Property: 'old-value',
            },
          },
        },
      });
    });
    cloudFormation.deployStack.mockImplementation((options) => Promise.resolve({
      noOp: true,
      outputs: {},
      stackArn: '',
      stackArtifact: options.stack,
    }));
  });

  test('diff can diff multiple nested stacks', async () => {
    // GIVEN
    const buffer = new StringWritable();
    setup.pushStackResourceSummaries(setup.stackSummaryOf('NestedStackA', 'AWS::CloudFormation::Stack', 'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackA/abcd'));
    setup.pushStackResourceSummaries(setup.stackSummaryOf('NestedStackB', 'AWS::CloudFormation::Stack', 'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackB/abcd'));

    // WHEN
    const exitCode = await toolkit.diff({
      stackNames: ['Parent'],
      stream: buffer,
    });

    // THEN
    /*eslint-disable*/
    const plainTextOutput = buffer.data.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
    console.log(plainTextOutput)
    expect(plainTextOutput.trim()).toEqual(`Stack Parent
Resources
[~] AWS::CloudFormation::Stack NestedStackA 
 ├─ [+] Outputs
 │   └─ {"NestedOutput":{"Value":{"Ref":"NestedResourceA"}}}
 ├─ [+] Parameters
 │   └─ {"NestedParam":{"Type":"Number"}}
 └─ [~] Resources
     └─ [~] .NestedResourceA:
         └─ [~] .Properties:
             └─ [~] .Property:
                 ├─ [-] old-value
                 └─ [+] new-value
[~] AWS::CloudFormation::Stack NestedStackB 
 └─ [~] Resources
     └─ [~] .NestedResourceB:
         └─ [~] .Properties:
             └─ [~] .Property:
                 ├─ [-] old-value
                 └─ [+] new-value`);

    expect(exitCode).toBe(0);
  });
});

class StringWritable extends Writable {
  public data: string;
  private readonly _decoder: NodeStringDecoder;

  constructor(options: any = {}) {
    super(options);
    this._decoder = new StringDecoder(options && options.defaultEncoding);
    this.data = '';
  }

  public _write(chunk: any, encoding: string, callback: (error?: Error | undefined) => void) {
    if (encoding === 'buffer') {
      chunk = this._decoder.write(chunk);
    }
    this.data += chunk;
    callback();
  }

  public _final(callback: (error?: Error | null) => void) {
    this.data += this._decoder.end();
    callback();
  }
}
