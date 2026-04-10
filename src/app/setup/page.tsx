export default function SetupPage() {
  return (
    <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', padding: '20px', maxWidth: '800px' }}>
{`# SelfImprove Setup Instructions

Set up SelfImprove for this project by following these steps:

## Step 1: Get your GitHub token
Run: gh auth token

## Step 2: Create the project
curl -X POST ${process.env.NEXT_PUBLIC_APP_URL || 'https://selfimprove-iota.vercel.app'}/api/cli/init \\
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"repo_url": "YOUR_REPO_URL", "site_url": "YOUR_SITE_URL"}'

Replace YOUR_GITHUB_TOKEN with the output from step 1.
Replace YOUR_REPO_URL with this repo's GitHub URL (run: git remote get-url origin).
Replace YOUR_SITE_URL with the production URL if you have one, or omit it.

## Step 3: Open the dashboard
The API response includes a "dashboard_url" field. Open it in the browser.
Your AI-generated product roadmap will populate within minutes.

## What happens
- SelfImprove creates your account (or links to existing)
- Scans your codebase for bugs, security issues, performance problems
- Imports your GitHub issues as signals
- Generates a prioritized product roadmap with PRDs
- You manage everything from the web dashboard
`}
    </pre>
  )
}
