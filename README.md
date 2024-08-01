## Amazon ECS "Render Task Definition" Action for GitHub Actions

Inserts a container image URI into an Amazon ECS task definition JSON file, creating a new task definition file.

**Table of Contents**

<!-- toc -->

- [Usage](#usage)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## Usage
If task definition file is provided that has precedence over any other option to fetch task definition. 
If both task definition file and task definition arn are provided, a warning that both have been provided will be returned and the task definition file will be used.
If neither of task definition file, task definition arn, and task definition family are provided, an error will be thrown. (At least one option needs to be provided)

To insert the image URI `amazon/amazon-ecs-sample:latest` as the image for the `web` container in the task definition file, and then deploy the edited task definition file to ECS:

```yaml
    - name: Render Amazon ECS task definition
      id: render-web-container
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        task-definition-arn:  task-definition-arn
        task-definition-family: task-definition-family-name 
        task-definition-revision: task-definition-revision
        container-name: web
        image: amazon/amazon-ecs-sample:latest
        environment-variables: "LOG_LEVEL=info"

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
        docker-labels: |
            SERVICE=service
            VERSION=version

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
        log-configuration-options: |
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
