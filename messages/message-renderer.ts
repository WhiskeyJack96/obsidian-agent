import { Component } from 'obsidian';
import { Message } from './base-message';

/**
 * Manages the lifecycle of messages in the chat interface.
 * Handles rendering, updating, and removing messages, as well as scroll management.
 */
export class MessageRenderer {
	private messages: Map<string, Message>;
	private container: HTMLElement;
	private component: Component;
	private pendingMessageId: string | null = null;

	constructor(container: HTMLElement, component: Component) {
		this.container = container;
		this.component = component;
		this.messages = new Map();
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
	async updateMessage(id: string, data: any): Promise<void> {
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
}
