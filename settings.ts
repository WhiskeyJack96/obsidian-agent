export interface TriggerConfig {
	id: string;
	folder: string;              // Folder path prefix to watch (e.g., "conversations/")
	prompt: string;              // Prompt template with placeholders: {file}, {event}, {content}
	enabled: boolean;
	debounceMs: number;          // Debounce delay in milliseconds (default: 3000)
}

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
	triggers: TriggerConfig[];
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
	triggers: []
};
