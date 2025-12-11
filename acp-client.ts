import { spawn, ChildProcess } from 'child_process';
import { ClientSideConnection, ndJsonStream, Client, Agent, AgentCapabilities } from '@agentclientprotocol/sdk';
import { Readable as NodeReadable, Writable as NodeWritable } from 'stream';
import { ReadableStream, WritableStream } from 'stream/web';
import { App, Notice, FileSystemAdapter } from 'obsidian';
import { ACPClientSettings } from './settings';
import * as schema from '@agentclientprotocol/sdk';
import type ACPClientPlugin from './main';
import {prompt} from './prompt'
import { DiffData, DiffResult } from './diff-view';
import {shellEnv} from 'shell-env';
import { SessionUpdate, SessionModeState } from './types';

export class ACPClient {
	private app: App;
	private settings: ACPClientSettings;
	private plugin: ACPClientPlugin;
	private readonly basePath: string;
	private process: ChildProcess | null = null;
	private connection: ClientSideConnection | null = null;
	private sessionId: string | null = null;
	private terminals: Map<string, {
		process: ChildProcess;
		output: { stdout: string; stderr: string };
	}> = new Map();
	private updateCallback: ((update: SessionUpdate) => void) | null = null;
	private modeState: SessionModeState | null = null;
	private agentCapabilities: AgentCapabilities | null = null;

	constructor(app: App, settings: ACPClientSettings, plugin: ACPClientPlugin) {
		this.app = app;
		this.settings = settings;
		this.plugin = plugin;
		this.basePath = this.getVaultPath();
	}

	setUpdateCallback(callback: (update: SessionUpdate) => void) {
		this.updateCallback = callback;
	}

