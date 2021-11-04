import { mocked } from "ts-jest/dist/utils/testing";
import VercelEnvVariabler, { VALID_TARGETS } from "./VercelEnvVariabler";
import { listEnvVariables, patchEnvVariable, postEnvVariable } from "./vercel";
import { AxiosResponse } from "axios";
import {
    ENV_2_VARIABLE_ID,
    ENV_3_VARIABLE_ID,
    DATABASE_URL_VARIABLE_ID,
    mockEnvVariablesResponse,
    mockEnvVariableForGitBranchResponse,
} from "./envVariableFixtures";

jest.mock("./vercel.ts", () => {
    const actualModule = jest.requireActual("./vercel.ts");
    return {
        ...jest.genMockFromModule<typeof actualModule>("./vercel.ts"),
        VercelEnvVariableTarget: actualModule.VercelEnvVariableTarget,
    };
});

describe("VercelEnvVariabler", () => {
    const newEnv2Value = "NEW_ENV_2_VALUE";
    const newEnv3Value = "NEW_ENV_3_VALUE";
    const newEnv4Value = "NEW_ENV_4_VALUE";
    beforeAll(() => {
        process.env.ENV_1 = "ENV_1_VALUE";
        process.env.TARGET_ENV_1 = "production,preview,development";
        process.env.TYPE_ENV_1 = "encrypted";

        process.env.ENV_2 = newEnv2Value;
        process.env.TARGET_ENV_2 = "production,preview,development";
        process.env.TYPE_ENV_2 = "encrypted";

        process.env.ENV_3 = newEnv3Value;
        process.env.TARGET_ENV_3 = "production";
        process.env.TYPE_ENV_3 = "encrypted";

        process.env.ENV_4 = newEnv4Value;
        process.env.TARGET_ENV_4 = "production,preview,development";
        process.env.TYPE_ENV_4 = "plain";

        mocked(listEnvVariables).mockResolvedValue({
            data: { envs: mockEnvVariablesResponse },
        } as AxiosResponse);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const testToken = "1234";
    const testProjectName = "test-vercel-project";
    const testAllEnvKeys = "ENV_1,ENV_2,ENV_3,ENV_4";
    const testTeamId = "team_1234";

    it("Should create DATABASE_URL for preview environment and associated gitBranch", async () => {
        const testGitBranch = "brantchoate/somebranch";
        process.env.DATABASE_URL = "mysql://1234";
        process.env.TARGET_DATABASE_URL = "preview";
        process.env.TYPE_DATABASE_URL = "encrypted";
        process.env.GIT_BRANCH_DATABASE_URL = testGitBranch;

        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "DATABASE_URL",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            expect.objectContaining({
                value: expect.anything(),
                target: ["preview"],
                type: expect.anything(),
                gitBranch: testGitBranch,
            })
        );
        expect(mocked(patchEnvVariable)).not.toHaveBeenCalled();
    });

    it("Should build an instance of the class", () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            testAllEnvKeys,
            testTeamId
        );

        expect(variabler).toBeInstanceOf(VercelEnvVariabler);
    });

    it("Should call for env variables", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            testAllEnvKeys,
            testTeamId
        );

        await variabler.populateExistingEnvVariables();

        expect(mocked(listEnvVariables)).toHaveBeenCalledTimes(1);
        expect(mocked(listEnvVariables)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName
        );
    });

    it("Should determine no changes for ENV_1", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "ENV_1",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).not.toHaveBeenCalled();
        expect(mocked(patchEnvVariable)).not.toHaveBeenCalled();
    });

    it("Should change everything for ENV_2", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "ENV_2",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).not.toHaveBeenCalled();
        expect(mocked(patchEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            ENV_2_VARIABLE_ID,
            expect.objectContaining({
                value: newEnv2Value,
                target: VALID_TARGETS,
                type: "encrypted",
            })
        );
    });

    it("Should only change value for ENV_3", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "ENV_3",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).not.toHaveBeenCalled();
        expect(mocked(patchEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            ENV_3_VARIABLE_ID,
            expect.objectContaining({
                value: newEnv3Value,
                target: ["production"],
                type: "encrypted",
            })
        );
    });

    it("Should create ENV_4", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "ENV_4",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            expect.objectContaining({
                value: newEnv4Value,
                target: VALID_TARGETS,
                type: "plain",
            })
        );
        expect(mocked(patchEnvVariable)).not.toHaveBeenCalled();
    });

    it("Should make all the changes needed when all env variables present", async () => {
        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            testAllEnvKeys,
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).toHaveBeenCalledTimes(1);
        expect(mocked(patchEnvVariable)).toHaveBeenCalledTimes(2);
    });
    it("Should create DATABASE_URL for preview environment and associated gitBranch when DATABASE_URL already exists for other gitBranch", async () => {
        mocked(listEnvVariables).mockResolvedValue({
            data: { envs: mockEnvVariableForGitBranchResponse },
        } as AxiosResponse);
        const testGitBranch = "danconger/someotherbranch";
        process.env.DATABASE_URL = "mysql://5678";
        process.env.TARGET_DATABASE_URL = "preview";
        process.env.TYPE_DATABASE_URL = "encrypted";
        process.env.GIT_BRANCH_DATABASE_URL = testGitBranch;

        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "DATABASE_URL",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            expect.objectContaining({
                value: expect.anything(),
                target: ["preview"],
                type: expect.anything(),
                gitBranch: testGitBranch,
            })
        );
        expect(mocked(patchEnvVariable)).not.toHaveBeenCalled();
    });
    it("Should not make call to vercel for env var when DATABASE_URL already exists for same gitBranch and env var has not changed", async () => {
        mocked(listEnvVariables).mockResolvedValue({
            data: { envs: mockEnvVariableForGitBranchResponse },
        } as AxiosResponse);
        const testGitBranch = "brantchoate/somebranch";
        process.env.DATABASE_URL = "mysql://1234";
        process.env.TARGET_DATABASE_URL = "preview";
        process.env.TYPE_DATABASE_URL = "encrypted";
        process.env.GIT_BRANCH_DATABASE_URL = testGitBranch;

        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "DATABASE_URL",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).not.toHaveBeenCalled();
        expect(mocked(patchEnvVariable)).not.toHaveBeenCalled();
    });
    xit("Should update env var when DATABASE_URL already exists for same gitBranch and new DATABASE_URL has changed", async () => {
        mocked(listEnvVariables).mockResolvedValue({
            data: { envs: mockEnvVariableForGitBranchResponse },
        } as AxiosResponse);
        const testGitBranch = "brantchoate/somebranch";
        process.env.DATABASE_URL = "mysql://notsameasexisting";
        process.env.TARGET_DATABASE_URL = "preview";
        process.env.TYPE_DATABASE_URL = "encrypted";
        process.env.GIT_BRANCH_DATABASE_URL = testGitBranch;

        const variabler = new VercelEnvVariabler(
            testToken,
            testProjectName,
            "DATABASE_URL",
            testTeamId
        );

        await variabler.populateExistingEnvVariables();
        await variabler.processEnvVariables();

        expect(mocked(postEnvVariable)).not.toHaveBeenCalled();
        expect(mocked(patchEnvVariable)).toHaveBeenCalledWith(
            expect.anything(),
            testProjectName,
            DATABASE_URL_VARIABLE_ID,
            expect.objectContaining({
                value: expect.anything(),
                target: ["preview"],
                type: expect.anything(),
                gitBranch: testGitBranch,
            })
        );
    });
    describe("populateExistingEnvVariables", () => {
        it("Should format correctly", async () => {
            mocked(listEnvVariables).mockResolvedValue({
                data: {
                    envs: [
                        {
                            type: "encrypted",
                            value: "mysql://1234",
                            target: ["preview"],
                            configurationId: null,
                            gitBranch: "dan/checkly",
                            id: "eXfcJVWXeJmLXyQ0",
                            key: "DATABASE_URL",
                            createdAt: 1636050171459,
                            updatedAt: 1636050171459,
                            createdBy: "WymTgfYdY5koDeVWUOXMl2z0",
                            updatedBy: null,
                        },
                        {
                            type: "encrypted",
                            value: "mysql://5678",
                            target: ["preview"],
                            configurationId: null,
                            gitBranch:
                                "brant/rem-380-handle-dynamic-brand-color",
                            id: "9U39h7zxK9Amm0tu",
                            key: "DATABASE_URL",
                            createdAt: 1636045618623,
                            updatedAt: 1636045618623,
                            createdBy: "WymTgfYdY5koDeVWUOXMl2z0",
                            updatedBy: null,
                        },
                    ],
                },
            } as AxiosResponse);
            const variabler = new VercelEnvVariabler(
                testToken,
                testProjectName,
                testAllEnvKeys,
                testTeamId
            );

            await variabler.populateExistingEnvVariables();
            expect(
                variabler.existingEnvVariables["preview"]["DATABASE_URL"]
            ).toHaveLength(2);
        });
    });
});
