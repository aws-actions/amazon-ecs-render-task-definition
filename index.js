const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');
const aws = require('aws-sdk');
var ssm = new aws.SSM();

const loadParams = async (Path, NextPage = null) => {
  const { Parameters, NextToken } = await ssm.getParametersByPath({ Path, NextToken: NextPage }).promise()

  if (NextToken) {
    const moreParams = await loadParams(Path, NextToken)
    return [...Parameters, ...moreParams]
  }

  return Parameters
}

const extractParamName = (ssmParam, ssmParamPathPattern) => ssmParam.Name.replace(ssmParamPathPattern, '')

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });

    const environmentVariables = core.getInput('environment-variables', { required: false });
    const ssmParamPathPattern = core.getInput('ssm-param-path-pattern', { required: false })

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

    if (ssmParamPathPattern) {
      const params = await loadParams(ssmParamPathPattern)
  
      const paramsByType = params.reduce((currentMap, ssmParam) => {
        switch (ssmParam.Type) {
          case 'String': return { ...currentMap, environment: [...currentMap.environment, ssmParam] }
          case 'SecureString': return { ...currentMap, secrets: [...currentMap.secrets, ssmParam] }
        }
      }, { environment: [], secrets: [] })

      containerDef.environment = paramsByType.environment.map(ssmParam => {
        return {
          name: extractParamName(ssmParam),
          value: ssmParam.Value
        }
      })

      containerDef.secrets = paramsByType.secrets.map(ssmParam => {
        return {
          name: extractParamName(ssmParam, ssmParamPathPattern),
          value: ssmParam.ARN
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