	async initialize(): Promise<void> {
		if (!this.settings.agentCommand) {
			throw new Error('Agent command not configured. Please configure in settings.');
		}

		const	command = this.settings.agentCommand;
		const 	args = this.settings.agentArgs;
		const userEnv = await shellEnv()
		this.process = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {...process.env, ...userEnv},
		});

		this.process.on('error', (err) => {
			new Notice(`Agent process error: ${err.message}`);
			console.error('Agent process error:', err);
		});

		this.process.on('exit', () => {
			// Note: This handler is removed during intentional cleanup to prevent race conditions
			// It only fires when the process exits unexpectedly
			this.cleanup().catch((err) => {
				console.error('Error during cleanup after unexpected process exit:', err);
			});
		});

		// Convert Node.js streams to Web Streams
		const stdin = this.process.stdin as NodeWritable;
		const stdout = this.process.stdout as NodeReadable;

		// Create Web WritableStream from Node.js Writable
		const webOutputStream = new WritableStream<Uint8Array>({
			write(chunk) {
				stdin.write(chunk);
			},
			close() {
				stdin.end();
			}
		});

		// Create Web ReadableStream from Node.js Readable
		const webInputStream = new ReadableStream<Uint8Array>({
			start(controller) {
				stdout.on('data', (chunk: Buffer) => {
					controller.enqueue(new Uint8Array(chunk));
				});
				stdout.on('end', () => {
					controller.close();
				});
				stdout.on('error', (err) => {
					controller.error(err);
				});
			}
		});

		// Create the stream using ndJsonStream
		// Type cast needed due to minor incompatibility between @types/node v20 Web Streams and ACP SDK types
		const stream = ndJsonStream(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			webOutputStream as any,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			webInputStream as any
		);

		// Create ClientSideConnection with proper signature
		this.connection = new ClientSideConnection(
			(_agent: Agent): Client => {
				return {
					requestPermission: this.handleRequestPermission.bind(this),
					sessionUpdate: this.handleSessionUpdate.bind(this),
					readTextFile: this.handleReadTextFile.bind(this),
					writeTextFile: this.handleWriteTextFile.bind(this),
					createTerminal: this.handleTerminalCreate.bind(this),
					terminalOutput: this.handleTerminalOutput.bind(this),
					releaseTerminal: this.handleTerminalRelease.bind(this),
					waitForTerminalExit: this.handleTerminalWaitForExit.bind(this),
					killTerminal: this.handleTerminalKill.bind(this)
				};
			},
			stream
		);

		// Initialize the agent
		const initResponse = await this.connection.initialize({
			protocolVersion: 1,
			clientCapabilities: {
				fs: {
					readTextFile: true,
					writeTextFile: true
				},
				terminal: true
			}
		});

		// Store agent capabilities
		this.agentCapabilities = initResponse.agentCapabilities || null;
	}

	async createSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to agent');
		}

		let systemPrompt = undefined
		if (this.settings.obsidianFocussedPrompt) {
			systemPrompt = prompt
		}

		// Configure MCP servers
		const mcpServers = [];
		if (this.settings.enableMCPServer) {
			mcpServers.push({
				type: "http" as const,
				name: "obsidian-commands",
				url: `http://localhost:${this.settings.mcpServerPort}/mcp`,
				headers: []
			});
		}

		const response = await this.connection.newSession({
			cwd: this.basePath,
			_meta: {
				systemPrompt
			},
			mcpServers
		});

		this.sessionId = response.sessionId;

		// Store mode state if provided
		if (response.modes) {
			this.modeState = {
				currentModeId: response.modes.currentModeId,
				availableModes: response.modes.availableModes
			};

			// Notify UI of available modes
			if (this.updateCallback) {
				this.updateCallback({
					type: 'mode_change',
					data: this.modeState
				});
			}
		}

	}

	async loadSession(sessionId: string): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to agent');
		}

		// Check if agent supports loadSession
		if (!this.agentCapabilities?.loadSession) {
			throw new Error('Agent does not support loading sessions. This feature requires an agent with loadSession capability.');
		}

		try {
			const response = await this.connection.loadSession({
				sessionId: sessionId,
				cwd: this.basePath,
				mcpServers: []
			});

			this.sessionId = sessionId;

			// Store mode state if provided
			if (response.modes) {
				this.modeState = {
					currentModeId: response.modes.currentModeId,
					availableModes: response.modes.availableModes
				};

				// Notify UI of available modes
				if (this.updateCallback) {
					this.updateCallback({
						type: 'mode_change',
						data: this.modeState
					});
				}
			}

		} catch (err) {
			throw new Error(`Failed to load session: ${err.message || 'Session not found. The session ID may not exist or may have expired.'}`);
		}
	}

	supportsLoadSession(): boolean {
		return this.agentCapabilities?.loadSession === true;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	private getVaultPath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		throw Error("could not get vault path")
	}

	async sendPrompt(prompt: string): Promise<void> {
		if (!this.connection || !this.sessionId) {
			throw new Error('No active session');
		}

		const response = await this.connection.prompt({
			sessionId: this.sessionId,
			prompt: [{
				type: 'text',
				text: prompt
			}]
		});

		// Clear tracked writes for this session now that the turn is complete
		if (this.plugin.triggerManager && this.sessionId) {
			this.plugin.triggerManager.clearTurnWrites(this.sessionId);
		}

		// Send turn_complete update when the agent finishes
		if (this.updateCallback) {
			this.updateCallback({
				type: 'turn_complete',
				data: response
			});
		}
	}

	async cancelSession(): Promise<void> {
		if (!this.connection || !this.sessionId) {
			return;
		}

		// Clear tracked writes when session is cancelled
		if (this.plugin.triggerManager && this.sessionId) {
			this.plugin.triggerManager.clearTurnWrites(this.sessionId);
		}

		await this.connection.cancel({
			sessionId: this.sessionId
		});
	}

	getModeState(): SessionModeState | null {
		return this.modeState;
	}

	async setMode(modeId: string): Promise<void> {
		if (!this.connection || !this.sessionId) {
			throw new Error('No active session');
		}

		if (!this.modeState) {
			throw new Error('No modes available for this session');
		}

		// Validate that the mode exists
		const modeExists = this.modeState.availableModes.some(mode => mode.id === modeId);
		if (!modeExists) {
			throw new Error(`Invalid mode ID: ${modeId}`);
		}

		await this.connection.setSessionMode({
			sessionId: this.sessionId,
			modeId: modeId
		});

		// Update local state
		this.modeState.currentModeId = modeId;
	}

	// Client method implementations
	// Protocol requires async signature even though no await is needed
	// eslint-disable-next-line @typescript-eslint/require-await
	private async handleSessionUpdate(params: schema.SessionNotification): Promise<void> {
		if (this.updateCallback) {
			this.updateCallback({
				type: 'message',
				data: params
			});
		}
	}

	private async handleReadTextFile(params: schema.ReadTextFileRequest): Promise<schema.ReadTextFileResponse> {
		try {
			// Convert absolute path to vault-relative path if needed
			const basePath = this.getVaultPath();
			let relativePath = params.path;

			if (params.path.startsWith(basePath)) {
				relativePath = params.path.substring(basePath.length + 1);
			}

			const file = this.app.vault.getFileByPath(relativePath);
			if (!file) {
				// Try reading via adapter for hidden/dot files that aren't in the vault index
				if (await this.app.vault.adapter.exists(relativePath)) {
					const content = await this.app.vault.adapter.read(relativePath);
					return { content };
				}
				throw new Error(`File not found: ${relativePath}`);
			}

			const content = await this.app.vault.read(file);

			// Add backlinks to the content for context
			let contextContent = content;
			// @ts-expect-error - getBacklinksForFile is not in the types yet
			if (this.app.metadataCache.getBacklinksForFile) {
				// @ts-expect-error - Obsidian internal API for backlinks
				const backlinks = this.app.metadataCache.getBacklinksForFile(file);
				if (backlinks && backlinks.data && backlinks.data.size > 0) {
					contextContent += '\n\n<!-- Backlinks (Added by ACP) -->\n# Backlinks\n';
					const files = Array.from(backlinks.data.keys());
					files.forEach((path: string) => {
						contextContent += `- [[${path}]]\n`;
					});
				}
			}

			return { content: contextContent };
		} catch (err) {
			console.error('File read error:', err);
			throw new Error(`Failed to read file: ${err.message}`);
		}
	}

	private async handleWriteTextFile(params: schema.WriteTextFileRequest): Promise<schema.WriteTextFileResponse> {
		try {
			// Convert absolute path to vault-relative path if needed
			const basePath = this.getVaultPath();
			let relativePath = params.path;

			if (params.path.startsWith(basePath)) {
				relativePath = params.path.substring(basePath.length + 1);
			}

			// Read current file content to show diff
			const file = this.app.vault.getFileByPath(relativePath);
			let oldText = '';
			let contentToWrite = params.content
			if (!this.settings.autoApproveWritePermission) {
				if (file) {
					// File exists, read current content
					oldText = await this.app.vault.read(file);
				} else if (await this.app.vault.adapter.exists(relativePath)) {
					// File exists but likely hidden/dotfile, read from adapter
					oldText = await this.app.vault.adapter.read(relativePath);
				}

				// Create diff data
				const diffData: DiffData = {
					oldText: oldText,
					newText: params.content,
					path: relativePath,
					toolCallId: crypto.randomUUID()
				};

				// Open diff view and wait for user approval
				const diffView = await this.plugin.openDiffView();
				if (!diffView) {
					throw new Error('Failed to open diff view');
				}

				// Wait for user to accept or reject, and get edited content
				const result = await new Promise<DiffResult>((resolve) => {
					diffView.setDiffData(diffData, resolve);
				});

				if (!result.approved) {
					throw new Error('User rejected the file write');
				}
				contentToWrite = result.editedText || params.content;
			}

			// Track this write to prevent trigger loops
			if (this.plugin.triggerManager && this.sessionId) {
				this.plugin.triggerManager.trackAgentWrite(this.sessionId, relativePath);
			}

			// User approved, proceed with write using edited content if provided
			if (file) {
				await this.app.vault.modify(file, contentToWrite);
			} else {
				// Fallback to adapter.write if creation via vault fails (e.g. dotfiles)
				try {
					await this.app.vault.create(relativePath, contentToWrite);
				} catch {
					// If normal create fails, try adapter write directly
					// This handles cases like .gitignore where Obsidian might block it or path validation fails
					await this.app.vault.adapter.write(relativePath, contentToWrite);
				}
			}

			return {};
		} catch (err) {
			console.error('File write error:', err);
			throw new Error(`Failed to write file: ${err.message}`);
		}
	}

	private async handleRequestPermission(params: schema.RequestPermissionRequest): Promise<schema.RequestPermissionResponse> {
		// Send permission request to UI for inline approval
		if (this.updateCallback && params.options && params.options.length > 0) {
			return new Promise((resolve) => {
				this.updateCallback!({
					type: 'permission_request',
					data: {
						params,
						resolve
					}
				});
			});
		}

		return {
			outcome: {
				outcome: 'cancelled'
			}
		};
	}

	// Protocol requires async signature even though no await is needed
	// eslint-disable-next-line @typescript-eslint/require-await
	private async handleTerminalCreate(params: schema.CreateTerminalRequest): Promise<schema.CreateTerminalResponse> {
		const terminalId = crypto.randomUUID();

		const basePath = this.getVaultPath();
		const workingDir = params.cwd || basePath;

		// If no args provided, this might be a shell command - use shell: true
		const useShell = !params.args || params.args.length === 0;

		const terminal = spawn(params.command, params.args || [], {
			cwd: workingDir,
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: useShell,  // Use shell if it's a full command string
			env: process.env,
		});

		// Initialize terminal with process and output buffer
		const terminalData = {
			process: terminal,
			output: { stdout: '', stderr: '' }
		};
		this.terminals.set(terminalId, terminalData);

		// Collect output continuously
		terminal.stdout?.on('data', (data) => {
			const terminal = this.terminals.get(terminalId);
			if (terminal) {
				terminal.output.stdout += data.toString();
			}
		});

		terminal.stderr?.on('data', (data) => {
			const terminal = this.terminals.get(terminalId);
			if (terminal) {
				terminal.output.stderr += data.toString();
			}
		});

		terminal.on('error', (err) => {
			console.error(`Terminal ${terminalId} error:`, err);
			const terminal = this.terminals.get(terminalId);
			if (terminal) {
				terminal.output.stderr += `Error: ${err.message}\n`;
			}
		});

		return { terminalId };
	}

	// Protocol requires async signature even though no await is needed
	// eslint-disable-next-line @typescript-eslint/require-await
	private async handleTerminalOutput(params: schema.TerminalOutputRequest): Promise<schema.TerminalOutputResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		// Combine stdout and stderr
		const combinedOutput = terminal.output.stdout + terminal.output.stderr;

		const response: schema.TerminalOutputResponse = {
			output: combinedOutput,
			truncated: false
		};

		// Include exit status if process has exited
		if (terminal.process.exitCode !== null) {
			response.exitStatus = {
				exitCode: terminal.process.exitCode
			};
		}

		return response;
	}

	// Protocol requires async signature even though no await is needed
	// eslint-disable-next-line @typescript-eslint/require-await
	private async handleTerminalKill(params: schema.KillTerminalCommandRequest): Promise<schema.KillTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		terminal.process.kill();
	}

	// Protocol requires async signature even though no await is needed
	// eslint-disable-next-line @typescript-eslint/require-await
	private async handleTerminalRelease(params: schema.ReleaseTerminalRequest): Promise<schema.ReleaseTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (terminal) {
			terminal.process.kill();
			this.terminals.delete(params.terminalId);
		}
	}

	private async handleTerminalWaitForExit(params: schema.WaitForTerminalExitRequest): Promise<schema.WaitForTerminalExitResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		return new Promise((resolve) => {
			terminal.process.on('exit', (code) => {
				resolve({ exitCode: code || 0 });
			});
		});
	}

	cleanup(): Promise<void> {
		return new Promise((resolve) => {
			// Clear tracked writes for this session
			if (this.plugin.triggerManager && this.sessionId) {
				this.plugin.triggerManager.clearTurnWrites(this.sessionId);
			}

			// Clean up terminals
			for (const terminal of this.terminals.values()) {
				terminal.process.kill();
			}
			this.terminals.clear();

			// Kill agent process
			if (this.process) {
				// Remove the exit handler to prevent it from calling cleanup again
				this.process.removeAllListeners('exit');

				// Wait for the process to exit before cleaning up references
				this.process.on('exit', () => {
					this.process = null;
					this.connection = null;
					this.sessionId = null;
					this.modeState = null;
					resolve();
				});

				this.process.kill();
			} else {
				this.connection = null;
				this.sessionId = null;
				this.modeState = null;
				resolve();
			}
		});
	}
}
