
  ---
  🔴 CRITICAL ISSUES (Fix Immediately)

  1. Unsafe Error Property Access (Multiple files)

  Impact: Could cause crashes in error handling paths

  All error handlers access err.message without type checking:
  - acp-client.ts:55, 207, 316, 375, 442
  - agent-view.ts:246, 328, 344, 368
  - git-integration.ts:76
  - mode-manager.ts:90

  Fix: Add type guard helper:
  function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  2. Synchronous File Read Blocks UI (acp-client.ts:140)

  if (this.settings.obsidianFocussedPrompt) {
      systemPrompt = readFileSync("prompt.md")  // ❌ Blocks event loop, no error
  handling
  }

  Issues:
  - Blocks UI thread
  - No error handling if file missing
  - Relative path without base resolution
  - Returns Buffer not string (missing encoding)
  - Wrong variable type

  3. Path Traversal Security Risk (acp-client.ts:297-377)

  File operations don't validate paths - agent could read/write outside vault:
  if (params.path.startsWith(basePath)) {
      relativePath = params.path.substring(basePath.length + 1);
      // ❌ No check for '..' or symlinks
  }

  4. Unbounded Memory Growth (acp-client.ts:423-436)

  Terminal output accumulates forever:
  terminal.output.stdout += data.toString();  // ❌ No size limit

  Impact: Long-running processes or verbose output = memory leak

  ---
  🟡 MODERATE ISSUES

  5. No Timeout on User Interactions (acp-client.ts:355-357)

  Diff approval waits forever - agent hangs if user doesn't respond:
  const result = await new Promise<DiffResult>((resolve) => {
      diffView.setDiffData(diffData, resolve);  // ❌ Never times out
  });

  6. Git Integration Bug (git-integration.ts:64-67)

  Only checks unstaged changes, ignores already-staged files:
  if (status.changed.length === 0) {
      return;  // ❌ Should check staged.length too
  }

  7. Event Listener Memory Leaks (Multiple files)

  Listeners added but never cleaned up:
  - agent-view.ts: Button listeners (lines 93, 110, 117, 142-161)
  - mode-manager.ts: Mode selector (line 21)
  - autocomplete-manager.ts: Autocomplete items (line 165)
  - thought-message.ts: Header click (line 39)

  8. ACPClient is a God Object (acp-client.ts:14-534)

  Single class handles 9 different responsibilities:
  - Process spawning
  - Stream conversion
  - Connection management
  - Session lifecycle
  - File operations
  - Terminal management
  - Permission handling
  - Cleanup

  Impact: Hard to test, maintain, and extend

  ---
  🔵 USABILITY GAPS

  Missing User Feedback

  1. No loading spinner during connection - users don't know if app is working
  2. No progress feedback - long operations feel frozen
  3. Silent autocomplete failures - no error when file listing fails
  4. No terminal output streaming - commands appear to hang

  Confusing UX

  5. Connection state unclear - "Connected" vs "Session active" is subtle
  6. Session ID disappears - shown once then lost in scroll
  7. Mode selector appears suddenly - no explanation what modes are
  8. Thought messages - no explanation what they contain

  Poor Error Messages

  9. Generic errors - "Failed to connect" doesn't explain why
  10. No command validation - typos in agent path discovered too late
  11. No help text - settings lack examples
  12. Git integration fails silently - enabled but obsidian-git missing

  Missing Safeguards

  13. No "New Conversation" confirmation - accidental clicks lose history
  14. No reject warning - users don't know reject loses agent's work
  15. Cancel button unsafe - may leave files inconsistent

  Accessibility

  16. No keyboard shortcuts - must use mouse for everything
  17. Limited autocomplete navigation - no Ctrl+N/Ctrl+P
  18. No screen reader support - blind users can't use plugin

  ---
  💡 POTENTIAL FEATURES

  Quick Wins (Low Complexity, High Impact)

  1. Conversation export - save as markdown note
  2. Copy message buttons - quick copy of code/responses
  3. Persistent session ID display - show in status bar
  4. Agent command validation - check file exists
  5. Suggested prompts - quick action buttons for common tasks
  6. Loading indicators - spinners during operations

  High Value Features

  7. Conversation history - persist and review past sessions
  8. Message search - find past solutions in long conversations
  9. Auto-reconnect - handle agent crashes gracefully
  10. Live terminal output - stream command output in real-time
  11. Better error messages - actionable troubleshooting tips
  12. Link modified files - clickable Obsidian links in messages

  Advanced Features

  13. Multiple agent profiles - switch between configurations
  14. Context menu integration - right-click text → send to agent
  15. Interactive plan editing - reorder/modify plan steps
  16. Tool call approval rules - auto-approve specific patterns
  17. Multi-line editor - syntax highlighting in input
  18. Diff improvements - edit before accepting, side-by-side view

  ---
  📊 TECHNICAL DEBT

  Type Safety Issues

  - any types in git-integration.ts (lines 26, 41)
  - any in message-renderer.ts (line 48)
  - Unsafe type assertions in main.ts (lines 97, 142, 152, 165, 182)
  - Constructor name string comparison (breaks in minified builds)

  Stylistic Inconsistencies

  - Mixed try-catch vs no error handling
  - Mix of async/await and promise chains
  - Inconsistent error message formats
  - Hardcoded values without constants

  Architecture Issues

  - Tight coupling between components
  - Circular dependency (acp-client ↔ main)
  - Duplicated path conversion logic
  - Duplicated smart spacing logic in message-renderer

  Resource Management

  - Terminal stream handles not closed
  - Process stdout/stderr not explicitly cleaned
  - Component references not nulled after unload
  - Tool call cache accumulates on errors

  ---
  🎯 RECOMMENDED PRIORITIES

  Sprint 1: Critical Fixes

  1. Fix error property access safety (add type guards)
  2. Fix synchronous file read (use async, add error handling)
  3. Add path validation (prevent traversal)
  4. Add timeout mechanism for diff approval
  5. Fix git integration staged files bug

  Sprint 2: Resource Management

  6. Add event listener cleanup
  7. Add terminal output size limits
  8. Properly close streams/processes
  9. Clear tool call cache on errors

  Sprint 3: Quick UX Wins

  10. Add loading spinners
  11. Add confirmations for destructive actions
  12. Validate agent command in settings
  13. Show session ID persistently
  14. Export conversation to markdown
  15. Add copy buttons

  Sprint 4: Refactoring

  16. Split ACPClient into focused classes
  17. Add TypeScript strict mode
  18. Remove any types
  19. Consolidate error handling patterns
  20. Extract duplicated code
