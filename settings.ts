export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApprovePermissions: boolean;
	defaultModel: string;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApprovePermissions: false,
	defaultModel: ''
};
