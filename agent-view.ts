import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Component } from 'obsidian';
import { ACPClient } from './acp-client';
import type ACPClientPlugin from './main';
import { AutocompleteManager } from './autocomplete-manager';
import {
	ToolCallCache,
	ToolCallUpdateData,
	ContentBlock,
	AvailableCommand,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionMode,
	SessionModeState,
	SessionUpdate,
	Plan,
} from './types';

export const VIEW_TYPE_AGENT = 'acp-agent-view';

enum ConnectionState {
	NOT_CONNECTED = 'not_connected',
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	SESSION_ACTIVE = 'session_active',
	CONNECTION_FAILED = 'connection_failed',
	DISCONNECTED = 'disconnected'
}

export class AgentView extends ItemView {
	private plugin: ACPClientPlugin;
	private client: ACPClient | null = null;
	private messagesContainer: HTMLElement;
	private inputContainer: HTMLElement;
	private inputField: HTMLTextAreaElement;
	private statusIndicator: HTMLElement;
	private cancelButton: HTMLElement;
	private modeSelector: HTMLSelectElement | null = null;
	private component: Component;
	private autocompleteManager: AutocompleteManager | null = null;
	private connectionState: ConnectionState = ConnectionState.NOT_CONNECTED;

	constructor(leaf: WorkspaceLeaf, plugin: ACPClientPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AGENT;
	}

	getDisplayText(): string {
		return 'ACP Agent';
	}

