import { spawn, ChildProcess } from 'child_process';
import { ClientSideConnection, ndJsonStream, Client, Agent } from '@zed-industries/agent-client-protocol';
import { Readable as NodeReadable, Writable as NodeWritable } from 'stream';
import { ReadableStream, WritableStream } from 'stream/web';
import { App, Notice } from 'obsidian';
import { ACPClientSettings } from './settings';
import * as schema from '@zed-industries/agent-client-protocol';

export interface SessionUpdate {
	type: 'message' | 'tool_call' | 'plan' | 'mode_change' | 'permission_request';
	data: any;
}

export class ACPClient {
	private app: App;
	private settings: ACPClientSettings;
	private process: ChildProcess | null = null;
	private connection: ClientSideConnection | null = null;
	private sessionId: string | null = null;
	private terminals: Map<string, ChildProcess> = new Map();
	private terminalOutputs: Map<string, { stdout: string; stderr: string }> = new Map();
	private updateCallback: ((update: SessionUpdate) => void) | null = null;

	constructor(app: App, settings: ACPClientSettings) {
		this.app = app;
		this.settings = settings;
	}

	setUpdateCallback(callback: (update: SessionUpdate) => void) {
		this.updateCallback = callback;
	}

	async initialize(): Promise<void> {
		if (!this.settings.agentCommand) {
			throw new Error('Agent command not configured. Please configure in settings.');
		}

		// Spawn the agent process
		// If the command is a Node.js script, run it with node explicitly
		const isNodeScript = this.settings.agentCommand.endsWith('.js') ||
							 this.settings.agentCommand.includes('node_modules');

		let command: string;
		let args: string[];

		if (isNodeScript) {
			// Run with node explicitly to avoid PATH issues
			command = '/opt/homebrew/bin/node';
			args = [this.settings.agentCommand, ...this.settings.agentArgs];
		} else {
			command = this.settings.agentCommand;
			args = this.settings.agentArgs;
		}

		this.process = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '')
			}
		});

		this.process.on('error', (err) => {
			new Notice(`Agent process error: ${err.message}`);
			console.error('Agent process error:', err);
		});

		this.process.on('exit', (code) => {
			console.log(`Agent process exited with code ${code}`);
			this.cleanup();
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

		console.log('Agent initialized:', initResponse);
	}

	async createSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to agent');
		}

		// Get vault base path
		const basePath = this.getVaultPath();
		console.log('Creating session with cwd:', basePath);

		const response = await this.connection.newSession({
			cwd: basePath,
			mcpServers: []
		});

		this.sessionId = response.sessionId;
		console.log('Session created:', this.sessionId);
	}

	private getVaultPath(): string {
		// The vault adapter has the base path
		const adapter = this.app.vault.adapter as any;

		// Try getBasePath() method
		if (typeof adapter.getBasePath === 'function') {
			const path = adapter.getBasePath();
			console.log('Vault path from getBasePath():', path);
			return path;
		}

		// Try basePath property
		if (adapter.basePath) {
			console.log('Vault path from basePath:', adapter.basePath);
			return adapter.basePath;
		}

		// Try using the vault root property
		if (adapter.path) {
			console.log('Vault path from path:', adapter.path);
			return adapter.path;
		}

		// Last resort: process.cwd() is likely the plugin dir, so go up 3 levels
		// from .obsidian/plugins/plugin-name to vault root
		const cwd = process.cwd();
		if (cwd.includes('.obsidian/plugins/')) {
			const vaultPath = cwd.split('.obsidian')[0].replace(/\/$/, '');
			console.log('Vault path from cwd parsing:', vaultPath);
			return vaultPath;
		}

		console.log('Vault path fallback to cwd:', cwd);
		return cwd;
	}

	async sendPrompt(prompt: string): Promise<void> {
		if (!this.connection || !this.sessionId) {
			throw new Error('No active session');
		}

		await this.connection.prompt({
			sessionId: this.sessionId,
			prompt: [{
				type: 'text',
				text: prompt
			}]
		});
	}

	async cancelSession(): Promise<void> {
		if (!this.connection || !this.sessionId) {
			return;
		}

		await this.connection.cancel({
			sessionId: this.sessionId
		});
	}

	// Client method implementations
	private async requestFilePermission(operation: 'read' | 'write', path: string): Promise<boolean> {
		if (!this.updateCallback || !this.sessionId) {
			return false;
		}

		return new Promise((resolve) => {
			const toolCallId = Math.random().toString(36).substring(7);
			const permissionParams: schema.RequestPermissionRequest = {
				sessionId: this.sessionId!,
				toolCall: {
					toolCallId: toolCallId,
					title: `${operation === 'read' ? 'Read' : 'Write'} file: ${path}`,
					kind: operation === 'read' ? 'read' : 'edit',
					rawInput: {
						path: path,
						operation: operation
					}
				},
				options: [
					{
						optionId: 'allow',
						name: 'Allow',
						kind: 'allow_once'
					},
					{
						optionId: 'deny',
						name: 'Deny',
						kind: 'reject_once'
					}
				]
			};

			this.updateCallback!({
				type: 'permission_request',
				data: {
					params: permissionParams,
					resolve: (response: schema.RequestPermissionResponse) => {
						const granted = response.outcome?.outcome === 'selected' &&
									   response.outcome?.optionId === 'allow';
						resolve(granted);
					}
				}
			});
		});
	}

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

			console.log('Reading file:', { original: params.path, relative: relativePath, basePath });

			// Request permission if auto-approve is not enabled for reads or globally
			if (!this.settings.autoApproveReadPermission && !this.settings.autoApprovePermissions) {
				const permissionGranted = await this.requestFilePermission('read', relativePath);
				if (!permissionGranted) {
					throw new Error('Permission denied to read file');
				}
			}

			const file = this.app.vault.getAbstractFileByPath(relativePath);
			if (!file) {
				throw new Error(`File not found: ${relativePath}`);
			}

			const content = await this.app.vault.read(file as any);
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

			console.log('Writing file:', { original: params.path, relative: relativePath, basePath });

			// Request permission unless auto-approve is enabled
			if (!this.settings.autoApprovePermissions) {
				const permissionGranted = await this.requestFilePermission('write', relativePath);
				if (!permissionGranted) {
					throw new Error('Permission denied to write file');
				}
			}

			const file = this.app.vault.getAbstractFileByPath(relativePath);
			if (file) {
				await this.app.vault.modify(file as any, params.content);
			} else {
				await this.app.vault.create(relativePath, params.content);
			}
			return {};
		} catch (err) {
			console.error('File write error:', err);
			throw new Error(`Failed to write file: ${err.message}`);
		}
	}

	private async handleRequestPermission(params: schema.RequestPermissionRequest): Promise<schema.RequestPermissionResponse> {
		console.log('Permission requested:', params);

		if (this.settings.autoApprovePermissions && params.options && params.options.length > 0) {
			return {
				outcome: {
					outcome: 'selected',
					optionId: params.options[0].optionId
				}
			};
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
		const terminalId = Math.random().toString(36).substring(7);

		const basePath = this.getVaultPath();
		const workingDir = params.cwd || basePath;

		console.log('Creating terminal:', { command: params.command, args: params.args, cwd: workingDir });

		// If no args provided, this might be a shell command - use shell: true
		const useShell = !params.args || params.args.length === 0;

		const terminal = spawn(params.command, params.args || [], {
			cwd: workingDir,
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: useShell,  // Use shell if it's a full command string
			env: {
				...process.env,
				PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '')
			}
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

		console.log(`Terminal ${params.terminalId} output:`, {
			length: combinedOutput.length,
			exitCode: terminal.exitCode,
			preview: combinedOutput.substring(0, 100)
		});

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

	cleanup(): void {
		// Clean up terminals
		for (const terminal of this.terminals.values()) {
			terminal.kill();
		}
		this.terminals.clear();
		this.terminalOutputs.clear();

		// Kill agent process
		if (this.process) {
			this.process.kill();
			this.process = null;
		}

		this.connection = null;
		this.sessionId = null;
	}
}
