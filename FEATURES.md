# Feature Guide

Advanced Focus Mode for Developers is built around one idea: keep the next work action visible while making distractions harder to reach.

## What the extension includes

- Focus dashboard as the new tab page
- Session timer with pause, resume, finish, skip break, and reset
- Developer work modes
- Project-aware sessions
- Task stack and session notes
- Distraction shield
- Focus recovery
- Parking lot for side thoughts
- Adaptive autopilot
- Focus budgets
- Session replay and forensics
- Session report export
- Demo kit and presentation mode
- Clean tab page
- Settings page for backup and reset
- Keyboard shortcuts

## Dashboard

The dashboard is the main surface of the extension. It opens on new tabs and gives you one place to manage a focus session.

### What you see

- Current session status
- Countdown timer
- Mission or objective
- Project context
- Focus coach recommendations
- Session review summary
- Task stack
- Shielded sites
- Recovery tools
- Parking lot
- Autopilot and budgets
- Activity log and replay

### What it does

- Keeps the active work visible
- Lets you start and stop sessions quickly
- Surfaces history and context without leaving the page
- Lets you demo the extension without manual setup

## Session Timer

The timer supports the core session flow:

- Start session
- Pause or resume
- Finish round
- Skip break
- Reset session

The session state also tracks:

- focus minutes
- break minutes
- remaining time
- current phase
- pause count
- current objective
- project details

## Developer Modes

The extension includes structured modes for different kinds of work:

- Code sprint
- Debug bash
- Review block
- Architecture block
- Writing block
- Planning block

Each mode changes the focus length, break length, and suggested objective so the timer fits the work instead of forcing one shape for everything.

## Project-Aware Sessions

Sessions can be tied to project context:

- project name
- branch
- ticket

This context appears in the dashboard and is included in reports and history entries.

## Task Stack

The task stack is a lightweight work queue for atomic actions.

### Features

- Add a task
- Mark a task done or undo it
- Remove a task
- Add a suggested task
- Link a task to saved context
- Open a task's linked context

The task stack is meant to keep the session focused on the next concrete step.

## Session Notes

You can keep notes directly in the dashboard.

Typical uses:

- blockers
- rationale
- exit criteria
- follow-up notes

## Distraction Shield

The shield lets you block distracting hosts during focus time.

### Features

- Add a host or domain
- Enable or disable a shield entry
- Remove a shield entry
- Use suggested distractions as quick picks
- Use smart block suggestions from recent behavior

When the extension sees repeated interruptions, it can suggest stronger protection.

## Focus Recovery

Focus recovery is built for context switching and interruptions.

### Features

- Capture the current tab context
- Restore the saved context later
- See saved tabs in the dashboard
- Link work tasks to a captured tab

This is intended to reduce the cost of getting pulled away from a session.

## Parking Lot

The parking lot is for everything that would otherwise pull you off task.

You can park:

- a side thought
- a link
- a distraction
- a future follow-up

This keeps the session clean without losing the idea.

## Adaptive Autopilot

Autopilot suggests how to shape your next block based on recent signals.

### Signals it uses

- pauses
- blocked attempts
- tab switches
- parked items
- budget pressure

### It recommends

- a work mode
- whether strict blocking should be on
- a confidence level
- a short rationale

### When you apply it

The extension applies the recommended mode and updates the session objective and timing.

## Focus Budgets

Budgets let you track time spent on distraction-heavy categories.

### Features

- Add a host budget
- Set a daily limit
- Reset usage
- Remove a budget
- Review overuse pressure

This is useful for sites that are not always worth blocking completely but should still be limited.

## Session Replay and Forensics

The replay section summarizes what happened during the session.

### Tracks

- blocked attempts
- tab switches
- focus escapes
- smart suggestions

### Activity log

The activity log records notable session events such as:

- session started
- session paused
- session resumed
- break started
- break completed
- project mode applied
- context captured
- state restored
- budget changes
- demo scenario loaded

## Session Review and Report

The review card gives you a compact summary of the current session.

### Report output includes

- objective
- top completed tasks
- next action
- project context
- timing
- replay summary
- budget summary
- autopilot recommendation
- parking lot items

You can copy the report or download it as markdown.

## Demo Kit

The demo kit is a guided walkthrough for presentations and onboarding.

### It provides

- a preloaded demo scenario
- a short walkthrough script
- a start presentation action
- keyboard navigation for the presentation HUD
- a collapsible demo panel

This is useful when you want to show the extension to someone without manually building a session first.

## Presentation Mode

Presentation mode highlights one section at a time and shows a live talk track.

### Controls

- Next
- Previous
- Arrow keys
- Home / End
- Escape to exit

It is meant for live demos, training, or recorded walkthroughs.

## Clean Tab

The clean tab is a simple in-extension page for distraction-free work.

It replaces a raw `about:blank` tab with a small branded surface.

## Settings Page

The settings page gives you:

- export backup
- import backup
- reset all state
- keyboard shortcut reference
- quick links to open the dashboard and clean tab

## Keyboard Shortcuts

- `Ctrl+Shift+Y` open dashboard
- `Ctrl+Shift+P` pause or resume
- `Ctrl+Shift+M` finish session
- `Ctrl+Shift+S` skip break
- Reset session from the dashboard button

## Install and Test

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.
5. Open a new tab and verify the dashboard loads.
6. Use `Open clean tab` to verify the clean page.
7. Open `Settings` and test import, export, and reset.

## Build

Use the included build script to create a release zip.
