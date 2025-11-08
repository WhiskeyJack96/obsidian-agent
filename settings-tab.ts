import { App, PluginSettingTab, Setting, Notice, TFolder } from 'obsidian';
import ACPClientPlugin from './main';
import { TriggerConfig } from './settings';

export class ACPClientSettingTab extends PluginSettingTab {
	plugin: ACPClientPlugin;
	private autocompleteContainers: Map<HTMLInputElement, HTMLElement> = new Map();

	constructor(app: App, plugin: ACPClientPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'ACP Client Settings' });

		new Setting(containerEl)
			.setName('Agent Command')
			.setDesc('Path to the agent executable (e.g., /usr/local/bin/claude-code)')
			.addText(text => text
				.setPlaceholder('/path/to/agent')
				.setValue(this.plugin.settings.agentCommand)
				.onChange(async (value) => {
					this.plugin.settings.agentCommand = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Agent Arguments')
			.setDesc('Arguments to pass to the agent (comma-separated)')
			.addText(text => text
				.setPlaceholder('--arg1, --arg2')
				.setValue(this.plugin.settings.agentArgs.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.agentArgs = value
						.split(',')
						.map(arg => arg.trim())
						.filter(arg => arg.length > 0);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-approve Write Permission')
			.setDesc('Automatically approve file write/edit requests from the agent')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoApproveWritePermission)
				.onChange(async (value) => {
					this.plugin.settings.autoApproveWritePermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-approve Read Permission')
			.setDesc('Automatically approve file read requests from the agent')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoApproveReadPermission)
				.onChange(async (value) => {
					this.plugin.settings.autoApproveReadPermission = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Git Integration')
			.setDesc('Automatically commit changes after agent turns complete (requires obsidian-git plugin)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGitIntegration)
				.onChange(async (value) => {
					this.plugin.settings.enableGitIntegration = value;
					await this.plugin.saveSettings();
				}));

		// Conversation Tracking section
		containerEl.createEl('h2', { text: 'Conversation Tracking' });

		new Setting(containerEl)
			.setName('Enable Conversation Tracking')
			.setDesc('Automatically save all conversation messages to markdown files')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableConversationTracking)
				.onChange(async (value) => {
					this.plugin.settings.enableConversationTracking = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Conversation Folder')
			.setDesc('Folder path where conversation files will be saved (e.g., "conversations/")')
			.addText(text => text
				.setPlaceholder('conversations/')
				.setValue(this.plugin.settings.conversationTrackingFolder)
				.onChange(async (value) => {
					this.plugin.settings.conversationTrackingFolder = value;
					await this.plugin.saveSettings();
				}));

		// Alpha Features section
		containerEl.createEl('h2', { text: 'Alpha Features' });

		const alphaWarningContainer = containerEl.createDiv();
		alphaWarningContainer.addClass('setting-item-description');
		alphaWarningContainer.style.marginBottom = '15px';
		alphaWarningContainer.style.padding = '10px';
		alphaWarningContainer.style.backgroundColor = 'var(--background-secondary)';
		alphaWarningContainer.style.borderRadius = '5px';
		alphaWarningContainer.style.border = '1px solid var(--text-warning)';
		alphaWarningContainer.innerHTML = '<strong>⚠️ ALPHA:</strong> These features are experimental and may change or be removed in future versions. Use with caution.';

		// Obsidian Focussed Prompt
		const obsidianPromptSetting = new Setting(containerEl)
			.setName('Obsidian Focussed Prompt')
			.setDesc('Enable Obsidian-specific context in agent prompts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.obsidianFocussedPrompt)
				.onChange(async (value) => {
					this.plugin.settings.obsidianFocussedPrompt = value;
					await this.plugin.saveSettings();
				}));
		obsidianPromptSetting.settingEl.style.borderLeft = '3px solid var(--text-warning)';
		obsidianPromptSetting.settingEl.style.paddingLeft = '10px';

		// MCP Server section
		const mcpHeader = containerEl.createEl('h4', { text: 'MCP Server' });
		mcpHeader.style.color = 'var(--text-warning)';
		mcpHeader.style.marginTop = '20px';
		mcpHeader.style.marginBottom = '10px';
		mcpHeader.style.fontSize = '1.1em';

		const mcpEnableSetting = new Setting(containerEl)
			.setName('Enable MCP Server')
			.setDesc('Start an embedded MCP server that exposes Obsidian commands. The ACP agent can connect to this server to execute Obsidian commands.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableMCPServer)
				.onChange(async (value) => {
					this.plugin.settings.enableMCPServer = value;
					await this.plugin.saveSettings();

					// Start or stop the server based on the new value
					if (value) {
						await this.plugin.startMCPServer();
					} else {
						await this.plugin.stopMCPServer();
					}
				}));
		mcpEnableSetting.settingEl.style.borderLeft = '3px solid var(--text-warning)';
		mcpEnableSetting.settingEl.style.paddingLeft = '10px';

		const mcpPortSetting = new Setting(containerEl)
			.setName('MCP Server Port')
			.setDesc('Port number for the MCP server (requires restart if server is running)')
			.addText(text => text
				.setPlaceholder('3100')
				.setValue(String(this.plugin.settings.mcpServerPort))
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.mcpServerPort = port;
						await this.plugin.saveSettings();

						// Restart server if it's running
						if (this.plugin.settings.enableMCPServer) {
							await this.plugin.startMCPServer();
						}
					}
				}));
		mcpPortSetting.settingEl.style.borderLeft = '3px solid var(--text-warning)';
		mcpPortSetting.settingEl.style.paddingLeft = '10px';

		// Add MCP server info
		const mcpInfoEl = containerEl.createDiv();
		mcpInfoEl.addClass('setting-item-description');
		mcpInfoEl.setText(`MCP Server endpoint: http://localhost:${this.plugin.settings.mcpServerPort}/mcp`);
		mcpInfoEl.style.marginTop = '10px';
		mcpInfoEl.style.fontStyle = 'italic';
		mcpInfoEl.style.color = 'var(--text-muted)';

		// Automated Triggers section
		const triggersHeader = containerEl.createEl('h4', { text: 'Automated Triggers' });
		triggersHeader.style.color = 'var(--text-warning)';
		triggersHeader.style.marginTop = '20px';
		triggersHeader.style.marginBottom = '10px';
		triggersHeader.style.fontSize = '1.1em';

		const triggersDesc = containerEl.createDiv();
		triggersDesc.addClass('setting-item-description');
		triggersDesc.setText('Automatically trigger agent sessions when files are created or modified in specific folders.');
		triggersDesc.style.marginBottom = '15px';

		// Add info about placeholders
		const placeholderInfo = containerEl.createDiv();
		placeholderInfo.addClass('setting-item-description');
		placeholderInfo.setText('Available placeholders: {file} (file path), {event} (created/modified), {content} (file contents)');
		placeholderInfo.style.marginBottom = '15px';
		placeholderInfo.style.fontStyle = 'italic';
		placeholderInfo.style.color = 'var(--text-muted)';

		// Display existing triggers
		this.displayTriggers(containerEl);

		// Add new trigger button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add New Trigger')
				.setCta()
				.onClick(() => {
					this.addNewTrigger();
				}));
	}

	private displayTriggers(containerEl: HTMLElement): void {
		const triggersContainer = containerEl.createDiv({ cls: 'acp-triggers-list' });

		if (this.plugin.settings.triggers.length === 0) {
			const emptyMsg = triggersContainer.createDiv();
			emptyMsg.addClass('setting-item-description');
			emptyMsg.setText('No triggers configured. Click "Add New Trigger" to create one.');
			emptyMsg.style.marginBottom = '15px';
			emptyMsg.style.fontStyle = 'italic';
			return;
		}

		for (const trigger of this.plugin.settings.triggers) {
			this.displayTrigger(triggersContainer, trigger);
		}
	}

	private displayTrigger(container: HTMLElement, trigger: TriggerConfig): void {
		const triggerContainer = container.createDiv({ cls: 'acp-trigger-item' });
		triggerContainer.style.border = '1px solid var(--text-warning)';
		triggerContainer.style.borderLeft = '3px solid var(--text-warning)';
		triggerContainer.style.borderRadius = '5px';
		triggerContainer.style.padding = '10px';
		triggerContainer.style.marginBottom = '10px';
		triggerContainer.style.position = 'relative'; // For autocomplete positioning
		triggerContainer.style.backgroundColor = 'var(--background-secondary)';

		// Enabled toggle
		new Setting(triggerContainer)
			.setName('Enabled')
			.addToggle(toggle => toggle
				.setValue(trigger.enabled)
				.onChange(async (value) => {
					trigger.enabled = value;
					await this.plugin.saveSettings();
				}));

		// Folder path with validation and autocomplete
		const folderSetting = new Setting(triggerContainer)
			.setName('Folder Path')
			.setDesc('Files in this folder will trigger the agent (e.g., "conversations/"). Use "." for all notes.')
			.addText(text => {
				text.setPlaceholder('conversations/ or .')
					.setValue(trigger.folder)
					.onChange(async (value) => {
						// Check for conflict with conversation tracking folder
						if (this.isConflictingWithConversationFolder(value)) {
							text.inputEl.style.borderColor = 'var(--text-error)';
							this.showFolderWarning(folderSetting, 'error');
							// Don't save if there's a conflict
							return;
						} else if (value === '.' && this.plugin.settings.enableConversationTracking) {
							// Show info warning for "." with conversation tracking
							text.inputEl.style.borderColor = '';
							this.showFolderWarning(folderSetting, 'info');
							trigger.folder = value;
							await this.plugin.saveSettings();
						} else {
							text.inputEl.style.borderColor = '';
							this.showFolderWarning(folderSetting, false);
							trigger.folder = value;
							await this.plugin.saveSettings();
						}
					});

				// Add autocomplete functionality
				this.setupFolderAutocomplete(text.inputEl, trigger);
				return text;
			});

		// Show warning if currently conflicting or using "."
		if (this.isConflictingWithConversationFolder(trigger.folder)) {
			this.showFolderWarning(folderSetting, 'error');
		} else if (trigger.folder === '.' && this.plugin.settings.enableConversationTracking) {
			this.showFolderWarning(folderSetting, 'info');
		}

		// Prompt template
		new Setting(triggerContainer)
			.setName('Prompt Template')
			.setDesc('Message to send to agent. Use {file}, {event}, {content} placeholders.')
			.addTextArea(text => {
				text.setPlaceholder('Add tags to {file}')
					.setValue(trigger.prompt)
					.onChange(async (value) => {
						trigger.prompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.style.width = '100%';
				return text;
			});

		// Debounce timeout
		new Setting(triggerContainer)
			.setName('Debounce Timeout (ms)')
			.setDesc('Wait time before triggering after file changes (default: 3000ms)')
			.addText(text => text
				.setPlaceholder('3000')
				.setValue(String(trigger.debounceMs))
				.onChange(async (value) => {
					const ms = parseInt(value);
					if (!isNaN(ms) && ms >= 0) {
						trigger.debounceMs = ms;
						await this.plugin.saveSettings();
					}
				}));

		// Delete button
		new Setting(triggerContainer)
			.addButton(button => button
				.setButtonText('Delete Trigger')
				.setWarning()
				.onClick(async () => {
					await this.deleteTrigger(trigger.id);
				}));
	}

	private addNewTrigger(): void {
		const newTrigger: TriggerConfig = {
			id: Date.now().toString(),
			folder: '',
			prompt: '',
			enabled: true,
			debounceMs: 3000
		};

		this.plugin.settings.triggers.push(newTrigger);
		this.plugin.saveSettings();
		this.display(); // Refresh the settings display
		new Notice('New trigger added');
	}

	private async deleteTrigger(triggerId: string): Promise<void> {
		this.plugin.settings.triggers = this.plugin.settings.triggers.filter(
			t => t.id !== triggerId
		);
		await this.plugin.saveSettings();
		this.display(); // Refresh the settings display
		new Notice('Trigger deleted');
	}

	private isConflictingWithConversationFolder(triggerFolder: string): boolean {
		if (!triggerFolder || !this.plugin.settings.enableConversationTracking) {
			return false;
		}

		// "." is allowed but will be warned about separately
		if (triggerFolder === '.') {
			return false;
		}

		const conversationFolder = this.plugin.settings.conversationTrackingFolder;
		if (!conversationFolder) {
			return false;
		}

		// Normalize paths: remove trailing slashes and ensure consistency
		const normalizePath = (path: string) => path.replace(/\/+$/, '');
		const normalizedTrigger = normalizePath(triggerFolder);
		const normalizedConversation = normalizePath(conversationFolder);

		// Check if paths are exactly the same
		if (normalizedTrigger === normalizedConversation) {
			return true;
		}

		// Check if trigger is a parent of conversation folder
		// e.g., trigger="parent/" and conversation="parent/conversations/"
		if (normalizedConversation.startsWith(normalizedTrigger + '/')) {
			return true;
		}

		// Check if conversation is a parent of trigger folder
		// e.g., trigger="conversations/subfolder/" and conversation="conversations/"
		if (normalizedTrigger.startsWith(normalizedConversation + '/')) {
			return true;
		}

		return false;
	}

	private showFolderWarning(setting: Setting, type: 'error' | 'info' | false): void {
		// Remove existing warning if present
		const existingWarning = setting.descEl.querySelector('.acp-folder-warning');
		if (existingWarning) {
			existingWarning.remove();
		}

		if (type === 'error') {
			const warning = setting.descEl.createDiv({ cls: 'acp-folder-warning' });
			warning.style.color = 'var(--text-error)';
			warning.style.fontWeight = 'bold';
			warning.style.marginTop = '5px';
			warning.setText('⚠️ Cannot trigger on conversation tracking folder - this would create an infinite loop!');
		} else if (type === 'info') {
			const warning = setting.descEl.createDiv({ cls: 'acp-folder-warning' });
			warning.style.color = 'var(--text-warning)';
			warning.style.fontStyle = 'italic';
			warning.style.marginTop = '5px';
			warning.setText('ℹ️ Note: "." will trigger on ALL notes including conversation tracking files. This may trigger repeatedly on agent-created conversations.');
		}
	}

	private getAllFolders(): string[] {
		const folders: string[] = [];
		const allFiles = this.app.vault.getAllLoadedFiles();

		for (const file of allFiles) {
			if (file instanceof TFolder && file.path !== '/') {
				folders.push(file.path + '/');
			}
		}

		// Sort alphabetically
		return folders.sort();
	}

	private setupFolderAutocomplete(inputEl: HTMLInputElement, trigger: TriggerConfig): void {
		// Create a wrapper for positioning
		const wrapper = createDiv({ cls: 'acp-folder-autocomplete-wrapper' });
		wrapper.style.position = 'relative';
		wrapper.style.display = 'inline-block';
		wrapper.style.width = '100%';

		// Wrap the input element
		inputEl.parentElement?.insertBefore(wrapper, inputEl);
		wrapper.appendChild(inputEl);

		// Create autocomplete container
		const autocompleteContainer = createDiv({ cls: 'acp-folder-autocomplete' });
		autocompleteContainer.style.position = 'absolute';
		autocompleteContainer.style.display = 'none';
		autocompleteContainer.style.backgroundColor = 'var(--background-primary)';
		autocompleteContainer.style.border = '1px solid var(--background-modifier-border)';
		autocompleteContainer.style.borderRadius = '4px';
		autocompleteContainer.style.maxHeight = '200px';
		autocompleteContainer.style.overflowY = 'auto';
		autocompleteContainer.style.zIndex = '1000';
		autocompleteContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
		autocompleteContainer.style.width = '100%';
		autocompleteContainer.style.top = '100%';
		autocompleteContainer.style.left = '0';
		autocompleteContainer.style.marginTop = '2px';

		// Append to wrapper
		wrapper.appendChild(autocompleteContainer);
		this.autocompleteContainers.set(inputEl, autocompleteContainer);

		let selectedIndex = -1;

		const showAutocomplete = () => {
			const query = inputEl.value.toLowerCase();
			const folders = this.getAllFolders();

			// Add "." as first option for all notes
			const allOptions = ['.', ...folders];

			const matches = allOptions.filter(folder =>
				folder.toLowerCase().includes(query) || query === ''
			);

			if (matches.length === 0) {
				autocompleteContainer.style.display = 'none';
				return;
			}

			autocompleteContainer.empty();
			selectedIndex = -1;

			matches.forEach((folder, index) => {
				const item = autocompleteContainer.createDiv({ cls: 'acp-autocomplete-item' });
				item.style.padding = '8px 12px';
				item.style.cursor = 'pointer';
				item.style.textAlign = 'left';
				item.setAttribute('data-folder', folder); // Store actual value

				// Add description for "." option
				if (folder === '.') {
					item.textContent = '. (all notes in vault)';
					item.style.fontStyle = 'italic';
					item.style.color = 'var(--text-muted)';
				} else {
					item.textContent = folder;
				}

				item.addEventListener('mouseenter', () => {
					// Remove highlight from all items
					autocompleteContainer.querySelectorAll('.acp-autocomplete-item').forEach(el => {
						(el as HTMLElement).style.backgroundColor = '';
					});
					item.style.backgroundColor = 'var(--background-modifier-hover)';
					selectedIndex = index;
				});

				item.addEventListener('click', () => {
					inputEl.value = folder;
					inputEl.dispatchEvent(new Event('input', { bubbles: true }));
					autocompleteContainer.style.display = 'none';
				});
			});

			// Show the autocomplete
			autocompleteContainer.style.display = 'block';
		};

		const hideAutocomplete = () => {
			autocompleteContainer.style.display = 'none';
		};

		const selectCurrent = () => {
			const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
			if (selectedIndex >= 0 && selectedIndex < items.length) {
				const selectedFolder = items[selectedIndex].getAttribute('data-folder');
				if (selectedFolder) {
					inputEl.value = selectedFolder;
					inputEl.dispatchEvent(new Event('input', { bubbles: true }));
					hideAutocomplete();
					return true;
				}
			}
			return false;
		};

		const highlightItem = (index: number) => {
			const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
			items.forEach((item, i) => {
				(item as HTMLElement).style.backgroundColor =
					i === index ? 'var(--background-modifier-hover)' : '';
			});
		};

		inputEl.addEventListener('input', showAutocomplete);
		inputEl.addEventListener('focus', showAutocomplete);

		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');

			if (autocompleteContainer.style.display === 'none') return;

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				highlightItem(selectedIndex);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				highlightItem(selectedIndex);
			} else if (e.key === 'Enter') {
				if (selectCurrent()) {
					e.preventDefault();
				}
			} else if (e.key === 'Escape') {
				hideAutocomplete();
			}
		});

		// Hide autocomplete when clicking outside
		document.addEventListener('click', (e: MouseEvent) => {
			if (!inputEl.contains(e.target as Node) && !autocompleteContainer.contains(e.target as Node)) {
				hideAutocomplete();
			}
		});
	}
}
