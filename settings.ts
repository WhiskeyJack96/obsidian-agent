export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApproveWritePermission: boolean;
	autoApproveReadPermission: boolean;
	obsidianFocussedPrompt: boolean;
	enableGitIntegration: boolean;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApproveWritePermission: false,
	autoApproveReadPermission: true,
	obsidianFocussedPrompt: false,
	enableGitIntegration: false
};
