import axios, { AxiosInstance } from "axios";
import {
    VercelEnvVariable,
    VercelEnvVariableTarget,
    VercelEnvVariableType,
    listEnvVariables,
    patchEnvVariable,
    postEnvVariable,
} from "./vercel";
import { info } from "@actions/core";

export const VALID_TYPES = ["encrypted", "plain"];

export const VALID_TARGETS: VercelEnvVariableTarget[] = [
    VercelEnvVariableTarget.Production,
    VercelEnvVariableTarget.Preview,
    VercelEnvVariableTarget.Development,
];

export default class VercelEnvVariabler {
    private envVariableKeys = new Array<string>();
    private vercelClient: AxiosInstance;

    private existingEnvVariables: Record<
        VercelEnvVariableTarget,
        Record<string, VercelEnvVariable | VercelEnvVariable[]>
    > = { production: {}, preview: {}, development: {} };

    constructor(
        private token: string,
        private projectName: string,
        envVariableKeysAsString: string,
        private teamId: string | undefined
    ) {
        const envVariableKeys = envVariableKeysAsString?.split(",");

        if (envVariableKeys?.length > 0) {
            this.envVariableKeys = envVariableKeys;
        }

        if (
            !this.token ||
            !this.projectName ||
            this.envVariableKeys.length === 0
        ) {
            throw new Error("Missing required input(s).");
        }

        this.vercelClient = axios.create({
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
            baseURL: "https://api.vercel.com/v8",
            params: {
                teamId: this.teamId,
            },
        });
    }

    public async populateExistingEnvVariables(): Promise<void> {
        const envResponse = await listEnvVariables(
            this.vercelClient,
            this.projectName
        );

        const env = envResponse?.data?.envs;
        if (env) {
            info(`Found ${env.length} existing env variables`);

            for (const existingEnvVariable of env) {
                for (const existingTarget of existingEnvVariable.target) {
                    const preExistingVariablesForTarget = this
                        .existingEnvVariables[existingTarget] ?? [{}];
                    this.existingEnvVariables[existingTarget] = {
                        ...preExistingVariablesForTarget,
                        [existingEnvVariable.key]:
                            existingTarget === "preview"
                                ? [existingEnvVariable]
                                : existingEnvVariable,
                    };
                }
            }
        }
    }

    public async processEnvVariables(): Promise<void> {
        for (const envVariableKey of this.envVariableKeys) {
            await this.processEnvVariable(envVariableKey);
        }
    }

    private async processEnvVariable(envVariableKey: string) {
        info(`Within processEnvVariable: ${envVariableKey}`);
        const parsedResult = this.parseAndValidateEnvVariable(envVariableKey);

        info(`Within parsedResult: ${JSON.stringify(parsedResult)}`);
        if (this.existingEnvVariables) {
            info(
                `this.existingEnvVariables: ${JSON.stringify(
                    this.existingEnvVariables
                )}`
            );
        }

        const { value, targets, type, gitBranch } = parsedResult;

        const existingVariables = targets.reduce(
            (
                result: Record<
                    VercelEnvVariableTarget,
                    VercelEnvVariable | VercelEnvVariable[]
                >,
                target: VercelEnvVariableTarget
            ) => {
                const existingVariable = this.existingEnvVariables?.[target]?.[
                    envVariableKey
                ];

                if (existingVariable) {
                    result[target] = existingVariable;
                }

                return result;
            },
            {} as Record<
                VercelEnvVariableTarget,
                VercelEnvVariable | VercelEnvVariable[]
            >
        );

        info(`ExistingVariables: ${JSON.stringify(envVariableKey)}`);
        const existingTargets = Object.keys(existingVariables);
        if (existingTargets.length === 0) {
            info(`No existing variable found for ${envVariableKey}, creating.`);
            await this.createEnvVariable({
                key: envVariableKey,
                value,
                targets,
                type,
                gitBranch,
            });
        } else if (existingTargets.includes("preview") && gitBranch) {
            const existingVariablesForPreviewEnv = existingVariables[
                "preview"
            ] as VercelEnvVariable[];
            const existingVariablesForEnvVariableKey = existingVariablesForPreviewEnv.find(
                (item: VercelEnvVariable) =>
                    item.key === envVariableKey &&
                    item.gitBranch &&
                    item.gitBranch === gitBranch
            );
            if (existingVariablesForEnvVariableKey) {
                info(
                    `Existing variable found for ${envVariableKey} and git branch ${gitBranch}, comparing values.`
                );
                // await this.processPossibleEnvVariableUpdate({
                //     value,
                //     targets,
                //     type,
                //     existingVariables,
                //     gitBranch,
                // });
            } else {
                await this.createEnvVariable({
                    key: envVariableKey,
                    value,
                    targets,
                    type,
                    gitBranch,
                });
            }
        } else {
            info(
                `Existing variable found for ${envVariableKey}, comparing values.`
            );
            await this.processPossibleEnvVariableUpdate({
                value,
                targets,
                type,
                existingVariables,
                gitBranch,
            });
        }
    }

