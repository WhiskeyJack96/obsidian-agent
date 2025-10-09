# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Obsidian plugin that implements an Agent Client Protocol (ACP) client, enabling integration with AI coding agents that support the ACP standard. The plugin spawns an external ACP-compatible agent process, communicates with it over JSON-RPC via stdin/stdout, and provides a chat UI within Obsidian.

## Commands

### Development
```bash
# Development build with watch mode
npm run dev

# Production build (includes type checking)
npm run build

# Version bump (used before releases)
npm run version
```

### Installation
```bash
npm install
```

## Architecture

### Core Components

**main.ts** - Plugin entry point
- Extends Obsidian's `Plugin` class
- Registers the agent view type and ribbon icon
- Manages plugin lifecycle (load/unload)
- Creates and maintains a singleton `ACPClient` instance
- Provides commands: open view, connect, disconnect

**acp-client.ts** - ACP protocol implementation
- Spawns external agent process using Node's `child_process.spawn`
- Converts Node.js streams to Web Streams for ACP library compatibility
- Creates `ClientSideConnection` from `@zed-industries/agent-client-protocol`
- Implements all required ACP client methods as protocol callbacks
- Manages terminal subprocesses spawned by agent requests
- Handles vault path resolution for file operations

**agent-view.ts** - Chat UI component
- Extends Obsidian's `ItemView` to create custom view
- Displays streaming agent messages, tool calls, plans, and permission requests
- Handles in-place updates for tool calls (shows status badges)
- Renders permission requests inline with approve/deny buttons
- Auto-scrolls messages container
- Manages connection controls and message input

**settings.ts / settings-tab.ts** - Configuration
- Stores agent command path, arguments, and preferences
- Provides settings UI in Obsidian settings panel

### Communication Flow

1. User clicks Connect → `AgentView.connect()`
2. `ACPClient.initialize()` spawns agent process, creates Web Streams, initializes connection
3. `ACPClient.createSession()` sends `newSession` request with vault path as cwd
4. User sends message → `ACPClient.sendPrompt()` sends `prompt` request
5. Agent processes request, may call back to client methods (file ops, terminal, permissions)
6. Agent sends session updates via `sessionUpdate` callback
7. `AgentView.handleUpdate()` parses update type and renders UI accordingly

### ACP Client Method Implementations

The plugin implements these ACP protocol client methods (called by the agent):

- **fs/read_text_file** - Reads vault files using Obsidian vault API, handles path conversion from absolute to vault-relative
- **fs/write_text_file** - Writes/modifies vault files
- **session/request_permission** - Shows inline permission UI or auto-approves based on settings
- **terminal/create** - Spawns subprocess with `child_process.spawn`, collects output continuously from creation
- **terminal/output** - Returns combined stdout/stderr collected since terminal creation
- **terminal/kill** - Kills subprocess
- **terminal/release** - Kills and removes subprocess from tracking
- **terminal/wait_for_exit** - Returns promise that resolves when subprocess exits
- **session/update** - Receives streaming updates (messages, tool calls, plans) from agent

### Key Implementation Details

**Stream Conversion**
- ACP library requires Web Streams (ReadableStream/WritableStream)
- Node.js child processes provide Node Streams (Readable/Writable)
- `acp-client.ts:79-101` converts Node streams to Web streams manually

**Vault Path Resolution**
- Agent needs absolute paths, Obsidian vault API uses relative paths
- `getVaultPath()` tries multiple methods to find vault root:
  1. `adapter.getBasePath()`
  2. `adapter.basePath` property
  3. `adapter.path` property
  4. Parse from `process.cwd()` if in plugin directory
- File reads/writes convert between absolute and vault-relative paths

**Terminal Output Collection**
- Terminal output is collected continuously from the moment the terminal is created
- Output buffers are initialized in `terminalOutputs` Map immediately after spawn
- stdout/stderr listeners are attached right after creation to capture all output
- This ensures no output is lost, even if the agent reads output later

**Tool Call Updates**
- Tool calls are tracked by `toolCallId` in a Map
- UI elements are updated in-place when status changes
- Compact display shows icon, title, and status badge
- Output shown only when status is 'completed'

**Permission Requests**
- Auto-approve mode selects first option automatically
- Manual mode shows inline UI with buttons for each option
- Returns promise that resolves when user clicks button
- Request message is removed from UI after selection

## File Structure

```
acp-client/
├── main.ts              # Plugin class, commands, view registration
├── acp-client.ts        # ACP protocol client, process spawning, callbacks
├── agent-view.ts        # Chat UI, message rendering, connection controls
├── settings.ts          # Settings interface and defaults
├── settings-tab.ts      # Settings UI component
├── permission-modal.ts  # Permission modal (currently unused, using inline UI)
├── styles.css           # Plugin styles
├── manifest.json        # Obsidian plugin metadata
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration (bundles to main.js)
└── version-bump.mjs     # Version management script
```

## Build System

- Uses esbuild for bundling (configured in `esbuild.config.mjs`)
- Entry point: `main.ts`
- Output: `main.js` (CommonJS format)
- Dev mode: watch mode with inline sourcemaps
- Production mode: single build, no sourcemaps, tree shaking enabled
- External modules: Obsidian API and Codemirror (provided by Obsidian runtime)

## Dependencies

- `obsidian` - Obsidian plugin API (dev dependency, provided at runtime)
- `@zed-industries/agent-client-protocol` - ACP TypeScript library for client/agent communication
- Node.js built-in modules: `child_process`, `stream`, `stream/web`
