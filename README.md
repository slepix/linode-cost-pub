# Linode Cost Management Tool

A comprehensive, self-hosted solution for monitoring, analyzing, and optimizing your Linode infrastructure costs with AI-powered recommendations.

## Features

### Cost Management
- **Real-time Cost Tracking**: Monitor monthly costs across all your Linode resources
- **Cost History**: View spending trends over 7, 14, or 30-day periods
- **Budget Alerts**: Set monthly spending limits with customizable alert thresholds
- **Cost Projections**: Automatic 30-day cost projections based on usage patterns

### Resource Monitoring
- **Multi-Account Support**: Manage multiple Linode accounts from a single dashboard
- **All Resource Types**: Track Linodes, Volumes, NodeBalancers, LKE Clusters, Databases, Domains, and Firewalls
- **Real-time Metrics**: CPU, Disk I/O, and Network metrics for Linode instances
- **Resource Sync**: Automatic syncing of resources from Linode API

### AI-Powered Recommendations
- **Intelligent Analysis**: AI analyzes resource usage patterns over 7-day periods
- **Cost Optimization**: Identifies underutilized resources for downsizing opportunities
- **Performance Upgrades**: Recommends upgrades for overutilized resources
- **Confidence Scoring**: Each recommendation includes a confidence score
- **Savings Estimation**: See potential monthly savings for each recommendation

### Recommendation Criteria

The AI uses these criteria to generate recommendations:

#### Downsize Recommendations
- CPU average < 20% AND 95th percentile < 40% over sustained period
- Resource appears consistently underutilized
- Potential for cost savings without performance impact

#### Upgrade Recommendations
- CPU average > 70% OR 95th percentile > 85% over sustained period
- Resource showing signs of capacity constraints
- Performance improvements needed for better service

#### Optimize Recommendations
- Resource has occasional spikes but generally underutilized
- Could benefit from auto-scaling or reserved capacity

#### Delete Unused Resources
- Very low metrics across all categories
- Resource appears idle or abandoned

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Linode API token(s)
- OpenAI-compatible API endpoint (OpenAI, Azure OpenAI, or self-hosted)
- Supabase account (already configured)

### Configuration

#### 1. Add Linode Account
1. Click "Add Account" in the Accounts panel
2. Enter a friendly name for your account
3. Paste your Linode API token
4. Click "Add Account"

To get a Linode API token:
- Go to https://cloud.linode.com/profile/tokens
- Click "Create a Personal Access Token"
- Give it read permissions for the resources you want to track

#### 2. Configure AI Endpoint
1. Click the Settings button (gear icon) in the bottom right
2. Enter your OpenAI-compatible API endpoint URL
   - For OpenAI: `https://api.openai.com/v1/chat/completions`
   - For Azure OpenAI: Your Azure endpoint URL
   - For self-hosted: Your local endpoint URL
3. Enter your API key
4. Enter the model name (e.g., `gpt-4`, `gpt-3.5-turbo`)
5. Click "Save Configuration"

#### 3. Sync Resources
1. Select an account from the Accounts panel
2. Click the refresh icon to sync resources
3. Resources will be fetched and stored in the database

#### 4. Set Up Budgets (Optional)
1. Navigate to the Budget Alerts section
2. Click "Add Budget"
3. Enter a budget name and monthly limit
4. Set alert threshold percentage (default: 80%)
5. Budget status updates automatically based on current spending

## Usage

### Viewing Metrics
1. Select an account from the Accounts panel
2. Resources will appear in the Resources panel
3. Click on any Linode instance to view detailed metrics
4. Choose time range: 24 hours, 7 days, or 30 days

### Generating AI Recommendations
1. Select a Linode instance from the Resources panel
2. Click "AI Analyze" button
3. Wait for the AI to analyze metrics (typically 5-10 seconds)
4. View recommendations in the AI Recommendations panel

### Managing Recommendations
- Active recommendations appear in the Recommendations panel
- Each shows potential savings/costs and confidence score
- Click the X icon to dismiss a recommendation
- Recommendations are organized by type (downsize, upgrade, optimize)

### Budget Monitoring
- Budget alerts show real-time spending vs. limits
- Visual progress bars indicate budget usage
- Warnings appear when approaching threshold
- Alerts trigger when exceeding threshold

## Architecture

### Database Schema
- **linode_accounts**: Store multiple Linode accounts
- **resources**: All Linode resources across accounts
- **metrics_history**: Time-series metrics data
- **cost_summary**: Daily cost aggregations
- **recommendations**: AI-generated recommendations
- **budget_alerts**: Budget configurations
- **ai_config**: OpenAI endpoint configuration

### Edge Functions
- **fetch-linode-resources**: Syncs all resources from Linode API
- **fetch-linode-metrics**: Retrieves metrics for specific resources
- **generate-recommendations**: AI-powered recommendation generation

## Technology Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **APIs**: Linode API v4, OpenAI-compatible API
- **Icons**: Lucide React

## Self-Hosting

This tool is designed to be completely self-hosted:

1. **Database**: Uses Supabase (can be self-hosted with Supabase self-hosted)
2. **Edge Functions**: Deployed to Supabase (runs on Deno)
3. **Frontend**: Static files that can be hosted anywhere
4. **AI**: Connect to any OpenAI-compatible endpoint (including local LLMs)

## Data Privacy

All data is stored in your own Supabase instance:
- Linode API tokens are encrypted in the database
- AI API keys are encrypted in the database
- Metrics data never leaves your infrastructure
- No third-party tracking or analytics

## Cost Optimization Tips

1. **Regular Monitoring**: Check recommendations weekly
2. **Act on High Confidence**: Recommendations with 80%+ confidence are usually safe
3. **Review Downsizing**: Verify application performance after downsizing
4. **Plan Upgrades**: Schedule upgrades during maintenance windows
5. **Clean Up Unused**: Delete resources with very low utilization
6. **Budget Alerts**: Set budgets 10-20% above expected costs for early warnings

## Support

This is a self-hosted solution. For Linode API issues, contact Linode support.
For feature requests or bugs, check the application logs in your browser console and Supabase function logs.

## License

This tool is provided as-is for self-hosting and personal use.
