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

    const environmentVariables = core.getInput('environment-variables', { required: false });

    const logConfigurationLogDriver = core.getInput("log-configuration-log-driver", { required: false });
    const logConfigurationOptions = core.getInput("log-configuration-options", { required: false });
    const dockerLabels = core.getInput('docker-labels', { required: false });

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
    const containerDef = taskDefContents.containerDefinitions.find(function (element) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }
    containerDef.image = imageURI;

    if (environmentVariables) {

      // If environment array is missing, create it
      if (!Array.isArray(containerDef.environment)) {
        containerDef.environment = [];
      }

      // Get pairs by splitting on newlines
      environmentVariables.split('\n').forEach(function (line) {
        // Trim whitespace
        const trimmedLine = line.trim();
        // Skip if empty
        if (trimmedLine.length === 0) { return; }
        // Split on =
        const separatorIdx = trimmedLine.indexOf("=");
        // If there's nowhere to split
        if (separatorIdx === -1) {
          throw new Error(`Cannot parse the environment variable '${trimmedLine}'. Environment variable pairs must be of the form NAME=value.`);
        }
        // Build object
        const variable = {
          name: trimmedLine.substring(0, separatorIdx),
          value: trimmedLine.substring(separatorIdx + 1),
        };

        // Search container definition environment for one matching name
        const variableDef = containerDef.environment.find((e) => e.name == variable.name);
        if (variableDef) {
          // If found, update
          variableDef.value = variable.value;
        } else {
          // Else, create
          containerDef.environment.push(variable);
        }
      })
    }

    if (logConfigurationLogDriver) {
      if (!containerDef.logConfiguration) { containerDef.logConfiguration = {} }
      const validDrivers = ["json-file", "syslog", "journald", "logentries", "gelf", "fluentd", "awslogs", "splunk", "awsfirelens"];
      if (!validDrivers.includes(logConfigurationLogDriver)) {
        throw new Error(`'${logConfigurationLogDriver}' is invalid logConfigurationLogDriver. valid options are ${validDrivers}. More details: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_LogConfiguration.html`)
      }
      containerDef.logConfiguration.logDriver = logConfigurationLogDriver
    }

    if (logConfigurationOptions) {
      if (!containerDef.logConfiguration) { containerDef.logConfiguration = {} }
      if (!containerDef.logConfiguration.options) { containerDef.logConfiguration.options = {} }
      logConfigurationOptions.split("\n").forEach(function (option) {
        option = option.trim();
        if (option && option.length) { // not a blank line
          if (option.indexOf("=") == -1) {
            throw new Error(`Can't parse logConfiguration option ${option}. Must be in key=value format, one per line`);
          }
          const [key, value] = option.split("=");
          containerDef.logConfiguration.options[key] = value
        }
      })
    }

    if (dockerLabels) {
      // If dockerLabels object is missing, create it
      if (!containerDef.dockerLabels) { containerDef.dockerLabels = {} }

      // Get pairs by splitting on newlines
      dockerLabels.split('\n').forEach(function (label) {
        // Trim whitespace
        label = label.trim();
        if (label && label.length) {
          if (label.indexOf("=") == -1 ) {
            throw new Error(`Can't parse logConfiguration option ${label}. Must be in key=value format, one per line`);
          }
          const [key, value] = label.split("=");
          containerDef.dockerLabels[key] = value;
        }
      })
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
