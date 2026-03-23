# Privacy Policy Draft

Advanced Focus Mode for Developers is designed to work locally first.

## Data the extension uses

- Session state
- Task titles and completion status
- Saved notes
- Shielded hosts and budgets
- Session history and replay summaries
- Tab titles and URLs captured for focus recovery

## Where the data is stored

- By default, the extension stores data locally in the browser using Chrome storage.
- Exported backups are saved only when the user explicitly downloads them.
- The current build does not send user data to a remote server.

## What the extension does not do

- It does not sell user data.
- It does not run remote code.
- It does not use analytics beacons or background tracking services.
- It does not sync data to a backend because there is no backend in the current build.

## User control

- Users can export their data.
- Users can import a backup file.
- Users can reset all stored focus data.
- Users can clear forensics and parking lot data from the dashboard.

## Permissions

The extension requests browser permissions only to support its focus features:

- `tabs` for session capture, restore, and tab-related forensics
- `storage` for local state persistence
- `alarms` for timer scheduling
- `notifications` for session reminders
- `declarativeNetRequest` and host access for distraction shielding

## Future backend note

If a backend sync service is added later, this policy should be updated to describe:

- what data is synced
- whether it is encrypted
- how long it is retained
- how the user can delete it
