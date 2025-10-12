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
			.setName('Debug Mode')
			.setDesc('Enable debug logging to console (errors are always logged)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debug)
				.onChange(async (value) => {
					this.plugin.settings.debug = value;
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
	}
}
