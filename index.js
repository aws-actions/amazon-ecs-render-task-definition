const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const secrets = core.getInput('secrets', { required: false });
    const regionName = core.getInput('region-name', { required: false });
    const accountID = core.getInput('aws-account-id', { required: false });

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
    }
    const taskDefContents = require(taskDefPath);

    // Insert the image URI
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error('Invalid task definition format: containerDefinitions section is not present or is not an array');
    }
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }
    containerDef.image = imageURI;

    // Insert any secrets from Parameter Store or Secrets Manager.
    // Up to here, we know that the containerDefinition must exist
    if (secrets && secrets.toLowerCase() === 'true') {
        // Check the task definition if secrets section exists
        if (!Array.isArray(containerDef.secrets)) {
            throw new Error('Invalid task definition format: secrets section must be an array')
        }
        if (!regionName || !accountID) {
            throw new Error('Invalid GitHub action input: You must specify the region name and the account ID.')
        }
        // Loop through array of, hopefully, dictionaries
        containerDef.secrets.forEach(element => {
            const valueFrom = element.valueFrom.split(":")
            if (valueFrom.length != 2) {
                // Detailed error since we're looping through.
                throw new Error(`Invalid task definition: valueFrom format must be in the form of <service>:<path of variable>. Errored: ${valueFrom}`);
            }
            if (!['ssm', 'secretsmanager'].includes(valueFrom[0])) {
                throw new Error(`Invalid task definition: valueFrom must have prefix ssm or secretsmanager, not ${valueFrom[0]}`)
            }
            if (valueFrom[1].charAt(0) != '/') {
                valueFrom[1] = "/".concat(valueFrom[1])
            }
            element.valueFrom = `arn:aws:${valueFrom[0]}:${regionName}:${accountID}:${(valueFrom[0] == 'ssm') ? 'parameter' : 'secret'}${valueFrom[1]}`

            // Set executionRoleArn to use secrets section
            taskDefContents.executionRoleArn = `arn:aws:iam::${accountID}:role/ecsTaskExecutionRole`
        });
    }

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      tmpdir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true
    });
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
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
