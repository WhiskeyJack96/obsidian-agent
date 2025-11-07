import { App, PluginSettingTab, Setting } from 'obsidian';
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

		// Alpha feature warning
		const alphaSettingEl = new Setting(containerEl)
			.setName('Obsidian Focussed Prompt')
			.setDesc('Enable Obsidian-specific context in agent prompts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.obsidianFocussedPrompt)
				.onChange(async (value) => {
					this.plugin.settings.obsidianFocussedPrompt = value;
					await this.plugin.saveSettings();
				}));

		// Add alpha warning styling
		alphaSettingEl.settingEl.addClass('acp-setting-alpha');
		const alphaWarning = alphaSettingEl.descEl.createDiv();
		alphaWarning.addClass('acp-alpha-warning');
		alphaWarning.setText('⚠️ ALPHA: This feature is experimental and may change');

		// MCP Server section
		containerEl.createEl('h2', { text: 'MCP Server Settings' });

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		// Add MCP server info
		const mcpInfoEl = containerEl.createDiv();
		mcpInfoEl.addClass('setting-item-description');
		mcpInfoEl.setText(`MCP Server endpoint: http://localhost:${this.plugin.settings.mcpServerPort}/mcp`);
		mcpInfoEl.style.marginTop = '10px';
		mcpInfoEl.style.fontStyle = 'italic';
		mcpInfoEl.style.color = 'var(--text-muted)';
	}
}
