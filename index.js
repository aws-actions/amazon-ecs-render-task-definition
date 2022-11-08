const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
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
    const environmentVariables = core.getInput('environment-variables', { required: false });
    const environmentSecrets = core.getInput('environment-secrets', { required: false });

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
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
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
      // Parse env file(s). 
      // Precedence: Order of aws-env-files < environment-variables == environment-secrets
      awsEnvFiles.split('|').forEach(function (awsEnvFilePath) {
        let filePath = awsEnvFilePath.trim()
        filePath = path.isAbsolute(filePath) ? filePath : path.join(process.env.GITHUB_WORKSPACE, filePath);
        if (!fs.existsSync(filePath)) {
          throw new Error(`AWS env file does not exist: ${awsEnvFilePath}`);
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
              variableDef.value = variable.value;
            } else {
              // Else, create
              containerDef.environment.push(variable);
            }
          })
        }
  
        if (awsEnvFile.secrets) {
          if (!Array.isArray(containerDef.secrets)) {
            containerDef.secrets = [];
          }
          awsEnvFile.secrets.forEach(function (secret) {
            // Search container definition secrets for one matching name
            const variableDef = containerDef.secrets.find((e) => e.name == secret.name);
            if (variableDef) {
              // If found, update
              variableDef.valueFrom = secret.valueFrom;
            } else {
              // Else, create
              containerDef.secrets.push(secret);
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

    if (environmentSecrets) {

      // If environment array is missing, create it
      if (!Array.isArray(containerDef.secrets)) {
        containerDef.secrets = [];
      }

      // Get pairs by splitting on newlines
      environmentSecrets.split('\n').forEach(function (line) {
        // Trim whitespace
        const trimmedLine = line.trim();
        // Skip if empty
        if (trimmedLine.length === 0) { return; }
        // Split on =
        const separatorIdx = trimmedLine.indexOf("=");
        // If there's nowhere to split
        if (separatorIdx === -1) {
            throw new Error(`Cannot parse the environment secret '${trimmedLine}'. Environment secret pairs must be of the form KEY=value.`);
        }
        // Build object
        const secret = {
          name: trimmedLine.substring(0, separatorIdx),
          valueFrom: trimmedLine.substring(separatorIdx + 1),
        };

        // Search container definition environment for one matching name
        const variableDef = containerDef.secrets.find((e) => e.name == secret.name);
        if (variableDef) {
          // If found, update
          variableDef.valueFrom = secret.valueFrom;
        } else {
          // Else, create
          containerDef.secrets.push(secret);
        }
      })
    }

    if (awslogsGroup && awslogsRegion && containerDef.logConfiguration && containerDef.logConfiguration.options) {
      containerDef.logConfiguration.options["awslogs-group"] = awslogsGroup;
      containerDef.logConfiguration.options["awslogs-region"] = awslogsRegion;
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
