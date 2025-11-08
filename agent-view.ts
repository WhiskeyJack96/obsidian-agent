import { ItemView, WorkspaceLeaf, Notice, Component } from 'obsidian';
import { ACPClient } from './acp-client';
import type ACPClientPlugin from './main';
import { AutocompleteManager } from './autocomplete-manager';
import { ModeManager } from './mode-manager';
import { GitIntegration } from './git-integration';
import {
	ContentBlock,
	AvailableCommand,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionUpdate,
	ToolCallUpdate,
} from './types';
import { MessageRenderer } from './messages/message-renderer';
import {
	TextMessage,
	PermissionRequestMessage,
	PendingMessage,
	DebugMessage,
} from './messages';

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
	private static viewCounter = 0;
	private viewNumber: number;
	private plugin: ACPClientPlugin;
	private client: ACPClient | null = null;
	private gitIntegration: GitIntegration | null = null;
	private messagesContainer: HTMLElement;
	private inputContainer: HTMLElement;
	private inputField: HTMLTextAreaElement;
	private statusIndicator: HTMLElement;
	private cancelButton: HTMLElement;
	private sessionIdInput: HTMLInputElement;
	private loadSessionButton: HTMLElement;
	private modeManager: ModeManager | null = null;
	private component: Component;
	private autocompleteManager: AutocompleteManager | null = null;
	private connectionState: ConnectionState = ConnectionState.NOT_CONNECTED;
	private messageRenderer: MessageRenderer;
	private initialPrompt: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ACPClientPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Assign a unique number to this view
		AgentView.viewCounter++;
		this.viewNumber = AgentView.viewCounter;
	}

	getViewType(): string {
		return VIEW_TYPE_AGENT;
	}

	getDisplayText(): string {
		return `Agent ${this.viewNumber}`;
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

		// Create mode manager
		this.modeManager = new ModeManager(
			statusBarContainer,
			(modeName) => this.addMessage('system', `Mode changed to: ${modeName}`)
		);

		const newConversationButton = statusBarContainer.createEl('button', {
			cls: 'acp-new-conversation-button',
			text: 'New Conversation'
		});
		newConversationButton.addEventListener('click', () => this.newConversation());

		// Add session loading controls (initially hidden until we know agent capabilities)
		this.sessionIdInput = statusBarContainer.createEl('input', {
			cls: 'acp-session-id-input',
			attr: {
				type: 'text',
				placeholder: 'Session ID'
			}
		});
		this.sessionIdInput.addClass('acp-hidden');

		this.loadSessionButton = statusBarContainer.createEl('button', {
			cls: 'acp-load-session-button',
			text: 'Load Session'
		});
		this.loadSessionButton.addClass('acp-hidden');
		this.loadSessionButton.addEventListener('click', () => this.loadExistingSession());

		this.cancelButton = statusBarContainer.createEl('button', {
			cls: 'acp-cancel-button',
			text: 'Cancel'
		});
		this.cancelButton.addClass('acp-hidden');
		this.cancelButton.addEventListener('click', () => this.cancelCurrentTurn());

		// Create messages container
		this.messagesContainer = container.createDiv({ cls: 'acp-messages' });

		// Initialize message renderer
		this.messageRenderer = new MessageRenderer(this.messagesContainer, this.component);

		// Create input container
		this.inputContainer = container.createDiv({ cls: 'acp-input-container' });

		// Create autocomplete container (positioned absolutely above input)
		const autocompleteContainer = this.inputContainer.createDiv({ cls: 'acp-autocomplete acp-hidden' });

		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'acp-input',
			attr: {
				placeholder: 'Type your message to the agent... (Enter to send, Shift+Enter for newline)',
				rows: '3'
			}
		});

		// Initialize autocomplete manager
		this.autocompleteManager = new AutocompleteManager(this.app, this.inputField, autocompleteContainer);

		// Add close button to view header
		this.addAction('cross', 'Close', () => {
			this.leaf.detach();
		});

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

		// Initialize client when view opens (after all UI elements are created)
		this.initializeClient();

		// Set git integration
		if (this.plugin.gitIntegration) {
			this.setGitIntegration(this.plugin.gitIntegration);
		}
	}

	initializeClient(): void {
		if (!this.client) {
			this.client = new ACPClient(this.plugin.app, this.plugin.settings, this.plugin);
			this.setClient(this.client);
		}
	}

	setClient(client: ACPClient): void {
		this.client = client;
		this.client.setUpdateCallback((update: SessionUpdate) => {
			this.handleUpdate(update);
		});

		// Set client for mode manager
		if (this.modeManager) {
			this.modeManager.setClient(client);
		}

		// Auto-connect when client is set (but only if not already connected)
		if (this.connectionState === ConnectionState.NOT_CONNECTED) {
			this.connect();
		}
	}

	private updateLoadSessionControls(): void {
		if (!this.client) return;

		const supportsLoadSession = this.client.supportsLoadSession();

		if (this.sessionIdInput && this.loadSessionButton) {
			this.sessionIdInput.toggleClass('acp-hidden', !supportsLoadSession);
			this.loadSessionButton.toggleClass('acp-hidden', !supportsLoadSession);
		}
	}

	setGitIntegration(gitIntegration: GitIntegration): void {
		this.gitIntegration = gitIntegration;
	}

	setInitialPrompt(prompt: string): void {
		this.initialPrompt = prompt;
		// If already connected, send immediately
		if (this.connectionState === ConnectionState.SESSION_ACTIVE) {
			this.sendInitialPrompt();
		}
	}

	private async sendInitialPrompt(): Promise<void> {
		if (!this.initialPrompt || !this.client) {
			return;
		}

		const prompt = this.initialPrompt;
		this.initialPrompt = null; // Clear to prevent duplicate sends

		// Show a visual indicator that this was triggered
		this.addMessage('system', '🤖 Triggered by vault event');

		// Add user message and send to agent
		this.addMessage('user', prompt);
		this.startAgentTurn();

		try {
			await this.client.sendPrompt(prompt);
		} catch (err) {
			new Notice(`Failed to send triggered message: ${err.message}`);
			console.error('Send error:', err);
			this.endAgentTurn();
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
			return;
		}

		try {
			this.updateConnectionState(ConnectionState.CONNECTING);
			await this.client.initialize();
			this.updateConnectionState(ConnectionState.CONNECTED);

			// Update load session controls visibility based on agent capabilities
			this.updateLoadSessionControls();

			await this.client.createSession();
			this.updateConnectionState(ConnectionState.SESSION_ACTIVE);

			// Show session ID to user
			const sessionId = this.client.getSessionId();
			if (sessionId) {
				this.addMessage('system', `Session started. Session ID: ${sessionId}`);
			}

			// Send initial prompt if one was set (e.g., from trigger)
			if (this.initialPrompt) {
				await this.sendInitialPrompt();
			}
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
		this.messageRenderer.clear();

		// Reset mode manager
		if (this.modeManager) {
			this.modeManager.reset();
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

	async loadExistingSession(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		const sessionId = this.sessionIdInput.value.trim();
		if (!sessionId) {
			new Notice('Please enter a session ID');
			return;
		}

		try {
			// Clean up current session if exists
			await this.client.cleanup();
			this.clearMessages();

			// Reset connection state
			this.updateConnectionState(ConnectionState.NOT_CONNECTED);

			// Initialize connection
			this.updateConnectionState(ConnectionState.CONNECTING);
			await this.client.initialize();
			this.updateConnectionState(ConnectionState.CONNECTED);

			// Update load session controls visibility based on agent capabilities
			this.updateLoadSessionControls();

			// Check if agent supports load session
			if (!this.client.supportsLoadSession()) {
				throw new Error('Agent does not support loading sessions');
			}

			// Load the session instead of creating new one
			await this.client.loadSession(sessionId);
			this.updateConnectionState(ConnectionState.SESSION_ACTIVE);

			this.addMessage('system', `Successfully loaded session: ${sessionId}`);

			// Clear the input field
			this.sessionIdInput.value = '';
		} catch (err) {
			this.updateConnectionState(ConnectionState.CONNECTION_FAILED);
			new Notice(`Failed to load session: ${err.message}`);
			console.error('Load session error:', err);
		}
	}

	async cancelCurrentTurn(): Promise<void> {
		if (!this.client) {
			new Notice('Client not initialized');
			return;
		}

		try {
			await this.client.cancelSession();
			this.endAgentTurn();
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

		this.startAgentTurn();

		try {
			await this.client.sendPrompt(message);
		} catch (err) {
			new Notice(`Failed to send message: ${err.message}`);
			console.error('Send error:', err);
			this.endAgentTurn();
		}
	}

	handleUpdate(update: SessionUpdate): void {
		if (update.type === 'turn_complete') {
			this.endAgentTurn();

			// Save conversation to file if tracking enabled
			if (this.plugin.settings.enableConversationTracking) {
				this.saveConversationToFile().catch((err) => {
					new Notice(`Failed to save conversation: ${err.message}`);
					console.error('Conversation tracking error:', err);
				});
			}

			// Trigger git integration if enabled
			if (this.plugin.settings.enableGitIntegration && this.gitIntegration) {
				this.gitIntegration.autoCommitIfNeeded().catch((err) => {
					console.error('Git integration error:', err);
				});
			}

			return;
		}

		// Handle mode changes - update UI
		if (update.type === 'mode_change') {
			if (this.modeManager) {
				this.modeManager.updateModeSelector(update.data);
			}
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

		if (data.update) {
			const updateData = data.update;
			const updateType = updateData.sessionUpdate;

			// Handle agent message chunks (streaming text)
			if (updateType === 'agent_message_chunk' && updateData.content) {
				this.appendToLastAgentMessage(updateData.content);
				return
			}
			else if (updateType === 'agent_thought_chunk' && updateData.content) {
				this.appendToLastAgentThought(updateData.content);
				return
			}
			else if (updateType === 'available_commands_update' && updateData.availableCommands) {
				this.showAvailableCommands(updateData.availableCommands);
				return
			}
			else if (updateType === 'tool_call') {
				this.handleToolCallUpdate(updateData);
				return
			}
			else if (updateType === 'tool_call_update') {
				this.handleToolCallUpdate(updateData);
				return
			}
			else if (updateType === 'plan' && updateData.entries) {
				this.plugin.openPlanView(updateData);
				return
			}
			else if (updateType === 'current_mode_update' && updateData.currentModeId) {
				if (this.modeManager) {
					this.modeManager.updateCurrentMode(updateData.currentModeId);
				}
				return
			}
		}
		// No update field, might be a different structure
		console.warn('Unhandled type:', data);
		this.showDebugMessage(data);
	}


	private async appendToLastAgentMessage(content: ContentBlock): Promise<void> {
		// End thought message when transitioning to agent message
		this.messageRenderer.endCurrentThoughtMessage();
		await this.messageRenderer.appendToCurrentAgentMessage(content);
	}

	private async appendToLastAgentThought(content: ContentBlock): Promise<void> {
		// Append to current thought message (creates one if needed)
		await this.messageRenderer.appendToCurrentThoughtMessage(content);
	}


	private startAgentTurn(): void {
		this.messageRenderer.addMessage(new PendingMessage('pending', this.component));
		this.cancelButton.removeClass('acp-hidden');
	}

	private endAgentTurn(): void {
		this.messageRenderer.removePendingMessage();
		this.cancelButton.addClass('acp-hidden');
	}

	private async showAvailableCommands(commands: AvailableCommand[]): Promise<void> {
		// Store commands for autocomplete, minus those that don't make sense in obsidian.
		const filteredCommands = commands.filter((x) => !["pr-comments", "review", "security-review"].contains(x.name));
		if (this.autocompleteManager) {
			this.autocompleteManager.setAvailableCommands(filteredCommands);
		}

		// Update or create commands message
		await this.messageRenderer.updateOrCreateCommandsMessage(filteredCommands);
	}

	private async handleToolCallUpdate(updateData: ToolCallUpdate): Promise<void> {
		this.messageRenderer.endCurrentAgentMessage();
		this.messageRenderer.endCurrentThoughtMessage();
		await this.messageRenderer.updateOrCreateToolCallMessage(updateData);
	}


	private showPermissionRequest(params: RequestPermissionRequest, resolve: (response: RequestPermissionResponse) => void): void {
		this.messageRenderer.endCurrentAgentMessage();
		this.messageRenderer.endCurrentThoughtMessage();

		const permissionId = `permission-${Date.now()}`;
		const message = new PermissionRequestMessage(permissionId, params, resolve, this.component);
		this.messageRenderer.addMessage(message);
	}

	private showDebugMessage(data: unknown): void {
		const debugId = `debug-${Date.now()}`;
		const message = new DebugMessage(debugId, data, this.component);
		this.messageRenderer.addMessage(message);
	}

	async addMessage(sender: 'user' | 'agent' | 'system', content: string): Promise<void> {
		// Reset current agent message tracker when adding a new non-agent message
		if (sender === 'user' || sender === 'system') {
			this.messageRenderer.endCurrentAgentMessage();
			this.messageRenderer.endCurrentThoughtMessage();
		}

		const messageId = `${sender}-${Date.now()}-${Math.random()}`;
		const message = new TextMessage(messageId, sender, content, this.component);

		await this.messageRenderer.addMessage(message);
	}

	private async saveConversationToFile(): Promise<void> {
		if (!this.client) return;

		const sessionId = this.client.getSessionId();
		if (!sessionId) return;

			const folder = this.plugin.settings.conversationTrackingFolder;
			const filePath = `${folder}${sessionId}.md`;

			// Ensure folder exists
			await this.ensureConversationFolder(folder);

			// Write conversation
			await this.messageRenderer.writeConversationToFile(
				this.app.vault,
				filePath,
				sessionId
			);
	}

	private async ensureConversationFolder(folder: string): Promise<void> {
		// Remove trailing slash for folder existence check
		const folderPath = folder.endsWith('/') ? folder.slice(0, -1) : folder;

		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}
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
