import * as ecs from '@aws-cdk/aws-ecs';
import { Construct } from 'constructs';

export interface IEksContainerDefinition {
  /**
   * The image that this container will run
   */
  image: ecs.ContainerImage;

  /**
   * An array of arguments to the entrypoint.
   * If this isn't specified, the CMD of the container image is used.
   * This corresponds to the args member in the Entrypoint portion of the Pod in Kubernetes.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to "$(NAME1)" and the NAME1 environment variable doesn't exist,
   * the command string will remain "$(NAME1)." $$ is replaced with $, and the resulting string isn't expanded.
   * or example, $$(VAR_NAME) is passed as $(VAR_NAME) whether or not the VAR_NAME environment variable exists.
   *
   * @see: https://docs.docker.com/engine/reference/builder/#cmd
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   */
  args?: string[];

  /**
   * The entrypoint for the container. This isn't run within a shell.
   * If this isn't specified, the `ENTRYPOINT` of the container image is used.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to `"$(NAME1)"` and the `NAME1` environment variable doesn't exist,
   * the command string will remain `"$(NAME1)."` `$$` is replaced with `$` and the resulting string isn't expanded.
   * For example, `$$(VAR_NAME)` will be passed as `$(VAR_NAME)` whether or not the `VAR_NAME` environment variable exists.

   * The entrypoint can't be updated. // ?????? TODO
   * 
   * @see: https://docs.docker.com/engine/reference/builder/#entrypoint
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   * @see: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#entrypoint
   */
  command?: string[];

  /**
   * The environment variables to pass to this container.
   * 
   * *Note*: Environment variables cannot start with "AWS_BATCH".
   * This naming convention is reserved for variables that AWS Batch sets.
   */
  env?: { [key:string]: string };

  /**
   * The image pull policy for this container
   * 
   * @see: https://kubernetes.io/docs/concepts/containers/images/#updating-images
   * 
   * @default -  `ALWAYS` if the `:latest` tag is specified, `IF_NOT_PRESENT` otherwise
   */
  imagePullPolicy?: ImagePullPolicy;

  /**
   * The name of this container
   * 
   * @default: `'Default'`
   */
  name?: string;

  /**
   * The amount (in MiB) of memory to present to the container.
   * If your container attempts to exceed the allocated memory, it will be terminated.
   * 
   * Must be larger that 4 MiB
   *
   * At least one of memoryLimitMiB and memoryReservationMiB is required
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory limit
   */
  memoryLimitMiB?: number;

  /**
   * The soft limit (in MiB) of memory to reserve for the container.
   * Your container will be given at least this much memory, but may consume more.
   * 
   * Must be larger that 4 MiB
   *
   * When system memory is under heavy contention, Docker attempts to keep the
   * container memory to this soft limit. However, your container can consume more
   * memory when it needs to, up to either the hard limit specified with the memory
   * parameter (if applicable), or all of the available memory on the container
   * instance, whichever comes first.
   *
   * At least one of `memoryLimitMiB` and `memoryReservationMiB` is required.
   * If both are specified, then `memoryLimitMib` must be equal to `memoryReservationMiB`
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory reserved
   */
  readonly memoryReservationMiB?: number;

  /**
   * The hard limit of CPUs to present to this container.
   * Must be an even multiple of 0.25
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPU limit
   */
  cpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPUs reserved
   */
  readonly cpuReservation?: number;

  /**
   * The hard limit of GPUs to present to this container.
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPU limit
   */
  gpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPUs reserved
   */
  readonly gpuReservation?: number;

  /**
   * If specified, gives this container elevated permissions on the host container instance.
   * The level of permissions are similar to the root user permissions.
   *
   * This parameter maps to `privileged` policy in the Privileged pod security policies in the Kubernetes documentation.
   *
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  priveleged?: boolean;

  /**
   * If specified, gives this container readonly access to its root file system.
   * 
   * This parameter maps to `ReadOnlyRootFilesystem` policy in the Volumes and file systems pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  readonlyFileSystem?: boolean;

  /**
   * If specified, the container is run as the specified group ID (`gid`).
   * If this parameter isn't specified, the default is the group that's specified in the image metadata.
   * This parameter maps to `RunAsGroup` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default none
   */
  runAsGroup?: number;

  /**
   * If specified, the container is run as a user with a `uid` other than 0. Otherwise, no such rule is enforced.
   * This parameter maps to `RunAsUser` and `MustRunAsNonRoot` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the container is *not* required to run as a non-root user
   */
  runAsRoot?: boolean;

