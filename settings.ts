export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApproveWritePermission: boolean;
	obsidianFocussedPrompt: boolean;
	enableGitIntegration: boolean;
	enableMCPServer: boolean;
	mcpServerPort: number;
	enableConversationTracking: boolean;
	conversationTrackingFolder: string;
	enableMetadataTriggers: boolean;
	metadataTriggerDebounceMs: number;
}

export const DEFAULT_SETTINGS: ACPClientSettings = {
	agentCommand: '',
	agentArgs: [],
	autoApproveWritePermission: false,
	obsidianFocussedPrompt: false,
	enableGitIntegration: false,
	enableMCPServer: false,
	mcpServerPort: 3100,
	enableConversationTracking: false,
	conversationTrackingFolder: 'conversations/',
	enableMetadataTriggers: true,
	metadataTriggerDebounceMs: 3000
};
