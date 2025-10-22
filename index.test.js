const run = require(".");
const core = require("@actions/core");
const tmp = require("tmp");
const fs = require("fs");
const { ECS } = require("@aws-sdk/client-ecs");

jest.mock("@actions/core");
jest.mock("tmp");
jest.mock("fs", () => ({
  promises: {
    access: jest.fn(),
  },
  constants: {
    O_CREATE: jest.fn(),
  },
  rmdirSync: jest.fn(),
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock("@aws-sdk/client-ecs");

const mockEcsDescribeTaskDef = jest.fn();

const config = {
  region: () => Promise.resolve("fake-region"),
};

describe("Render task definition", () => {
  const mockEcsClient = {
    config,
    describeTaskDefinition: mockEcsDescribeTaskDef,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json") // task-definition file
      .mockReturnValueOnce("web") // container-name
      .mockReturnValueOnce("nginx:latest") // image
      .mockReturnValueOnce("FOO=bar\nHELLO=world") // environment-variables
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce(
        // secrets
        "SSM_SECRET=arn:aws:ssm:region:0123456789:parameter/secret\nSM_SECRET=arn:aws:secretsmanager:us-east-1:0123456789:secret:secretName",
      )
      .mockReturnValueOnce(""); // tags

    process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname });
    process.env = Object.assign(process.env, { RUNNER_TEMP: "/home/runner/work/_temp" });

    tmp.fileSync.mockReturnValue({
      name: "new-task-def-file-name",
    });

    fs.existsSync.mockReturnValue(true);

    jest.mock(
      "./task-definition.json",
      () => ({
        family: "task-def-family",
        revision: 10,
        registeredBy: "arn:aws:sts::012345678901:assumed-role/Role/myrole",
        compatibilities: ["EC2", "FARGATE"],
        requiresAttributes: [
          {
            name: "com.amazonaws.ecs.capability.task-iam-role",
          },
        ],
        registeredAt: "1970-01-01T00:00:00.00000+00:00",
        deregisteredAt: "1970-01-01T00:01:00.00000+00:00",

        containerDefinitions: [
          {
            name: "web",
            image: "some-other-image",
            environment: [
              {
                name: "FOO",
                value: "not bar",
              },
              {
                name: "DONT-TOUCH",
                value: "me",
              },
            ],
            environmentFiles: [
              {
                value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                type: "s3",
              },
            ],
            secrets: [
              {
                name: "EXISTING_SECRET",
                valueFrom: "arn:aws:ssm:region:0123456789:parameter/existingSecret",
              },
              {
                name: "SSM_SECRET",
                valueFrom: "arn:aws:ssm:region:0123456789:parameter/oldSsmSecret",
              },
            ],
          },
          {
            name: "sidecar",
            image: "hello",
          },
        ],
        tags: [
          {
            key: "project",
            value: "mytaskdef",
          },
        ],
      }),
      { virtual: true },
    );

    mockEcsDescribeTaskDef.mockImplementation(() =>
      Promise.resolve({
        taskDefinition: {
          taskDefinitionArn: "task-definition-arn",
          family: "task-definition-family",
          revision: 10,
          registeredBy: "arn:aws:sts::012345678901:assumed-role/Role/myrole",
          compatibilities: ["EC2", "FARGATE"],
          requiresAttributes: [
            {
              name: "com.amazonaws.ecs.capability.task-iam-role",
            },
          ],
          registeredAt: "1970-01-01T00:00:00.00000+00:00",
          deregisteredAt: "1970-01-01T00:01:00.00000+00:00",

          containerDefinitions: [
            {
              name: "web",
              image: "some-other-image",
              environment: [
                {
                  name: "FOO",
                  value: "not bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
        },
        tags: [
          {
            key: "project",
            value: "mytaskdef",
          },
        ],
      }),
    );
    ECS.mockImplementation(() => mockEcsClient);
  });

  test("renders the task definition and creates a new task def file", async () => {
    await run();

    expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
      tmpdir: "/home/runner/work/_temp",
      prefix: "task-definition-",
      postfix: ".json",
      keep: true,
      discardDescriptor: true,
    });
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "new-task-def-file-name",
      JSON.stringify(
        {
          family: "task-def-family",
          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environment: [
                {
                  name: "FOO",
                  value: "bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
                {
                  name: "HELLO",
                  value: "world",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              secrets: [
                {
                  name: "EXISTING_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/existingSecret",
                },
                {
                  name: "SSM_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/secret",
                },

                {
                  name: "SM_SECRET",
                  valueFrom: "arn:aws:secretsmanager:us-east-1:0123456789:secret:secretName",
                },
              ],
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
          tags: [
            {
              key: "project",
              value: "mytaskdef",
            },
          ],
        },
        null,
        2,
      ),
    );

    expect(core.setOutput).toHaveBeenNthCalledWith(1, "task-definition", "new-task-def-file-name");
    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
  });

  test("renders a task definition at an absolute path, and with initial environment and secrets empty", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("/hello/task-definition.json") // task-definition
      .mockReturnValueOnce("web") // container-name
      .mockReturnValueOnce("nginx:latest") // image
      .mockReturnValueOnce("EXAMPLE=here") // environment-variables
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    jest.mock(
      "/hello/task-definition.json",
      () => ({
        family: "task-def-family",
        containerDefinitions: [
          {
            name: "web",
            image: "some-other-image",
          },
        ],
      }),
      { virtual: true },
    );

    await run();

    expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
      tmpdir: "/home/runner/work/_temp",
      prefix: "task-definition-",
      postfix: ".json",
      keep: true,
      discardDescriptor: true,
    });
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "new-task-def-file-name",
      JSON.stringify(
        {
          family: "task-def-family",
          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              environment: [
                {
                  name: "EXAMPLE",
                  value: "here",
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
    );
    expect(core.setOutput).toHaveBeenNthCalledWith(1, "task-definition", "new-task-def-file-name");
    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
  });

  test("renders logConfiguration on the task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("FOO=bar\nHELLO=world")
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env")
      .mockReturnValueOnce("awslogs")
      .mockReturnValueOnce(
        `awslogs-create-group=true\nawslogs-group=/ecs/web\nawslogs-region=us-east-1\nawslogs-stream-prefix=ecs`,
      )
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
      tmpdir: "/home/runner/work/_temp",
      prefix: "task-definition-",
      postfix: ".json",
      keep: true,
      discardDescriptor: true,
    });

    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "new-task-def-file-name",
      JSON.stringify(
        {
          family: "task-def-family",
          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environment: [
                {
                  name: "FOO",
                  value: "bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
                {
                  name: "HELLO",
                  value: "world",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              secrets: [
                {
                  name: "EXISTING_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/existingSecret",
                },
                {
                  name: "SSM_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/secret",
                },
                {
                  name: "SM_SECRET",
                  valueFrom: "arn:aws:secretsmanager:us-east-1:0123456789:secret:secretName",
                },
              ],
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-create-group": "true",
                  "awslogs-group": "/ecs/web",
                  "awslogs-region": "us-east-1",
                  "awslogs-stream-prefix": "ecs",
                },
              },
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
          tags: [
            {
              key: "project",
              value: "mytaskdef",
            },
          ],
        },
        null,
        2,
      ),
    );
    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
  });

  test("testing the complete flow of describeTaskDefResponse with log configurations", async () => {
    mockEcsDescribeTaskDef.mockImplementation(() =>
      Promise.resolve({
        taskDefinition: {
          taskDefinitionArn: "task-definition-arn",
          family: "task-definition-family",
          revision: 10,

          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environment: [
                {
                  name: "FOO",
                  value: "bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
                {
                  name: "HELLO",
                  value: "world",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-create-group": "true",
                  "awslogs-group": "/ecs/web",
                  "awslogs-region": "us-east-1",
                  "awslogs-stream-prefix": "ecs",
                },
              },
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
        },
      }),
    );

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
    expect(tmp.fileSync).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test("error returned for malformatted secret string", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("EXAMPLE=here")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("SECRET")
      .mockReturnValueOnce(""); // tags
    await run();

    expect(core.setFailed).toBeCalledWith(expect.stringContaining(`Cannot parse the secret 'SECRET'`));
  });

  test("error returned for invalid secret format", async () => {
    fs.existsSync.mockReturnValue(false);
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("does-not-exist-task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith("Task definition file does not exist: does-not-exist-task-definition.json");
  });

  test("error returned if container-name input is not well formated", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("/hello/task-definition.json")
      .mockReturnValueOnce("web,")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Invalid format for container name. Please use a single value or comma separated values",
    );
  });

  test("error returned for missing task definition file", async () => {
    fs.existsSync.mockReturnValue(false);
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("does-not-exist-task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith("Task definition file does not exist: does-not-exist-task-definition.json");
  });

  test("error thown for missing task definition, task definition arn and task definition family ", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce(0) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Either task definition, task definition arn or task definition family must be provided",
    );
  });

  test("info returned for providing both task definition, task definition arn, and task definition family ", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json") // task definition
      .mockReturnValueOnce("web") // conatiner name
      .mockReturnValueOnce("nginx:latest") // image
      .mockReturnValueOnce("EXAMPLE=here") // environment-variables
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("task-definition-arn") // task definition arn
      .mockReturnValueOnce("task-definition-family") // task definition family
      .mockReturnValueOnce(0) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.info).toBeCalledWith("Task definition file will be used.");
  });

  test("if inputs are task definition family and revision, that specific task definition revision is chosen", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("") // task definition
      .mockReturnValueOnce("") // conatiner name
      .mockReturnValueOnce("") // image
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("") // task definition arn
      .mockReturnValueOnce("task-definition-family") // task definition family
      .mockReturnValueOnce(10) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(1);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "task-definition-family:10",
      include: ["TAGS"],
    });
  });

  test("if the only input is task definition family and no revision, the latest verion for task definition family is provided", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("") // task definition
      .mockReturnValueOnce("") // conatiner name
      .mockReturnValueOnce("") // image
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("") // task definition arn
      .mockReturnValueOnce("task-definition-family") // task definition family
      .mockReturnValueOnce(0) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(1);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "task-definition-family",
      include: ["TAGS"],
    });
    expect(core.info).toBeCalledWith(
      "The latest revision of the task definition family will be used to fetch task definition",
    );
  });

  test("if only arn is provided to fetch task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("") // task definition
      .mockReturnValueOnce("") // conatiner name
      .mockReturnValueOnce("") // image
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("task-definition-arn") // task definition arn
      .mockReturnValueOnce("") // task definition family
      .mockReturnValueOnce(0) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(1);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "task-definition-arn",
      include: ["TAGS"],
    });
    expect(core.info).toBeCalledWith("The task definition arn will be used to fetch task definition");
  });

  test("if file and arn are provided to fetch task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json") // task definition
      .mockReturnValueOnce("web") // conatiner name
      .mockReturnValueOnce("nginx:latest") // image
      .mockReturnValueOnce("EXAMPLE=here") // environment-variables
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("task-definition-arn") // task definition arn
      .mockReturnValueOnce("") // task definition family
      .mockReturnValueOnce(0) //task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
    expect(core.info).toBeCalledWith("Task definition file will be used.");
  });

  test("if file, arn, family and revision are all provided to fetch task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json") // task definition
      .mockReturnValueOnce("web") // conatiner name
      .mockReturnValueOnce("nginx:latest") // image
      .mockReturnValueOnce("EXAMPLE=here") // environment-variables
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("task-definition-arn") //task definition arn
      .mockReturnValueOnce("task-definition-family") //task definition family
      .mockReturnValueOnce(10) //task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(0);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledTimes(0);
    expect(core.info).toBeCalledWith("Task definition file will be used.");
  });

  test("if arn and family are provided to fetch task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("") // task definition
      .mockReturnValueOnce("") // conatiner name
      .mockReturnValueOnce("") // image
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("task-definition-arn") // task definition arn
      .mockReturnValueOnce("task-definition-family") // task definition family
      .mockReturnValueOnce(0) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(mockEcsClient.describeTaskDefinition).toHaveBeenCalledTimes(1);
    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "task-definition-arn",
      include: ["TAGS"],
    });
  });

  test("if only revision is provided to fetch task definition", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("") // task definition
      .mockReturnValueOnce("") // conatiner name
      .mockReturnValueOnce("") // image
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // Docker Labels
      .mockReturnValueOnce("") // Command Options
      .mockReturnValueOnce("") // task definition arn
      .mockReturnValueOnce("") // task definition family
      .mockReturnValueOnce(10) // task definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith(
      "You can't fetch task definition with just revision: Either use task definition file, arn or family name",
    );
  });

  test("renders a task definition with docker labels", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("EXAMPLE=here")
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env")
      .mockReturnValueOnce("awslogs")
      .mockReturnValueOnce(
        "awslogs-create-group=true\nawslogs-group=/ecs/web\nawslogs-region=us-east-1\nawslogs-stream-prefix=ecs",
      )
      .mockReturnValueOnce("key1=value1\nkey2=value2")
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
      tmpdir: "/home/runner/work/_temp",
      prefix: "task-definition-",
      postfix: ".json",
      keep: true,
      discardDescriptor: true,
    });

    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "new-task-def-file-name",
      JSON.stringify(
        {
          family: "task-def-family",
          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environment: [
                {
                  name: "FOO",
                  value: "bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
                {
                  name: "HELLO",
                  value: "world",
                },
                {
                  name: "EXAMPLE",
                  value: "here",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              secrets: [
                {
                  name: "EXISTING_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/existingSecret",
                },
                {
                  name: "SSM_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/secret",
                },
                {
                  name: "SM_SECRET",
                  valueFrom: "arn:aws:secretsmanager:us-east-1:0123456789:secret:secretName",
                },
              ],
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-create-group": "true",
                  "awslogs-group": "/ecs/web",
                  "awslogs-region": "us-east-1",
                  "awslogs-stream-prefix": "ecs",
                },
              },
              dockerLabels: {
                key1: "value1",
                key2: "value2",
              },
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
          tags: [
            {
              key: "project",
              value: "mytaskdef",
            },
          ],
        },
        null,
        2,
      ),
    );
  });

  test("renders a task definition at an absolute path with bad docker labels", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("/hello/task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("EXAMPLE=here")
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env")
      .mockReturnValueOnce("awslogs")
      .mockReturnValueOnce(
        "awslogs-create-group=true\nawslogs-group=/ecs/web\nawslogs-region=us-east-1\nawslogs-stream-prefix=ecs",
      )
      .mockReturnValueOnce("key1=update_value1\nkey2\nkey3=value3")
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    jest.mock(
      "/hello/task-definition.json",
      () => ({
        family: "task-def-family",
        containerDefinitions: [
          {
            name: "web",
            image: "some-other-image",
            dockerLabels: {
              key1: "value1",
              key2: "value2",
            },
          },
        ],
      }),
      { virtual: true },
    );

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Can't parse logConfiguration option key2. Must be in key=value format, one per line",
    );
  });

  test("error returned for non-JSON task definition contents", async () => {
    jest.mock("./non-json-task-definition.json", () => "hello", { virtual: true });

    core.getInput = jest
      .fn()
      .mockReturnValueOnce("non-json-task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Invalid task definition format: containerDefinitions section is not present or is not an array",
    );
  });

  test("error returned for malformed task definition with non-array container definition section", async () => {
    jest.mock(
      "./malformed-task-definition.json",
      () => ({
        family: "task-def-family",
        containerDefinitions: {},
      }),
      { virtual: true },
    );

    core.getInput = jest
      .fn()
      .mockReturnValueOnce("malformed-task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("") // environment-variables
      .mockReturnValueOnce("") // env-files
      .mockReturnValueOnce("") // log Configuration Log Driver
      .mockReturnValueOnce("") // log Configuration Options
      .mockReturnValueOnce("") // docker labels
      .mockReturnValueOnce("") // command
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Invalid task definition format: containerDefinitions section is not present or is not an array",
    );
  });

  test("error returned for task definition without matching container name", async () => {
    jest.mock(
      "./missing-container-task-definition.json",
      () => ({
        family: "task-def-family",
        containerDefinitions: [
          {
            name: "main",
            image: "some-other-image",
          },
        ],
      }),
      { virtual: true },
    );

    core.getInput = jest
      .fn()
      .mockReturnValueOnce("missing-container-task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest");

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Invalid task definition: Could not find container definition with matching name",
    );
  });

  test("renders a task definition with docker command", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("EXAMPLE=here")
      .mockReturnValueOnce("arn:aws:s3:::s3_bucket_name/envfile_object_name.env")
      .mockReturnValueOnce("awslogs")
      .mockReturnValueOnce(
        "awslogs-create-group=true\nawslogs-group=/ecs/web\nawslogs-region=us-east-1\nawslogs-stream-prefix=ecs",
      )
      .mockReturnValueOnce("key1=value1\nkey2=value2")
      .mockReturnValueOnce("npm start --nice --please")
      .mockReturnValueOnce("") // task-definition arn
      .mockReturnValueOnce("") // task-definition family
      .mockReturnValueOnce("") // task-definition revision
      .mockReturnValueOnce("") // secrets
      .mockReturnValueOnce(""); // tags

    await run();

    expect(tmp.fileSync).toHaveBeenNthCalledWith(1, {
      tmpdir: "/home/runner/work/_temp",
      prefix: "task-definition-",
      postfix: ".json",
      keep: true,
      discardDescriptor: true,
    });

    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      "new-task-def-file-name",
      JSON.stringify(
        {
          family: "task-def-family",
          containerDefinitions: [
            {
              name: "web",
              image: "nginx:latest",
              environment: [
                {
                  name: "FOO",
                  value: "bar",
                },
                {
                  name: "DONT-TOUCH",
                  value: "me",
                },
                {
                  name: "HELLO",
                  value: "world",
                },
                {
                  name: "EXAMPLE",
                  value: "here",
                },
              ],
              environmentFiles: [
                {
                  value: "arn:aws:s3:::s3_bucket_name/envfile_object_name.env",
                  type: "s3",
                },
              ],
              secrets: [
                {
                  name: "EXISTING_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/existingSecret",
                },
                {
                  name: "SSM_SECRET",
                  valueFrom: "arn:aws:ssm:region:0123456789:parameter/secret",
                },
                {
                  name: "SM_SECRET",
                  valueFrom: "arn:aws:secretsmanager:us-east-1:0123456789:secret:secretName",
                },
              ],
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-create-group": "true",
                  "awslogs-group": "/ecs/web",
                  "awslogs-region": "us-east-1",
                  "awslogs-stream-prefix": "ecs",
                },
              },
              dockerLabels: {
                key1: "value1",
                key2: "value2",
              },
              command: ["npm", "start", "--nice", "--please"],
            },
            {
              name: "sidecar",
              image: "hello",
            },
          ],
          tags: [
            {
              key: "project",
              value: "mytaskdef",
            },
          ],
        },
        null,
        2,
      ),
    );
  });

  test("renders a task definition with tags from input", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("Environment=production\nManagedBy=GitHubActions");

    await run();

    const writtenContent = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(writtenContent.tags).toContainEqual({
      key: "project",
      value: "mytaskdef",
    });
    expect(writtenContent.tags).toContainEqual({
      key: "Environment",
      value: "production",
    });
    expect(writtenContent.tags).toContainEqual({
      key: "ManagedBy",
      value: "GitHubActions",
    });
  });

  test("renders a task definition with tags from ARN and merges with input tags", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("arn:aws:ecs:us-east-1:123456789012:task-definition/my-task:1")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("project=updated-project\nTeam=DevOps");

    await run();

    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "arn:aws:ecs:us-east-1:123456789012:task-definition/my-task:1",
      include: ["TAGS"],
    });

    const writtenContent = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(writtenContent.tags).toEqual([
      {
        key: "project",
        value: "updated-project",
      },
      {
        key: "Team",
        value: "DevOps",
      },
    ]);
  });

  test("renders a task definition from ARN with existing tags preserved", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("arn:aws:ecs:us-east-1:123456789012:task-definition/my-task:1")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("");

    await run();

    expect(mockEcsDescribeTaskDef).toHaveBeenCalledWith({
      taskDefinition: "arn:aws:ecs:us-east-1:123456789012:task-definition/my-task:1",
      include: ["TAGS"],
    });

    const writtenContent = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(writtenContent.tags).toEqual([
      {
        key: "project",
        value: "mytaskdef",
      },
    ]);
  });

  test("error returned for malformed tag string", async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce("task-definition.json")
      .mockReturnValueOnce("web")
      .mockReturnValueOnce("nginx:latest")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("InvalidTag");

    await run();

    expect(core.setFailed).toBeCalledWith(
      "Cannot parse the tag 'InvalidTag'. Tag pairs must be of the form KEY=value.",
    );
  });
});