  /**
   * If specified, this container is run as the specified user ID (`uid`).
   * This parameter maps to `RunAsUser` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the user that is specified in the image metadata. 
   */
  runAsUser?: number;

  /**
   * The Volumes to mount to this container.
   * Automatically added to the Pod.
   * 
   * @see: https://kubernetes.io/docs/concepts/storage/volumes/
   */
  volumes?: EksVolume[];
}

export enum ImagePullPolicy {
  /**
   * Every time the kubelet launches a container,
   * the kubelet queries the container image registry to resolve the name to an image digest.
   * If the kubelet has a container image with that exact digest cached locally,
   * the kubelet uses its cached image; otherwise, the kubelet pulls the image with the resolved digest,
   * and uses that image to launch the container.
   * 
   * @see: https://docs.docker.com/engine/reference/commandline/pull/#pull-an-image-by-digest-immutable-identifier
   */
  ALWAYS = 'Always',

  /**
   * The image is pulled only if it is not already present locally
   */
  IF_NOT_PRESENT = 'IfNotPresent',

  /**
   * The kubelet does not try fetching the image.
   * If the image is somehow already present locally,
   * the kubelet attempts to start the container; otherwise, startup fails.
   * See pre-pulled images for more details.
   * 
   * @see: https://kubernetes.io/docs/concepts/containers/images/#pre-pulled-images
   */
  NEVER = 'Never',
}

export interface EksContainerProps {
  /**
   * The image that this container will run
   */
  image: ecs.ContainerImage;

  /**
   * An array of arguments to the entrypoint.
   * If this isn't specified, the CMD of the container image is used.
   * This corresponds to the args member in the Entrypoint portion of the Pod in Kubernetes.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to "$(NAME1)" and the NAME1 environment variable doesn't exist,
   * the command string will remain "$(NAME1)." $$ is replaced with $, and the resulting string isn't expanded.
   * or example, $$(VAR_NAME) is passed as $(VAR_NAME) whether or not the VAR_NAME environment variable exists.
   *
   * @see: https://docs.docker.com/engine/reference/builder/#cmd
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   */
  args?: string[];

  /**
   * The entrypoint for the container. This isn't run within a shell.
   * If this isn't specified, the `ENTRYPOINT` of the container image is used.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to `"$(NAME1)"` and the `NAME1` environment variable doesn't exist,
   * the command string will remain `"$(NAME1)."` `$$` is replaced with `$` and the resulting string isn't expanded.
   * For example, `$$(VAR_NAME)` will be passed as `$(VAR_NAME)` whether or not the `VAR_NAME` environment variable exists.

   * The entrypoint can't be updated. // ?????? TODO
   * 
   * @see: https://docs.docker.com/engine/reference/builder/#entrypoint
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   * @see: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#entrypoint
   */
  command?: string[];

  /**
   * The environment variables to pass to this container.
   * 
   * *Note*: Environment variables cannot start with "AWS_BATCH".
   * This naming convention is reserved for variables that AWS Batch sets.
   */
  env?: { [key:string]: string };

  /**
   * The image pull policy for this container
   * 
   * @see: https://kubernetes.io/docs/concepts/containers/images/#updating-images
   * 
   * @default -  `ALWAYS` if the `:latest` tag is specified, `IF_NOT_PRESENT` otherwise
   */
  imagePullPolicy?: ImagePullPolicy;

  /**
   * The name of this container
   * 
   * @default: `'Default'`
   */
  name?: string;

  /**
   * The amount (in MiB) of memory to present to the container.
   * If your container attempts to exceed the allocated memory, it will be terminated.
   * 
   * Must be larger that 4 MiB
   *
   * At least one of memoryLimitMiB and memoryReservationMiB is required
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory limit
   */
  memoryLimitMiB?: number;

  /**
   * The soft limit (in MiB) of memory to reserve for the container.
   * Your container will be given at least this much memory, but may consume more.
   * 
   * Must be larger that 4 MiB
   *
   * When system memory is under heavy contention, Docker attempts to keep the
   * container memory to this soft limit. However, your container can consume more
   * memory when it needs to, up to either the hard limit specified with the memory
   * parameter (if applicable), or all of the available memory on the container
   * instance, whichever comes first.
   *
   * At least one of `memoryLimitMiB` and `memoryReservationMiB` is required.
   * If both are specified, then `memoryLimitMib` must be equal to `memoryReservationMiB`
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory reserved
   */
  readonly memoryReservationMiB?: number;

