# SmartHass Home Assistant Add-on

AI-powered Home Assistant analytics and automation suggestions.

## Overview

SmartHass analyzes your Home Assistant entity data using Claude AI to provide:

- **Usage Patterns** — Discover daily/weekly routines and device behavior trends
- **Anomaly Detection** — Get alerted when something unusual happens
- **Automation Suggestions** — AI-generated automation YAML ready to deploy
- **Efficiency Insights** — Find energy waste and underutilized devices
- **Cross-Device Correlations** — Discover hidden relationships between devices
- **Device Recommendations** — Get suggestions for new devices that complement your setup

## Setup

1. Install the add-on from the repository
2. Open the **Configuration** tab and enter your Anthropic API key
3. Start the add-on
4. Click **OPEN WEB UI** in the sidebar

SmartHass will automatically:
- Create an admin account
- Connect to your Home Assistant instance
- Start syncing entity data in real-time via WebSocket
- Run your first analysis within the configured schedule

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `anthropic_api_key` | Your Anthropic API key for Claude AI analysis | (required) |
| `log_level` | Logging verbosity: debug, info, warning, error | `info` |
| `sync_cron_schedule` | Cron schedule for reconciliation sync | `0 3 * * *` (3 AM daily) |
| `analysis_cron_schedule` | Cron schedule for AI analysis runs | `0 4 * * 0` (4 AM Sunday) |

## How It Works

### Continuous Sync

Unlike the standalone Docker deployment which syncs once daily, the HA add-on maintains a persistent WebSocket connection to Home Assistant. This means:

- Entity states are updated in real-time (within 30 seconds of a change)
- Hourly activity and state distribution stats are computed continuously
- The daily cron sync becomes a lightweight reconciliation pass (new entities, automations, baselines)

### Data Storage

All data is stored in a bundled PostgreSQL database at `/data/postgres`. This persists across add-on restarts and updates.

### Authentication

The add-on trusts Home Assistant's authentication via the Supervisor. No separate login is required — access SmartHass directly from the HA sidebar.

## API Key

SmartHass requires an Anthropic API key to power its AI analysis features. You can get one at [console.anthropic.com](https://console.anthropic.com/).

Analysis runs consume Claude API tokens. Typical usage:
- Weekly analysis of ~500 entities: ~$0.05-0.15 per run
- On-demand analysis: ~$0.02-0.05 per run
