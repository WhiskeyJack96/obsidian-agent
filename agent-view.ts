import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Component } from 'obsidian';
import { ACPClient, SessionUpdate } from './acp-client';
import type ACPClientPlugin from './main';

export const VIEW_TYPE_AGENT = 'acp-agent-view';

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
	private availableCommands: Array<{name: string; description?: string}> = [];
	private autocompleteContainer: HTMLElement | null = null;
	private autocompleteSelectedIndex: number = -1;

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
		this.autocompleteContainer = this.inputContainer.createDiv({ cls: 'acp-autocomplete' });
		this.autocompleteContainer.style.display = 'none';

		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'acp-input',
			attr: {
				placeholder: 'Type your message to the agent... (Enter to send, Shift+Enter for newline)',
				rows: '3'
			}
		});

		this.inputField.addEventListener('keydown', (e) => {
			// Handle autocomplete keyboard navigation
			if (this.autocompleteContainer && this.autocompleteContainer.style.display !== 'none') {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					this.moveAutocompleteSelection(1);
					return;
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					this.moveAutocompleteSelection(-1);
					return;
				} else if (e.key === 'Enter' || e.key === 'Tab') {
					e.preventDefault();
					this.selectCurrentAutocompleteItem();
					return;
				} else if (e.key === 'Escape') {
					e.preventDefault();
					this.hideAutocomplete();
					return;
				}
			}

			// Normal Enter behavior (send message)
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Add input event listener for autocomplete
		this.inputField.addEventListener('input', () => {
			this.handleAutocomplete();
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
		if (this.statusIndicator.getText() === 'Not connected') {
			this.connect();
		}
	}

	async connect(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		// Don't connect if already connected or connecting
		const currentStatus = this.statusIndicator.getText();
		if (currentStatus === 'Connecting...' || currentStatus === 'Connected' || currentStatus === 'Session active') {
			if (this.plugin.settings.debug) {
				console.log('Already connected or connecting, skipping connect()');
			}
			return;
		}

		try {
			this.statusIndicator.setText('Connecting...');
			await this.client.initialize();
			this.statusIndicator.setText('Connected');

			await this.client.createSession();
			this.statusIndicator.setText('Session active');
		} catch (err) {
			this.statusIndicator.setText('Connection failed');
			new Notice(`Failed to connect: ${err.message}`);
			console.error('Connection error:', err);
		}
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.cleanup();
			this.statusIndicator.setText('Disconnected');
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

		// Reset status so connect() will proceed
		this.statusIndicator.setText('Not connected');

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
		const data = update.data;

		// Handle turn completion - remove pending message when agent is done
		if (update.type === 'turn_complete') {
			this.removePendingMessage();
			if (this.plugin.settings.debug) {
				console.log('Agent turn completed:', data);
			}
			return;
		}

		// Handle mode changes - update UI
		if (update.type === 'mode_change') {
			this.updateModeSelector(data);
			return;
		}

		// Handle permission requests specially
		if (update.type === 'permission_request') {
			this.showPermissionRequest(data.params, data.resolve);
			return;
		}

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
				this.handleToolCallUpdate(updateData);
			}
			// Handle tool call updates (progress/completion)
			else if (updateType === 'tool_call_update') {
				this.handleToolCallUpdate(updateData);
			}
			// Handle plan updates
			else if (updateType === 'plan_update' && updateData.plan) {
				this.showPlan(updateData.plan);
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
	private toolCallCache: Map<string, { title?: string; rawInput?: any; kind?: string }> = new Map();
	private commandsMessageElement: HTMLElement | null = null;
	private pendingMessage: HTMLElement | null = null;

	private async appendToLastAgentMessage(content: any): Promise<void> {
		if (content.type === 'text' && content.text) {
			if (!this.lastAgentMessage) {
				this.lastAgentMessage = this.createAgentMessage();
				this.lastAgentMessageText = '';
			}
			// Accumulate text
			this.lastAgentMessageText += content.text;

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

	private showAvailableCommands(commands: any[]): void {
		// Store commands for autocomplete, minus those that don't make sense in obsidian
		this.availableCommands = commands.filter((x) => !["pr-comments", "review", "security-review"].contains(x.name));

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

		for (const cmd of this.availableCommands) {
			const item = commandList.createEl('li');
			item.createEl('code', { text: `/${cmd.name}`, cls: 'acp-command-name' });
			if (cmd.description) {
				item.appendText(` - ${cmd.description}`);
			}
		}

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private handleToolCallUpdate(updateData: any): void {
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
				if (block.type === 'text' && block.text) {
					const outputEl = contentEl.createDiv({ cls: 'acp-tool-output-compact' });
					this.renderTextContent(block.text, outputEl);
				}
			}
		}

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private generateToolTitle(updateData: any): string {
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
			if (rawInput.path) {
				const fileName = rawInput.path.split('/').pop() || rawInput.path;
				if (kind === 'read') {
					return `Read file "${fileName}"`;
				} else if (kind === 'edit') {
					return `Write file "${fileName}"`;
				}
			}

			// Terminal commands
			if (rawInput.command) {
				const command = rawInput.command;
				const args = rawInput.args ? ` ${rawInput.args.join(' ')}` : '';
				return `Run: ${command}${args}`;
			}

			// Generic description if available
			if (rawInput.description) {
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

	private showPermissionRequest(params: any, resolve: (response: any) => void): void {
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
			const cmd = params.toolCall.rawInput.command;
			const desc = params.toolCall.rawInput.description;
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

	private async showPlan(plan: any): Promise<void> {
		this.lastAgentMessage = null;
		this.lastAgentMessageText = '';

		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-plan' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Plan');

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		let planText: string;
		if (typeof plan === 'string') {
			planText = plan;
		} else if (plan.description) {
			planText = plan.description;
		} else {
			planText = '```json\n' + JSON.stringify(plan, null, 2) + '\n```';
		}

		await MarkdownRenderer.renderMarkdown(planText, contentEl, '', this.component);

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private showModeChange(mode: any): void {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-system' });
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		const modeName = typeof mode === 'string' ? mode : (mode.name || 'unknown');
		contentEl.setText(`Mode changed to: ${modeName}`);

		// Ensure pending message stays at bottom
		this.ensurePendingAtBottom();
	}

	private updateModeSelector(modeState: any): void {
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

	private showDebugMessage(data: any): void {
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

	private handleAutocomplete(): void {
		const cursorPos = this.inputField.selectionStart;
		const textBeforeCursor = this.inputField.value.substring(0, cursorPos);

		// Find the last trigger character (/ or @) before the cursor
		const slashMatch = textBeforeCursor.lastIndexOf('/');
		const atMatch = textBeforeCursor.lastIndexOf('@');

		let triggerType: 'command' | 'file' | null = null;
		let triggerPos = -1;
		let query = '';

		// Determine which trigger is most recent
		if (slashMatch > atMatch && slashMatch !== -1) {
			// Check if this is the start of the line or preceded by whitespace
			if (slashMatch === 0 || /\s/.test(textBeforeCursor[slashMatch - 1])) {
				triggerType = 'command';
				triggerPos = slashMatch;
				query = textBeforeCursor.substring(slashMatch + 1);
			}
		} else if (atMatch !== -1 && atMatch > slashMatch) {
			// Check if this is the start of the line or preceded by whitespace
			if (atMatch === 0 || /\s/.test(textBeforeCursor[atMatch - 1])) {
				triggerType = 'file';
				triggerPos = atMatch;
				query = textBeforeCursor.substring(atMatch + 1);
			}
		}

		// If we found a trigger and the query doesn't contain whitespace, show autocomplete
		if (triggerType && triggerPos !== -1 && !/\s/.test(query)) {
			if (triggerType === 'command') {
				this.showCommandAutocomplete(query, triggerPos);
			} else if (triggerType === 'file') {
				this.showFileAutocomplete(query, triggerPos);
			}
		} else {
			this.hideAutocomplete();
		}
	}

	private showCommandAutocomplete(query: string, triggerPos: number): void {
		const filtered = this.availableCommands.filter(cmd =>
			cmd.name.toLowerCase().includes(query.toLowerCase())
		);

		if (filtered.length === 0) {
			this.hideAutocomplete();
			return;
		}

		this.renderAutocomplete(filtered.map(cmd => ({
			type: 'command',
			name: cmd.name,
			description: cmd.description,
			insertText: cmd.name,
			triggerPos: triggerPos
		})));
	}

	private showFileAutocomplete(query: string, triggerPos: number): void {
		// Get all files from vault
		const files = this.app.vault.getMarkdownFiles();

		const filtered = files
			.filter(file =>
				file.path.toLowerCase().includes(query.toLowerCase()) ||
				file.basename.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, 50); // Limit to 50 results

		if (filtered.length === 0) {
			this.hideAutocomplete();
			return;
		}

		this.renderAutocomplete(filtered.map(file => ({
			type: 'file',
			name: file.basename,
			path: file.path,
			insertText: file.path,
			triggerPos: triggerPos
		})));
	}

	private renderAutocomplete(items: Array<{
		type: 'command' | 'file';
		name: string;
		description?: string;
		path?: string;
		insertText: string;
		triggerPos: number;
	}>): void {
		if (!this.autocompleteContainer) return;

		this.autocompleteContainer.empty();
		this.autocompleteSelectedIndex = 0;

		items.forEach((item, index) => {
			const itemEl = this.autocompleteContainer!.createDiv({ cls: 'acp-autocomplete-item' });

			if (index === 0) {
				itemEl.addClass('selected');
			}

			const nameEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-name' });
			if (item.type === 'command') {
				nameEl.setText(`/${item.name}`);
			} else {
				nameEl.setText(item.name);
			}

			if (item.description) {
				const descEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-description' });
				descEl.setText(item.description);
			}

			if (item.path) {
				const pathEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-path' });
				pathEl.setText(item.path);
			}

			// Handle click
			itemEl.addEventListener('click', () => {
				this.selectAutocompleteItem(item);
			});

			// Store item data on element for keyboard navigation
			(itemEl as any)._acpItem = item;
		});

		this.autocompleteContainer.style.display = 'block';
		// Reset scroll position to top when showing new autocomplete
		this.autocompleteContainer.scrollTop = 0;

		// Adjust container height to show complete items only
		// Wait for next frame to ensure items are rendered
		requestAnimationFrame(() => {
			if (!this.autocompleteContainer) return;

			const firstItem = this.autocompleteContainer.querySelector('.acp-autocomplete-item') as HTMLElement;
			if (firstItem) {
				const itemHeight = firstItem.offsetHeight;
				const maxVisibleItems = 5; // Show up to 5 items at once
				const itemsToShow = Math.min(items.length, maxVisibleItems);
				const containerHeight = itemHeight * itemsToShow;

				this.autocompleteContainer.style.maxHeight = `${containerHeight}px`;
			}
		});
	}

	private hideAutocomplete(): void {
		if (this.autocompleteContainer) {
			this.autocompleteContainer.style.display = 'none';
			this.autocompleteSelectedIndex = -1;
		}
	}

	private selectAutocompleteItem(item: { insertText: string; type: string; triggerPos: number }): void {
		const cursorPos = this.inputField.selectionStart;
		const value = this.inputField.value;

		// Find the end of the current query (up to cursor or next whitespace)
		let queryEnd = cursorPos;
		while (queryEnd < value.length && !/\s/.test(value[queryEnd])) {
			queryEnd++;
		}

		// Replace from trigger position to end of query with the selected item
		const before = value.substring(0, item.triggerPos);
		const after = value.substring(queryEnd);
		const triggerChar = item.type === 'command' ? '/' : '@';

		this.inputField.value = before + triggerChar + item.insertText + ' ' + after;

		// Set cursor after the inserted text
		const newCursorPos = before.length + 1 + item.insertText.length + 1;
		this.inputField.setSelectionRange(newCursorPos, newCursorPos);

		this.hideAutocomplete();
		this.inputField.focus();
	}

	private moveAutocompleteSelection(direction: number): void {
		if (!this.autocompleteContainer) return;

		const items = this.autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
		if (items.length === 0) return;

		// Remove current selection
		items[this.autocompleteSelectedIndex]?.removeClass('selected');

		// Update index
		this.autocompleteSelectedIndex += direction;

		// Wrap around
		if (this.autocompleteSelectedIndex < 0) {
			this.autocompleteSelectedIndex = items.length - 1;
		} else if (this.autocompleteSelectedIndex >= items.length) {
			this.autocompleteSelectedIndex = 0;
		}

		// Add new selection
		const selectedItem = items[this.autocompleteSelectedIndex] as HTMLElement;
		selectedItem?.addClass('selected');

		// Scroll with one-item lookahead so user can see the next item
		if (selectedItem) {
			const container = this.autocompleteContainer;
			const itemHeight = selectedItem.offsetHeight;
			const lookaheadPadding = itemHeight; // Reserve space for one more item
			const itemTop = selectedItem.offsetTop;
			const itemBottom = itemTop + selectedItem.offsetHeight;
			const containerScrollTop = container.scrollTop;
			const containerHeight = container.clientHeight;
			const containerScrollBottom = containerScrollTop + containerHeight;

			// If item is near top boundary, scroll up to show previous item
			if (itemTop < containerScrollTop + lookaheadPadding) {
				container.scrollTop = Math.max(0, itemTop - lookaheadPadding);
			}
			// If item is near bottom boundary, scroll down to show next item
			else if (itemBottom > containerScrollBottom - lookaheadPadding) {
				container.scrollTop = itemBottom - containerHeight + lookaheadPadding;
			}
		}
	}

	private selectCurrentAutocompleteItem(): void {
		if (!this.autocompleteContainer) return;

		const items = this.autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
		const selectedItem = items[this.autocompleteSelectedIndex] as HTMLElement;

		if (selectedItem && (selectedItem as any)._acpItem) {
			this.selectAutocompleteItem((selectedItem as any)._acpItem);
		}
	}
}
