import { ItemView, WorkspaceLeaf, Notice, Component } from 'obsidian';
import { ACPClient } from './acp-client';
import type ACPClientPlugin from './main';
import { AutocompleteManager } from './autocomplete-manager';
import {
	ContentBlock,
	AvailableCommand,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionMode,
	SessionModeState,
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
	private messageRenderer: MessageRenderer;

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

		// Initialize message renderer
		this.messageRenderer = new MessageRenderer(this.messagesContainer, this.component);

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
		this.messageRenderer.clear();

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
				this.handleToolCallUpdate(updateData);
			}
			// Handle tool call updates (progress/completion)
			else if (updateType === 'tool_call_update') {
				this.handleToolCallUpdate(updateData);
			}
			// Handle plan updates (new type)
			else if (updateType === 'plan' && updateData.entries) {
				this.plugin.openPlanView(updateData);
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


	private async appendToLastAgentMessage(content: ContentBlock): Promise<void> {
		await this.messageRenderer.appendToCurrentAgentMessage(content);
	}


	private showPendingMessage(): void {
		// Remove any existing pending message first
		this.removePendingMessage();

		// Create pending message
		const pendingId = 'pending';
		const message = new PendingMessage(pendingId, this.component);
		this.messageRenderer.addMessage(message);

		// Show cancel button
		this.cancelButton.style.display = 'block';
	}

	private removePendingMessage(): void {
		this.messageRenderer.removePendingMessage();

		// Hide cancel button when no pending message
		this.cancelButton.style.display = 'none';
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
		await this.messageRenderer.updateOrCreateToolCallMessage(updateData);
	}


	private showPermissionRequest(params: RequestPermissionRequest, resolve: (response: RequestPermissionResponse) => void): void {
		this.messageRenderer.endCurrentAgentMessage();

		const permissionId = `permission-${Date.now()}`;
		const message = new PermissionRequestMessage(permissionId, params, resolve, this.component);
		this.messageRenderer.addMessage(message);
	}

	private async showModeChange(mode: SessionMode | string): Promise<void> {
		const modeName = typeof mode === 'string' ? mode : (mode.name || 'unknown');
		await this.addMessage('system', `Mode changed to: ${modeName}`);
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
		const debugId = `debug-${Date.now()}`;
		const message = new DebugMessage(debugId, data, this.component);
		this.messageRenderer.addMessage(message);
	}

	async addMessage(sender: 'user' | 'agent' | 'system', content: string): Promise<void> {
		// Reset current agent message tracker when adding a new non-agent message
		if (sender === 'user' || sender === 'system') {
			this.messageRenderer.endCurrentAgentMessage();
		}

		const messageId = `${sender}-${Date.now()}-${Math.random()}`;
		const message = new TextMessage(messageId, sender, content, this.component);

		await this.messageRenderer.addMessage(message);
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
