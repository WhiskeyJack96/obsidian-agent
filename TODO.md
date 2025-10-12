Ideas:
- Could we add custom https://agentclientprotocol.com/protocol/extensibility#extension-methods to provide vault search methods?
    - This would likely be worse quality than letting an agent run bash, but it would be _MUCH_ safer
- I should probably add some tests :this-is-fine:
- Should it be possible to add slash commands from _within_ obsidian somehow?
- It would be cool to have a command pallete command that lets you start a new session for the current note (maybe by running a slash command and @-ing the file, or maybe by running a user configured saved prompt)
- Saving sessions (pending claude acp adaptor support)
- Move Mode to the chat box, add a hotkey for it
- Respect Accept Edits mode to skip diffs for the current convo
- git integration option: The integration should:
        Only run if a setting is toggled on.
        If it is it should:
        Check if the repository is a git repository (look for .git/)

        If it is not it should show a toast with an error.

        check if the `obsidian-git` plugin is installed
        If the obsidian-git plugin is installed we should use it (it has a property ..gitManager.commit({message:"descriptive message"})
        If it is not then it should default to commiting with the agent in a seperate session.

Commits should only be done after agent turns complete and the user should be given the ability to review/agree to the commit.
- tool permissions also render Notices