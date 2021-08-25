import { expect, haveResource, ResourcePart } from '@aws-cdk/assert-internal';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as constructs from 'constructs';
import { nodeunitShim, Test } from 'nodeunit-shim';
import * as autoscaling from '../lib';

nodeunitShim({
  'we can add a lifecycle hook with no role and with a notifcationTarget to an ASG'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack();
    const asg = newASG(stack);

    // WHEN
    asg.addLifecycleHook('Transition', {
      notificationTarget: new FakeNotificationTarget(),
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      defaultResult: autoscaling.DefaultResult.ABANDON,
    });

    // THEN
    expect(stack).to(haveResource('AWS::AutoScaling::LifecycleHook', {
      LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
      DefaultResult: 'ABANDON',
      NotificationTargetARN: 'target:arn',
    }));

    // Lifecycle Hook has a dependency on the policy object
    expect(stack).to(haveResource('AWS::AutoScaling::LifecycleHook', {
      DependsOn: [
        'ASGLifecycleHookTransitionRoleDefaultPolicy2E50C7DB',
        'ASGLifecycleHookTransitionRole3AAA6BB7',
      ],
    }, ResourcePart.CompleteDefinition));

    expect(stack).to(haveResource('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'autoscaling.amazonaws.com',
            },
          },
        ],
      },
    }));

    expect(stack).to(haveResource('AWS::IAM::Policy', {
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'action:Work',
            Effect: 'Allow',
            Resource: '*',
          },
        ],
      },
    }));

    test.done();
  },
});

nodeunitShim({
  'we can add a lifecycle hook to an ASG with no role and with no notificationTargetArn'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack();
    const asg = newASG(stack);

    // WHEN
    asg.addLifecycleHook('Transition', {
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      defaultResult: autoscaling.DefaultResult.ABANDON,
    });

    // THEN
    expect(stack).to(haveResource('AWS::AutoScaling::LifecycleHook', {
      LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
      DefaultResult: 'ABANDON',
    }));

    test.done();
  },
});

nodeunitShim({
  'we can add a lifecycle hook to an ASG with a role and with a notificationTargetArn'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack();
    const asg = newASG(stack);
    const myrole = new iam.Role(stack, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // WHEN
    asg.addLifecycleHook('Transition', {
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      defaultResult: autoscaling.DefaultResult.ABANDON,
      notificationTarget: new FakeNotificationTarget(),
      role: myrole,
    });

    // THEN
    expect(stack).to(haveResource('AWS::AutoScaling::LifecycleHook', {
      NotificationTargetARN: 'target:arn',
      LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
      DefaultResult: 'ABANDON',
    }));

    test.done();
  },
});


nodeunitShim({
  'adding a lifecycle hook with a role and with no notificationTarget to an ASG throws an error'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack();
    const asg = newASG(stack);
    const myrole = new iam.Role(stack, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // WHEN
    test.throws(() => {
      asg.addLifecycleHook('Transition', {
        lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
        defaultResult: autoscaling.DefaultResult.ABANDON,
        role: myrole,
      });
    // THEN
    }, /'notificationTarget' parameter required when 'role' parameter is specified/);

    test.done();
  },
});


class FakeNotificationTarget implements autoscaling.ILifecycleHookTarget {
  public bind(_scope: constructs.Construct, lifecycleHook: autoscaling.ILifecycleHook): autoscaling.LifecycleHookTargetConfig {
    if (lifecycleHook.role) {
      lifecycleHook.role.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['action:Work'],
        resources: ['*'],
      }));
    }

    return { notificationTargetArn: 'target:arn' };
  }
}

function newASG(stack: cdk.Stack) {
  const vpc = new ec2.Vpc(stack, 'VPC');

  return new autoscaling.AutoScalingGroup(stack, 'ASG', {
    vpc,
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.M4, ec2.InstanceSize.MICRO),
    machineImage: new ec2.AmazonLinuxImage(),
  });
}
