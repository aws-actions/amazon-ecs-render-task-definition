const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');
const aws = require('aws-sdk');

function mergeContainerDefinition(defaults, patch) {
  const { environment: envDefaults } = defaults;
  const { environment: envPatch, ...patchRest } = patch;
  const { acc: environment } = (envPatch || []).concat(envDefaults || []).reduce(({ acc, seen }, e) => {
    if (seen[e.name]) return { acc, seen };
    seen[e.name] = 1;
    acc.push(e)
    return { acc, seen };
  }, { acc: [], seen: {} });
  return { ...defaults, ...patchRest, environment };
}

async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'amazon-ecs-render-task-definition-for-github-actions'
    });

    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition-patch', { required: true });
    const service = core.getInput('service', { required: true });
    const clusterName = core.getInput('cluster', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const image = core.getInput('image', { required: true });
    const includeTags = core.getInput('include_tags', { required: false }) !== "false" ? ["TAGS"] : undefined;

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
    }
    const taskDefPatch = require(taskDefPath);

    // Download the task definition
    const describeResponse = await ecs.describeServices({
      services: [service],
      cluster: clusterName
    }).promise();
    if (describeResponse.failures && describeResponse.failures.length > 0) {
      const failure = describeResponse.failures[0];
      throw new Error(`${failure.arn} is ${failure.reason}`);
    }

    const serviceResponse = describeResponse.services[0];
    if (serviceResponse.status != 'ACTIVE') {
      throw new Error(`Service is ${serviceResponse.status}`);
    }
    const taskDefArn = serviceResponse.taskDefinition

    core.debug('Downloading the task definition');
    let describeTaskResponse;
    try {
      describeTaskResponse = await ecs.describeTaskDefinition({ taskDefinition: taskDefArn, include: includeTags }).promise();
    } catch (error) {
      core.setFailed("Failed to download task definition in ECS: " + error.message);
      core.debug("Task definition name: " + taskDefArn);
      throw (error);
    }

    core.info(includeTags);
    core.info(JSON.stringify(describeTaskResponse));

    const taskDef = describeTaskResponse.taskDefinition;
    if (includeTags) {
      const tags = describeTaskResponse.tags;
    }
    const findContDef = taskDef.containerDefinitions.findIndex(x => x.name === containerName);

    const newContainerDefinition = mergeContainerDefinition(
      taskDef.containerDefinitions[findContDef], { ...taskDefPatch, image });

    var newTaskDef = {
      containerDefinitions: [newContainerDefinition],
      family: taskDef.family,
      taskRoleArn: taskDef.taskRoleArn,
      executionRoleArn: taskDef.executionRoleArn,
      networkMode: taskDef.networkMode,
      memory: taskDef.memory,
      cpu: taskDef.cpu,
      requiresCompatibilities: taskDef.requiresCompatibilities,
      volumes: taskDef.volumes,
      placementConstraints: taskDef.placementConstraints
    }
    if (includeTags) {
      newTaskDef.tags = tags;
    }

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      tmpdir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true
    });
    const newtaskDefPatch = JSON.stringify(newTaskDef, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newtaskDefPatch);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
  run();
}