    private parseAndValidateEnvVariable(
        envVariableKey: string
    ): {
        value: string;
        targets: VercelEnvVariableTarget[];
        type: VercelEnvVariableType;
        gitBranch?: string;
    } {
        const value = process.env[envVariableKey];

        const targetString = process.env[`TARGET_${envVariableKey}`];
        const gitBranch = process.env[`GIT_BRANCH_${envVariableKey}`];

        const type = process.env[
            `TYPE_${envVariableKey}`
        ] as VercelEnvVariableType;

        if (!value) {
            throw new Error(
                `Variable ${envVariableKey} is missing env variable: ${envVariableKey}`
            );
        }
        if (!targetString) {
            throw new Error(
                `Variable ${envVariableKey} is missing env variable: ${`TARGET_${envVariableKey}`}`
            );
        }
        if (!type) {
            throw new Error(
                `Variable ${envVariableKey} is missing env variable: ${`TYPE_${envVariableKey}`}`
            );
        }
        if (gitBranch && targetString !== "preview") {
            throw new Error(
                "You cannot use gitBranch for anything other than preview target environment"
            );
        }
        if (!VALID_TYPES.includes(type)) {
            throw new Error(
                `No valid type found for ${envVariableKey}, type given: ${type}, valid types: ${VALID_TYPES.join(
                    ","
                )}`
            );
        }

        const targets = targetString
            .split(",")
            .filter((target) =>
                VALID_TARGETS.includes(target as VercelEnvVariableTarget)
            ) as VercelEnvVariableTarget[];

        if (targets.length === 0) {
            throw new Error(
                `No valid targets found for ${envVariableKey}, targets given: ${targetString}, valid targets: ${VALID_TARGETS.join(
                    ","
                )}`
            );
        }

        return { value, targets, type, gitBranch };
    }

    private async createEnvVariable({
        type,
        key,
        value,
        targets,
        gitBranch,
    }: {
        key: string;
        value: string;
        targets: VercelEnvVariableTarget[];
        type: VercelEnvVariableType;
        gitBranch?: string;
    }) {
        const createResponse = await postEnvVariable(
            this.vercelClient,
            this.projectName,
            { type, key, value, target: targets, gitBranch }
        );

        if (!createResponse?.data) {
            info(
                `Variable ${key} with targets ${targets.join(
                    ","
                )} created successfully`
            );
        }
    }

    private async processPossibleEnvVariableUpdate({
        type,
        value,
        targets,
        existingVariables,
        gitBranch,
    }: {
        value: string;
        targets: VercelEnvVariableTarget[];
        type: VercelEnvVariableType;
        existingVariables: Record<
            VercelEnvVariableTarget,
            VercelEnvVariable | VercelEnvVariable[]
        >;
        gitBranch?: string;
    }) {
        info(
            `Within processPossibleEnvVariableUpdate value is: ${value} and existingVariables: ${JSON.stringify(
                existingVariables
            )} and gitBranch is: ${gitBranch}`
        );
        const existing = Object.values(existingVariables)[0];
        info(`existing is: ${existing}`);
        const existingVariable = Array.isArray(existing)
            ? existing[0]
            : existing; // They are all actually the same

        info(`existingVariable is: ${existingVariable}`);
        if (
            existingVariable.value !== value ||
            existingVariable.target.length !== targets.length ||
            existingVariable.type !== type
        ) {
            info(
                `Value, target, or type for env variable ${existingVariable.key} has found to have changed, updating value`
            );
            try {
                const patchResponse = await patchEnvVariable(
                    this.vercelClient,
                    this.projectName,
                    existingVariable.id,
                    { type, value, target: targets, gitBranch }
                );
                if (patchResponse?.data) {
                    info(`${existingVariable.key} updated successfully.`);
                } else {
                    info(`${JSON.stringify(patchResponse)}`);
                }
            } catch (err) {
                // @ts-ignore
                info(err.message);
            }
        } else {
            info(`No change found for ${existingVariable.key}, skipping...`);
        }
    }
}
