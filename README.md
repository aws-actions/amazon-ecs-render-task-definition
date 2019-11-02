## Amazon ECS "Render Task Definition" Action for GitHub Actions

Inserts a container image URI into an Amazon ECS task definition file, creating a new task definition file.

## Usage

To insert the image URI `amazon/amazon-ecs-sample:latest` as the image for the `web` container in the task definition file, and then deploy the edited task definition file to ECS:

```yaml
    - name: Render Amazon ECS task definition
      id: render-web-container
      uses: aws/amazon-ecs-render-task-definition-for-github-actions
      with:
        task-definition: task-definition.json
        container-name: web
        image: amazon/amazon-ecs-sample:latest

    - name: Deploy to Amazon ECS service
      uses: aws/amazon-ecs-deploy-task-definition-for-github-actions
      with:
        task-definition: ${{ steps.render-web-container.outputs.task-definition }}
        service: my-service
        cluster: my-cluster
```

## License Summary

This code is made available under the MIT license.
