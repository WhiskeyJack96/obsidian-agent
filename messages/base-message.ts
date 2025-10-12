import { Component } from 'obsidian';

/**
 * Base class for all message types in the agent view.
 * Each message knows how to render itself and handle its own updates.
 */
export abstract class Message {
	id: string;
	timestamp: Date;
	protected element: HTMLElement | null = null;
	protected component: Component;

	constructor(id: string, component: Component) {
		this.id = id;
		this.timestamp = new Date();
		this.component = component;
	}

	/**
	 * Render the message into a container and return the created element.
	 * Should be called only once per message instance.
	 */
	abstract render(container: HTMLElement): HTMLElement | Promise<HTMLElement>;

	/**
	 * Update the message with new data (optional, not all messages support updates).
	 */
	update?(data: any): void;

	/**
	 * Remove the message from the DOM.
	 */
	remove(): void {
		if (this.element) {
			this.element.remove();
			this.element = null;
		}
	}

	/**
	 * Get the rendered element (if it has been rendered).
	 */
	getElement(): HTMLElement | null {
		return this.element;
	}

	/**
	 * Helper to create a message wrapper with sender label.
	 */
	protected createMessageElement(container: HTMLElement, cssClass: string, senderLabel?: string): HTMLElement {
		const messageEl = container.createDiv({ cls: `acp-message ${cssClass}` });

		if (senderLabel) {
			const senderEl = messageEl.createDiv({ cls: 'acp-message-sender' });
			senderEl.setText(senderLabel);
		}

		this.element = messageEl;
		return messageEl;
	}
}
