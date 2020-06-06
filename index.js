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
        process.env = Object.assign(process.env, { RUNNER_TEMP: '/home/runner/work/_temp' });

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
            tmpdir: '/home/runner/work/_temp',
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
            tmpdir: '/home/runner/work/_temp',
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

    // Secrets section

    test('error returned for malformed task definition with missing secrets section', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition format: secrets section must be an array');
    });

    test('error returned for missing AWS account ID if secrets is turned on', async () => {
        jest.mock('./correct-secrets-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image",
                    secrets: [
                        {
                            name: "SomeEnvironmentVarName",
                            valueFrom: "ssm:/qwop/blah"
                        },
                        {
                            name: "Yoomzzzzzz",
                            valueFrom: "ssm:/qwerty/qwerty"
                        }
                    ]
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('correct-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-2')

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid GitHub action input: You must specify the region name and the account ID');
    });

    test('error returned for missing region name if secrets is turned on', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('correct-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce(1234)

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid GitHub action input: You must specify the region name and the account ID');
    });

    // Testing valueFrom format
    test('error returned for incorrect valueFrom prefix in secrets section', async () => {
        jest.mock('./incorrect-valueFrom-prefix-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image",
                    secrets: [
                        {
                            name: "someEnvironName",
                            valueFrom: "randomService:/asd/asd"
                        }
                    ]
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('incorrect-valueFrom-prefix-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(12345);

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition: valueFrom must have prefix ssm or secretsmanager, not randomService');
    });

    test('error returned for incorrect valueFrom format in secrets section', async () => {
        jest.mock('./incorrect-valueFrom-format-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image",
                    secrets: [
                        {
                            name: "someEnvironName",
                            valueFrom: "randomService"
                        },
                        {
                            name: "someEnvironName",
                            valueFrom: "randomService"
                        }
                    ]
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('incorrect-valueFrom-format-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition: valueFrom format must be in the form of <service>:<path of variable>. Errored: randomService');
    });

    test('insert / at beginning of parameter path if / is not there', async () => {
        jest.mock('./missing-beginning-slash-param-path-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image",
                    secrets: [
                        {
                            name: "someEnvironName",
                            valueFrom: "ssm:asd/asd"
                        }
                    ]
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('missing-beginning-slash-param-path-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
            tmpdir: '/home/runner/work/_temp',
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
                        image: "nginx:latest",
                        secrets: [
                            {
                                name: "someEnvironName",
                                valueFrom: 'arn:aws:ssm:us-east-2:1234:parameter/asd/asd'
                            }
                        ]
                    }
                ],
                executionRoleArn: 'arn:aws:iam::1234:role/ecsTaskExecutionRole'
            }, null, 2)
        );
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition', 'new-task-def-file-name');
    });

    // Testing external secrets file insertion
    test('insert external secrets file into secrets', async () => {
        jest.mock('./two-external-secrets.json', () => ({
            secrets: [
                {
                    "name": "external1",
                    "valueFrom": "ssm:blah"
                },
                {
                    "name": "external2",
                    "valueFrom": "ssm:blah2"
                }
            ]
        }), { virtual: true });

        jest.mock('./empty-secrets-array-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image"
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('empty-secrets-array-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('two-external-secrets.json')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
            tmpdir: '/home/runner/work/_temp',
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
                        image: "nginx:latest",
                        secrets: [
                            {
                                name: "external1",
                                valueFrom: "arn:aws:ssm:us-east-2:1234:parameter/blah"
                            },
                            {
                                name: "external2",
                                valueFrom: "arn:aws:ssm:us-east-2:1234:parameter/blah2"
                            }
                        ]
                    }
                ],
                executionRoleArn: 'arn:aws:iam::1234:role/ecsTaskExecutionRole'
            }, null, 2)
        );
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition', 'new-task-def-file-name');
    });

    test('insert external secrets file into secrets which already has secrets in task definition', async () => {
        // Makes sure the secrets are combined.
        jest.mock('./three-external-secrets.json', () => ({
            secrets: [
                {
                    "name": "external1",
                    "valueFrom": "ssm:blah"
                },
                {
                    "name": "external2",
                    "valueFrom": "secretsmanager:/blah2"
                },
                {
                    "name": "external3",
                    "valueFrom": "secretsmanager:/blah/blah"
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('correct-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('three-external-secrets.json')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
            tmpdir: '/home/runner/work/_temp',
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
                        image: "nginx:latest",
                        secrets: [
                            {
                                name: "SomeEnvironmentVarName",
                                valueFrom: "arn:aws:ssm:us-east-2:1234:parameter/qwop/blah"
                            },
                            {
                                name: "Yoomzzzzzz",
                                valueFrom: "arn:aws:ssm:us-east-2:1234:parameter/qwerty/qwerty"
                            },
                            {
                                name: "external1",
                                valueFrom: "arn:aws:ssm:us-east-2:1234:parameter/blah"
                            },
                            {
                                name: "external2",
                                valueFrom: "arn:aws:secretsmanager:us-east-2:1234:secret/blah2"
                            },
                            {
                                name: "external3",
                                valueFrom: "arn:aws:secretsmanager:us-east-2:1234:secret/blah/blah"
                            }
                        ]
                    }
                ],
                executionRoleArn: 'arn:aws:iam::1234:role/ecsTaskExecutionRole'
            }, null, 2)
        );
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition', 'new-task-def-file-name');
    });

    test('error returned for non-array secrets section', async () => {
        jest.mock('./non-array-secrets-task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "web",
                    image: "some-other-image",
                    secrets: {
                        name: "SomeEnvironmentVarName",
                        valueFrom: "ssm:/qwop/blah"
                    }
                }
            ]
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('non-array-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('three-external-secrets.json')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValue('1234')

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid task definition format: secrets section must be an array');
    });

    test('error returned for invalid external secrets json file format', async () => {
        jest.mock('./invalid-external-secrets-file.json', () => ({
            secrets: {
                "name": "external1",
                "valueFrom": "ssm:blah"
            }
        }), { virtual: true });

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('correct-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('invalid-external-secrets-file.json')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(core.setFailed).toBeCalledWith('Invalid external secrets file: secrets section must be an array');
    });

    test('error returned for missing external secrets file', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('correct-secrets-task-definition.json')
            .mockReturnValueOnce('web')
            .mockReturnValueOnce('nginx:latest')
            .mockReturnValueOnce('missing-external-secrets-file.json')
            .mockReturnValueOnce('us-east-2')
            .mockReturnValueOnce(1234);

        await run();

        expect(core.setFailed).toBeCalledWith('Secrets file does not exist: missing-external-secrets-file.json');
    });
});
