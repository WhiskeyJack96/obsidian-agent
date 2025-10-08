import { App, Modal } from 'obsidian';

export class PermissionModal extends Modal {
	private resolve: (optionId: string | null) => void;
	private toolCall: any;
	private options: any[];

	constructor(app: App, toolCall: any, options: any[]) {
		super(app);
		this.toolCall = toolCall;
		this.options = options;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('acp-permission-modal');

		contentEl.createEl('h2', { text: 'Permission Request' });

		// Show tool call info
		const toolInfo = contentEl.createDiv({ cls: 'acp-permission-tool-info' });
		toolInfo.createEl('strong', { text: 'Tool Call:' });

		if (this.toolCall.title) {
			toolInfo.createEl('div', { text: this.toolCall.title, cls: 'acp-permission-title' });
		}

		if (this.toolCall.rawInput) {
			const inputPre = toolInfo.createEl('pre', { cls: 'acp-permission-input' });
			inputPre.setText(JSON.stringify(this.toolCall.rawInput, null, 2));
		}

		// Show options
		const optionsContainer = contentEl.createDiv({ cls: 'acp-permission-options' });

		for (const option of this.options) {
			const button = optionsContainer.createEl('button', {
				cls: `acp-permission-option acp-permission-${option.kind}`,
				text: option.name
			});

			button.addEventListener('click', () => {
				this.resolve(option.optionId);
				this.close();
			});
		}

		// Add cancel button
		const cancelButton = contentEl.createEl('button', {
			cls: 'acp-permission-cancel',
			text: 'Cancel'
		});

		cancelButton.addEventListener('click', () => {
			this.resolve(null);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async requestPermission(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}