	getIcon(): string {
		return 'bot';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('acp-agent-view');

		// Initialize component for markdown rendering
		this.component = new Component();
		this.component.load();

		// Create status bar container with status text and new conversation button
		const statusBarContainer = container.createDiv({ cls: 'acp-status-bar-container' });

		this.statusIndicator = statusBarContainer.createDiv({ cls: 'acp-status' });
		this.statusIndicator.setText('Not connected');

		// Create mode selector dropdown
		this.modeSelector = statusBarContainer.createEl('select', {
			cls: 'acp-mode-selector'
		});
		this.modeSelector.disabled = true; // Initially disabled until session is created
		this.modeSelector.addEventListener('change', () => this.handleModeChange());

		const newConversationButton = statusBarContainer.createEl('button', {
			cls: 'acp-new-conversation-button',
			text: 'New Conversation'
		});
		newConversationButton.addEventListener('click', () => this.newConversation());

		this.cancelButton = statusBarContainer.createEl('button', {
			cls: 'acp-cancel-button',
			text: 'Cancel'
		});
		this.cancelButton.style.display = 'none'; // Initially hidden
		this.cancelButton.addEventListener('click', () => this.cancelCurrentTurn());

		// Create messages container
		this.messagesContainer = container.createDiv({ cls: 'acp-messages' });

		// Create input container
		this.inputContainer = container.createDiv({ cls: 'acp-input-container' });

		// Create autocomplete container (positioned absolutely above input)
		const autocompleteContainer = this.inputContainer.createDiv({ cls: 'acp-autocomplete' });
		autocompleteContainer.style.display = 'none';

		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'acp-input',
			attr: {
				placeholder: 'Type your message to the agent... (Enter to send, Shift+Enter for newline)',
				rows: '3'
			}
		});

		// Initialize autocomplete manager
		this.autocompleteManager = new AutocompleteManager(this.app, this.inputField, autocompleteContainer);

		this.inputField.addEventListener('keydown', (e) => {
			// Handle autocomplete keyboard navigation
			if (this.autocompleteManager && this.autocompleteManager.handleKeyDown(e)) {
				e.preventDefault();
				return;
			}

			// Normal Enter behavior (send message)
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Add input event listener for autocomplete
		this.inputField.addEventListener('input', () => {
			if (this.autocompleteManager) {
				this.autocompleteManager.handleInput();
			}
		});

		// Ensure client is initialized when view opens (after all UI elements are created)
		if (!this.client) {
			this.plugin.ensureClientForView(this);
		}
	}

	setClient(client: ACPClient): void {
		this.client = client;
		this.client.setUpdateCallback((update: SessionUpdate) => {
			this.handleUpdate(update);
		});
		// Auto-connect when client is set (but only if not already connected)
		if (this.connectionState === ConnectionState.NOT_CONNECTED) {
			this.connect();
		}
	}

	private updateConnectionState(state: ConnectionState): void {
		this.connectionState = state;
		// Update status text based on state
		const statusText: Record<ConnectionState, string> = {
			[ConnectionState.NOT_CONNECTED]: 'Not connected',
			[ConnectionState.CONNECTING]: 'Connecting...',
			[ConnectionState.CONNECTED]: 'Connected',
			[ConnectionState.SESSION_ACTIVE]: 'Session active',
			[ConnectionState.CONNECTION_FAILED]: 'Connection failed',
			[ConnectionState.DISCONNECTED]: 'Disconnected'
		};
		this.statusIndicator.setText(statusText[state]);
	}

	async connect(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		// Don't connect if already connected or connecting
		if (this.connectionState === ConnectionState.CONNECTING ||
			this.connectionState === ConnectionState.CONNECTED ||
			this.connectionState === ConnectionState.SESSION_ACTIVE) {
			if (this.plugin.settings.debug) {
				console.log('Already connected or connecting, skipping connect()');
			}
			return;
		}

		try {
			this.updateConnectionState(ConnectionState.CONNECTING);
			await this.client.initialize();
			this.updateConnectionState(ConnectionState.CONNECTED);

			await this.client.createSession();
			this.updateConnectionState(ConnectionState.SESSION_ACTIVE);
		} catch (err) {
			this.updateConnectionState(ConnectionState.CONNECTION_FAILED);
			new Notice(`Failed to connect: ${err.message}`);
			console.error('Connection error:', err);
		}
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.cleanup();
			this.updateConnectionState(ConnectionState.DISCONNECTED);
			this.addMessage('system', 'Disconnected from agent.');
		}
	}

	clearMessages(): void {
		this.messagesContainer.empty();
		this.lastAgentMessage = null;
		this.lastAgentMessageText = '';
		this.toolCallElements.clear();
		this.toolCallCache.clear();
		this.commandsMessageElement = null;
		this.pendingMessage = null;

		// Reset mode selector
		if (this.modeSelector) {
			this.modeSelector.empty();
			this.modeSelector.disabled = true;
		}
	}

	async newConversation(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		// Clean up current session
		await this.client.cleanup();
		this.clearMessages();

		// Reset connection state so connect() will proceed
		this.updateConnectionState(ConnectionState.NOT_CONNECTED);

		// Reconnect
		await this.connect();
	}

	async cancelCurrentTurn(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		try {
			await this.client.cancelSession();
			this.removePendingMessage();
			this.addMessage('system', 'Agent turn cancelled.');
		} catch (err) {
			new Notice(`Failed to cancel: ${err.message}`);
			console.error('Cancel error:', err);
		}
	}

	async sendMessage(): Promise<void> {
		const message = this.inputField.value.trim();
		if (!message) {
			return;
		}

		if (!this.client) {
			new Notice('Not connected to agent');
			return;
		}

		this.addMessage('user', message);
		this.inputField.value = '';

		// Show pending message immediately while waiting for agent response
		this.showPendingMessage();

		try {
			await this.client.sendPrompt(message);
		} catch (err) {
			new Notice(`Failed to send message: ${err.message}`);
			console.error('Send error:', err);
			// Remove pending message on error
			this.removePendingMessage();
		}
	}

	handleUpdate(update: SessionUpdate): void {
		// Handle turn completion - remove pending message when agent is done
		if (update.type === 'turn_complete') {
			this.removePendingMessage();
			if (this.plugin.settings.debug) {
				console.log('Agent turn completed:', update.data);
			}
			return;
		}

		// Handle mode changes - update UI
		if (update.type === 'mode_change') {
			this.updateModeSelector(update.data);
			return;
		}

		// Handle permission requests specially
		if (update.type === 'permission_request') {
			this.showPermissionRequest(update.data.params, update.data.resolve);
			return;
		}

		// Handle plan updates (direct plan data)
		if (update.type === 'plan') {
			this.plugin.openPlanView(update.data);
			return;
		}

		// For message and tool_call types, data is SessionNotification
		const data = update.data;

		// Log to console for debugging
		if (this.plugin.settings.debug) {
			console.log('Session update received:', data);
		}

		// Handle different session update types based on ACP spec
		if (data.update) {
			const updateData = data.update;
			const updateType = updateData.sessionUpdate; // Note: it's sessionUpdate, not sessionUpdateType

			if (this.plugin.settings.debug) {
				console.log('Update type:', updateType);
			}

			// Handle agent message chunks (streaming text)
			if (updateType === 'agent_message_chunk' && updateData.content) {
				this.appendToLastAgentMessage(updateData.content);
			}
			// Handle available commands update
			else if (updateType === 'available_commands_update' && updateData.availableCommands) {
				this.showAvailableCommands(updateData.availableCommands);
			}
			// Handle tool call start
			else if (updateType === 'tool_call') {
				this.handleToolCallUpdate(updateData as unknown as ToolCallUpdateData);
			}
			// Handle tool call updates (progress/completion)
			else if (updateType === 'tool_call_update') {
				this.handleToolCallUpdate(updateData as unknown as ToolCallUpdateData);
			}
			// Handle plan updates (new type)
			else if (updateType === 'plan' && updateData.entries) {
				this.plugin.openPlanView(updateData as unknown as Plan);
			}
			// Handle current mode updates
			else if (updateType === 'current_mode_update' && updateData.currentModeId) {
				this.updateCurrentMode(updateData.currentModeId);
			}
			// Fallback: show as formatted JSON for debugging
			else {
				console.warn('Unhandled update type:', updateType, updateData);
				this.showDebugMessage(updateData);
			}
		} else {
			// No update field, might be a different structure
			console.warn('Update without update field:', data);
			this.showDebugMessage(data);
		}
	}

	private lastAgentMessage: HTMLElement | null = null;
	private lastAgentMessageText: string = '';
	private toolCallElements: Map<string, HTMLElement> = new Map();
	private toolCallCache: Map<string, ToolCallCache> = new Map();
	private commandsMessageElement: HTMLElement | null = null;
	private pendingMessage: HTMLElement | null = null;

	private async appendToLastAgentMessage(content: ContentBlock): Promise<void> {
		if (content.type === 'text' && content.text) {
			if (!this.lastAgentMessage) {
				this.lastAgentMessage = this.createAgentMessage();
				this.lastAgentMessageText = '';
			}

			// Smart spacing: detect if we need to add paragraph breaks between chunks
			let textToAdd = content.text;
			if (this.lastAgentMessageText.length > 0) {
				const lastChar = this.lastAgentMessageText.trim().slice(-1);
				const firstChar = content.text.trim()[0];

				// If previous text ends with sentence-ending punctuation and new text starts with uppercase,
				// it's likely a new thought - add double newline for paragraph break
				if (/[.!?:]/.test(lastChar) && firstChar && /[A-Z]/.test(firstChar)) {
					// Only add spacing if there isn't already whitespace at the boundary
					if (!/\s$/.test(this.lastAgentMessageText) && !/^\s/.test(content.text)) {
						textToAdd = '\n\n' + content.text;
					}
				}
			}

			// Accumulate text
			this.lastAgentMessageText += textToAdd;

			// Clear and re-render with markdown
			this.lastAgentMessage.empty();
			await MarkdownRenderer.renderMarkdown(
				this.lastAgentMessageText,
				this.lastAgentMessage,
				'',
				this.component
			);

			// Ensure pending message stays at bottom
			this.ensurePendingAtBottom();
		}
	}

	private createAgentMessage(): HTMLElement {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-agent' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Agent');
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		return contentEl;
	}

	private showPendingMessage(): void {
		// Remove any existing pending message first
		this.removePendingMessage();

		// Create pending message bubble
		this.pendingMessage = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-pending' });
		const senderEl = this.pendingMessage.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Agent');
		const contentEl = this.pendingMessage.createDiv({ cls: 'acp-message-content' });

		// Add loading dots
		const loadingEl = contentEl.createDiv({ cls: 'acp-loading-dots' });
		loadingEl.createSpan({ cls: 'acp-loading-dot' });
		loadingEl.createSpan({ cls: 'acp-loading-dot' });
		loadingEl.createSpan({ cls: 'acp-loading-dot' });

		// Show cancel button
		this.cancelButton.style.display = 'block';

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private removePendingMessage(): void {
		if (this.pendingMessage) {
			this.pendingMessage.remove();
			this.pendingMessage = null;
		}

		// Hide cancel button when no pending message
		this.cancelButton.style.display = 'none';
	}

	private ensurePendingAtBottom(): void {
		// If pending message exists, move it to the bottom of the messages container
		if (this.pendingMessage && this.pendingMessage.parentElement === this.messagesContainer) {
			this.messagesContainer.appendChild(this.pendingMessage);
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	private showAvailableCommands(commands: AvailableCommand[]): void {
		// Store commands for autocomplete, minus those that don't make sense in obsidian.
		const filteredCommands = commands.filter((x) => !["pr-comments", "review", "security-review"].contains(x.name));
		if (this.autocompleteManager) {
			this.autocompleteManager.setAvailableCommands(filteredCommands);
		}

		// Reuse existing commands message element if it exists
		let messageEl: HTMLElement;
		let contentEl: HTMLElement;

		if (this.commandsMessageElement) {
			messageEl = this.commandsMessageElement;
			contentEl = messageEl.querySelector('.acp-message-content') as HTMLElement;
			contentEl.empty();
		} else {
			messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-system' });
			contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
			this.commandsMessageElement = messageEl;
		}

		contentEl.createEl('strong', { text: 'Available Commands:' });
		const commandList = contentEl.createEl('ul', { cls: 'acp-command-list' });

		for (const cmd of filteredCommands) {
			const item = commandList.createEl('li');
			item.createEl('code', { text: `/${cmd.name}`, cls: 'acp-command-name' });
			if (cmd.description) {
				item.appendText(` - ${cmd.description}`);
			}
		}

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private async handleToolCallUpdate(updateData: ToolCallUpdateData): Promise<void> {
		this.lastAgentMessage = null; // End current message
		this.lastAgentMessageText = '';

		const toolCallId = updateData.toolCallId;
		// Get cached permission details if available
		const cachedDetails = toolCallId ? this.toolCallCache.get(toolCallId) : null;

		// Merge cached details with update data (update data takes precedence)
		const mergedData = {
			...cachedDetails,
			...updateData,
			// Preserve cached rawInput if updateData doesn't have it
			rawInput: updateData.rawInput || cachedDetails?.rawInput
		};
		// Clear completed tool calls out of the cache to keep it from getting very large
		if (mergedData.status == "completed") {
			this.toolCallCache.delete(toolCallId)
		} else {
			this.toolCallCache.set(toolCallId, mergedData)
		}

		// Check if we already have a message for this tool call
		let messageEl = toolCallId ? this.toolCallElements.get(toolCallId) : null;

		if (!messageEl) {
			// Create new message for this tool call
			messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-tool' });

			if (toolCallId) {
				this.toolCallElements.set(toolCallId, messageEl);
			}
		}

		// Find or create content container
		let contentEl = messageEl.querySelector('.acp-message-content') as HTMLElement;
		if (!contentEl) {
			contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		} else {
			// Clear and rebuild content
			contentEl.empty();
		}

		// Compact header with tool info and status
		const toolHeader = contentEl.createDiv({ cls: 'acp-tool-compact-header' });

		// Generate descriptive title using merged data
		const titleText = this.generateToolTitle(mergedData);
		toolHeader.createSpan({ text: titleText, cls: 'acp-tool-title' });

		// Show tool status badge if available
		if (updateData.status) {
			const statusBadge = toolHeader.createEl('span', { cls: `acp-tool-status-badge acp-tool-status-${updateData.status}` });
		}

		// Show content/output if available (only when completed)
		if (updateData.status === 'completed' && updateData.content && Array.isArray(updateData.content) && updateData.content.length > 0) {
			for (const block of updateData.content) {
				if (block.type === 'content' && block.content.type === 'text') {
					const outputEl = contentEl.createDiv({ cls: 'acp-tool-output-compact' });
					this.renderTextContent(block.content.text, outputEl);
				}
			}
		}

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private generateToolTitle(updateData: ToolCallCache): string {
		// If title is provided, use it
		if (updateData.title) {
			return updateData.title;
		}

		// Try to extract meaningful info from rawInput
		const rawInput = updateData.rawInput;
		const kind = updateData.kind;
		if (this.plugin.settings.debug) {
			console.log(updateData);
		}
		if (rawInput) {
			// File operations
			if (typeof rawInput.path === 'string') {
				const fileName = rawInput.path.split('/').pop() || rawInput.path;
				if (kind === 'read') {
					return `Read file "${fileName}"`;
				} else if (kind === 'edit') {
					return `Write file "${fileName}"`;
				}
			}

			// Terminal commands
			if (typeof rawInput.command === 'string') {
				const command = rawInput.command;
				const args = Array.isArray(rawInput.args) ? ` ${rawInput.args.join(' ')}` : '';
				return `Run: ${command}${args}`;
			}

			// Generic description if available
			if (typeof rawInput.description === 'string') {
				return rawInput.description;
			}
		}

		// Fallback to kind or generic text
		return kind || 'Tool Call';
	}

	private renderTextContent(text: string, container: HTMLElement): void {
		// Check if text contains markdown code blocks
		const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
		let lastIndex = 0;
		let match;

		while ((match = codeBlockRegex.exec(text)) !== null) {
			// Add text before code block
			if (match.index > lastIndex) {
				const textBefore = text.substring(lastIndex, match.index);
				if (textBefore.trim()) {
					container.appendText(textBefore);
				}
			}

			// Add code block
			const language = match[1] || '';
			const code = match[2];
			const pre = container.createEl('pre');
			const codeEl = pre.createEl('code');
			if (language) {
				codeEl.addClass(`language-${language}`);
			}
			codeEl.setText(code);

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			const remainingText = text.substring(lastIndex);
			if (remainingText.trim()) {
				container.appendText(remainingText);
			}
		}

		// If no code blocks were found, just set the text
		if (lastIndex === 0) {
			container.setText(text);
		}
	}

	private getToolIcon(kind: string): string {
		const icons: Record<string, string> = {
			'read': '📖',
			'write': '✍️',
			'execute': '⚡',
			'search': '🔍',
			'list': '📋',
			'edit': '✏️'
		};
		return icons[kind] || '🔧';
	}

	private showPermissionRequest(params: RequestPermissionRequest, resolve: (response: RequestPermissionResponse) => void): void {
		this.lastAgentMessage = null;
		this.lastAgentMessageText = '';

		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-permission' });
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		// Show what permission is being requested
		const headerEl = contentEl.createDiv({ cls: 'acp-permission-header' });
		headerEl.createEl('strong', { text: '🔐 Permission Required' });

		if (params.toolCall && params.toolCall.title) {
			const titleEl = contentEl.createDiv({ cls: 'acp-permission-tool-title' });
			titleEl.setText(params.toolCall.title);
		}

		// Show compact input info
		if (params.toolCall && params.toolCall.rawInput) {
			const inputEl = contentEl.createDiv({ cls: 'acp-permission-input-compact' });
			const rawInput = params.toolCall.rawInput;
			const cmd = typeof rawInput.command === 'string' ? rawInput.command : undefined;
			const desc = typeof rawInput.description === 'string' ? rawInput.description : undefined;
			if (cmd) {
				inputEl.createEl('code', { text: cmd });
			} else if (desc) {
				inputEl.setText(desc);
			}
		}

		// Create action buttons
		const actionsEl = contentEl.createDiv({ cls: 'acp-permission-actions' });

		for (const option of params.options) {
			const button = actionsEl.createEl('button', {
				cls: `acp-permission-btn acp-permission-${option.kind}`,
				text: option.name
			});

			button.addEventListener('click', () => {
				// Remove the permission request message
				messageEl.remove();

				// Resolve with selected option
				resolve({
					outcome: {
						outcome: 'selected',
						optionId: option.optionId
					}
				});
			});
		}

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private async showPlan(plan: Plan | string): Promise<void> {
		this.lastAgentMessage = null;
		this.lastAgentMessageText = '';

		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-plan' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Plan');

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		let planText: string;
		if (typeof plan === 'string') {
			planText = plan;
		} else {
			// Plan is a structured object with entries, render as JSON
			planText = '```json\n' + JSON.stringify(plan, null, 2) + '\n```';
		}

		await MarkdownRenderer.renderMarkdown(planText, contentEl, '', this.component);

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}


	private showModeChange(mode: SessionMode | string): void {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-system' });
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		const modeName = typeof mode === 'string' ? mode : (mode.name || 'unknown');
		contentEl.setText(`Mode changed to: ${modeName}`);

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private updateModeSelector(modeState: SessionModeState): void {
		if (!this.modeSelector || !modeState) {
			return;
		}

		// Clear existing options
		this.modeSelector.empty();

		// Add options for each available mode
		for (const mode of modeState.availableModes) {
			const option = this.modeSelector.createEl('option', {
				value: mode.id,
				text: mode.name
			});

			// Set tooltip with description if available
			if (mode.description) {
				option.title = mode.description;
			}
		}

		// Set current mode
		this.modeSelector.value = modeState.currentModeId;

		// Enable the selector
		this.modeSelector.disabled = false;

		if (this.plugin.settings.debug) {
			console.log('Mode selector updated:', modeState);
		}
	}

	private updateCurrentMode(modeId: string): void {
		if (!this.modeSelector) {
			return;
		}

		// Update the dropdown selection
		this.modeSelector.value = modeId;

		// Update the client's internal state
		if (this.client) {
			const modeState = this.client.getModeState();
			if (modeState) {
				modeState.currentModeId = modeId;

				// Find the mode name for display
				const mode = modeState.availableModes.find(m => m.id === modeId);
				if (mode) {
					this.showModeChange(mode);
				}
			}
		}

		if (this.plugin.settings.debug) {
			console.log('Current mode updated to:', modeId);
		}
	}

	private async handleModeChange(): Promise<void> {
		if (!this.modeSelector || !this.client) {
			return;
		}

		const selectedModeId = this.modeSelector.value;
		const modeState = this.client.getModeState();

		if (!modeState || modeState.currentModeId === selectedModeId) {
			// No change or no mode state
			return;
		}

		try {
			await this.client.setMode(selectedModeId);

			// Find the mode name for display message
			const mode = modeState.availableModes.find(m => m.id === selectedModeId);
			if (mode) {
				this.showModeChange(mode);
			}
		} catch (err) {
			new Notice(`Failed to change mode: ${err.message}`);
			console.error('Mode change error:', err);

			// Revert dropdown to previous value
			this.modeSelector.value = modeState.currentModeId;
		}
	}

	private showDebugMessage(data: unknown): void {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-debug' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Debug');

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		const pre = contentEl.createEl('pre', { cls: 'acp-debug-json' });
		pre.setText(JSON.stringify(data, null, 2));

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	async addMessage(sender: 'user' | 'agent' | 'system', content: string): Promise<void> {
		// Reset last agent message tracker when adding a new message
		if (sender === 'user' || sender === 'system') {
			this.lastAgentMessage = null;
			this.lastAgentMessageText = '';
		}

		const messageEl = this.messagesContainer.createDiv({ cls: `acp-message acp-message-${sender}` });

		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText(sender.charAt(0).toUpperCase() + sender.slice(1));

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		// Render markdown for user and agent messages
		if (sender === 'user' || sender === 'agent') {
			await MarkdownRenderer.renderMarkdown(content, contentEl, '', this.component);
		} else {
			// System messages remain as plain text
			contentEl.setText(content);
		}

		if (sender === 'agent') {
			this.lastAgentMessage = contentEl;
			this.lastAgentMessageText = content;
		}

		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	async onClose(): Promise<void> {
		if (this.client) {
			await this.client.cleanup();
		}
		if (this.component) {
			this.component.unload();
		}
	}
}
