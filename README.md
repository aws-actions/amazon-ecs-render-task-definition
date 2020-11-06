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
        container-name: web
        image: amazon/amazon-ecs-sample:latest

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

If containers in your task definition require different values depending on environment, you can specify a `merge` file that contains a JSON fragment to merge with the `task-definition`. `merge` task defintion JSON fragments can be used to modify any key/value pair in `task-definition`. If merging an array value, arrays from the `task-defition` and `merge` fragment will be concatenated.

_task-def.json_

```json
  {
    "family": "task-def-family",
    "containerDefinitions": [
      {
          "name": "web",
          "image": "some-image"
      }
    ]
  }
```

_staging-vars.json_

```json
  {
    "containerDefinitions": [
      {
        "name": "web",
        "environment": [
            {
              "name": "log_level",
              "value": "debug"
            }
        ]
      }
    ]
  }
```

_prod-vars.json_

```json
  {
    "containerDefinitions": [
      {
        "name": "web",
        "environment": [
            {
              "name": "log_level",
              "value": "info"
            }
        ]
      }
    ]
  }
```

```yaml
    - name: Add image to Amazon ECS task definition
      id: render-image-in-task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-def.json
        container-name: web
        image: amazon/amazon-ecs-sample:latest

    - name: Render Amazon ECS task definition for staging
      id: render-staging-task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: ${{ steps.render-image-in-task-def.outputs.task-definition }}
        merge: staging-vars.json

    - name: Render Amazon ECS task definition for prod
      id: render-prod-task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: ${{ steps.render-image-in-task-def.outputs.task-definition }}
        merge: prod-vars.json

    - name: Deploy to Staging
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.render-staging-task-def.outputs.task-definition }}
        service: my-staging-service
        cluster: my-staging-cluster

    - name: Deploy to Prod
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.render-prod-task-def.outputs.task-definition }}
        service: my-prod-service
        cluster: my-prod-cluster
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## License Summary

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
