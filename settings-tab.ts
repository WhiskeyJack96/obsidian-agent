import {App, PluginSettingTab, Setting} from 'obsidian';
import ACPClientPlugin from './main';

export class ACPClientSettingTab extends PluginSettingTab {
    plugin: ACPClientPlugin;

    constructor(app: App, plugin: ACPClientPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();
        new Setting(containerEl)
            .setName('Agent command')
            .setDesc('Path to the agent executable (e.g., /usr/local/bin/claude-code)')
            .addText(text => text
                .setPlaceholder('/path/to/agent')
                .setValue(this.plugin.settings.agentCommand)
                .onChange(async (value) => {
                    this.plugin.settings.agentCommand = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Agent arguments')
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
            .setName('Default view location')
            .setDesc('Where to open the agent view by default')
            .addDropdown(dropdown => dropdown
                .addOption('right-sidebar', 'Right sidebar')
                .addOption('left-sidebar', 'Left sidebar')
                .addOption('tab', 'New tab (main area)')
                .addOption('split', 'Split (main area)')
                .setValue(this.plugin.settings.defaultViewType)
                .onChange(async (value) => {
                    this.plugin.settings.defaultViewType = value as 'right-sidebar' | 'left-sidebar' | 'tab' | 'split';
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName('Auto-approve write permission')
            .setDesc('Automatically approve file write/edit requests from the agent')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoApproveWritePermission)
                .onChange(async (value) => {
                    this.plugin.settings.autoApproveWritePermission = value;
                    await this.plugin.saveSettings();
                }));


        // Conversation Tracking section
        new Setting(containerEl).setName('Conversation tracking').setHeading();

        new Setting(containerEl)
            .setName('Enable conversation tracking')
            .setDesc('Automatically save all conversation messages to Markdown files')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableConversationTracking)
                .onChange(async (value) => {
                    this.plugin.settings.enableConversationTracking = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Conversation folder')
            .setDesc('Folder path where conversation files will be saved (e.g., "conversations/")')
            .addText(text => text
                .setPlaceholder('Conversations/')
                .setValue(this.plugin.settings.conversationTrackingFolder)
                .onChange(async (value) => {
                    this.plugin.settings.conversationTrackingFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Alpha Features section
        new Setting(containerEl).setName('Experimental features ⚠️').setHeading();

        const alphaWarningContainer = containerEl.createDiv({cls: 'acp-alpha-warning-container setting-item-description'});
        alphaWarningContainer.appendText('These features are experimental and may change or be removed in future versions. Use with caution.');

        // Obsidian Focussed Prompt
        const obsidianPromptSetting = new Setting(containerEl)
            .setName('Obsidian focussed prompt')
            .setDesc('Enable Obsidian-specific context in agent prompts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.obsidianFocussedPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.obsidianFocussedPrompt = value;
                    await this.plugin.saveSettings();
                }));
        obsidianPromptSetting.settingEl.addClass('acp-setting-alpha-border');

        // MCP Server section
        new Setting(containerEl).setName('Model context protocol server').setHeading().settingEl.addClass('acp-alpha-section-header');

        const mcpEnableSetting = new Setting(containerEl)
            .setName('Enable mcp server')
            .setDesc('Start an embedded mcp server that exposes Obsidian commands. The agent can connect to this server to execute Obsidian commands.')
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
            .setName('Server port')
            .setDesc('Port number for the mcp server (requires restart if server is running)')
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
        const mcpInfoEl = containerEl.createDiv({cls: 'acp-info-text setting-item-description'});
        mcpInfoEl.setText(`Server endpoint: http://localhost:${this.plugin.settings.mcpServerPort}/mcp`);

        // Metadata-Based Triggers section
        new Setting(containerEl).setName('Metadata-based triggers').setHeading().settingEl.addClass('acp-alpha-section-header');

        const triggersDesc = containerEl.createDiv({cls: 'acp-info-text-bottom-margin setting-item-description'});
        triggersDesc.setText('Automatically trigger agent sessions when files have acp-trigger: true in their frontmatter');

        // Enable metadata triggers toggle
        new Setting(containerEl)
            .setName('Enable metadata triggers')
            .setDesc('When enabled, files with "acp-trigger: true" in frontmatter will automatically spawn an agent session')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMetadataTriggers)
                .onChange(async (value) => {
                    this.plugin.settings.enableMetadataTriggers = value;
                    await this.plugin.saveSettings();
                }));

        // Debounce timeout
        new Setting(containerEl)
            .setName('Trigger debounce (ms)')
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
        const usageInfo = containerEl.createDiv({cls: 'acp-info-text-bottom-margin setting-item-description'});
        usageInfo.createEl('strong', {text: 'Usage:'});
        usageInfo.createEl('br');
        usageInfo.appendText('Add to note frontmatter:');
        usageInfo.createEl('br');
        const codeBlock = usageInfo.createEl('code');
        codeBlock.appendText('---');
        codeBlock.createEl('br');
        codeBlock.appendText('acp-trigger: true');
        codeBlock.createEl('br');
        codeBlock.appendText('acp-prompt: "Your custom prompt here"');
        codeBlock.createEl('br');
        codeBlock.appendText('---');
        usageInfo.createEl('br');
        usageInfo.createEl('br');
        usageInfo.appendText('The trigger field will be automatically set to false after activation.');
        usageInfo.addClass('acp-usage-info');
    }
}
