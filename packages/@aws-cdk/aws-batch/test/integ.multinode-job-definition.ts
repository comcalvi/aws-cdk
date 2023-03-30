import { InstanceClass, InstanceSize, InstanceType } from '@aws-cdk/aws-ec2';
import { ContainerImage } from '@aws-cdk/aws-ecs';
import { App, Size, Stack } from '@aws-cdk/core';
import * as integ from '@aws-cdk/integ-tests';
import * as batch from '../lib';

const app = new App();
const stack = new Stack(app, 'stack');

new batch.MultiNodeJobDefinition(stack, 'SingleContainerMultiNodeJob', {
  instanceType: InstanceType.of(InstanceClass.R4, InstanceSize.LARGE),
  containers: [{
    startNode: 0,
    endNode: 10,
    container: new batch.EcsEc2ContainerDefinition(stack, 'myContainer', {
      image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      cpu: 256,
      memory: Size.mebibytes(2048),
    }),
  }],
});

const multinodeJob = new batch.MultiNodeJobDefinition(stack, 'MultiContainerMultiNodeJob', {
  instanceType: InstanceType.of(InstanceClass.R4, InstanceSize.LARGE),
  containers: [{
    startNode: 0,
    endNode: 10,
    container: new batch.EcsEc2ContainerDefinition(stack, 'multinodecontainer', {
      image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      cpu: 256,
      memory: Size.mebibytes(2048),
    }),
  }],
});

multinodeJob.addContainer({
  startNode: 11,
  endNode: 20,
  container: new batch.EcsEc2ContainerDefinition(stack, 'multiContainer', {
    image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
    cpu: 256,
    memory: Size.mebibytes(2048),
  }),
});

new integ.IntegTest(app, 'BatchMultiNodeJobDefinitionTest', {
  testCases: [stack],
});

app.synth();
