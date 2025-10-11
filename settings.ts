export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApproveWritePermission: boolean;
	autoApproveReadPermission: boolean;
	defaultModel: string;
	debug: boolean;
	obsidianFocussedPrompt: boolean;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApproveWritePermission: false,
	autoApproveReadPermission: true,
	defaultModel: '',
	debug: false,
	obsidianFocussedPrompt: false
};
