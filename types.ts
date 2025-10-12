/**
 * Type definitions for the ACP Client plugin.
 *
 * This file re-exports types from the ACP protocol library and defines
 * plugin-specific types that extend or complement the ACP types.
 */

import * as schema from '@zed-industries/agent-client-protocol';

// Re-export commonly used ACP types for convenience
export type {
	SessionNotification,
	PlanEntry,
	AvailableCommand,
	ToolCallUpdate,
	ContentBlock,
	ToolCallContent,
	ToolCallStatus,
	ToolCallLocation,
	ToolKind,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionMode,
	PromptResponse,
} from '@zed-industries/agent-client-protocol';

/**
 * Session mode state tracking available modes and current selection
 */
export interface SessionModeState {
	currentModeId: string;
	availableModes: schema.SessionMode[];
}

/**
 * Plan data structure containing plan entries
 */
export interface Plan {
	entries: schema.PlanEntry[];
}

/**
 * Permission request data with resolver function
 */
export interface PermissionRequestData {
	params: schema.RequestPermissionRequest;
	resolve: (response: schema.RequestPermissionResponse) => void;
}

/**
 * Session update types and their corresponding data structures.
 * This is a discriminated union for type-safe update handling.
 */
export type SessionUpdate =
	| {
			type: 'message';
			data: schema.SessionNotification;
	  }
	| {
			type: 'tool_call';
			data: schema.SessionNotification;
	  }
	| {
			type: 'plan';
			data: Plan;
	  }
	| {
			type: 'mode_change';
			data: SessionModeState;
	  }
	| {
			type: 'permission_request';
			data: PermissionRequestData;
	  }
	| {
			type: 'turn_complete';
			data: schema.PromptResponse;
	  };
