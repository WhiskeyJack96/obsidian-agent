# Obsidian ACP Client Plugin

An Obsidian plugin that implements an Agent Client Protocol (ACP) client, enabling integration with AI coding agents that support the ACP standard.

## Quick Start

### Claude Code
- First install and auth with claude code - https://docs.claude.com/en/docs/claude-code/overview#install-and-authenticate
- Then install the acp adaptor for claude code - `npm install -g @zed-industries/claude-code-acp`
- Then set the "Agent Command" to the full path to the adaptor which you can get by running: `which claude-code-acp`

### Gemini CLI
COMING SOON! If you get this working let me know and we can tag team the docs :D 

## Features

![](demos/demo.mov)

- **ACP Client Implementation**: Full implementation of the Agent Client Protocol specification
- **Agent Communication**: Connect to and interact with ACP-compatible agents
- **File System Access**: Agents can read and write files in your vault (with permission)
- **Terminal Support**: Execute commands through the agent's terminal interface
- **Session Management**: Create and manage conversation sessions with agents
- **Permission Control**: Granular permission system with inline approval UI
- **Chat Interface**: User-friendly chat view with markdown support
- **Smart Autocomplete**:
  - Type `/` to autocomplete agent slash commands
  - Type `@` to autocomplete vault files
- **Auto-Connect**: Automatically connects when opening the agent view
- **Tool Call Visibility**: Real-time display of agent tool calls with status indicators

## ⚠️ Security Warning

> [!CAUTION] Carefully Inspect Bash Commands
> AI agents can execute terminal commands on your system through this plugin. **Always carefully review and understand any bash commands before approving them.** Commands run with the same permissions as Obsidian and can modify files, install software, or access your system. When in doubt, deny permission requests and manually execute commands yourself.

## Installation

### Development Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/` directory
2. Navigate to the plugin directory:
   ```bash
   cd .obsidian/plugins/acp-client
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the plugin:
   ```bash
   npm run build
   ```
5. Enable the plugin in Obsidian Settings → Community Plugins

### Manual Installation

1. Download the latest release
2. Extract `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/acp-client/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

## Configuration

1. Open Settings → ACP Client
2. Configure the following:
   - **Agent Command**: Path to your ACP-compatible agent executable
   - **Agent Arguments**: Command-line arguments to pass to the agent (comma-separated)
   - **Auto-approve Write Permissions**: Automatically approve file write requests only, some form of vault backup _HIGHLY_ recommended
   - **Auto-approve Read Permissions**: Automatically approve file read requests only
   - **Default Model**: Default model to use for new sessions (optional)

### Example Configuration

For an agent executable at `/usr/local/bin/my-agent`:
- **Agent Command**: `/usr/local/bin/my-agent`
- **Agent Arguments**: `--config, /path/to/config.json`

## Usage

### Opening the Agent View

1. Click the robot (bot) icon in the left ribbon
2. Or use Command Palette → "Open Agent View"
3. The agent panel will open in the right sidebar
4. The agent will automatically connect when the view opens

### Sending Messages

1. Type your message in the input field
2. Press `Enter` to send (or `Shift+Enter` for a new line)
3. The agent will process your request and respond

### Using Autocomplete

- **Commands**: Type `/` to see and autocomplete available agent slash commands
- **Files**: Type `@` to search and autocomplete vault files
- Use arrow keys to navigate suggestions, `Enter` or `Tab` to select, `Esc` to cancel

### Starting a New Conversation

1. Click the "New Conversation" button in the status bar
2. This will clean up the current session and start fresh
3. The agent will automatically reconnect

### Disconnecting

Use Command Palette → "Disconnect from Agent" to close the connection manually

## Commands

The plugin adds the following commands to Obsidian:

- **Open Agent View**: Opens the agent chat interface
- **Connect to Agent**: Connects to the configured agent
- **Disconnect from Agent**: Closes the agent connection

## Agent Client Protocol

This plugin implements the [Agent Client Protocol](https://agentclientprotocol.com/) specification, which defines:

- JSON-RPC 2.0 communication over stdin/stdout
- File system operations (read/write text files)
- Terminal operations (create, execute, monitor)
- Permission requests and inline approval UI
- Session management and streaming updates

### Supported Client Methods

The plugin implements all required ACP client methods:

- `fs/read_text_file`: Read files from the vault (with path conversion)
- `fs/write_text_file`: Write/create files in the vault (with path conversion)
- `session/request_permission`: Display inline permission UI with approve/deny buttons
- `terminal/create`: Spawn subprocess and collect output from creation
- `terminal/output`: Return combined stdout/stderr collected since terminal creation
- `terminal/kill`: Terminate running subprocess
- `terminal/release`: Kill and remove subprocess from tracking
- `terminal/wait_for_exit`: Promise-based wait for subprocess exit
- `session/update`: Handle streaming agent messages, tool calls, and plans

## UI Features

### Chat Interface

- **Streaming Messages**: Agent responses stream in real-time with markdown rendering
- **Tool Call Display**: Shows agent tool calls with status badges (running, completed, failed)
- **Permission Requests**: Inline approval UI appears when agent requests permissions
- **Available Commands**: Agent displays available slash commands for easy discovery
- **Status Indicator**: Shows connection status (Not connected, Connecting, Connected, Session active)

### Path Handling

The plugin automatically converts between:
- Absolute paths (used by the agent)
- Vault-relative paths (used by Obsidian's API)

Multiple fallback methods ensure reliable vault path detection across different Obsidian configurations.

### Terminal Output

Terminal output is collected continuously from the moment a terminal is created. This ensures no output is lost, even if the agent requests output later.

## Development

### Project Structure

```
acp-client/
├── main.ts              # Plugin class, commands, view registration
├── acp-client.ts        # ACP protocol client, process spawning, callbacks
├── agent-view.ts        # Chat UI, message rendering, autocomplete
├── settings.ts          # Settings interface and defaults
├── settings-tab.ts      # Settings UI component
├── styles.css           # Plugin styles
├── manifest.json        # Obsidian plugin metadata
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration (bundles to main.js)
├── version-bump.mjs     # Version management script
└── CLAUDE.md            # Developer documentation for Claude Code
```

### Building

```bash
# Development build (with watch mode)
npm run dev

# Production build
npm run build
```

## Troubleshooting

### Agent won't connect

- Verify the agent command path is correct
- Check that the agent supports ACP
- Look for error messages in the developer console (Ctrl+Shift+I)

### Permission errors

- Check your permission settings in Settings → ACP Client
- Enable "Auto-approve Read Permissions" to allow automatic file reads
- Inline permission requests will appear in the chat for manual approval
- Ensure file paths are being properly converted between absolute and vault-relative

### Terminal commands fail

- Check the agent has permission to execute commands
- Verify the working directory is correct
- Look for errors in terminal output

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Credits

- Built with the [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Uses [@zed-industries/agent-client-protocol](https://github.com/zed-industries/agent-client-protocol)
- Follows the [Agent Client Protocol specification](https://agentclientprotocol.com/)
