# Paseo project manager

A [Paseo](https://paseo.sh) plugin for keeping a busy host tidy:

- **Status board**: every workspace in one of four columns (needs review, in progress, idle, archived), refreshed every five seconds, with a review count in the sidebar and "mark all read".
- **Cleanup**: archive idle workspaces that have been inactive for 1 to 90 days, in bulk.
- **Projects**: reorder, hide or delete projects. The order and hidden list apply to the "Project manager" sidebar view.

The interface is available in English, Korean, Japanese and Simplified Chinese. [한국어 설명](README.ko.md)

## Install

Requires Paseo 0.16 or later, with plugins enabled on the daemon.

```bash
paseo plugin add git:dr-coton/paseo-project-manager
```

Then open "Project manager" at the top of the sidebar or from the Command Center (⌘K). To apply the project order to the sidebar, choose **Settings → Sidebar → Sidebar view → Project manager**.

## Safety

- Only idle workspaces can be archived. Pinned workspaces and worktrees with uncommitted changes (checked with `git status` right before archiving) are skipped. Archiving uses Paseo's own operation, which removes a Paseo-owned worktree folder but keeps its branch and commits.
- Deleting a project runs `paseo project delete` with the CLI bundled with the daemon. Workspaces are archived and their agents and terminals closed; files on disk are kept. It is refused while an agent in the project is working or waiting on a question.
- Paseo's archived-workspace registry (`projects/workspaces.json`) is only read, never written.
- "Mark all read" cannot clear Paseo's own unread markers; the plugin keeps its own record in `plugin-data/project-manager/acks.json`.
- Nothing is sent over the network.

## Development

```bash
npm install
npm run typecheck
npm test                      # logic tests against a fake Paseo API, no daemon needed
paseo plugin install "$PWD"   # install this checkout
paseo plugin reload project-manager
paseo plugin logs project-manager
```

Layout: `client/` app UI (React Native), `server/` daemon handlers, `shared/` RPC contracts and settings, `client/locales/` translations, `test/` logic tests.

## License

[MIT](LICENSE)
