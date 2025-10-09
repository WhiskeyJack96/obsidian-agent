export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApprovePermissions: boolean;
	autoApproveReadPermission: boolean;
	defaultModel: string;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApprovePermissions: false,
	autoApproveReadPermission: true,
	defaultModel: ''
};
