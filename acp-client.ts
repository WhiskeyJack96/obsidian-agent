import { spawn, ChildProcess } from 'child_process';
import { ClientSideConnection, ndJsonStream, Client, Agent } from '@zed-industries/agent-client-protocol';
import { Readable as NodeReadable, Writable as NodeWritable } from 'stream';
import { ReadableStream, WritableStream } from 'stream/web';
import { App, Notice, FileSystemAdapter, TFile } from 'obsidian';
import { ACPClientSettings } from './settings';
import * as schema from '@zed-industries/agent-client-protocol';
import { readFile, readFileSync } from 'fs';
import type ACPClientPlugin from './main';
import { DiffData, DiffResult } from './diff-view';

export interface SessionModeState {
	currentModeId: string;
	availableModes: schema.SessionMode[];
}

export interface SessionUpdate {
	type: 'message' | 'tool_call' | 'plan' | 'mode_change' | 'permission_request' | 'turn_complete';
	data: any;
}

export class ACPClient {
	private app: App;
	private settings: ACPClientSettings;
	private plugin: ACPClientPlugin;
	private basePath: string;
	private process: ChildProcess | null = null;
	private connection: ClientSideConnection | null = null;
	private sessionId: string | null = null;
	private terminals: Map<string, ChildProcess> = new Map();
	private terminalOutputs: Map<string, { stdout: string; stderr: string }> = new Map();
	private updateCallback: ((update: SessionUpdate) => void) | null = null;
	private modeState: SessionModeState | null = null;

