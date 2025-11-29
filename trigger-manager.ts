import { TFile, Vault, Notice, MetadataCache } from 'obsidian';
import type ACPClientPlugin from './main';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
const DEFAULT_AUDIO_PROMPT = 'Transcribe this audio and create a new note with the transcription';

export class TriggerManager {
	private plugin: ACPClientPlugin;
	private vault: Vault;
	private metadataCache: MetadataCache;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	// Per-session tracking: sessionId → Set<filePath>
	private turnWrittenFiles: Map<string, Set<string>> = new Map();

	/**
	 * Track a file written by an agent during the current turn.
	 * Files tracked by any session will not trigger until that session's turn completes.
	 */
	trackAgentWrite(sessionId: string, filePath: string) {
		if (!this.turnWrittenFiles.has(sessionId)) {
			this.turnWrittenFiles.set(sessionId, new Set());
		}
		this.turnWrittenFiles.get(sessionId)!.add(filePath);
	}

	/**
	 * Clear tracked agent writes for a specific session.
	 * Call this when an agent turn completes.
	 */
	clearTurnWrites(sessionId: string) {
		this.turnWrittenFiles.delete(sessionId);
	}

	/**
	 * Check if a file is being tracked by any active session.
	 */
	private isFileTracked(filePath: string): boolean {
		for (const files of this.turnWrittenFiles.values()) {
			if (files.has(filePath)) {
				return true;
			}
		}
		return false;
	}

	constructor(plugin: ACPClientPlugin) {
		this.plugin = plugin;
		this.vault = plugin.app.vault;
		this.metadataCache = plugin.app.metadataCache;
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

		// Skip if metadata triggers are disabled
		if (!this.plugin.settings.enableMetadataTriggers) {
			return;
		}

		// Skip if this file was written by an agent during any active turn
		if (this.isFileTracked(filePath)) {
			return;
		}

		// Check if file has acp-trigger metadata set to true
		const cache = this.metadataCache.getFileCache(file);
		const shouldTrigger = cache?.frontmatter?.['acp-trigger'] === true;

		if (!shouldTrigger) {
			return;
		}

		// Debounce trigger execution
		this.debounceTrigger(file, event);
	}

	/**
	 * Debounce trigger execution per file path
	 */
	private debounceTrigger(file: TFile, event: 'created' | 'modified') {
		const debounceKey = file.path;

		// Clear existing timer for this file
		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey)!);
		}

		// Set new timer
		const timer = setTimeout(() => {
			this.executeTrigger(file, event);
			this.debounceTimers.delete(debounceKey);
		}, this.plugin.settings.metadataTriggerDebounceMs);

		this.debounceTimers.set(debounceKey, timer);
	}

	/**
	 * Execute a trigger: read metadata, set acp-trigger to false, spawn agent
	 */
	private async executeTrigger(file: TFile, event: 'created' | 'modified') {
		try {
			// Read file content to get frontmatter
			const content = await this.vault.read(file);
			const cache = this.metadataCache.getFileCache(file);

			// Get custom prompt from frontmatter, or use default for audio
			let prompt = cache?.frontmatter?.['acp-prompt'] as string | undefined;
			const isAudio = this.isAudioFile(file);

			if (!prompt) {
				if (isAudio) {
					prompt = DEFAULT_AUDIO_PROMPT;
				} else {
					// For non-audio files without custom prompt, just mention the file
					prompt = `Process the file: ${file.path}`;
				}
			}

			// Set acp-trigger to false BEFORE spawning agent to prevent race conditions
			await this.disableTrigger(file, content);

			// Add file context to prompt
			const fullPrompt = `${prompt}\n\nFile: ${file.path}`;

			// For audio files, we need to handle differently
			if (isAudio) {
				// Spawn agent view with audio file context
				await this.plugin.activateView(fullPrompt, file);
			} else {
				// Spawn agent view with text prompt only
				await this.plugin.activateView(fullPrompt);
			}

		} catch (error) {
			console.error('Error executing trigger:', error);
			new Notice(`Failed to execute trigger: ${error.message}`);
		}
	}

	/**
	 * Check if file is an audio file based on extension
	 */
	private isAudioFile(file: TFile): boolean {
		return AUDIO_EXTENSIONS.some(ext => file.path.toLowerCase().endsWith(ext));
	}

	/**
	 * Disable trigger by setting acp-trigger to false in frontmatter
	 */
	private async disableTrigger(file: TFile, content: string): Promise<void> {
		// Use regex to replace acp-trigger: true with acp-trigger: false
		// This handles both with and without quotes
		const updatedContent = content.replace(
			/^(\s*acp-trigger\s*:\s*)(true|"true"|'true')/m,
			'$1false'
		);

		if (updatedContent !== content) {
			await this.vault.modify(file, updatedContent);
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
