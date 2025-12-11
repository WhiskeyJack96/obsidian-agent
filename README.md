# Obsidian ACP Client

> Transform your Obsidian vault into a powerful AI coding workspace

An Obsidian plugin that brings AI coding agents directly into your vault through the Agent Client Protocol (ACP). Chat with AI agents that can read, write, and modify files while you maintain full control over permissions.

![Platform](https://img.shields.io/badge/platform-Desktop%20Only-blue) ![ACP](https://img.shields.io/badge/ACP-Compatible-green)

![Demo](./demo.gif)

## Why Use This Plugin?

- **Work Where You Think**: Keep your notes, documentation, and code in one place while collaborating with AI agents
- **Full File System Access**: Agents can read and modify files in your vault with granular permission control
- **Terminal Integration**: Execute commands and run scripts directly through agent conversations
- **Protocol-Based**: Uses the open Agent Client Protocol standard, compatible with multiple AI providers

## Quick Start

### Agent Compatibility

| Agent | Status | Setup |
|-------|--------|-------|
| [Claude Code](https://docs.claude.com/claude-code) | ✅ Tested | [Setup instructions](#claude-code) |
| [Gemini CLI](https://github.com/google/generative-ai-cli) | ✅ Tested | [Setup instructions](#gemini-cli) |
| [OpenCode](https://github.com/OpenCodeLab/opencode) | ✅ Tested | [Setup instructions](#opencode) |
| [Mistral](https://mistral.ai/) | ✅ Tested | [Setup instructions](#mistral) |

## Core Features

### 🤖 Agent Communication
- Full Agent Client Protocol (ACP) implementation
- Real-time streaming responses
- Multi-turn conversation sessions
- Mode switching support (chat, code, etc.)

### 📁 File Operations
- Read and write files in your vault
- Automatic backlinks metadata injection
- Side-by-side diff view for edits before approval
- Support for hidden/dotfiles

### 💻 Terminal Support
- Execute shell commands through agent requests
- Real-time output streaming
- Process management (create, monitor, kill)
- Full environment variable support

### 🔗 Obsidian Integration
- Native vault file access
- Command palette integration
- Metadata-based automation [⚠️ ALPHA]
- MCP server for Obsidian commands [⚠️ ALPHA]

### 🎨 User Experience
- Inline chat interface with markdown rendering
- Smart autocomplete (`/` for commands, `@` for files)
- Real-time tool call visibility with status badges
- Multiple simultaneous agent sessions
- Auto-save conversation history

### 🔐 Security & Control
- Granular permission system with inline approval
- Auto-approve options for trusted operations
- Clear visibility of all agent actions
- Manual command review before execution

## Agent Setup

### Claude Code

Claude Code is Anthropic's official CLI agent with excellent ACP support.

**Installation:**
```bash
# Install and authenticate Claude Code
npm install -g @anthropics/claude-code
claude-code auth

# Install the ACP adapter
npm install -g @zed-industries/claude-code-acp
```

**Configuration:**
1. Get the adapter path: `which claude-code-acp`
2. In Obsidian Settings → ACP Client:
   - **Agent Command**: Paste the full path from step 1
   - **Agent Arguments**: Leave empty

**Known Issues:**
- Ensure you're authenticated before using the adapter

### Gemini CLI

> **Note**: Setup instructions coming soon! If you have this working, please contribute documentation.

**Installation:**
```bash
# Placeholder - user will provide details
```

**Configuration:**
1. Agent Command: (path to executable)
2. Agent Arguments: (if needed)

**Known Issues:**
- TBD

### OpenCode

> **Note**: Setup instructions coming soon! If you have this working, please contribute documentation.

**Installation:**
```bash
# Placeholder - user will provide details
```

**Configuration:**
1. Agent Command: (path to executable)
2. Agent Arguments: (if needed)

**Known Issues:**
- TBD

### Mistral

> **Note**: Setup instructions coming soon! If you have this working, please contribute documentation.

**Installation:**
```bash
# Placeholder - user will provide details
```

**Configuration:**
1. Agent Command: (path to executable)
2. Agent Arguments: (if needed)

**Known Issues:**
- TBD

## Installation

### From Community Plugins (Recommended)

> **Note**: This plugin is not yet available in the Community Plugins store. Coming soon!

### Manual Installation

1. Download the latest release from [GitHub Releases](../../releases)
2. Extract `main.js`, `manifest.json`, and `styles.css`
3. Copy to your vault: `.obsidian/plugins/acp-client/`
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

### Development Installation

```bash
# Clone into your vault's plugin folder
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/yourusername/obsidian-acp-client acp-client
cd acp-client

# Install and build
npm install
npm run build
```

Enable the plugin in Obsidian Settings → Community Plugins.

## Configuration

### Basic Settings

**Agent Command** (required)
- Path to your ACP-compatible agent executable
- Get the path using `which agent-name`
- Example: `/usr/local/bin/claude-code-acp`

**Agent Arguments** (optional)
- Command-line arguments passed to the agent
- Enter as comma-separated values
- Example: `--model,claude-3-5-sonnet,--verbose`

### Permission Settings

**Auto-approve Read Permissions**
- Automatically approve file read requests
- Safe for most use cases
- Files remain read-only unless write is also approved

**Auto-approve Write Permissions**
- Automatically approve file write requests
- ⚠️ Use with caution-enables agents to modify files without confirmation
- **Strongly recommend** vault backups (use [Obsidian Git](https://github.com/vincent-github/obsidian-git))

### View Settings

**Default View Type**
- Choose where the agent view opens
- Options: Right sidebar (default), Left sidebar, Main area tab, Split view

### Conversation Tracking

**Enable Conversation Tracking**
- Auto-save all messages to markdown files after each agent turn
- Great for keeping a record of interactions

**Conversation Tracking Folder**
- Where to save conversation files
- Default: `conversations/`

### Alpha Features

> ⚠️ **These features are experimental and may change**

**Metadata-Based Triggers** [⚠️ ALPHA]
- Auto-activate agent when files have `acp-trigger: true` in frontmatter
- See [Metadata-Based Triggers](#metadata-based-triggers-alpha) for details

**MCP Server** [⚠️ ALPHA]
- Expose Obsidian commands to agents via Model Context Protocol
- See [MCP Server](#mcp-server-alpha) for details

**Obsidian-Focused Prompt** [⚠️ ALPHA]
- Inject Obsidian-specific context into agent prompts
- Helps agents understand vault-specific conventions

## Key Features (Detailed)

### Permission System

The plugin gives you complete control over what agents can access:

**Inline Approval**
When an agent requests permission, you'll see an inline request in the chat:
- Clear description of what the agent wants to do
- Multiple action buttons (Approve, Deny, etc.)
- Request automatically dismissed after selection

**Auto-Approval Modes**
Toggle auto-approval in settings or during a session:
- Read-only access is generally safe
- Write access should be used carefully
- Can be toggled mid-session via button in chat

### Diff View

Before writing files, agents show you exactly what will change:

- **Side-by-side comparison**: Old content on left, new content on right
- **Inline editing**: Modify the proposed changes before approval
- **Syntax highlighting**: Code changes are easy to read
- **Line-by-line diff**: See exactly what's added, removed, or modified

Skip the diff view by enabling auto-approve write permissions in settings.

### Autocomplete

Speed up your workflow with smart autocomplete:

**Command Autocomplete** (type `/`)
- Shows available agent slash commands
- Filtered automatically as you type
- Press Enter or Tab to select

**File Autocomplete** (type `@`)
- Search all files in your vault
- Fuzzy matching by filename
- Inserts wiki-link format: `[[filename]]`

**Navigation**
- ↑/↓ arrow keys to navigate
- Enter or Tab to select
- Esc to cancel

### Metadata-Based Triggers [⚠️ ALPHA]

Automatically activate agents when you edit specific files:

**Setup:**
Add frontmatter to any note:
```yaml
---
acp-trigger: true
acp-prompt: "Review this note and suggest improvements"
---
```

**How it works:**
1. Edit and save a file with `acp-trigger: true`
2. Optionally also set a custom prompt with `acp-prompt: "Tell a joke about this note"`
3. Agent receives your custom prompt (or default prompt)

**Configuration:**
- Enable/disable in settings
- Adjust debounce delay (in milliseconds) to avoid triggering before you're done editing

**Use cases:**
- Auto-review documentation on save
- Validate code snippets in notes
- Generate summaries of meeting notes

### MCP Server [⚠️ ALPHA]

Expose Obsidian commands to agents via Model Context Protocol:

**What it does:**
- Starts an HTTP server (default port 3100)
- Provides two MCP tools:
  - `list_obsidian_commands`: Get all available commands
  - `execute_obsidian_command`: Run a command by ID
- Agents can discover and execute any Obsidian command

**Configuration:**
- Enable in settings
- Set custom port if 3100 is in use
- Server starts when plugin loads

**Example usage:**
Agent can toggle spellcheck, create notes, run plugin commands, open files, etc.

### Conversation Tracking

Automatically save your agent conversations:

**How it works:**
- After each agent turn, messages are saved to a markdown file
- Files are timestamped and organized by date
- Includes both your prompts and agent responses
- Tool calls and outputs are included

**File format:**
```
conversations/
├── 2024-01-15-conversation-1.md
├── 2024-01-15-conversation-2.md
└── 2024-01-16-conversation-1.md
```

**Benefits:**
- Searchable conversation history
- Reference past interactions
- Build a knowledge base from agent assistance

## Usage

### Opening the Agent View

**Via Ribbon:**
Click the robot icon in the left ribbon

**Via Command Palette:**
1. Press `Cmd/Ctrl + P`
2. Type "Open Agent View"
3. Press Enter

The agent will automatically connect when the view opens.

### Sending Messages

1. Type your message in the input field at the bottom
2. Use `Shift + Enter` for line breaks
3. Press `Enter` to send
4. Use autocomplete with `/` (commands) or `@` (files)

### Starting a New Conversation

Click the **New Conversation** button in the status bar to:
- Clear all messages
- Reset the session
- Start fresh with the agent

### Managing Multiple Sessions

You can open multiple agent views simultaneously:
- Each view maintains its own conversation
- Views are numbered (Agent 1, Agent 2, etc.)
- Close views individually via the X button

### Switching Modes

Some agents support multiple modes (chat, code, plan, etc.):
1. Use the mode dropdown in the status bar
2. Or use Command Palette → "Cycle Agent Mode"
3. Current mode is shown in the status bar

## ⚠️ Security Warning

> **Always Review Commands Before Approval**
>
> AI agents can execute terminal commands on your system through this plugin. Commands run with the same permissions as Obsidian and can:
> - Modify or delete files
> - Install software
> - Access your system
> - Make network requests
>
> **Best practices:**
> - Carefully review all bash commands before approving
> - Understand what each command does
> - When in doubt, deny and execute manually
> - Keep backups of your vault
> - Start with read-only permissions

## Recommended Plugins

Enhance your ACP Client experience:

**[Show Hidden Files](https://github.com/polyipseity/obsidian-show-hidden-files)** (highly recommended)
- Makes dotfiles visible in Obsidian file explorer
- Essential for seeing `.env`, `.gitignore`, config files, etc.
- ACP Client can access hidden files regardless, but this helps you see them

**[Obsidian Git](https://github.com/vincent-github/obsidian-git)** (highly recommended)
- Version control for your vault
- Critical backup when using auto-approve write permissions
- Easily rollback unwanted changes

## Requirements

### Platform Support

**Desktop Only** (Windows, macOS, Linux)
- Requires access to local executables
- Uses Node.js child processes
- Not available on mobile (iOS/Android)

**Dependencies**
- Node.js (if using npm-based agents)
- ACP-compatible agent installed separately

## Troubleshooting

### Agent Won't Connect

**Check the agent command path:**
```bash
# Verify the executable exists
which your-agent-command
ls -la /path/to/agent
```

**Verify ACP support:**
- Ensure your agent supports the Agent Client Protocol
- Check agent documentation for ACP compatibility

**Check developer console:**
1. Press `Cmd/Ctrl + Shift + I`
2. Look for error messages
3. Check the Console tab

**Common issues:**
- Incorrect path to executable
- Agent not installed
- Missing authentication (Claude Code requires `claude-code auth`)
- Wrong arguments passed to agent

### Permission Errors

**File read/write fails:**
- Check if auto-approve settings match your intent
- Verify file permissions in your OS
- Ensure Obsidian has access to the vault folder

**Permission UI not appearing:**
- Check if auto-approve is enabled (may be bypassing UI)
- Look for error messages in developer console

### Terminal Commands Fail

**Command not found:**
- Verify the command exists in your PATH
- Try running the command manually in your terminal

**Permission denied:**
- Check file/folder permissions
- Some commands require sudo (not recommended through plugin)

**Wrong working directory:**
- By default, commands run in your vault root
- Agents can specify custom working directories

### Agent-Specific Issues

**Claude Code:**
- Run `claude-code auth` if authentication fails
- Ensure `@zed-industries/claude-code-acp` is installed globally
- Check for updates: `npm update -g @zed-industries/claude-code-acp`

**Other Agents:**
- Check agent-specific documentation
- Verify ACP implementation version
- Look for known compatibility issues

### Still Having Issues?

1. Check [GitHub Issues](../../issues) for similar problems
2. Enable debug logging in developer console
3. Create a new issue with:
   - Your OS and Obsidian version
   - Agent name and version
   - Error messages from console
   - Steps to reproduce

## FAQ

**Q: Can I use multiple agents at the same time?**
A: Yes! Open multiple agent views and configure each with a different agent command.

**Q: Are my conversations private?**
A: Conversations are sent to the agent provider (e.g., Anthropic for Claude). Check your agent's privacy policy.

**Q: Can agents access files outside my vault?**
A: No, file operations are restricted to your vault directory only.

**Q: What happens if I close Obsidian during an agent session?**
A: The agent process is terminated. Conversations are not automatically resumed.

**Q: Can I use this on mobile?**
A: No, this plugin requires desktop Obsidian due to Node.js process requirements.

**Q: Does this work with the Obsidian API for plugins?**
A: Yes, agents with MCP server access can execute Obsidian commands, including those from other plugins.

## Contributing

Contributions are welcome! Here's how you can help:

**Agent Support:**
- Test with different ACP-compatible agents
- Document setup instructions and known issues
- Submit compatibility reports

**Code Contributions:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with clear commit messages
4. Submit a pull request

**Bug Reports:**
- Use [GitHub Issues](../../issues)
- Include reproduction steps
- Provide console logs
- Specify your environment

**Documentation:**
- Improve setup instructions
- Add troubleshooting tips
- Clarify confusing sections

## Development

### Building

```bash
# Development mode (watch for changes)
npm run dev

# Production build
npm run build

# Version bump (before releases)
npm run version
```

### Project Structure

```
acp-client/
├── main.ts              # Plugin entry point, commands
├── acp-client.ts        # ACP protocol implementation
├── agent-view.ts        # Chat UI and message rendering
├── settings.ts          # Settings interface
├── settings-tab.ts      # Settings UI
├── styles.css           # Plugin styles
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies
└── CLAUDE.md            # Developer documentation
```

## Credits

Built with:
- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [@zed-industries/agent-client-protocol](https://github.com/zed-industries/agent-client-protocol)
- [Agent Client Protocol Specification](https://agentclientprotocol.com/)

## License

MIT

---

**Agent Client Protocol**: Learn more about ACP at [agentclientprotocol.com](https://agentclientprotocol.com/)
