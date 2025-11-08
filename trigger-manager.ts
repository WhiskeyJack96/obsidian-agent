import { TFile, Vault, Notice } from 'obsidian';
import { TriggerConfig } from './settings';
import type ACPClientPlugin from './main';

export class TriggerManager {
	private plugin: ACPClientPlugin;
	private vault: Vault;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	constructor(plugin: ACPClientPlugin) {
		this.plugin = plugin;
		this.vault = plugin.app.vault;
	}

	/**
	 * Register vault event listeners for create and modify events
	 */
	registerListeners() {
		this.plugin.registerEvent(
			this.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleVaultEvent(file, 'created');
				}
			})
		);
		this.plugin.registerEvent(
			this.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleVaultEvent(file, 'modified');
				}
			})
		);
	}

	/**
	 * Handle vault events with debouncing
	 */
	private async handleVaultEvent(file: TFile, event: 'created' | 'modified') {

		const filePath = file.path;

		// Find matching triggers
		const matchingTriggers = this.plugin.settings.triggers.filter(trigger => {
			if (!trigger.enabled) {
				return false;
			}

			// "." means all notes
			if (trigger.folder === '.') {
				return true;
			}

			// Otherwise check if file is in the trigger folder
			return filePath.startsWith(trigger.folder);
		});

		if (matchingTriggers.length === 0) {
			return;
		}

		// Process each matching trigger with debouncing
		for (const trigger of matchingTriggers) {
			this.debounceTrigger(trigger, file, event);
		}
	}

	/**
	 * Debounce trigger execution per file path
	 */
	private debounceTrigger(trigger: TriggerConfig, file: TFile, event: 'created' | 'modified') {
		const debounceKey = `${trigger.id}:${file.path}`;

		// Clear existing timer for this trigger+file combination
		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey)!);
		}

		// Set new timer
		const timer = setTimeout(() => {
			this.executeTrigger(trigger, file, event);
			this.debounceTimers.delete(debounceKey);
		}, trigger.debounceMs);

		this.debounceTimers.set(debounceKey, timer);
	}

	/**
	 * Execute a trigger: read file content, replace placeholders, spawn agent
	 */
	private async executeTrigger(trigger: TriggerConfig, file: TFile, event: 'created' | 'modified') {
		try {
			// Read file content
			const content = await this.vault.read(file);

			// Replace placeholders in prompt template
			const prompt = trigger.prompt
				.replace(/{file}/g, file.path)
				.replace(/{event}/g, event)
				.replace(/{content}/g, content);

			// Show notice to user
			new Notice(`Trigger activated: ${trigger.folder} (${event})`);

			// Spawn new agent view with the generated prompt
			await this.plugin.activateView(prompt);

		} catch (error) {
			console.error('Error executing trigger:', error);
			new Notice(`Failed to execute trigger: ${error.message}`);
		}
	}

	/**
	 * Clean up all pending debounce timers
	 */
	cleanup() {
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}
}
