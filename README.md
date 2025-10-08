# Obsidian ACP Client Plugin

An Obsidian plugin that implements an Agent Client Protocol (ACP) client, enabling integration with AI coding agents that support the ACP standard.

## Features

- **ACP Client Implementation**: Full implementation of the Agent Client Protocol specification
- **Agent Communication**: Connect to and interact with ACP-compatible agents
- **File System Access**: Agents can read and write files in your vault (with permission)
- **Terminal Support**: Execute commands through the agent's terminal interface
- **Session Management**: Create and manage conversation sessions with agents
- **Permission Control**: Approve or deny agent requests for sensitive operations
- **Chat Interface**: User-friendly chat view for agent interactions

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
   - **Auto-approve Permissions**: Automatically approve all permission requests
   - **Default Model**: Default model to use for new sessions (optional)

### Example Configuration

For an agent executable at `/usr/local/bin/my-agent`:
- **Agent Command**: `/usr/local/bin/my-agent`
- **Agent Arguments**: `--config, /path/to/config.json`

## Usage

### Opening the Agent View

1. Click the robot icon in the left ribbon
2. Or use Command Palette → "Open Agent View"
3. The agent panel will open in the right sidebar

### Connecting to an Agent

1. Open the agent view
2. Click the "Connect" button
3. Wait for the connection to be established
4. The status will change to "Session active"

### Sending Messages

1. Type your message in the input field
2. Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) or click "Send"
3. The agent will process your request and respond

### Disconnecting

Click the "Disconnect" button to close the connection to the agent

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
- Permission requests and approval
- Session management and streaming updates

### Supported Client Methods

The plugin implements all required ACP client methods:

- `fs/read_text_file`: Read files from the vault
- `fs/write_text_file`: Write files to the vault
- `session/request_permission`: Request user approval for operations
- `terminal/create`: Create and execute terminal commands
- `terminal/output`: Get terminal output
- `terminal/kill`: Kill running terminal commands
- `terminal/release`: Release terminal resources
- `terminal/wait_for_exit`: Wait for command completion
- `session/update`: Receive real-time session updates

## Development

### Project Structure

```
acp-client/
├── main.ts              # Main plugin class
├── acp-client.ts        # ACP client implementation
├── agent-view.ts        # Chat UI component
├── settings.ts          # Settings interface
├── settings-tab.ts      # Settings UI
├── styles.css           # Plugin styles
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
└── version-bump.mjs     # Version management
```

### Building

```bash
# Development build (with watch mode)
npm run dev

# Production build
npm run build
```

### Dependencies

- `obsidian`: Obsidian plugin API
- `@zed-industries/agent-client-protocol`: ACP TypeScript library

## Troubleshooting

### Agent won't connect

- Verify the agent command path is correct
- Check that the agent supports ACP
- Look for error messages in the developer console (Ctrl+Shift+I)

### Permission errors

- Ensure the agent has permission to access vault files
- Check that file paths are absolute
- Verify the vault adapter is properly configured

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
