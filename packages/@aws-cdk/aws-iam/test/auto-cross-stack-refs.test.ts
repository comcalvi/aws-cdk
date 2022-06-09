import { Template } from '@aws-cdk/assertions';
import * as cdk from '@aws-cdk/core';
import * as iam from '../lib';

describe('automatic cross-stack references', () => {
  test('automatic exports are created when attributes are referneced across stacks', () => {
    // GIVEN
    const app = new cdk.App();
    const stackWithUser = new cdk.Stack(app, 'stack1');
    const stackWithGroup = new cdk.Stack(app, 'stack2');
    const user = new iam.User(stackWithUser, 'User');
    const group = new iam.Group(stackWithGroup, 'Group');

    // WHEN
    group.addUser(user);

    //
    // `group.addUser` adds the group to the user resource definition, so we expect
    // that an automatic export will be created for the group and the user's stack
    // to use ImportValue to import it.
    // note that order of "expect"s matters. we first need to synthesize the user's
    // stack so that the cross stack reference will be reported and only then the
    // group's stack. in the real world, App will take care of this.
    //

    // THEN
    Template.fromStack(stackWithUser).templateMatches({
      Resources: {
        User00B015A1: {
          Type: 'AWS::IAM::User',
          Properties: {
            Groups: [{ 'Fn::ImportValue': 'stack2:ExportsOutputRefGroupC77FDACD8CF7DD5B' }],
          },
        },
      },
    });
    Template.fromStack(stackWithGroup).templateMatches({
      Outputs: {
        ExportsOutputRefGroupC77FDACD8CF7DD5B: {
          Value: { Ref: 'GroupC77FDACD' },
          Export: { Name: 'stack2:ExportsOutputRefGroupC77FDACD8CF7DD5B' },
        },
      },
      Resources: {
        GroupC77FDACD: {
          Type: 'AWS::IAM::Group',
        },
      },
    });
  });

  test('cannot reference tokens across apps', () => {
    // GIVEN
    const stack1 = new cdk.Stack();
    const stack2 = new cdk.Stack();
    const user = new iam.User(stack1, 'User');
    const group = new iam.Group(stack2, 'Group');
    group.addUser(user);

    // THEN
    expect(() => cdk.App.of(stack1)!.synth()).toThrow(/Cannot reference across apps/);
  });
});

test('policy names include the name of the stack in which they are created', () => {
  // GIVEN
  const stack1 = new cdk.Stack();
  const stack2 = new cdk.Stack();
  const resource1 = new cdk.CfnResource(stack1, 'SomeResource', {
    type: 'CDK::Test::SomeResource',
  });
  const resource2 = new cdk.CfnResource(stack2, 'SomeResource', {
    type: 'CDK::Test::SomeResource',
  });
  const role = new iam.Role(stack2, 'MyRole', {
    assumedBy: new iam.AnyPrincipal(),
  });

  iam.Role.fromRoleArn(stack1, 'MyRole', role.roleArn);
  applyGrantWithDependencyTo(resource1, role);
  applyGrantWithDependencyTo(resource2, role);

  // THEN
  Template.fromStack(stack1).templateMatches({
    Resources: {
      MyRoleDefaultPolicyA36BE1DD: {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'SomeResource',
        },
      },
    },
  });

  Template.fromStack(stack2).templateMatches({
    Resources: {
      MyRoleDefaultPolicyA36BE1DD: {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'MyRoleDefaultPolicyA36BE1DD',
        },
      },
    },
  });
});

function applyGrantWithDependencyTo(resource: any, principal: iam.IPrincipal) {
  iam.Grant.addToPrincipal({
    actions: ['service:DoAThing'],
    grantee: principal,
    resourceArns: ['*'],
  }).applyBefore(resource);
}