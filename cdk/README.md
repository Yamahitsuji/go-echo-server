# CDKテンプレート
## デプロイ手順
1. CDKデプロイ
`cdk deploy`でリソースを作成
2. CodeDeployの作成
コンソールまたはCLIからCodeDeployを作成する。  
ECSのBlue/GreenデプロイメントはCloudformationおよびCDKでは現状対応していない。  
代わりにHooksを使ったCfnが存在するが、設定内容が異なるため、今回は手動作成をする。  
CodeDeployのIAMロールはCDKで作成したものを使う。

Hooksの参考リンク
- https://github.com/aws/aws-cdk/issues/1559
- https://github.com/aws-samples/aws-reinvent-trivia-game/blob/master/trivia-backend/infra/cdk/ecs-service-blue-green.ts
- https://github.com/aws-samples/aws-reinvent-trivia-game/tree/master/trivia-backend#ecs-on-fargate-codedeploy-blue-green-deployments
- https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-ecs-cfn.html
3. CodeDeployをCodePipelineに設定
コンソールまたはCLIで、２で作成したCodeDeployをCodePipelineに設定する。  
Buildステージの後に新しくDeployステージを作成し、アクションに2のCodeDeployを追加する。
4. CodePipelineの実行
