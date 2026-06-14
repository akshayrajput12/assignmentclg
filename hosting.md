# HOSTING.md — Deployment Manual (Vercel & Neon)

This guide provides step-by-step instructions to deploy this application to Vercel and connect a serverless Neon PostgreSQL database.

---

## 1. Create a Free Neon PostgreSQL Database
1. Go to [Neon Console](https://console.neon.tech/) and sign up for a free account.
2. Create a new project (e.g. `shared-expenses-app`).
3. Select **PostgreSQL 16** (or latest).
4. Copy the **Connection String** from the dashboard. It will look like this:
   `postgresql://username:password@ep-host.region.neon.tech/dbname?sslmode=require`

---

## 2. Configure Local Environment Variables
Create a `.env` file in the root of your local project:
```env
DATABASE_URL="postgresql://username:password@ep-host.region.neon.tech/dbname?sslmode=require"
```

---

## 3. Local DB Setup
Generate your Prisma Client and push your database schema to Neon:
```bash
# Compile schema
npx prisma generate

# Create tables in Neon
npx prisma db push
```

---

## 4. Deploying to Vercel
1. Initialize a Git repository if not already done, commit all files, and push them to your GitHub repository:
   ```bash
   git add .
   git commit -m "feat: complete project for deployment"
   git push origin master
   ```
2. Log in to the [Vercel Dashboard](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository `assignmentclg`.
4. In the **Environment Variables** section, add your database connection:
   - **Key:** `DATABASE_URL`
   - **Value:** *[Your Neon Connection String]*
5. Click **Deploy**.
6. Vercel will build the frontend, deploy the backend serverless API routes, and make the application live!

---

## 5. Production DB Sync
Once hosted, you can visit your Vercel deployment URL and click "One-Click Import Local CSV" to parse the CSV and seed the Neon database instantly in production!
