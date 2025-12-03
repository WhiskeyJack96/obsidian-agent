export interface ACPClientSettings {
	agentCommand: string;
	agentArgs: string[];
	autoApproveWritePermission: boolean;
	obsidianFocussedPrompt: boolean;
	enableMCPServer: boolean;
	mcpServerPort: number;
	defaultViewType: 'right-sidebar' | 'left-sidebar' | 'tab' | 'split';
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
	enableMCPServer: false,
	mcpServerPort: 3100,
	defaultViewType: 'right-sidebar',
	enableConversationTracking: false,
	conversationTrackingFolder: 'conversations/',
	enableMetadataTriggers: true,
	metadataTriggerDebounceMs: 3000
};