  /**
   * The hard limit of CPUs to present to this container.
   * Must be an even multiple of 0.25
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPU limit
   */
  cpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPUs reserved
   */
  readonly cpuReservation?: number;

  /**
   * The hard limit of GPUs to present to this container.
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPU limit
   */
  gpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPUs reserved
   */
  readonly gpuReservation?: number;

  /**
   * If specified, gives this container elevated permissions on the host container instance.
   * The level of permissions are similar to the root user permissions.
   *
   * This parameter maps to `privileged` policy in the Privileged pod security policies in the Kubernetes documentation.
   *
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  priveleged?: boolean;

  /**
   * If specified, gives this container readonly access to its root file system.
   * 
   * This parameter maps to `ReadOnlyRootFilesystem` policy in the Volumes and file systems pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  readonlyFileSystem?: boolean;

  /**
   * If specified, the container is run as the specified group ID (`gid`).
   * If this parameter isn't specified, the default is the group that's specified in the image metadata.
   * This parameter maps to `RunAsGroup` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default none
   */
  runAsGroup?: number;

  /**
   * If specified, the container is run as a user with a `uid` other than 0. Otherwise, no such rule is enforced.
   * This parameter maps to `RunAsUser` and `MustRunAsNonRoot` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the container is *not* required to run as a non-root user
   */
  runAsRoot?: boolean;

  /**
   * If specified, this container is run as the specified user ID (`uid`).
   * This parameter maps to `RunAsUser` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the user that is specified in the image metadata. 
   */
  runAsUser?: number;

  /**
   * The Volumes to mount to this container.
   * Automatically added to the Pod.
   * 
   * @see: https://kubernetes.io/docs/concepts/storage/volumes/
   */
  volumes?: EksVolume[]; 
}

export class EksContainerDefinition extends Construct {
  /**
   * The image that this container will run
   */
  image: ecs.ContainerImage;

  /**
   * An array of arguments to the entrypoint.
   * If this isn't specified, the CMD of the container image is used.
   * This corresponds to the args member in the Entrypoint portion of the Pod in Kubernetes.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to "$(NAME1)" and the NAME1 environment variable doesn't exist,
   * the command string will remain "$(NAME1)." $$ is replaced with $, and the resulting string isn't expanded.
   * or example, $$(VAR_NAME) is passed as $(VAR_NAME) whether or not the VAR_NAME environment variable exists.
   *
   * @see: https://docs.docker.com/engine/reference/builder/#cmd
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   */
  args?: string[];

  /**
   * The entrypoint for the container. This isn't run within a shell.
   * If this isn't specified, the `ENTRYPOINT` of the container image is used.
   * Environment variable references are expanded using the container's environment.
   * If the referenced environment variable doesn't exist, the reference in the command isn't changed.
   * For example, if the reference is to `"$(NAME1)"` and the `NAME1` environment variable doesn't exist,
   * the command string will remain `"$(NAME1)."` `$$` is replaced with `$` and the resulting string isn't expanded.
   * For example, `$$(VAR_NAME)` will be passed as `$(VAR_NAME)` whether or not the `VAR_NAME` environment variable exists.

   * The entrypoint can't be updated. // ?????? TODO
   * 
   * @see: https://docs.docker.com/engine/reference/builder/#entrypoint
   * @see: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/
   * @see: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#entrypoint
   */
  command?: string[];

  /**
   * The environment variables to pass to this container.
   * 
   * *Note*: Environment variables cannot start with "AWS_BATCH".
   * This naming convention is reserved for variables that AWS Batch sets.
   */
  env?: { [key:string]: string };

  /**
   * The image pull policy for this container
   * 
   * @see: https://kubernetes.io/docs/concepts/containers/images/#updating-images
   * 
   * @default -  `ALWAYS` if the `:latest` tag is specified, `IF_NOT_PRESENT` otherwise
   */
  imagePullPolicy?: ImagePullPolicy;

  /**
   * The name of this container
   * 
   * @default: `'Default'`
   */
  name?: string;

  /**
   * The amount (in MiB) of memory to present to the container.
   * If your container attempts to exceed the allocated memory, it will be terminated.
   * 
   * Must be larger that 4 MiB
   *
   * At least one of memoryLimitMiB and memoryReservationMiB is required
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory limit
   */
  memoryLimitMiB?: number;

