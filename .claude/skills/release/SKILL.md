---
   name: release-new-version
   description: Help the user release new versions of this plugin. Use anytime the user asks for help releasing
---

# Release Skill

Use this skill to create and publish a new release for the Obsidian plugin.

## Steps

1. **Bump Version**
   - Read current version from `manifest.json`
   - Increment version number appropriately (patch/minor/major)
   - Update `manifest.json` with new version
   - Update `versions.json` with new version mapping to minimum Obsidian version

2. **Build the Plugin**
   - Run `npm run build` to ensure clean compilation
   - Verify no TypeScript errors

3. **Create Git Commit**
   - Stage changes: `manifest.json`, `versions.json`, and any feature files
   - Create commit with descriptive message following format:
     ```
     feat: <brief description>

     <detailed description of changes>

     Changes:
     - List of key changes

     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

4. **Create and Push Tag**
   - Create annotated tag: `git tag -a <version> -m "Release version <version>: <description>"`
   - Push commits: `git push`
   - Push tag: `git push origin <version>`

5. **Wait for Release Workflow**
   - Check workflow status: `gh run list --limit 5`
   - Wait for "Release Obsidian plugin" workflow to complete successfully

6. **Update Release**
   - View release: `gh release view <version>`
   - Mark as pre-release and add notes:
     ```bash
     gh release edit <version> --prerelease --notes "<release notes>"
     ```
   - Release notes format:
     ```markdown
     ## 🎯 <Feature Title>

     **Brief description**
     - Single bullet point per feature describing the feature for users

     ---

     **Full Changelog**: https://github.com/<user>/<repo>/compare/<prev-version>...<version>
     ```

## Example Usage

User: "Can you create a release for the new autocomplete feature?"

Assistant will:
1. Determine appropriate version bump
2. Update manifest and versions files
3. Build to verify
4. Commit changes with detailed message
5. Create and push git tag
6. Monitor workflow completion
7. Mark as pre-release with concise user-facing notes

## Notes

- Always verify the build succeeds before committing
- Use semantic versioning (MAJOR.MINOR.PATCH)
- Keep release notes user-focused and concise
- Mark releases as pre-release by default for testing
