import { Writable } from 'stream';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';
import { CloudFormationDeployments } from '../lib/api/cloudformation-deployments';
import { CdkToolkit } from '../lib/cdk-toolkit';
import * as setup from '../test/util/nested-stack-diff-setup';
import { instanceMockFrom, MockCloudExecutable } from './util';

let cloudExecutable: MockCloudExecutable;
let cloudFormation: jest.Mocked<CloudFormationDeployments>;
let toolkit: CdkToolkit;

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

describe('nested stacks', () => {
  beforeEach(() => {
    cloudExecutable = new MockCloudExecutable({
      stacks: [{
        stackName: 'Parent',
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
      }],
    });

    const mockSdkProvider = setup.setupNestedDiffTests();
    cloudFormation = instanceMockFrom(CloudFormationDeployments);

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
    // All of A's descendants are not here, to test that newly created nested stacks are correctly rendered
    // B's descendants are here, to ensure that sibling stacks and deep nesting levels with already created stacks are correctly rendered
    cloudFormation.readCurrentNestedTemplate.mockImplementation((stackArtifact: CloudFormationStackArtifact, nestedStackName: string) => {
      stackArtifact;
      switch (nestedStackName) {
        case 'Parent-NestedStackA':
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

        case 'Parent-NestedStackB':
          return Promise.resolve({
            Resources: {
              NestedResourceB: {
                Type: 'AWS::Something',
                Properties: {
                  Property: 'old-value',
                },
              },
              NestedChildB: {
                Type: 'AWS::CloudFormation::Stack',
                Metadata: {
                  'aws:asset:path': 'diff-NestedChildB.nested.template.json',
                },
              },
            },
          });

        case 'Parent-NestedStackB-NestedChildB':
          return Promise.resolve({
            Resources: {
              NestedResourceB: {
                Type: 'AWS::Something',
                Properties: {
                  Property: 'old-value',
                },
              },
              NestedGrandChildB: {
                Type: 'AWS::CloudFormation::Stack',
                Metadata: {
                  'aws:asset:path': 'diff-NestedGrandChildB.nested.template.json',
                },
              },
              NestedGrandChildB2: {
                Type: 'AWS::CloudFormation::Stack',
                Metadata: {
                  'aws:asset:path': 'diff-NestedGrandChildB2.nested.template.json',
                },
              },
            },
          });

        case 'Parent-NestedStackB-NestedGrandChildB':
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

        case 'Parent-NestedStackB-NestedGrandChildB2':
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

  test('diff can diff multiple nested stacks, with both deep nested stack creation and deep sibling stack comparisons', async () => {
    // GIVEN
    const buffer = new StringWritable();
    // NestedStackA's descendants are absent here to ensure that nested stack creation is tested with multiple levels
    setup.pushStackResourceSummaries('Parent',
      setup.stackSummaryOf('NestedStackA', 'AWS::CloudFormation::Stack',
        'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackA/abcd',
      ),
      setup.stackSummaryOf('NestedStackB', 'AWS::CloudFormation::Stack',
        'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackB/abcd',
      ),
    );

    setup.pushStackResourceSummaries('Parent-NestedStackB',
      setup.stackSummaryOf('NestedChildB', 'AWS::CloudFormation::Stack',
        'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackB-NestedChildB/abcd',
      ),
      setup.stackSummaryOf('NestedResourceB', 'AWS::Something',
        'arn:aws:something:bermuda-triangle-1337:123456789012:property',
      ),
    );

    setup.pushStackResourceSummaries('Parent-NestedStackB-NestedChildB',
      setup.stackSummaryOf('NestedGrandChildB', 'AWS::CloudFormation::Stack',
        'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackB-NestedGrandChildB/abcd',
      ),
      setup.stackSummaryOf('NestedGrandChildB2', 'AWS::CloudFormation::Stack',
        'arn:aws:cloudformation:bermuda-triangle-1337:123456789012:stack/Parent-NestedStackB-NestedGrandChildB2/abcd',
      ),
      setup.stackSummaryOf('NestedResourceB', 'AWS::Something',
        'arn:aws:something:bermuda-triangle-1337:123456789012:property',
      ),
    );

    setup.pushStackResourceSummaries('Parent-NestedStackB-NestedGrandChildB',
      setup.stackSummaryOf('NestedResourceB', 'AWS::Something',
        'arn:aws:something:bermuda-triangle-1337:123456789012:property',
      ),
    );

    setup.pushStackResourceSummaries('Parent-NestedStackB-NestedGrandChildB2',
      setup.stackSummaryOf('NestedResourceB', 'AWS::Something',
        'arn:aws:something:bermuda-triangle-1337:123456789012:property',
      ),
    );

    // WHEN
    const exitCode = await toolkit.diff({
      stackNames: ['Parent'],
      stream: buffer,
    });

    // THEN
    const plainTextOutput = buffer.data.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
    expect(plainTextOutput.trim()).toEqual(`Stack Parent
Resources
[~] AWS::CloudFormation::Stack NestedStackA 
 ├─ [+] Outputs
 │   └─ {"NestedOutput":{"Value":{"Ref":"NestedResourceA"}}}
 ├─ [+] Parameters
 │   └─ {"NestedParam":{"Type":"Number"}}
 └─ [~] Resources
     ├─ [~] .NestedChildA:
     │   └─ [~] .Resources:
     │       ├─ [~] .NestedGrandChildA:
     │       │   └─ [~] .Resources:
     │       │       └─ [+] Added: .NestedResourceA
     │       └─ [+] Added: .NestedResourceA
     └─ [~] .NestedResourceA:
         └─ [~] .Properties:
             └─ [~] .Property:
                 ├─ [-] old-value
                 └─ [+] new-value
[~] AWS::CloudFormation::Stack NestedStackB 
 └─ [~] Resources
     ├─ [~] .NestedChildB:
     │   └─ [~] .Resources:
     │       ├─ [~] .NestedGrandChildB:
     │       │   └─ [~] .Resources:
     │       │       └─ [~] .NestedResourceB:
     │       │           └─ [~] .Properties:
     │       │               └─ [~] .Property:
     │       │                   ├─ [-] old-value
     │       │                   └─ [+] new-value
     │       ├─ [~] .NestedGrandChildB2:
     │       │   └─ [~] .Resources:
     │       │       └─ [~] .NestedResourceB:
     │       │           └─ [~] .Properties:
     │       │               └─ [~] .Property:
     │       │                   ├─ [-] old-value
     │       │                   └─ [+] new-value
     │       └─ [~] .NestedResourceB:
     │           └─ [~] .Properties:
     │               └─ [~] .Property:
     │                   ├─ [-] old-value
     │                   └─ [+] new-value
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