  /**
   * The soft limit (in MiB) of memory to reserve for the container.
   * Your container will be given at least this much memory, but may consume more.
   * 
   * Must be larger that 4 MiB
   *
   * When system memory is under heavy contention, Docker attempts to keep the
   * container memory to this soft limit. However, your container can consume more
   * memory when it needs to, up to either the hard limit specified with the memory
   * parameter (if applicable), or all of the available memory on the container
   * instance, whichever comes first.
   *
   * At least one of `memoryLimitMiB` and `memoryReservationMiB` is required.
   * If both are specified, then `memoryLimitMib` must be equal to `memoryReservationMiB`
   * 
   * *Note*: To maximize your resource utilization, provide your jobs with as much memory as possible
   * for the specific instance type that you are using.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   * @see: https://docs.aws.amazon.com/batch/latest/userguide/memory-management.html
   *
   * @default - No memory reserved
   */
  readonly memoryReservationMiB?: number;

  /**
   * The hard limit of CPUs to present to this container.
   * Must be an even multiple of 0.25
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPU limit
   */
  cpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * At least one of `cpuReservation` and `cpuLimit` is required.
   * If both are specified, then `cpuLimit` must be at least as large as `cpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No CPUs reserved
   */
  readonly cpuReservation?: number;

  /**
   * The hard limit of GPUs to present to this container.
   * 
   * If your container attempts to exceed this limit, it will be terminated.
   * 
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPU limit
   */
  gpuLimit?: number;

  /**
   * The soft limit of CPUs to reserve for the container
   * Must be an even multiple of 0.25
   *
   * The container will given at least this many CPUs, but may consume more.
   *
   * If both `gpuReservation` and `gpuLimit` are specified, then `gpuLimit` must be equal to `gpuReservation`.
   * 
   * @see: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
   *
   * @default - No GPUs reserved
   */
  readonly gpuReservation?: number;

  /**
   * If specified, gives this container elevated permissions on the host container instance.
   * The level of permissions are similar to the root user permissions.
   *
   * This parameter maps to `privileged` policy in the Privileged pod security policies in the Kubernetes documentation.
   *
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  priveleged?: boolean;

  /**
   * If specified, gives this container readonly access to its root file system.
   * 
   * This parameter maps to `ReadOnlyRootFilesystem` policy in the Volumes and file systems pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#volumes-and-file-systems
   * 
   * @default false
   */
  readonlyFileSystem?: boolean;

  /**
   * If specified, the container is run as the specified group ID (`gid`).
   * If this parameter isn't specified, the default is the group that's specified in the image metadata.
   * This parameter maps to `RunAsGroup` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default none
   */
  runAsGroup?: number;

  /**
   * If specified, the container is run as a user with a `uid` other than 0. Otherwise, no such rule is enforced.
   * This parameter maps to `RunAsUser` and `MustRunAsNonRoot` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the container is *not* required to run as a non-root user
   */
  runAsRoot?: boolean;

  /**
   * If specified, this container is run as the specified user ID (`uid`).
   * This parameter maps to `RunAsUser` and `MustRunAs` policy in the Users and groups pod security policies in the Kubernetes documentation.
   * 
   * *Note*: this is only compatible with Kubernetes < v1.25
   * 
   * @see: https://kubernetes.io/docs/concepts/security/pod-security-policy/#users-and-groups
   * 
   * @default - the user that is specified in the image metadata. 
   */
  runAsUser?: number;

  /**
   * The Volumes to mount to this container.
   * Automatically added to the Pod.
   * 
   * @see: https://kubernetes.io/docs/concepts/storage/volumes/
   */
  volumes?: EksVolume[]; 

  constructor(scope: Construct, id: string, props: EksContainerProps) {
    super(scope, id);

    this.image = props.image;
    this.args = props.args;
    this.command = props.command;
    this.env = props.env;
    this.imagePullPolicy = props.imagePullPolicy;
    this.name = props.name;
    this.memoryLimitMiB = props.memoryLimitMiB;
    this.memoryReservationMiB = props.memoryReservationMiB;
    this.cpuLimit = props.cpuLimit
    this.cpuReservation = props.cpuReservation;
    this.gpuLimit = props.gpuLimit;
    this.gpuReservation = props.gpuReservation;
    this.priveleged = props.priveleged;
    this.readonlyFileSystem = props.readonlyFileSystem;
    this.runAsGroup = props.runAsGroup;
    this.runAsRoot = props.runAsRoot;
    this.runAsUser = props.runAsUser;
    this.volumes = props.volumes;
  }

  addVolume(...EksVolume[]) {}
}

interface EksVolumeOptions {
  /**
   * The name of this volume.
   * The name must be a valid DNS subdomain name.
   * 
   * @see: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
   */
  name: string;

  /**
   * The path on the container where the container is mounted.
   * 
   * @default - the container is not mounted
   */
  mountPath?: string;

  /**
   * If specified, the container has readonly access to the volume.
   * Otherwise, the container has read/write access.
   * 
   * @default false
   */
  readonly?: boolean;
}

abstract class EksVolume {
  static emptyDir(options: EmptyDirVolumeOptions) {
    return new EmptyDirVolume(options);
  }
  static hostPath(options: HostPathVolumeOptions) {
    return new HostPathVolume(options);
  }
  static secret(options: SecretPathVolumeOptions) {
    return new SecretPathVolume(options);
  }

  /**
   * The name of this volume.
   * The name must be a valid DNS subdomain name.
   * 
   * @see: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
   */
  name: string;

  /**
   * The path on the container where the container is mounted.
   * 
   * @default - the container is not mounted
   */
  mountPath?: string;

  /**
   * If specified, the container has readonly access to the volume.
   * Otherwise, the container has read/write access.
   * 
   * @default false
   */
  readonly?: boolean;

  constructor(options: EksVolumeOptions) {
    this.name = options.name;
    this.mountPath = options.mountPath;
    this.readonly = options.readonly;
  }
}

export interface EmptyDirVolumeOptions extends EksVolumeOptions {
  /**
   * The storage type to use for this Volume.
   * 
   * @default `EmptyDirMediumType.DISK`
   */
  medium?: EmptyDirMediumType;

  /**
   * The maximum size for this Volume
   * 
   * @default - no size limit
   */
  sizeLimit?: number;
}

export enum EmptyDirMediumType {
  /**
   * Use the disk storage of the node.
   * Items written here will survive node reboots.
   */
  DISK = '',

  /**
   * Use the `tmpfs` volume that is backed by RAM of the node.
   * Items written here will *not* survive node reboots.
   */
  MEMORY = 'Memory',
}

/**
 * @see: https://kubernetes.io/docs/concepts/storage/volumes/#emptydir
 */
class EmptyDirVolume extends EksVolume {
  /**
   * The storage type to use for this Volume.
   * 
   * @default `EmptyDirMediumType.DISK`
   */
  medium?: EmptyDirMediumType;

  /**
   * The maximum size for this Volume
   * 
   * @default - no size limit
   */
  sizeLimit?: number;

  constructor(options: EmptyDirVolumeOptions) {
    super(options);
    this.medium = options.medium;
    this.sizeLimit = options.sizeLimit;
  }
}

export interface HostPathVolumeOptions extends EksVolumeOptions {
  /**
   * The path of the file or directory on the host to mount into containers on the pod.
   * 
   * *Note*: HothPath Volumes present many security risks, and should be avoided when possible.
   * 
   * @see: https://kubernetes.io/docs/concepts/storage/volumes/#hostpath
   */
  path: string;
}

/**
 * @see: https://kubernetes.io/docs/concepts/storage/volumes/#hostpath
 */
class HostPathVolume extends EksVolume {
  /**
   * The path of the file or directory on the host to mount into containers on the pod.
   * 
   * *Note*: HothPath Volumes present many security risks, and should be avoided when possible.
   * 
   * @see: https://kubernetes.io/docs/concepts/storage/volumes/#hostpath
   */
  path: string;

  constructor(options: HostPathVolumeOptions) {
    super(options);
    this.path = options.path;
  }
}

export interface SecretPathVolumeOptions extends EksVolumeOptions {
  /**
   * The name of the secret.
   * Must be a valid DNS subdomain name.
   * 
   * @see: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
   */
  secretName: string;

  /**
   * Specifies whether the secret or the secret's keys must be defined
   * 
   * @default true
   */
  optional?: boolean;
}

/**
 * Specifies the configuration of a Kubernetes secret volume
 * 
 * @see: https://kubernetes.io/docs/concepts/storage/volumes/#secret
 */
class SecretPathVolume extends EksVolume {
  /**
   * The name of the secret.
   * Must be a valid DNS subdomain name.
   * 
   * @see: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
   */
  secretName: string;

  /**
   * Specifies whether the secret or the secret's keys must be defined
   * 
   * @default true
   */
  optional?: boolean;

  constructor(options: SecretPathVolumeOptions) {
    super(options);
    this.secretName = options.secretName;
    this.optional = options.optional;
  }
}
