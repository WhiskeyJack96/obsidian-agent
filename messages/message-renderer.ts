import { App, Component, Vault, TFile } from 'obsidian';
import { Message, MessageUpdateData } from './base-message';
import { TextMessage } from './text-message';
import { ThoughtMessage } from './thought-message';
import { ToolCallMessage } from './tool-call-message';
import { CommandsMessage } from './commands-message';
import { ToolCallUpdate, ContentBlock, AvailableCommand } from '../types';

/**
 * Manages the lifecycle of messages in the chat interface.
 * Handles rendering, updating, and removing messages, as well as scroll management.
 */
export class MessageRenderer {
	private app: App;
	private messages: Map<string, Message>;
	private container: HTMLElement;
	private component: Component;
	private pendingMessageId: string | null = null;
	private currentAgentMessageId: string | null = null;
	private currentThoughtMessageId: string | null = null;
	private commandsMessageId: string | null = null;
	private toolCallCache: Map<string, ToolCallUpdate> = new Map();

	constructor(app: App, container: HTMLElement, component: Component) {
		this.app = app;
		this.container = container;
		this.component = component;
		this.messages = new Map();

		// Add click handler for internal links
		this.container.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;
			const anchor = target.closest('a.internal-link');

			if (anchor) {
				event.preventDefault();
				const href = anchor.getAttribute('data-href');
				if (href) {
					void this.app.workspace.openLinkText(href, '', false);
				}
			}
		});
	}

	/**
	 * Add a new message and render it.
	 */
	async addMessage(message: Message): Promise<void> {
		// If this is a pending message, track it
		if (message.constructor.name === 'PendingMessage') {
			this.removePendingMessage();
			this.pendingMessageId = message.id;
		}

		this.messages.set(message.id, message);
		await message.render(this.container);
		this.ensurePendingAtBottom();
		this.scrollToBottom();
	}

	/**
	 * Update an existing message with new data.
	 */
	async updateMessage(id: string, data: MessageUpdateData): Promise<void> {
		const message = this.messages.get(id);
		if (message && message.update) {
			await message.update(data);
			this.ensurePendingAtBottom();
		}
	}

	/**
	 * Remove a message by ID.
	 */
	removeMessage(id: string): void {
		const message = this.messages.get(id);
		if (message) {
			message.remove();
			this.messages.delete(id);

			if (id === this.pendingMessageId) {
				this.pendingMessageId = null;
			}
		}
	}

	/**
	 * Get a message by ID.
	 */
	getMessage(id: string): Message | undefined {
		return this.messages.get(id);
	}

	/**
	 * Check if a message exists.
	 */
	hasMessage(id: string): boolean {
		return this.messages.has(id);
	}

	/**
	 * Clear all messages.
	 */
	clear(): void {
		for (const message of this.messages.values()) {
			message.remove();
		}
		this.messages.clear();
		this.pendingMessageId = null;
		this.currentAgentMessageId = null;
		this.currentThoughtMessageId = null;
		this.commandsMessageId = null;
		this.toolCallCache.clear();
		this.container.empty();
	}

	/**
	 * Remove the pending message (if one exists).
	 */
	removePendingMessage(): void {
		if (this.pendingMessageId) {
			this.removeMessage(this.pendingMessageId);
		}
	}

	/**
	 * Append content to the current agent message (creating one if needed).
	 */
	async appendToCurrentAgentMessage(content: ContentBlock): Promise<void> {
		if (content.type === 'text' && content.text) {
			// Create new agent message if we don't have one
			if (!this.currentAgentMessageId) {
				this.currentAgentMessageId = `agent-${Date.now()}`;
				const message = new TextMessage(this.currentAgentMessageId, 'agent', '', this.component);
				await this.addMessage(message);
			}

			// Get current message and accumulate text
			const currentMessage = this.messages.get(this.currentAgentMessageId);
			if (currentMessage && currentMessage instanceof TextMessage) {
				const currentText = currentMessage.getContent();

				// Smart spacing: detect if we need to add paragraph breaks between chunks
				let textToAdd = content.text;
				if (currentText.length > 0) {
					const lastChar = currentText.trim().slice(-1);
					const firstChar = content.text.trim()[0];

					// If previous text ends with sentence-ending punctuation and new text starts with uppercase,
					// it's likely a new thought - add double newline for paragraph break
					if (/[.!?:]/.test(lastChar) && firstChar && /[A-Z]/.test(firstChar)) {
						// Only add spacing if there isn't already whitespace at the boundary
						if (!/\s$/.test(currentText) && !/^\s/.test(content.text)) {
							textToAdd = '\n\n' + content.text;
						}
					}
				}

				// Update message with accumulated text
				const newText = currentText + textToAdd;
				await currentMessage.update(newText);
			}
		}
	}

	/**
	 * Update or create the commands message.
	 */
	async updateOrCreateCommandsMessage(commands: AvailableCommand[]): Promise<void> {
		// Reuse existing commands message if it exists, otherwise create new one
		if (this.commandsMessageId && this.messages.has(this.commandsMessageId)) {
			await this.updateMessage(this.commandsMessageId, commands);
		} else {
			this.commandsMessageId = 'commands';
			const message = new CommandsMessage(this.commandsMessageId, commands, this.component);
			await this.addMessage(message);
		}
	}

	/**
	 * Update or create a tool call message, merging with cached data.
	 */
	async updateOrCreateToolCallMessage(update: ToolCallUpdate): Promise<void> {
		const toolCallId = update.toolCallId;
		if (!toolCallId) {
			return;
		}

		// Get cached permission details if available
		const cachedDetails = this.toolCallCache.get(toolCallId);

		// Merge cached details with update data (update data takes precedence)
		const mergedData = {
			...cachedDetails,
			...update,
			// Preserve cached rawInput if updateData doesn't have it
			rawInput: update.rawInput || cachedDetails?.rawInput
		};

		// Clear completed tool calls out of the cache to keep it from getting very large
		if (mergedData.status === "completed") {
			this.toolCallCache.delete(toolCallId);
		} else {
			this.toolCallCache.set(toolCallId, mergedData);
		}

		// Check if we already have a message for this tool call
		if (this.messages.has(toolCallId)) {
			// Update existing message
			await this.updateMessage(toolCallId, mergedData);
		} else {
			// Create new message for this tool call
			const message = new ToolCallMessage(toolCallId, mergedData, this.component);
			await this.addMessage(message);
		}
	}

	/**
	 * End the current agent message (clears the tracker).
	 */
	endCurrentAgentMessage(): void {
		this.currentAgentMessageId = null;
	}

	/**
	 * Append content to the current thought message (creating one if needed).
	 */
	async appendToCurrentThoughtMessage(content: ContentBlock): Promise<void> {
		if (content.type === 'text' && content.text) {
			// Create new thought message if we don't have one
			if (!this.currentThoughtMessageId) {
				this.currentThoughtMessageId = `thought-${Date.now()}`;
				const message = new ThoughtMessage(this.currentThoughtMessageId, '', this.component);
				await this.addMessage(message);
			}

			// Get current message and accumulate text
			const currentMessage = this.messages.get(this.currentThoughtMessageId);
			if (currentMessage && currentMessage instanceof ThoughtMessage) {
				const currentText = currentMessage.getContent();

				// Smart spacing: add paragraph breaks between chunks when appropriate
				let textToAdd = content.text;
				if (currentText.length > 0) {
					const lastChar = currentText.trim().slice(-1);
					const firstChar = content.text.trim()[0];

					// If previous text ends with sentence-ending punctuation and new text starts with uppercase,
					// it's likely a new thought - add double newline for paragraph break
					if (/[.!?:]/.test(lastChar) && firstChar && /[A-Z]/.test(firstChar)) {
						// Only add spacing if there isn't already whitespace at the boundary
						if (!/\s$/.test(currentText) && !/^\s/.test(content.text)) {
							textToAdd = '\n\n' + content.text;
						}
					}
				}

				// Update message with accumulated text
				const newText = currentText + textToAdd;
				await currentMessage.update(newText);
			}
		}
	}

	/**
	 * End the current thought message (clears the tracker).
	 */
	endCurrentThoughtMessage(): void {
		this.currentThoughtMessageId = null;
	}

	/**
	 * Ensure the pending message stays at the bottom of the container.
	 */
	private ensurePendingAtBottom(): void {
		if (this.pendingMessageId) {
			const pendingMessage = this.messages.get(this.pendingMessageId);
			if (pendingMessage) {
				const element = pendingMessage.getElement();
				if (element && element.parentElement === this.container) {
					this.container.appendChild(element);
					this.scrollToBottom();
				}
			}
		}
	}

	/**
	 * Scroll the container to the bottom.
	 */
	private scrollToBottom(): void {
		this.container.scrollTop = this.container.scrollHeight;
	}

	/**
	 * Get all messages as markdown for conversation tracking.
	 */
	getConversationMarkdown(sessionId: string): string {
		const parts: string[] = [];

		// Add header
		const timestamp = new Date().toLocaleString();
		parts.push(`# Conversation: ${sessionId}`);
		parts.push(`Started: ${timestamp}`);
		parts.push('');
		parts.push('---');
		parts.push('');

		// Iterate through messages in order and convert to markdown
		for (const message of this.messages.values()) {
			const markdown = message.toMarkdown();
			if (markdown) {
				parts.push(markdown);
				parts.push('');
				parts.push('---');
				parts.push('');
			}
		}

		return parts.join('\n');
	}

	/**
	 * Write the conversation to a file in the vault.
	 */
	async writeConversationToFile(vault: Vault, filePath: string, sessionId: string): Promise<void> {
		const markdown = this.getConversationMarkdown(sessionId);
		const file = vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			await vault.modify(file, markdown);
		} else {
			await vault.create(filePath, markdown);
		}
	}
}
