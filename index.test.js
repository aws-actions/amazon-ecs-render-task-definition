const run = require('.');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

jest.mock('@actions/core');
jest.mock('tmp');
jest.mock('fs');

describe('Render task definition', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('web')                  // container-name
            .mockReturnValueOnce('nginx:latest');        // image

        process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname });
        process.env = Object.assign(process.env, { RUNNER_TEMP: '/tmp' });

        tmp.fileSync.mockReturnValue({
            name: 'new-task-def-file-name'
        });

        fs.existsSync.mockReturnValue(true);

        jest.mock('./task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image"
                },
                {
                    name: "sidecar",
                    image: "hello"
                }
            ]
        }), { virtual: true });
    });

    test('renders the task definition and creates a new task def file', async () => {
        await run();
        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
            dir: '/tmp',
            prefix: 'task-definition-',
            postfix: '.json',
            keep: true,
            discardDescriptor: true
          });
        expect(fs.writeFileSync).toHaveBeenNthCalledWith(1, 'new-task-def-file-name',
            JSON.stringify({
                family: 'task-def-family',
                containerDefinitions: [
                    {
                        name: "web",
                        image: "nginx:latest"
                    },
                    {
                        name: "sidecar",
                        image: "hello"
                    }
                ]
            }, null, 2)
        );
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition', 'new-task-def-file-name');
    });

    test('renders a task definition at an absolute path', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('/hello/task-definition.json') // task-definition
            .mockReturnValueOnce('web')                  // container-name
            .mockReturnValueOnce('nginx:latest');        // image
        jest.mock('/hello/task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image"
                }
            ]
        }), { virtual: true });

        await run();

        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
            dir: '/tmp',
            prefix: 'task-definition-',
            postfix: '.json',
            keep: true,
            discardDescriptor: true
          });
        expect(fs.writeFileSync).toHaveBeenNthCalledWith(1, 'new-task-def-file-name',
            JSON.stringify({
                family: 'task-def-family',
                containerDefinitions: [
                    {
                        name: "web",
                        image: "nginx:latest"
                    }
                ]
            }, null, 2)
        );
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition', 'new-task-def-file-name');
    });

    test('error returned for missing task definition file', async () => {
        fs.existsSync.mockReturnValue(false);
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('does-not-exist-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest');

        await run();

        expect(core.setFailed).toBeCalledWith('Task definition file does not exist: does-not-exist-task-definition.json');
    });

    test('error returned for non-JSON task definition contents', async () => {
        jest.mock('./non-json-task-definition.json', () => ("hello"), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('non-json-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest');

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition format: containerDefinitions section is not present or is not an array');
    });

    test('error returned for malformed task definition with non-array container definition section', async () => {
        jest.mock('./malformed-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: {}
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('malformed-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest');

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition format: containerDefinitions section is not present or is not an array');
    });

    test('error returned for task definition without matching container name', async () => {
        jest.mock('./missing-container-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "main",
                    image: "some-other-image"
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('missing-container-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest');

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition: Could not find container definition with matching name');
    });

    test('renders environments variables', async () => {
        jest.mock(
          './task-definition-with-env.json',
          () => ({
            family: 'task-def-family',
            containerDefinitions: [
              {
                name: 'web',
                image: 'expect-image',
                environment: []
              }
            ]
          }),
          { virtual: true }
        );

         core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition-with-env.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('expect-image')
            .mockReturnValueOnce([
                {
                    name: 'secret',
                    value: 'expect-value-2'
                }
            ]);

        await run();

        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
          dir: '/tmp',
          prefix: 'task-definition-',
          postfix: '.json',
          keep: true,
          discardDescriptor: true
        });

        expect(fs.writeFileSync).toHaveBeenNthCalledWith(
          1,
          'new-task-def-file-name',
          JSON.stringify(
            {
              family: 'task-def-family',
              containerDefinitions: [
                {
                  name: 'web',
                  image: 'expect-image',
                  environment: [
                    {
                      name: 'secret',
                      value: 'expect-value-2'
                    }
                  ]
                }
              ]
            },
            null,
            2
          )
        );
    });

    test('error returned for task definition without environment section', async () => {
      jest.mock(
        './task-definition-without-env.json',
        () => ({
          family: 'task-def-family',
          containerDefinitions: [
            {
              name: 'web',
              image: 'expect-image',
            }
          ]
        }),
        { virtual: true }
      );

      core.getInput = jest
        .fn()
        .mockReturnValueOnce('task-definition-without-env.json')
        .mockReturnValueOnce('web')
        .mockReturnValueOnce('expect-image')
        .mockReturnValueOnce([
          {
            name: 'secret',
            value: 'expect-value-2'
          }
        ]);

      await run();

      expect(core.setFailed).toBeCalledWith('Invalid task definition format: environment section is not present or is not an array');
    });

    test('error returned for non-array input envs', async () => {
      jest.mock(
        './task-definition-non-array-input.json',
        () => ({
          family: 'task-def-family',
          containerDefinitions: [
            {
              name: 'web',
              image: 'expect-image',
              environment: []
            }
          ]
        }),
        { virtual: true }
      );

      core.getInput = jest
        .fn()
        .mockReturnValueOnce('task-definition-non-array-input.json')
        .mockReturnValueOnce('web')
        .mockReturnValueOnce('expect-image')
        .mockReturnValueOnce({
            name: 'my',
            value: 'secret'
        });

      await run();

      expect(core.setFailed).toBeCalledWith('Invalid input format: environments section is not an array');
    });

    test('error returned for invalid input envs', async () => {
      jest.mock(
        './task-definition-invalid-input.json',
        () => ({
          family: 'task-def-family',
          containerDefinitions: [
            {
              name: 'web',
              image: 'expect-image',
              environment: []
            }
          ]
        }),
        { virtual: true }
      );

      core.getInput = jest
				.fn()
				.mockReturnValueOnce('task-definition-invalid-input.json')
				.mockReturnValueOnce('web')
				.mockReturnValueOnce('expect-image')
				.mockReturnValueOnce([
					{
                        notname: 'my',
						notvalue: 'secret'
					}
				]);

      await run();

      expect(core.setFailed).toBeCalledWith('Invalid input format: each environment must have name and value args');
    });
});
