import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { ACPClient, SessionUpdate } from './acp-client';

export const VIEW_TYPE_AGENT = 'acp-agent-view';

export class AgentView extends ItemView {
	private client: ACPClient | null = null;
	private messagesContainer: HTMLElement;
	private inputContainer: HTMLElement;
	private inputField: HTMLTextAreaElement;
	private statusIndicator: HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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

		// Create status bar
		this.statusIndicator = container.createDiv({ cls: 'acp-status' });
		this.statusIndicator.setText('Not connected');

		// Create messages container
		this.messagesContainer = container.createDiv({ cls: 'acp-messages' });

		// Create input container
		this.inputContainer = container.createDiv({ cls: 'acp-input-container' });

		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'acp-input',
			attr: {
				placeholder: 'Type your message to the agent... (Enter to send, Shift+Enter for newline)',
				rows: '3'
			}
		});

		this.inputField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Add control buttons
		const buttonContainer = this.inputContainer.createDiv({ cls: 'acp-button-container' });

		const connectButton = buttonContainer.createEl('button', {
			cls: 'acp-control-button',
			text: 'Connect'
		});

		connectButton.addEventListener('click', () => this.connect());

		const disconnectButton = buttonContainer.createEl('button', {
			cls: 'acp-control-button',
			text: 'Disconnect'
		});

		disconnectButton.addEventListener('click', () => this.disconnect());
	}

	setClient(client: ACPClient): void {
		this.client = client;
		this.client.setUpdateCallback((update: SessionUpdate) => {
			this.handleUpdate(update);
		});
	}

	async connect(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		try {
			this.statusIndicator.setText('Connecting...');
			await this.client.initialize();
			this.statusIndicator.setText('Connected');

			await this.client.createSession();
			this.statusIndicator.setText('Session active');

			this.addMessage('system', 'Connected to agent. You can now send messages.');
		} catch (err) {
			this.statusIndicator.setText('Connection failed');
			new Notice(`Failed to connect: ${err.message}`);
			console.error('Connection error:', err);
		}
	}

	disconnect(): void {
		if (this.client) {
			this.client.cleanup();
			this.statusIndicator.setText('Disconnected');
			this.addMessage('system', 'Disconnected from agent.');
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

		try {
			await this.client.sendPrompt(message);
		} catch (err) {
			new Notice(`Failed to send message: ${err.message}`);
			console.error('Send error:', err);
		}
	}

	handleUpdate(update: SessionUpdate): void {
		const data = update.data;

		// Handle permission requests specially
		if (update.type === 'permission_request') {
			this.showPermissionRequest(data.params, data.resolve);
			return;
		}

		// Log to console for debugging
		console.log('Session update received:', data);

		// Handle different session update types based on ACP spec
		if (data.update) {
			const updateData = data.update;
			const updateType = updateData.sessionUpdate; // Note: it's sessionUpdate, not sessionUpdateType

			console.log('Update type:', updateType);

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
			else if (updateType === 'current_mode_update' && updateData.currentMode) {
				this.showModeChange(updateData.currentMode);
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
	private toolCallElements: Map<string, HTMLElement> = new Map();

	private appendToLastAgentMessage(content: any): void {
		if (content.type === 'text' && content.text) {
			if (!this.lastAgentMessage) {
				this.lastAgentMessage = this.createAgentMessage();
			}
			this.lastAgentMessage.appendText(content.text);
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	private createAgentMessage(): HTMLElement {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-agent' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Agent');
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		return contentEl;
	}

	private showAvailableCommands(commands: any[]): void {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-system' });
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		contentEl.createEl('strong', { text: 'Available Commands:' });
		const commandList = contentEl.createEl('ul', { cls: 'acp-command-list' });

		for (const cmd of commands) {
			const item = commandList.createEl('li');
			item.createEl('code', { text: `/${cmd.name}`, cls: 'acp-command-name' });
			if (cmd.description) {
				item.appendText(` - ${cmd.description}`);
			}
		}

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private handleToolCallUpdate(updateData: any): void {
		this.lastAgentMessage = null; // End current message

		const toolCallId = updateData.toolCallId;

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

		// Icon based on kind
		const icon = this.getToolIcon(updateData.kind);
		const iconEl = toolHeader.createSpan({ cls: 'acp-tool-icon', text: icon });

		// Generate descriptive title
		const titleText = this.generateToolTitle(updateData);
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

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private generateToolTitle(updateData: any): string {
		// If title is provided, use it
		if (updateData.title) {
			return updateData.title;
		}

		// Try to extract meaningful info from rawInput
		const rawInput = updateData.rawInput;
		const kind = updateData.kind;
		console.log(updateData)
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

	private showPlan(plan: any): void {
		this.lastAgentMessage = null;

		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-plan' });
		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText('Plan');

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		if (typeof plan === 'string') {
			contentEl.setText(plan);
		} else if (plan.description) {
			contentEl.setText(plan.description);
		} else {
			contentEl.setText(JSON.stringify(plan, null, 2));
		}

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private showModeChange(mode: any): void {
		const messageEl = this.messagesContainer.createDiv({ cls: 'acp-message acp-message-system' });
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		const modeName = typeof mode === 'string' ? mode : (mode.name || 'unknown');
		contentEl.setText(`Mode changed to: ${modeName}`);

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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

	addMessage(sender: 'user' | 'agent' | 'system', content: string): void {
		// Reset last agent message tracker when adding a new message
		if (sender === 'user' || sender === 'system') {
			this.lastAgentMessage = null;
		}

		const messageEl = this.messagesContainer.createDiv({ cls: `acp-message acp-message-${sender}` });

		const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
		senderEl.setText(sender.charAt(0).toUpperCase() + sender.slice(1));

		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		contentEl.setText(content);

		if (sender === 'agent') {
			this.lastAgentMessage = contentEl;
		}

		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	async onClose(): Promise<void> {
		if (this.client) {
			this.client.cleanup();
		}
	}
}
