## Amazon ECS "Render Task Definition" Action for GitHub Actions

Inserts a container image URI into an Amazon ECS task definition JSON file, creating a new task definition file.

**Table of Contents**

<!-- toc -->

- [Usage](#usage)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## Usage

To insert the image URI `amazon/amazon-ecs-sample:latest` as the image for the `web` container in the task definition file, and then deploy the edited task definition file to ECS:

```yaml
    - name: Render Amazon ECS task definition
      id: render-web-container
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        family: "core-service"
        cpu: "1024"
        memory: "2048"
        executionRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/x"
        taskRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/x"
        container-name: web
        overwrite-container-name: "true"
        awslogs-group: "ecs/web"
        awslogs-region: "us-west-2"
        image: amazon/amazon-ecs-sample:latest
        environment-variables: "LOG_LEVEL=info"
        environment-secrets: "SECRET_VAR=arn:aws:secretsmanager:us-west-x:xxxxxxxxxxxx:secret:prod/pkey"

    - name: Deploy to Amazon ECS service
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.render-web-container.outputs.task-definition }}
        service: my-service
        cluster: my-cluster
```

If your task definition file holds multiple containers in the `containerDefinitions`
section which require updated image URIs, chain multiple executions of this action
together using the output value from the first action for the `task-definition`
input of the second:

```yaml
    - name: Render Amazon ECS task definition for first container
      id: render-web-container
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        container-name: web
        image: amazon/amazon-ecs-sample-1:latest
        environment-variables: |
            LOG_LEVEL=info
            ENVIRONMENT=prod

    - name: Modify Amazon ECS task definition with second container
      id: render-app-container
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: ${{ steps.render-web-container.outputs.task-definition }}
        container-name: app
        image: amazon/amazon-ecs-sample-2:latest

    - name: Deploy to Amazon ECS service
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.render-app-container.outputs.task-definition }}
        service: my-service
        cluster: my-cluster
```

Use the following approach to configure your log driver if needed:

```yaml
    - name: Render Amazon ECS task definition
      id: render-web-container
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        container-name: web
        image: amazon/amazon-ecs-sample:latest
        log-configuration-log-driver: awslogs
        log-configuration-log-options: |
          awslogs-create-group=true
          awslogs-group=/ecs/web
          awslogs-region=us-east-1
          awslogs-stream-prefix=ecs

```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## License Summary

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
