import { Notice } from 'obsidian';
import { ACPClient } from './acp-client';
import { SessionModeState } from './types';

export class ModeManager {
	private modeSelector: HTMLSelectElement;
	private client: ACPClient | null = null;
	private onModeChangeMessage: (modeName: string) => void;

	constructor(
		container: HTMLElement,
		onModeChangeMessage: (modeName: string) => void
	) {
		this.onModeChangeMessage = onModeChangeMessage;

		// Create mode selector dropdown
		this.modeSelector = container.createEl('select', {
			cls: 'acp-mode-selector'
		});
		this.modeSelector.disabled = true; // Initially disabled until session is created
		this.modeSelector.addEventListener('change', () => this.handleModeChange());
	}

	setClient(client: ACPClient | null): void {
		this.client = client;
	}

	updateModeSelector(modeState: SessionModeState): void {
		if (!modeState) {
			return;
		}

		// Clear existing options then create them from the new list
		this.modeSelector.empty();
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

		this.modeSelector.value = modeState.currentModeId;
		this.modeSelector.disabled = false;
	}

	updateCurrentMode(modeId: string): void {
		// Update the dropdown selection
		this.modeSelector.value = modeId;
		if (this.client) {
			const modeState = this.client.getModeState();
			if (modeState) {
				modeState.currentModeId = modeId;

				// Find the mode name for display
				const mode = modeState.availableModes.find(m => m.id === modeId);
				if (mode) {
					this.onModeChangeMessage(mode.name);
				}
			}
		}
	}

	private async handleModeChange(): Promise<void> {
		if (!this.client) {
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
				this.onModeChangeMessage(mode.name);
			}
		} catch (err) {
			new Notice(`Failed to change mode: ${err.message}`);
			console.error('Mode change error:', err);

			// Revert dropdown to previous value
			this.modeSelector.value = modeState.currentModeId;
		}
	}

	reset(): void {
		this.modeSelector.empty();
		this.modeSelector.disabled = true;
	}

	getElement(): HTMLSelectElement {
		return this.modeSelector;
	}
}
