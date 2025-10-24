import { App, Modal, Notice, Setting } from 'obsidian';

export interface CommitReviewResult {
	approved: boolean;
	message?: string;
}

export class CommitReviewModal extends Modal {
	private result: CommitReviewResult = { approved: false };
	private onSubmit: (result: CommitReviewResult) => void;
	private commitMessage: string = '';

	constructor(app: App, onSubmit: (result: CommitReviewResult) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.addClass('acp-commit-review-modal');

		contentEl.createEl('h2', { text: 'Review Git Commit' });

		contentEl.createEl('p', {
			text: 'The agent has completed its turn. Would you like to commit the changes?'
		});

		// Commit message input
		new Setting(contentEl)
			.setName('Commit message')
			.setDesc('Enter a descriptive commit message')
			.addTextArea(text => {
				text
					.setPlaceholder('Describe the changes...')
					.setValue(this.commitMessage)
					.onChange(value => {
						this.commitMessage = value;
					});
				// Make the text area larger
				text.inputEl.rows = 4;
				text.inputEl.addClass('acp-input-full-width');
			});

		// Buttons container
		const buttonContainer = contentEl.createDiv({ cls: 'acp-commit-buttons' });

		// Commit button
		const commitButton = buttonContainer.createEl('button', {
			text: 'Commit Changes',
			cls: 'mod-cta'
		});
		commitButton.addEventListener('click', () => {
			if (!this.commitMessage.trim()) {
				new Notice('Please enter a commit message');
				return;
			}
			this.result = {
				approved: true,
				message: this.commitMessage.trim()
			};
			this.close();
		});

		// Skip button
		const skipButton = buttonContainer.createEl('button', {
			text: 'Skip'
		});
		skipButton.addEventListener('click', () => {
			this.result = { approved: false };
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.onSubmit(this.result);
	}
}
