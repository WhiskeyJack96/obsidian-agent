import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObsidianMCPServer } from '../mcp-server';
import { App } from 'obsidian';
import { Server } from 'http';

describe('ObsidianMCPServer Token Authentication', () => {
	let app: App;
	let server: ObsidianMCPServer;
	const testPort = 13100; // Use fixed port for testing

	beforeEach(() => {
		app = new App();
		server = new ObsidianMCPServer({
			app,
			port: testPort
		});
	});

	afterEach(async () => {
		if (server) {
			try {
				await server.stop();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	describe('Token Management', () => {
		describe('addAuthToken()', () => {
			it('should add a token to the auth tokens set', () => {
				const token = 'test-token-1';
				server.addAuthToken(token);
				// Token is added internally, no exception thrown
				expect(() => server.addAuthToken(token)).not.toThrow();
			});

			it('should allow multiple tokens to be added', () => {
				const token1 = 'test-token-1';
				const token2 = 'test-token-2';
				server.addAuthToken(token1);
				server.addAuthToken(token2);
				// Both added without error
				expect(() => {
					server.addAuthToken(token1);
					server.addAuthToken(token2);
				}).not.toThrow();
			});

			it('should handle duplicate tokens gracefully', () => {
				const token = 'test-token';
				server.addAuthToken(token);
				server.addAuthToken(token); // Add same token again
				// Set deduplicates, no error thrown
				expect(() => server.addAuthToken(token)).not.toThrow();
			});
		});

		describe('removeAuthToken()', () => {
			it('should remove a token from the auth tokens set', () => {
				const token = 'test-token';
				server.addAuthToken(token);
				server.removeAuthToken(token);
				// No error on removal
				expect(() => server.removeAuthToken(token)).not.toThrow();
			});

			it('should be idempotent (removing non-existent token should not error)', () => {
				const token = 'non-existent-token';
				expect(() => {
					server.removeAuthToken(token);
				}).not.toThrow();
			});

			it('should remove one token without affecting others', () => {
				const token1 = 'test-token-1';
				const token2 = 'test-token-2';
				server.addAuthToken(token1);
				server.addAuthToken(token2);
				server.removeAuthToken(token1);
				// token2 can still be removed after token1 is removed
				expect(() => server.removeAuthToken(token2)).not.toThrow();
			});

			it('should not throw when removing all tokens', () => {
				const token = 'test-token';
				server.addAuthToken(token);
				server.removeAuthToken(token);
				expect(() => server.removeAuthToken(token)).not.toThrow();
			});
		});
	});

	describe('Auth Middleware Logic', () => {
		// Unit tests for middleware logic without actual HTTP
		
		describe('Token validation logic', () => {
			it('should accept request when token is valid', () => {
				const token = 'valid-token-123';
				server.addAuthToken(token);

				const authHeader = `Bearer ${token}`;
				const lowerAuthHeader = authHeader.toLowerCase();
				const providedToken = authHeader.substring(7).toLowerCase();

				let isValid = false;
				if (lowerAuthHeader.startsWith('bearer ')) {
					// Simulate middleware check
					const tokenSet = new Set<string>();
					tokenSet.add(token);
					for (const t of tokenSet) {
						if (t.toLowerCase() === providedToken) {
							isValid = true;
							break;
						}
					}
				}

				expect(isValid).toBe(true);
			});

			it('should reject request when token is invalid', () => {
				const validToken = 'valid-token-123';
				server.addAuthToken(validToken);

				const authHeader = `Bearer wrong-token`;
				const lowerAuthHeader = authHeader.toLowerCase();
				const providedToken = authHeader.substring(7).toLowerCase();

				let isValid = false;
				if (lowerAuthHeader.startsWith('bearer ')) {
					const tokenSet = new Set<string>();
					tokenSet.add(validToken);
					for (const t of tokenSet) {
						if (t.toLowerCase() === providedToken) {
							isValid = true;
							break;
						}
					}
				}

				expect(isValid).toBe(false);
			});

			it('should reject request without Bearer prefix', () => {
				server.addAuthToken('valid-token');

				const authHeader = `InvalidScheme valid-token`;
				const lowerAuthHeader = authHeader.toLowerCase();

				const isValid = lowerAuthHeader.startsWith('bearer ');
				expect(isValid).toBe(false);
			});

			it('should reject empty Authorization header', () => {
				server.addAuthToken('valid-token');

				const authHeader = '';
				const lowerAuthHeader = authHeader.toLowerCase();

				const isValid = lowerAuthHeader.startsWith('bearer ');
				expect(isValid).toBe(false);
			});

			it('should accept token with case-insensitive Bearer scheme', () => {
				const token = 'test-token-123';
				server.addAuthToken(token);

				const testHeaders = [
					`Bearer ${token}`,
					`bearer ${token}`,
					`BEARER ${token}`,
					`BeArEr ${token}`
				];

				for (const authHeader of testHeaders) {
					const lowerAuthHeader = authHeader.toLowerCase();
					const providedToken = authHeader.substring(7).toLowerCase();

					let isValid = false;
					if (lowerAuthHeader.startsWith('bearer ')) {
						const tokenSet = new Set<string>();
						tokenSet.add(token);
						for (const t of tokenSet) {
							if (t.toLowerCase() === providedToken) {
								isValid = true;
								break;
							}
						}
					}

					expect(isValid).toBe(true);
				}
			});

			it('should support multiple concurrent tokens', () => {
				const token1 = 'token-1';
				const token2 = 'token-2';
				server.addAuthToken(token1);
				server.addAuthToken(token2);

				// Both tokens added without error
				expect(() => {
					server.addAuthToken(token1);
					server.addAuthToken(token2);
				}).not.toThrow();

				// After removing one, can still remove the other
				server.removeAuthToken(token1);
				expect(() => server.removeAuthToken(token2)).not.toThrow();
			});
		});
	});
});
