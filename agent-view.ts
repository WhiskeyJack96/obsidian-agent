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

		// Handle different session update types
		if (data.update) {
			const updateData = data.update;

			// Handle agent message chunks
			if (updateData.sessionUpdateType === 'agent_message_chunk' && updateData.content) {
				this.appendToLastAgentMessage(updateData.content);
			}
			// Handle available commands update
			else if (updateData.sessionUpdateType === 'available_commands_update' && updateData.availableCommands) {
				this.showAvailableCommands(updateData.availableCommands);
			}
			// Handle other content updates
			else if (updateData.content) {
				if (updateData.content.type === 'text' && updateData.content.text) {
					this.addMessage('agent', updateData.content.text);
				}
			}
		}
	}

	private lastAgentMessage: HTMLElement | null = null;

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
