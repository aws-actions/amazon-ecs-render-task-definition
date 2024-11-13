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
            .mockReturnValueOnce('task-def-family-modified') // family
            .mockReturnValueOnce('2048')                  // cpu
            .mockReturnValueOnce('4096')                  // memory
            .mockReturnValueOnce('arn:aws:iam::xxxxxxxxxxxx:role/new') // executionRoleArn
            .mockReturnValueOnce('arn:aws:iam::xxxxxxxxxxxx:role/new') // taskRoleArn
            .mockReturnValueOnce('mobile')             // container-name
            .mockReturnValueOnce('true')                  // overwrite-container-name
            .mockReturnValueOnce('nginx:latest')         // image
            .mockReturnValueOnce('80')         // container-port
            .mockReturnValueOnce('80')         // host-port
            .mockReturnValueOnce('gunicorn api:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:80 --workers=8 --timeout=300')         // command
            .mockReturnValueOnce('/ecs/new')         // awslogs-group
            .mockReturnValueOnce('us-west-1')         // awslogs-region
            .mockReturnValueOnce('/hello/env_one.json|/hello/env_two.json')        // aws-env-file
            .mockReturnValueOnce("true")        // prefer-task-definition-environment-variables
            .mockReturnValueOnce('FOO=bar\nHELLO=world') // environment-variables
            .mockReturnValueOnce('FOO=bar\nHELLO=world'); // environment-secrets

        process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname });
        process.env = Object.assign(process.env, { RUNNER_TEMP: '/home/runner/work/_temp' });

        tmp.fileSync.mockReturnValue({
            name: 'new-task-def-file-name'
        });

        fs.existsSync.mockReturnValue(true);

        jest.mock('./task-definition.json', () => ({
            family: 'task-def-family',
            cpu: "1024",
            memory: "2048",
            executionRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/old",
            taskRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/old",
            containerDefinitions: [
                {
                    name: "placeholder_container_name",
                    image: "some-other-image",
                    portMappings: [],
                    command: [],
                    logConfiguration: {
                        logDriver: "awslogs",
                        options: {
                            "awslogs-group": "/ecs/old",
                            "awslogs-region": "us-west-2",
                            "awslogs-stream-prefix": "ecs",
                            "awslogs-create-group": "true"
                        }
                    },
                    environment: [
                        {
                            name: "environment_var_1",
                            value: "environment_var_1_value"
                        },
                        {
                            name: "environment_var_2",
                            value: "environment_var_2_old_value"
                        },
                        {
                            name: "FOO",
                            value: "not bar"
                        },
                        {
                            name: "DONT-TOUCH",
                            value: "me"
                        }
                    ],
                    secrets: [
                        {
                            name: "environment_secret_1",
                            valueFrom: "environment_secret_1_value"
                        },
                        {
                            name: "environment_secret_2",
                            valueFrom: "environment_secret_2_old_value"
                        },
                        {
                            name: "FOO",
                            valueFrom: "not bar"
                        },
                        {
                            name: "DONT-TOUCH",
                            valueFrom: "me"
                        }
                    ]
                },
                {
                    name: "sidecar",
                    image: "hello"
                }
            ]
        }), { virtual: true });
        jest.mock('/hello/env_one.json', () => ({
            environment: [
                {
                    name: "environment_var_1",
                    value: "environment_var_1_value_file"
                }
            ],
            secrets: [
                {
                    name: "environment_secret_1",
                    valueFrom: "environment_secret_1_value"
                }
            ],
        }), { virtual: true });
        jest.mock('/hello/env_two.json', () => ({
            environment: [
                {
                    name: "environment_var_2",
                    value: "environment_var_2_value_file"
                }
            ],
            secrets: [
                {
                    name: "environment_secret_2",
                    valueFrom: "environment_secret_2_value"
                }
            ],
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
                family: 'task-def-family-modified',
                cpu: "2048",
                memory: "4096",
                executionRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/new",
                taskRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/new",
                containerDefinitions: [
                    {
                        name: "mobile",
                        image: "nginx:latest",
                        portMappings: [
                            {
                                "containerPort": "80",
                                "hostPort": "80",
                                "protocol": "tcp"
                            }
                        ],
                        command: [
                            "gunicorn", 
                            "api:app", 
                            "--worker-class", 
                            "uvicorn.workers.UvicornWorker", 
                            "--bind", "0.0.0.0:80", 
                            "--workers=8",
                            "--timeout=300"
                        ],
                        logConfiguration: {
                            logDriver: "awslogs",
                            options: {
                                "awslogs-group": "/ecs/new",
                                "awslogs-region": "us-west-1",
                                "awslogs-stream-prefix": "ecs",
                                "awslogs-create-group": "true"
                            }
                        },
                        environment: [
                            {
                                name: "environment_var_1",
                                value: "environment_var_1_value"
                            },
                            {
                                name: "environment_var_2",
                                value: "environment_var_2_old_value"
                            },
                            {
                                name: "FOO",
                                value: "bar"
                            },
                            {
                                name: "DONT-TOUCH",
                                value: "me"
                            },
                            {
                                name: "HELLO",
                                value: "world"
                            }
                        ],
                        secrets: [
                            {
                                name: "environment_secret_1",
                                valueFrom: "environment_secret_1_value"
                            },
                            {
                                name: "environment_secret_2",
                                valueFrom: "environment_secret_2_old_value"
                            },
                            {
                                name: "FOO",
                                valueFrom: "bar"
                            },
                            {
                                name: "DONT-TOUCH",
                                valueFrom: "me"
                            },
                            {
                                name: "HELLO",
                                valueFrom: "world"
                            }
                        ]
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

    test('renders a task definition at an absolute path, and with initial environment empty', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('/hello/task-definition.json') // task-definition
            .mockReturnValueOnce('task-def-family') // family
            .mockReturnValueOnce('2048')                  // cpu
            .mockReturnValueOnce('4096')                  // memory
            .mockReturnValueOnce('arn:aws:iam::xxxxxxxxxxxx:role/new') // executionRoleArn
            .mockReturnValueOnce('arn:aws:iam::xxxxxxxxxxxx:role/new') // taskRoleArn
            .mockReturnValueOnce('mobile')                  // container-name
            .mockReturnValueOnce('true')                  // overwrite-container-name
            .mockReturnValueOnce('nginx:latest')         // image
            .mockReturnValueOnce('80')         // container-port
            .mockReturnValueOnce('80')         // host-port
            .mockReturnValueOnce('gunicorn api:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:80 --workers=8 --timeout=300')         // command
            .mockReturnValueOnce('/ecs/new')         // awslogs-group
            .mockReturnValueOnce('us-west-1')         // awslogs-region
            .mockReturnValueOnce('/hello/env_one.json|/hello/env_three.json')        // aws-env-files
            .mockReturnValueOnce('')        // prefer-task-definition-environment-variables
            .mockReturnValueOnce('EXAMPLE=here')        // environment-variables
            .mockReturnValueOnce('EXAMPLE=here');        // environment-secrets
        jest.mock('/hello/task-definition.json', () => ({
            family: 'task-def-family',
            containerDefinitions: [
                {
                    name: "placeholder_container_name",
                    image: "some-other-image"
                }
            ]
        }), { virtual: true });
        jest.mock('/hello/env_one.json', () => ({
            environment: [
                {
                    name: "environment_var_1",
                    value: "environment_var_1_value"
                },
                {
                    name: "EXAMPLE",
                    value: "version_1"
                }
            ],
            secrets: [
                {
                    name: "environment_secret_1",
                    valueFrom: "environment_secret_1_value"
                },
                {
                    name: "EXAMPLE",
                    valueFrom: "version_1"
                }
            ],
        }), { virtual: true });
        jest.mock('/hello/env_three.json', () => ({
            environment: [
                {
                    name: "environment_var_1",
                    value: "environment_var_2_value"
                },
                {
                    name: "EXAMPLE",
                    value: "version_2"
                }
            ],
            secrets: [
                {
                    name: "environment_secret_1",
                    valueFrom: "environment_secret_2_value"
                },
                {
                    name: "EXAMPLE",
                    valueFrom: "version_2"
                }
            ],
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
                        name: "mobile",
                        image: "nginx:latest",
                        portMappings: [
                            {
                                "containerPort": "80",
                                "hostPort": "80",
                                "protocol": "tcp"
                            }
                        ],
                        command: [
                            "gunicorn", 
                            "api:app", 
                            "--worker-class", 
                            "uvicorn.workers.UvicornWorker", 
                            "--bind", "0.0.0.0:80", 
                            "--workers=8",
                            "--timeout=300"
                        ],
                        environment: [
                            {
                                name: "environment_var_1",
                                value: "environment_var_2_value"
                            },
                            {
                                name: "EXAMPLE",
                                value: "here"
                            }
                        ],
                        secrets: [
                            {
                                name: "environment_secret_1",
                                valueFrom: "environment_secret_2_value"
                            },
                            {
                                name: "EXAMPLE",
                                valueFrom: "here"
                            }
                        ]
                    }
                ],
                cpu: "2048",
                memory: "4096",
                executionRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/new",
                taskRoleArn: "arn:aws:iam::xxxxxxxxxxxx:role/new",
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
});