	constructor(app: App, settings: ACPClientSettings, plugin: ACPClientPlugin) {
		this.app = app;
		this.settings = settings;
		this.plugin = plugin;
		this.basePath = this.getVaultPath();
		if (this.settings.debug) {
			console.log('Creating session with cwd:', this.basePath);
		}
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

		this.process = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: process.env
		});

		this.process.on('error', (err) => {
			new Notice(`Agent process error: ${err.message}`);
			console.error('Agent process error:', err);
		});

		this.process.on('exit', (code) => {
			if (this.settings.debug) {
				console.log(`Agent process exited with code ${code}`);
			}
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
		const stream = ndJsonStream(webOutputStream, webInputStream);

		// Create ClientSideConnection with proper signature
		this.connection = new ClientSideConnection(
			(agent: Agent): Client => {
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

		if (this.settings.debug) {
			console.log('Agent initialized:', initResponse);
		}
	}

	async createSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to agent');
		}

		let systemPrompt = undefined
		if (this.settings.obsidianFocussedPrompt) {
			systemPrompt = readFileSync("prompt.md")
		}

		const response = await this.connection.newSession({
			cwd: this.basePath,
			_meta: {
				systemPrompt
			},
			mcpServers: []
		});

		this.sessionId = response.sessionId;

		// Store mode state if provided
		if (response.modes) {
			this.modeState = {
				currentModeId: response.modes.currentModeId,
				availableModes: response.modes.availableModes
			};

			if (this.settings.debug) {
				console.log('Session modes:', this.modeState);
			}

			// Notify UI of available modes
			if (this.updateCallback) {
				this.updateCallback({
					type: 'mode_change',
					data: this.modeState
				});
			}
		}

		if (this.settings.debug) {
			console.log('Session created:', this.sessionId, response);
		}
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

		// Send turn_complete update when the agent finishes
		if (this.updateCallback) {
			this.updateCallback({
				type: 'turn_complete',
				data: response
			});
		}

		if (this.settings.debug) {
			console.log('Agent turn completed with response:', response);
		}
	}

	async cancelSession(): Promise<void> {
		if (!this.connection || !this.sessionId) {
			return;
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

		if (this.settings.debug) {
			console.log('Setting session mode to:', modeId);
		}

		await this.connection.setSessionMode({
			sessionId: this.sessionId,
			modeId: modeId
		});

		// Update local state
		this.modeState.currentModeId = modeId;

		if (this.settings.debug) {
			console.log('Mode changed to:', modeId);
		}
	}

	// Client method implementations
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

			if (this.settings.debug) {
				console.log('Reading file:', { original: params.path, relative: relativePath, basePath });
			}

			const file = this.app.vault.getFileByPath(relativePath);
			if (!file) {
				throw new Error(`File not found: ${relativePath}`);
			}

			const content = await this.app.vault.read(file);
			return { content };
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

			if (this.settings.debug) {
				console.log('Writing file:', { original: params.path, relative: relativePath, basePath });
			}

			// Read current file content to show diff
			const file = this.app.vault.getFileByPath(relativePath);
			let oldText = '';
			let contentToWrite = params.content
			if (!this.settings.autoApproveWritePermission) {
				if (file) {
					// File exists, read current content
					oldText = await this.app.vault.read(file);
				}

				// Create diff data
				const diffData: DiffData = {
					oldText: oldText,
					newText: params.content,
					path: relativePath,
					toolCallId: crypto.randomUUID()
				};

				// Open diff view and wait for user approval
				const diffView = await this.plugin.openDiffView(diffData);
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

			// User approved, proceed with write using edited content if provided
			if (file) {
				await this.app.vault.modify(file, contentToWrite);
			} else {
				await this.app.vault.create(relativePath, contentToWrite);
			}

			return {};
		} catch (err) {
			console.error('File write error:', err);
			throw new Error(`Failed to write file: ${err.message}`);
		}
	}

	private async handleRequestPermission(params: schema.RequestPermissionRequest): Promise<schema.RequestPermissionResponse> {
		if (this.settings.debug) {
			console.log('Permission requested:', params);
		}

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

	private async handleTerminalCreate(params: schema.CreateTerminalRequest): Promise<schema.CreateTerminalResponse> {
		const terminalId = crypto.randomUUID();

		const basePath = this.getVaultPath();
		const workingDir = params.cwd || basePath;

		if (this.settings.debug) {
			console.log('Creating terminal:', { command: params.command, args: params.args, cwd: workingDir });
		}

		// If no args provided, this might be a shell command - use shell: true
		const useShell = !params.args || params.args.length === 0;

		const terminal = spawn(params.command, params.args || [], {
			cwd: workingDir,
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: useShell,  // Use shell if it's a full command string
			env: process.env,
		});

		// Initialize output buffer
		this.terminalOutputs.set(terminalId, { stdout: '', stderr: '' });

		// Collect output continuously
		terminal.stdout?.on('data', (data) => {
			const output = this.terminalOutputs.get(terminalId);
			if (output) {
				output.stdout += data.toString();
			}
		});

		terminal.stderr?.on('data', (data) => {
			const output = this.terminalOutputs.get(terminalId);
			if (output) {
				output.stderr += data.toString();
			}
		});

		terminal.on('error', (err) => {
			console.error(`Terminal ${terminalId} error:`, err);
			const output = this.terminalOutputs.get(terminalId);
			if (output) {
				output.stderr += `Error: ${err.message}\n`;
			}
		});

		this.terminals.set(terminalId, terminal);

		return { terminalId };
	}

	private async handleTerminalOutput(params: schema.TerminalOutputRequest): Promise<schema.TerminalOutputResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		const outputs = this.terminalOutputs.get(params.terminalId);
		if (!outputs) {
			throw new Error(`Terminal output buffer not found: ${params.terminalId}`);
		}

		// Combine stdout and stderr
		const combinedOutput = outputs.stdout + outputs.stderr;

		const response: schema.TerminalOutputResponse = {
			output: combinedOutput,
			truncated: false
		};

		// Include exit status if process has exited
		if (terminal.exitCode !== null) {
			response.exitStatus = {
				exitCode: terminal.exitCode
			};
		}

		if (this.settings.debug) {
			console.log(`Terminal ${params.terminalId} output:`, {
				length: combinedOutput.length,
				exitCode: terminal.exitCode,
				preview: combinedOutput.substring(0, 100)
			});
		}

		return response;
	}

	private async handleTerminalKill(params: schema.KillTerminalCommandRequest): Promise<schema.KillTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		terminal.kill();
	}

	private async handleTerminalRelease(params: schema.ReleaseTerminalRequest): Promise<schema.ReleaseTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (terminal) {
			terminal.kill();
			this.terminals.delete(params.terminalId);
			this.terminalOutputs.delete(params.terminalId);
		}
	}

	private async handleTerminalWaitForExit(params: schema.WaitForTerminalExitRequest): Promise<schema.WaitForTerminalExitResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		return new Promise((resolve) => {
			terminal.on('exit', (code) => {
				resolve({ exitCode: code || 0 });
			});
		});
	}

	cleanup(): Promise<void> {
		return new Promise((resolve) => {
			// Clean up terminals
			for (const terminal of this.terminals.values()) {
				terminal.kill();
			}
			this.terminals.clear();
			this.terminalOutputs.clear();

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
