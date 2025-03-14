# Deploying to Cloudflare Pages

This project is configured to be deployed to Cloudflare Pages, which provides serverless hosting for Next.js applications.

## Prerequisites

1. A Cloudflare account
2. Node.js installed locally (version 20 or later)
3. Your code pushed to a Git repository (GitHub, GitLab, etc.)

## Deployment Options

### Option 1: Direct from GitHub (Recommended)

1. Log in to your Cloudflare dashboard
2. Navigate to "Pages"
3. Click "Create a project" and select "Connect to Git"
4. Choose your repository and configure:
   - Project name: `champagne-festival` (or your preferred name)
   - Production branch: `main` (or your main branch)
   - Build settings:
     - Framework preset: Next.js
     - Build command: `npm run build`
     - Build output directory: `.next`
     - Node.js version: 20

5. Click "Save and Deploy"

### Option 2: Manual Deployment with Wrangler

This project includes the necessary Wrangler configuration and a deploy script.

1. Log in to Cloudflare from the CLI:
   ```bash
   npx wrangler login
   ```

2. Build and deploy the site:
   ```bash
   npm run build && npm run deploy
   ```

   If deploying for the first time, you'll need to create a project:
   ```bash
   npx wrangler pages project create champagne-festival
   ```

## Environment Variables

If your project requires environment variables, you can set them in the Cloudflare Pages dashboard:

1. Navigate to your Pages project
2. Click on "Settings" > "Environment variables"
3. Add your variables for production and preview environments

## Custom Domains

After initial deployment, you can configure a custom domain:

1. In the Cloudflare Pages dashboard, go to your project
2. Click on "Custom domains"
3. Follow the instructions to add and verify your domain

## Troubleshooting

If you encounter issues during deployment:

1. Check build logs in the Cloudflare dashboard
2. Verify that all required environment variables are set
3. Ensure your Next.js configuration is compatible with Cloudflare Pages (output: 'standalone')
4. Check that your code doesn't use APIs unavailable in Edge Runtime

For more help, refer to the [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/).