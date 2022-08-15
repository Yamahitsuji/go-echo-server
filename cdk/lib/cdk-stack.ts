import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnParameter,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_elasticloadbalancingv2 as elbv2,
  aws_codepipeline as codePipeline,
  aws_codepipeline_actions as actions,
  aws_codecommit as codecommit,
  aws_codebuild as codebuild,
  aws_logs as logs,
  aws_iam as iam,
  Duration,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class ECSPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const vpcCidr = '10.0.0.0/16'

    const vpc = new ec2.Vpc(this, 'VPC', {
      cidr: vpcCidr,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    })

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    })

    const lb = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster: cluster,
        cpu: 256,
        memoryLimitMiB: 512,
        protocol: elbv2.ApplicationProtocol.HTTP,
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry('httpd'),
          containerPort: 80,
        },
        taskSubnets: { subnets: vpc.privateSubnets },
        deploymentController: {
          type: ecs.DeploymentControllerType.CODE_DEPLOY,
        },
      }
    )

    // It's needed for CodeDeploy Blue/Green Deployment
    const tg = new elbv2.ApplicationTargetGroup(this, 'targetGroup', {
      vpc,
      port: 80,
      targetGroupName: 'ecsTargetGroup',
      targetType: elbv2.TargetType.IP,
    })

    const ecrRepo = new ecr.Repository(this, 'ecrRepository', {
      encryption: ecr.RepositoryEncryption.AES_256,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      repositoryName: 'echo-server',
    })

    const codecommitRepo = new codecommit.Repository(this, 'CodeCommit', {
      repositoryName: 'echo-server',
    })

    const sourceOutput = new codePipeline.Artifact('SourceArtifact')
    const sourceAction = new actions.CodeCommitSourceAction({
      actionName: 'Source',
      repository: codecommitRepo,
      branch: 'main',
      output: sourceOutput,
      trigger: actions.CodeCommitTrigger.EVENTS,
    })

    const buildProject = new codebuild.PipelineProject(this, 'CodeBuild', {
      concurrentBuildLimit: 8,
      timeout: Duration.hours(1),
      environment: {
        computeType: codebuild.ComputeType.SMALL,
        buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
        privileged: true,
      },
      environmentVariables: {
        IMAGE_REPO_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: ecrRepo.repositoryName,
        },
      },
      logging: {
        cloudWatch: {
          logGroup: new logs.LogGroup(this, 'CodeBuildLogs', {
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        },
      },
    })
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        resources: [ecrRepo.repositoryArn],
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:CompleteLayerUpload',
          'ecr:InitiateLayerUpload',
          'ecr:PutImage',
          'ecr:UploadLayerPart',
        ],
      })
    )
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ecr:GetAuthorizationToken'],
      })
    )
    const buildOutput = new codePipeline.Artifact('BuildArtifact')
    const buildAction = new actions.CodeBuildAction({
      actionName: 'DockerBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      type: actions.CodeBuildActionType.BUILD,
    })

    // Currently, ECS Blue/Green Deployment is not supported.
    // To do it, you need to use hooks (different from appspec deployment)
    // https://github.com/aws/aws-cdk/issues/1559
    // https://github.com/aws-samples/aws-reinvent-trivia-game/blob/master/trivia-backend/infra/cdk/ecs-service-blue-green.ts
    // https://github.com/aws-samples/aws-reinvent-trivia-game/tree/master/trivia-backend#ecs-on-fargate-codedeploy-blue-green-deployments
    // https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-ecs-cfn.html

    const pipeline = new codePipeline.Pipeline(this, 'codePipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
      ],
    })

    pipeline.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'codedeploy:CreateDeployment',
          'codedeploy:GetDeployment',
          'codedeploy:GetApplication',
          'codedeploy:GetApplicationRevision',
          'codedeploy:RegisterApplicationRevision',
          'codedeploy:GetDeploymentConfig',
          'ecs:RegisterTaskDefinition',
        ],
        resources: ['*'],
      })
    )
    pipeline.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: ['*'],
        conditions: {
          StringEqualsIfExists: {
            'iam:PassedToService': ['ecs-tasks.amazonaws.com'],
          },
        },
      })
    )
  }
}
