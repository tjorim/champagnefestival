# Deploying to Cloudflare Pages

This project is configured to be deployed to Cloudflare Pages, which provides serverless hosting for React applications.

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
     - Framework preset: Vite
     - Build command: `npm run build`
     - Build output directory: `dist`
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
   
   Or use the NPM script:
   ```bash
   npm run deploy
   ```

   If deploying for the first time, you'll need to create a project:
   ```bash
   npx wrangler pages project create champagne-festival
   ```

## Environment Variables

This project requires environment variables for both the frontend and the contact form function. Set these in the Cloudflare Pages dashboard:

1. Navigate to your Pages project
2. Click on "Settings" > "Environment variables"
3. Add the following variables for both production and preview environments:

### Frontend Variables (prefixed with VITE_)
- `VITE_PUBLIC_URL`: The public URL of your site
- `VITE_SITE_TITLE`: The title of your site (optional)

### Contact Form Function Variables
- `CONTACT_EMAIL`: Email address to receive contact form submissions
- `SMTP_HOSTNAME`: SMTP server hostname for sending emails
- `SMTP_USERNAME`: SMTP username/email for authentication
- `SMTP_PASSWORD`: SMTP password for authentication
- `SMTP_PORT`: SMTP port (usually 587 for TLS or 465 for SSL)

Important Notes:
- Vite frontend variables must start with `VITE_` to be accessible in the frontend code
- Function variables are securely stored and accessible only to Cloudflare Functions
- For testing locally, add these variables to your `.env` file (but never commit sensitive values to version control)

## SPA Routing Configuration

This project is configured as a Single Page Application (SPA) with the following files:

1. `public/_routes.json`: Defines SPA routing rules, directing all routes to index.html
2. `public/_headers`: Sets security headers including Content Security Policy

## Cloudflare Functions

This project uses Cloudflare Functions for the contact form processing. These are serverless functions that run on Cloudflare's edge network:

### Existing Functions

- `/functions/contact.js`: Handles contact form submissions and sends emails

### How Functions Work

1. Functions are deployed automatically when you deploy your site
2. Each function is accessible at a URL path matching its file path
3. For example, the contact form function is available at `/contact`
4. Functions can access environment variables through `context.env`
5. They run on Cloudflare's edge network, close to your users

### Developing New Functions

To create a new function:

1. Add a JavaScript file to the `/functions` directory
2. Export an appropriate handler function:
   ```javascript
   // Handle all HTTP methods
   export function onRequest(context) {
     return new Response("Hello, world!");
   }
   
   // Or handle specific HTTP methods
   export function onRequestPost(context) {
     // Process POST requests only
   }
   ```
3. Deploy your site to make the function available

### Testing Functions Locally

You can test functions locally using Wrangler:

```bash
npx wrangler pages dev dist
```

This will start a local development server that includes your functions.

### Function Logs

To view logs from your functions in production:

1. Go to your Cloudflare Pages dashboard
2. Navigate to your project
3. Click on "Functions" > "Logs"

This helps debug any issues with your contact form or other functions.

## Custom Domains

After initial deployment, you can configure a custom domain:

1. In the Cloudflare Pages dashboard, go to your project
2. Click on "Custom domains"
3. Follow the instructions to add and verify your domain

## Troubleshooting

If you encounter issues during deployment:

1. Check build logs in the Cloudflare dashboard
2. Verify that all required environment variables are set
3. Ensure your Vite configuration is properly set up (check vite.config.ts)
4. Confirm that `dist` is the correct output directory
5. Check that your SPA routing is working properly with the _routes.json file

For more help, refer to the [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/)