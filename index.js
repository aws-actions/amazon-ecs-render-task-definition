const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
  core.info(`Starting Amazon ECS Render Task Definition action`);
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });

    const family = core.getInput('family', { required: false });
    const cpu = core.getInput('cpu', { required: false });
    const memory = core.getInput('memory', { required: false });
    const executionRoleArn = core.getInput('executionRoleArn', { required: false });
    const taskRoleArn = core.getInput('taskRoleArn', { required: false });

    const containerName = core.getInput('container-name', { required: false });
    const overwriteContainerName = core.getInput('overwrite-container-name', { required: false });
    const imageURI = core.getInput('image', { required: true });
    const containerPort = core.getInput('container-port', { required: false });
    const hostPort = core.getInput('host-port', { required: false });
    const command = core.getInput('command', { required: false });
    const awslogsGroup = core.getInput('awslogs-group', { required: false });
    const awslogsRegion = core.getInput('awslogs-region', { required: false });

    const awsEnvFiles = core.getInput('aws-env-files', { required: false });
    const preferTaskDefEnvironmentVariables = core.getInput('prefer-task-definition-environment-variables', { required: false }) === "true";
    const environmentVariables = core.getInput('environment-variables', { required: false });
    const environmentSecrets = core.getInput('environment-secrets', { required: false });
    const logConfigOptions = core.getInput('log-configuration-options', { required: false });
    const logConfigSecretOptions = core.getInput('log-configuration-secret-options', { required: false });

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
    const lookupName = overwriteContainerName == "true" ? "placeholder_container_name" : containerName;
    core.info(`Looking up container by name: "${lookupName}"`);
    const containerDef = taskDefContents.containerDefinitions.find(function (element) {
      return element.name == lookupName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }
    containerDef.name = containerName;
    containerDef.image = imageURI;

    if (family) {
      taskDefContents.family = family;
    }

    if (cpu) {
      taskDefContents.cpu = cpu;
    }

    if (memory) {
      taskDefContents.memory = memory;
    }

    if (executionRoleArn) {
      taskDefContents.executionRoleArn = executionRoleArn;
    }

    if (taskRoleArn) {
      taskDefContents.taskRoleArn = taskRoleArn;
    }

    if (containerPort && hostPort) {
      const portMapping = {
        containerPort: containerPort,
        hostPort: hostPort,
        protocol: "tcp"
      };
      // If portMappings array is missing, create it
      if (!Array.isArray(containerDef.portMappings)) {
        containerDef.portMappings = [];
      }
      containerDef.portMappings.push(portMapping);
    }

    if (command) {
      if (!Array.isArray(containerDef.command)) {
        containerDef.command = [];
      }

      command.split(' ').forEach(function (line) {
        const trimmedLine = line.trim();
        containerDef.command.push(trimmedLine);
      })
    }

    if (awsEnvFiles) {
      core.info(`Has "aws-env-files" set`);
      // Parse env file(s).
      // Precedence: Order of aws-env-files < environment-variables == environment-secrets
      awsEnvFiles.split('|').forEach(function (awsEnvFilePath) {
        let filePath = awsEnvFilePath.trim()
        filePath = path.isAbsolute(filePath) ? filePath : path.join(process.env.GITHUB_WORKSPACE, filePath);
        if (!fs.existsSync(filePath)) {
          throw new Error(`AWS env file does not exist: ${filePath}`);
        }
        const awsEnvFile = require(filePath);
        if (awsEnvFile.environment) {
          if (!Array.isArray(containerDef.environment)) {
            containerDef.environment = [];
          }

          awsEnvFile.environment.forEach(function (variable) {
            // Search container definition environment for one matching name
            const variableDef = containerDef.environment.find((e) => e.name == variable.name);
            if (variableDef) {
              // If found, update
              variableDef.value = preferTaskDefEnvironmentVariables ? variableDef.value : variable.value;
              core.info(`"Updating ${variable.name} with value ${variableDef.value} from task def`);
            } else {
              // Else, create
              if (variable.value.length !== 0) {
                containerDef.environment.push(variable);
                core.info(`"Updating ${variable.name} with value ${variable.value} from env file`);
              }
            }
          })
        }

        if (awsEnvFile.secrets) {
          core.info(`Has "aws-env-files" secrets`);
          if (!Array.isArray(containerDef.secrets)) {
            containerDef.secrets = [];
          }
          awsEnvFile.secrets.forEach(function (secret) {
            // Search container definition secrets for one matching name
            const variableDef = containerDef.secrets.find((e) => e.name == secret.name);
            if (variableDef) {
              // If found, update
              variableDef.valueFrom = preferTaskDefEnvironmentVariables ? variableDef.valueFrom : secret.valueFrom;
            } else {
              // Else, create (only if not empty)
              if (secret.valueFrom.length !== 0) {
                containerDef.secrets.push(secret);
              }
            }
          })
        }
      })
    }

    if (environmentVariables) {

      // If environment array is missing, create it
      if (!Array.isArray(containerDef.environment)) {
        containerDef.environment = [];
      }

      // Get pairs by splitting on newlines
      environmentVariables.split('\n').forEach(function (line) {
        const variable = getVarFromRaw(line, "environment variable", false);
        set_or_replace(containerDef.environment, variable, false);
      })
    }

    if (environmentSecrets) {

      // If environment array is missing, create it
      if (!Array.isArray(containerDef.secrets)) {
        containerDef.secrets = [];
      }

      // Get pairs by splitting on newlines
      environmentSecrets.split('\n').forEach(function (line) {
        const secret = getVarFromRaw(line, "environment secret", true);
        set_or_replace(containerDef.secrets, secret, true);
      })
    }

    if (awslogsGroup && awslogsRegion && containerDef.logConfiguration && containerDef.logConfiguration.options) {
      containerDef.logConfiguration.options["awslogs-group"] = awslogsGroup;
      containerDef.logConfiguration.options["awslogs-region"] = awslogsRegion;
    }

    if (logConfigOptions) {
      // NOTE: We're mostly just assuming that log configuration is already there, and mostly configured
      if (!containerDef.logConfiguration.options) {
        containerDef.logConfiguration.options = {};
      }
      core.info(`alog configuration options"${JSON.stringify(containerDef.logConfiguration.options)}"`);
      logConfigOptions.split('\n').forEach(function (line) {
        const variable = getVarFromRaw(line, "log configuration option", false);
        core.info(`Setting log configuration option "${JSON.stringify(variable)}"`);
        if (variable.name in containerDef.logConfiguration.options) {
          containerDef.logConfiguration.options[variable.name] = variable.value;
        } else {
          containerDef.logConfiguration.options[variable.name] = variable.value;
        }
      });
      core.info(`blog configuration options"${JSON.stringify(containerDef.logConfiguration.options)}"`);
    }

    if (logConfigSecretOptions) {
      // NOTE: We're mostly just assuming that log configuration is already there, and mostly configured
      if (!containerDef.logConfiguration.secretOptions) {
        containerDef.logConfiguration.secretOptions = [];
      }
      logConfigSecretOptions.split('\n').forEach(function (line) {
        const variable = getVarFromRaw(line, "log configuration setcret option", true);
        core.info(`Setting log configuration secret option "${JSON.stringify(variable)}"`);
        set_or_replace(containerDef.logConfiguration.secretOptions, variable, true);
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
    core.info(`Writing new task definition to "${updatedTaskDefFile.name}"`);
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  }
  catch (error) {
    core.setFailed(error.message);
  }
  core.info(`Finishing Amazon ECS Render Task Definition action`);
}

function getVarFromRaw(line, kind, isSecret) {
  // Trim whitespace
  const trimmedLine = line.trim();
  // Skip if empty
  if (trimmedLine.length === 0) { return; }
  // Split on =
  const separatorIdx = trimmedLine.indexOf("=");
  // If there's nowhere to split
  if (separatorIdx === -1) {
    throw new Error(`Cannot parse the ${kind} '${trimmedLine}'. Environment variable pairs must be of the form NAME=value.`);
  }
  // Build object
  if (isSecret) {
    return {
      name: trimmedLine.substring(0, separatorIdx),
      valueFrom: trimmedLine.substring(separatorIdx + 1),
    };
  } else {
    return {
      name: trimmedLine.substring(0, separatorIdx),
      value: trimmedLine.substring(separatorIdx + 1),
    };
  }
}

function set_or_replace(map, variable, isSecret) {
  // Search container definition environment for one matching name
  core.info(`set_or_replace called with map: ${JSON.stringify(map)}`);
  const variableDef = map.find((e) => e.name == variable.name);
  if (variableDef) {
    // If found, update
    if (isSecret) {
      variableDef.valueFrom = variable.valueFrom;
    } else {
      variableDef.value = variable.value;
    }
  } else {
    // Else, create
    if (isSecret) {
      if (variable.valueFrom.length !== 0) {
        map.push(variable);
      }
    } else {
      if (variable.value.length !== 0) {
        map.push(variable);
      }
    }
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
  run();
}
