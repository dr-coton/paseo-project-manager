Project manager keeps a busy Paseo host tidy. It adds a status board for every workspace, bulk cleanup of old workspaces, and a project list where you set the order, hide projects or delete them.

Open it from the "Project manager" row at the top of the sidebar or from the Command Center. The row shows how many workspaces need review.

## Status board

Workspaces are sorted into four columns:

- **Needs review**: an agent asked a question or for permission, or finished or failed and you have not looked yet.
- **In progress**: an agent is working.
- **Idle**: nothing to do.
- **Archived**: archived workspaces of existing projects.

The board refreshes every five seconds while open. Opening a card opens the workspace. "Mark all read" moves finished and failed workspaces to idle; questions stay until answered. Paseo's own unread markers are not changed, because plugins cannot clear them; the plugin keeps its own record instead, and a new finish or error brings the workspace back.

Only two moves are manual. An idle workspace can be archived from its card. An archived workspace can be restored, which opens Paseo's recovery screen for it.

## Cleanup

Lists idle workspaces whose last activity is older than 1 to 90 days, grouped by project and selected by default, and archives them together. Archiving uses Paseo's own archive operation: agents and terminals close, and a Paseo-owned worktree folder is removed while its branch and commits stay. Pinned workspaces and worktrees with uncommitted changes, checked with `git status` right before archiving, are skipped.

## Projects

Move projects up, down or to the top, hide or show them, or delete them. The order and hidden list are host settings shared by every client of the daemon, and take effect in the "Project manager" sidebar view, chosen under Settings, Sidebar, Sidebar view. Hiding never changes a project.

Deleting a project does what `paseo project delete` does: its workspaces are archived and their agents and terminals closed. Files on disk, including worktree folders, are kept. Deletion is refused while an agent in the project is working or waiting on a question.

## What it reads and runs

Everything stays on the daemon host. The plugin uses the Paseo API for projects, workspaces and agents. It reads `projects/workspaces.json` in the Paseo home to list archived workspaces and never writes it. It stores read markers in `plugin-data/project-manager/acks.json`. It runs `git status` in worktrees before archiving them, and runs the Paseo CLI bundled with the daemon for `project ls` at startup and `project delete` when you delete a project. Nothing is sent over the network.

Requires Paseo 0.16 or later. The interface is available in English, Korean, Japanese and Simplified Chinese.
