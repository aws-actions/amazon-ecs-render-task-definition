const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');
const {ECS} = require('@aws-sdk/client-ecs');

async function run() {
  try {
    const ecs = new ECS({
      customUserAgent: 'amazon-ecs-render-task-definition-for-github-actions'
    });

    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: false });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const environmentVariables = core.getInput('environment-variables', { required: false });
    const envFiles = core.getInput('env-files', { required: false });

    const logConfigurationLogDriver = core.getInput("log-configuration-log-driver", { required: false });
    const logConfigurationOptions = core.getInput("log-configuration-options", { required: false });
    const dockerLabels = core.getInput('docker-labels', { required: false });
    const command = core.getInput('command', { required: false });

    //New inputs to fetch task definition 
    const taskDefinitionArn = core.getInput('task-definition-arn', { required: false }) || undefined;
    const taskDefinitionFamily = core.getInput('task-definition-family', { required: false }) || undefined;
    const taskDefinitionRevision = Number(core.getInput('task-definition-revision', { required: false })) || null;
    const secrets = core.getInput('secrets', { required: false });

    let taskDefPath;
    let taskDefContents;
    let describeTaskDefResponse;
    let params;
    
    if (taskDefinitionFile) {
      core.info("Task definition file will be used.");
      taskDefPath = path.isAbsolute(taskDefinitionFile) ?
        taskDefinitionFile : 
        path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
      if (!fs.existsSync(taskDefPath)) {
        throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
      }
      taskDefContents = require(taskDefPath);
    } else if (taskDefinitionArn || taskDefinitionFamily || taskDefinitionRevision) {
      if (taskDefinitionArn) {
        core.info("The task definition arn will be used to fetch task definition");
        params = {taskDefinition: taskDefinitionArn, include: ['TAGS']};
      } else if (taskDefinitionFamily && taskDefinitionRevision) {
        core.info("The specified revision of the task definition family will be used to fetch task definition");
        params = {taskDefinition: `${taskDefinitionFamily}:${taskDefinitionRevision}`, include: ['TAGS']};
      } else if (taskDefinitionFamily) {
        core.info("The latest revision of the task definition family will be used to fetch task definition");
        params = {taskDefinition: taskDefinitionFamily, include: ['TAGS']};
      } else if (taskDefinitionRevision) {
        core.setFailed("You can't fetch task definition with just revision: Either use task definition file, arn or family name");
      } else {
        throw new Error('Either task definition file, ARN, family, or family and revision must be provided to fetch task definition');
      }

      try {
        describeTaskDefResponse = await ecs.describeTaskDefinition(params);
      } catch (error) {
        core.setFailed("Failed to describe task definition in ECS: " + error.message);
        throw(error); 
      }
      taskDefContents = describeTaskDefResponse.taskDefinition;
      taskDefContents.tags = describeTaskDefResponse.tags;
      core.debug("Task definition tags:");
      core.debug(JSON.stringify(describeTaskDefResponse.tags, undefined, 4));
      core.debug("Task definition contents:");
      core.debug(JSON.stringify(taskDefContents, undefined, 4));
    } else {
      throw new Error("Either task definition, task definition arn or task definition family must be provided");
    }

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

    if (command) {
      containerDef.command = command.split(' ')
    }

    if (envFiles) {
      containerDef.environmentFiles = [];
      envFiles.split('\n').forEach(function (line) {
        // Trim whitespace
        const trimmedLine = line.trim();
        // Skip if empty
        if (trimmedLine.length === 0) { return; }
        // Build object
        const variable = {
          value: trimmedLine,
          type: "s3",
        };
        containerDef.environmentFiles.push(variable);
      })
    }

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

      if (secrets) {
        // If secrets array is missing, create it
        if (!Array.isArray(containerDef.secrets)) {
          containerDef.secrets = [];
        }

        // Get pairs by splitting on newlines
        secrets.split('\n').forEach(function (line) {
          // Trim whitespace
          const trimmedLine = line.trim();
          // Skip if empty
          if (trimmedLine.length === 0) { return; }
          // Split on =
          const separatorIdx = trimmedLine.indexOf("=");
          // If there's nowhere to split
          if (separatorIdx === -1) {
              throw new Error(
                `Cannot parse the secret '${trimmedLine}'. Secret pairs must be of the form NAME=valueFrom, 
                where valueFrom is an arn from parameter store or secrets manager. See AWS documentation for more information: 
                https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html.`);
          }
          // Build object
          const secret = {
            name: trimmedLine.substring(0, separatorIdx),
            valueFrom: trimmedLine.substring(separatorIdx + 1),
          };

          // Search container definition environment for one matching name
          const secretDef = containerDef.secrets.find((s) => s.name == secret.name);
          if (secretDef) {
            // If found, update
            secretDef.valueFrom = secret.valueFrom;
          } else {
            // Else, create
            containerDef.secrets.push(secret);
          }
        })
      }
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