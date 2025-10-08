import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { ACPClient, SessionUpdate } from './acp-client';

export const VIEW_TYPE_AGENT = 'acp-agent-view';

export class AgentView extends ItemView {
	private client: ACPClient | null = null;
	private messagesContainer: HTMLElement;
	private inputContainer: HTMLElement;
	private inputField: HTMLTextAreaElement;
	private sendButton: HTMLButtonElement;
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
				placeholder: 'Type your message to the agent...',
				rows: '3'
			}
		});

		const buttonContainer = this.inputContainer.createDiv({ cls: 'acp-button-container' });

		this.sendButton = buttonContainer.createEl('button', {
			cls: 'acp-send-button',
			text: 'Send'
		});

		this.sendButton.addEventListener('click', () => this.sendMessage());

		this.inputField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Add control buttons
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
			const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
			senderEl.setText('Tool Call');

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

		// Show tool name and title
		const toolHeader = contentEl.createDiv({ cls: 'acp-tool-header' });
		const titleText = updateData.title || updateData.kind || 'Tool Call';
		toolHeader.createEl('strong', { text: titleText });

		// Show tool status if available
		if (updateData.status) {
			const statusBadge = toolHeader.createEl('span', { cls: `acp-tool-status acp-tool-status-${updateData.status}` });
			statusBadge.setText(updateData.status);
		}

		// Only show input for initial tool call or when completed
		if (updateData.rawInput && updateData.status !== 'in_progress') {
			const inputSection = contentEl.createDiv({ cls: 'acp-tool-section acp-tool-input-collapsed' });
			const inputHeader = inputSection.createDiv({ cls: 'acp-tool-label acp-collapsible' });
			inputHeader.setText('Input ▸');
			const inputPre = inputSection.createEl('pre', { cls: 'acp-tool-input acp-collapsed' });
			inputPre.setText(JSON.stringify(updateData.rawInput, null, 2));

			inputHeader.addEventListener('click', () => {
				inputPre.toggleClass('acp-collapsed', !inputPre.hasClass('acp-collapsed'));
				inputHeader.setText(inputPre.hasClass('acp-collapsed') ? 'Input ▸' : 'Input ▾');
			});
		}

		// Show content/output if available
		if (updateData.content && Array.isArray(updateData.content) && updateData.content.length > 0) {
			const outputSection = contentEl.createDiv({ cls: 'acp-tool-section' });
			outputSection.createEl('div', { text: 'Output:', cls: 'acp-tool-label' });

			for (const block of updateData.content) {
				if (block.type === 'text' && block.text) {
					outputSection.createEl('div', { text: block.text, cls: 'acp-tool-output-text' });
				} else if (block.type === 'resource' && block.resource) {
					const resourceEl = outputSection.createDiv({ cls: 'acp-tool-resource' });
					resourceEl.createEl('strong', { text: block.resource.uri || 'Resource' });
					if (block.resource.text) {
						resourceEl.createEl('pre', { text: block.resource.text });
					}
				}
			}
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
