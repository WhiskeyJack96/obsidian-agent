import { App, PluginSettingTab, Setting, Notice, TFolder } from 'obsidian';
import ACPClientPlugin from './main';

export class ACPClientSettingTab extends PluginSettingTab {
	plugin: ACPClientPlugin;

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
			.setName('Default View Location')
			.setDesc('Where to open the agent view by default')
			.addDropdown(dropdown => dropdown
				.addOption('right-sidebar', 'Right Sidebar')
				.addOption('left-sidebar', 'Left Sidebar')
				.addOption('tab', 'New Tab (Main Area)')
				.addOption('split', 'Split (Main Area)')
				.setValue(this.plugin.settings.defaultViewType)
				.onChange(async (value) => {
					this.plugin.settings.defaultViewType = value as any;
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

		const alphaWarningContainer = containerEl.createDiv({ cls: 'acp-alpha-warning-container setting-item-description' });
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
		obsidianPromptSetting.settingEl.addClass('acp-setting-alpha-border');

		// MCP Server section
		const mcpHeader = containerEl.createEl('h4', { text: 'MCP Server', cls: 'acp-alpha-section-header' });

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
		mcpEnableSetting.settingEl.addClass('acp-setting-alpha-border');

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
		mcpPortSetting.settingEl.addClass('acp-setting-alpha-border');

		// Add MCP server info
		const mcpInfoEl = containerEl.createDiv({ cls: 'acp-info-text setting-item-description' });
		mcpInfoEl.setText(`MCP Server endpoint: http://localhost:${this.plugin.settings.mcpServerPort}/mcp`);

		// Metadata-Based Triggers section
		const triggersHeader = containerEl.createEl('h4', { text: 'Metadata-Based Triggers', cls: 'acp-alpha-section-header' });

		const triggersDesc = containerEl.createDiv({ cls: 'acp-info-text-bottom-margin setting-item-description' });
		triggersDesc.setText('Automatically trigger agent sessions when files have acp-trigger: true in their frontmatter. Supports audio transcription for audio files (.mp3, .m4a, .wav, etc.)');

		// Enable metadata triggers toggle
		new Setting(containerEl)
			.setName('Enable Metadata Triggers')
			.setDesc('When enabled, files with "acp-trigger: true" in frontmatter will automatically spawn an agent session')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableMetadataTriggers)
				.onChange(async (value) => {
					this.plugin.settings.enableMetadataTriggers = value;
					await this.plugin.saveSettings();
				}));

		// Debounce timeout
		new Setting(containerEl)
			.setName('Trigger Debounce (ms)')
			.setDesc('Wait time before triggering after file changes (default: 3000ms)')
			.addText(text => text
				.setPlaceholder('3000')
				.setValue(String(this.plugin.settings.metadataTriggerDebounceMs))
				.onChange(async (value) => {
					const ms = parseInt(value);
					if (!isNaN(ms) && ms >= 0) {
						this.plugin.settings.metadataTriggerDebounceMs = ms;
						await this.plugin.saveSettings();
					}
				}));

		// Usage instructions
		const usageInfo = containerEl.createDiv({ cls: 'acp-info-text-bottom-margin setting-item-description' });
		usageInfo.innerHTML = `
			<strong>Usage:</strong><br>
			Add to note frontmatter:<br>
			<code>---<br>
			acp-trigger: true<br>
			acp-prompt: "Your custom prompt here"<br>
			---</code><br><br>
			For audio files, omit acp-prompt to use default transcription prompt.<br>
			The trigger field will be automatically set to false after activation.
		`;
		usageInfo.style.fontFamily = 'monospace';
		usageInfo.style.fontSize = '0.9em';
	}
}
