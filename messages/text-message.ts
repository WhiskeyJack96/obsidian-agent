import { Component, MarkdownRenderer } from 'obsidian';
import { Message } from './base-message';

/**
 * A simple text message from user, agent, or system.
 */
export class TextMessage extends Message {
	private sender: 'user' | 'agent' | 'system';
	private content: string;
	private contentEl: HTMLElement | null = null;

	constructor(id: string, sender: 'user' | 'agent' | 'system', content: string, component: Component) {
		super(id, component);
		this.sender = sender;
		this.content = content;
	}

	async render(container: HTMLElement): Promise<HTMLElement> {
		const senderLabel = this.sender.charAt(0).toUpperCase() + this.sender.slice(1);
		const messageEl = this.createMessageElement(container, `acp-message-${this.sender}`, senderLabel);

		this.contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		// Render markdown for user and agent messages, plain text for system
		if (this.sender === 'user' || this.sender === 'agent') {
			await MarkdownRenderer.renderMarkdown(this.content, this.contentEl, '', this.component);
		} else {
			this.contentEl.setText(this.content);
		}

		return messageEl;
	}

	/**
	 * Update the message content (useful for streaming agent messages).
	 */
	async update(newContent: string): Promise<void> {
		this.content = newContent;

		if (this.contentEl) {
			this.contentEl.empty();

			if (this.sender === 'user' || this.sender === 'agent') {
				await MarkdownRenderer.renderMarkdown(this.content, this.contentEl, '', this.component);
			} else {
				this.contentEl.setText(this.content);
			}
		}
	}

	getContent(): string {
		return this.content;
	}
}
