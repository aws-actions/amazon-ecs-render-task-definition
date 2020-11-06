const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');
const mergeWith = require('lodash.mergeWith');

// Customizer for lodash mergeWith
// allows arrays in the original task definition to contain
// values as opposed to only in the mergeFiles (otherwise
// they are overridden)
// https://lodash.com/docs/4.17.15#mergeWith
function customizer(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: false });
    const mergeFile = core.getInput('merge', { required: false });

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
    }
    const taskDefContents = require(taskDefPath);

    // Get containerDef with name `containerName`
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error('Invalid task definition format: containerDefinitions section is not present or is not an array');
    }
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }

    // Check for imageURI
    if(imageURI) {
      // Insert the image URI
      containerDef.image = imageURI;
    }

    // Check for mergeFile
    if (mergeFile) {
      // Parse the merge file
      const mergeFilePath = path.isAbsolute(mergeFile) ?
        mergeFile :
        path.join(process.env.GITHUB_WORKSPACE, mergeFile);
      if (!fs.existsSync(mergeFilePath)) {
        throw new Error(`Merge file does not exist: ${mergeFile}`);
      }
      const mergeContents = require(mergeFilePath);

      // Merge the merge file
      if (!Array.isArray(mergeContents.containerDefinitions)) {
        throw new Error('Invalid merge fragment definition: containerDefinitions section is not present or is not an array');
      }
      const mergeDef = mergeContents.containerDefinitions.find(function(element) {
        return element.name == containerName;
      });
      if (!mergeDef) {
        throw new Error('Invalid merge fragment definition: Could not find container definition with matching name');
      }

      // mergeWith contents
      mergeWith(containerDef, mergeDef, customizer);
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
