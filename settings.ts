export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApproveWritePermission: boolean;
	autoApproveReadPermission: boolean;
	debug: boolean;
	obsidianFocussedPrompt: boolean;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApproveWritePermission: false,
	autoApproveReadPermission: true,
	debug: false,
	obsidianFocussedPrompt: false
};
