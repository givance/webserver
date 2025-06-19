# Deployment Guide

This guide covers deploying the Givance platform to production, including infrastructure setup, environment configuration, and deployment best practices.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Infrastructure Requirements](#infrastructure-requirements)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Application Deployment](#application-deployment)
- [Background Jobs](#background-jobs)
- [Monitoring & Logging](#monitoring--logging)
- [Security Checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services
- **Node.js**: v22.4.0 (use nvm for version management)
- **PostgreSQL**: v15+ with UUID extension
- **Redis**: v7+ for caching and job queues
- **Domain**: With SSL certificate
- **Email Service**: SMTP or transactional email provider
- **Storage**: S3-compatible storage for attachments

### Third-Party Services
- **Clerk**: Authentication and organization management
- **OpenAI/Anthropic**: AI model access
- **Google Cloud**: Custom Search API for donor research
- **WhatsApp Business**: API access (optional)
- **Trigger.dev**: Background job processing
- **Sentry**: Error tracking (recommended)

## Infrastructure Requirements

### Minimum Production Specifications

#### Web Server
- **CPU**: 4 vCPUs
- **RAM**: 8GB
- **Storage**: 50GB SSD
- **Network**: 1Gbps

#### Database Server
- **CPU**: 4 vCPUs
- **RAM**: 16GB
- **Storage**: 100GB SSD (with growth capacity)
- **Backup**: Daily automated backups

#### Redis Server
- **CPU**: 2 vCPUs
- **RAM**: 4GB
- **Persistence**: AOF enabled

### Recommended Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   CloudFlare    │────▶│  Load Balancer  │
└─────────────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌─────────────┐       ┌─────────────┐
            │   Web App   │       │   Web App   │
            │  (Next.js)  │       │  (Next.js)  │
            └─────────────┘       └─────────────┘
                    │                     │
        ┌───────────┼─────────────────────┤
        ▼           ▼                     ▼
┌─────────────┐ ┌─────────────┐   ┌─────────────┐
│ PostgreSQL  │ │    Redis    │   │ Trigger.dev │
│  (Primary)  │ │   (Cache)   │   │   Workers   │
└─────────────┘ └─────────────┘   └─────────────┘
        │
┌─────────────┐
│ PostgreSQL  │
│  (Replica)  │
└─────────────┘
```

## Environment Setup

### 1. Create Production Environment File

```bash
cp .env.example .env.production
```

### 2. Configure Environment Variables

```bash
# Core Configuration
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/givance_prod?ssl=true
REDIS_URL=redis://default:password@host:6379

# Application URLs
NEXT_PUBLIC_APP_URL=https://app.givance.com
NEXT_PUBLIC_API_URL=https://api.givance.com

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Google APIs
GOOGLE_CUSTOM_SEARCH_API_KEY=...
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=...

# Email Configuration
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG...
EMAIL_FROM="Givance <noreply@givance.com>"

# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...

# Trigger.dev
TRIGGER_API_KEY=...
TRIGGER_API_URL=https://api.trigger.dev
TRIGGER_PROJECT_ID=...

# Security
ENCRYPTION_KEY=... # 32-byte key for encrypting sensitive data
SESSION_SECRET=... # Random string for session encryption

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...
```

### 3. Validate Environment

```bash
# Use the built-in validation
npm run validate:env
```

## Database Setup

### 1. Create Production Database

```sql
CREATE DATABASE givance_prod;
CREATE USER givance_user WITH ENCRYPTED PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE givance_prod TO givance_user;

-- Enable required extensions
\c givance_prod
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
```

### 2. Configure Connection Pooling

For production, use PgBouncer or similar:

```ini
[databases]
givance_prod = host=postgres-primary port=5432 dbname=givance_prod

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

### 3. Run Migrations

```bash
# Generate migrations from schema
npm run db:generate

# Apply migrations to production
DATABASE_URL=postgresql://... npm run db:migrate

# Verify migration status
npm run db:status
```

### 4. Set Up Replication

Configure streaming replication for high availability:

```bash
# On primary
postgresql.conf:
wal_level = replica
max_wal_senders = 3
wal_keep_segments = 64

# On replica
recovery.conf:
standby_mode = 'on'
primary_conninfo = 'host=primary port=5432 user=replicator'
```

## Application Deployment

### 1. Build Application

```bash
# Install dependencies
npm ci --production=false

# Build Next.js application
npm run build

# Verify build
npm run build:analyze
```

### 2. Deploy with Docker

```dockerfile
# Dockerfile
FROM node:22.4.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### 3. Deploy with PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'givance-web',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

### 4. Configure Nginx

```nginx
# /etc/nginx/sites-available/givance
upstream givance_app {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name app.givance.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.givance.com;

    ssl_certificate /etc/letsencrypt/live/app.givance.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.givance.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:;" always;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    location / {
        proxy_pass http://givance_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /_next/static {
        alias /var/www/givance/.next/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API routes
    location /api {
        proxy_pass http://givance_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for AI operations
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

## Background Jobs

### 1. Deploy Trigger.dev Workers

```bash
# Install Trigger.dev CLI
npm install -g @trigger.dev/cli

# Deploy to Trigger.dev cloud
npm run trigger:deploy

# Or self-host workers
docker run -d \
  --name trigger-worker \
  -e TRIGGER_API_KEY=$TRIGGER_API_KEY \
  -e DATABASE_URL=$DATABASE_URL \
  triggerdev/worker:latest
```

### 2. Configure Job Concurrency

```typescript
// src/trigger/client.ts
export const client = new TriggerClient({
  id: "givance-prod",
  apiKey: process.env.TRIGGER_API_KEY,
  apiUrl: process.env.TRIGGER_API_URL,
  // Production concurrency settings
  concurrencyLimit: {
    generateBulkEmails: 10,
    bulkDonorResearch: 5,
    crawlWebsite: 2
  }
});
```

### 3. Monitor Job Performance

```bash
# View job dashboard
open https://app.trigger.dev/orgs/your-org/projects/givance-prod

# Set up alerts for failed jobs
curl -X POST https://api.trigger.dev/alerts \
  -H "Authorization: Bearer $TRIGGER_API_KEY" \
  -d '{
    "type": "job_failed",
    "threshold": 5,
    "webhook_url": "https://your-webhook.com/alerts"
  }'
```

## Monitoring & Logging

### 1. Application Monitoring

```typescript
// src/app/lib/monitoring.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay(),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### 2. Set Up Health Checks

```typescript
// src/app/api/health/route.ts
export async function GET() {
  const checks = {
    app: "healthy",
    database: await checkDatabase(),
    redis: await checkRedis(),
    external: await checkExternalServices(),
  };

  const healthy = Object.values(checks).every(v => v === "healthy");
  
  return Response.json(
    { status: healthy ? "healthy" : "unhealthy", checks },
    { status: healthy ? 200 : 503 }
  );
}
```

### 3. Configure Logging

```typescript
// src/app/lib/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### 4. Set Up Alerts

```yaml
# datadog-monitors.yaml
monitors:
  - name: "High Error Rate"
    type: "metric alert"
    query: "avg(last_5m):sum:nodejs.errors{app:givance} > 10"
    
  - name: "Database Connection Pool Exhausted"
    type: "metric alert"
    query: "avg(last_5m):avg:postgresql.connections.used{app:givance} > 0.9"
    
  - name: "AI Token Usage Spike"
    type: "metric alert"
    query: "sum(last_1h):sum:ai.tokens.used{app:givance} > 1000000"
```

## Security Checklist

### Pre-Deployment

- [ ] All secrets in environment variables
- [ ] Database connections use SSL
- [ ] API keys have minimum required permissions
- [ ] CORS configured for production domains only
- [ ] Rate limiting implemented on all endpoints
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention via parameterized queries
- [ ] XSS prevention via content security policy

### Infrastructure

- [ ] Firewall rules configured (only required ports open)
- [ ] SSL certificates installed and auto-renewal configured
- [ ] Database backups automated and tested
- [ ] Monitoring and alerting configured
- [ ] DDoS protection enabled (CloudFlare/AWS Shield)
- [ ] WAF rules configured for common attacks

### Application

- [ ] Authentication required on all protected routes
- [ ] Organization-based data isolation verified
- [ ] Sensitive data encryption at rest
- [ ] Audit logging for sensitive operations
- [ ] Error messages don't leak sensitive info
- [ ] File upload restrictions implemented
- [ ] Session timeout configured

### Compliance

- [ ] Privacy policy updated and accessible
- [ ] Terms of service updated and accessible
- [ ] Cookie consent implemented (if applicable)
- [ ] Data retention policies implemented
- [ ] GDPR compliance verified (if applicable)
- [ ] Payment data never stored (PCI compliance)

## Troubleshooting

### Common Issues

#### 1. Database Connection Errors
```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Verify SSL
psql $DATABASE_URL -c "SHOW ssl"

# Check connection pool
SELECT count(*) FROM pg_stat_activity;
```

#### 2. Memory Issues
```bash
# Monitor memory usage
pm2 monit

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Check for memory leaks
npm run test:memory
```

#### 3. Slow Performance
```bash
# Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;

# Analyze slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

# Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
AND correlation < 0.1
ORDER BY n_distinct DESC;
```

#### 4. Background Job Failures
```bash
# Check Trigger.dev logs
trigger logs --tail

# Retry failed jobs
trigger retry --job-id=xxx

# Scale workers
trigger scale --workers=5
```

### Emergency Procedures

#### Database Rollback
```bash
# List migrations
npm run db:migrations:list

# Rollback last migration
npm run db:rollback

# Restore from backup
pg_restore -h localhost -U givance_user -d givance_prod backup.dump
```

#### Application Rollback
```bash
# With PM2
pm2 deploy ecosystem.config.js production revert 1

# With Docker
docker stop givance-web
docker run -d --name givance-web givance:previous-version

# With Kubernetes
kubectl rollout undo deployment/givance-web
```

## Post-Deployment

### 1. Verify Deployment
```bash
# Run smoke tests
npm run test:e2e:production

# Check critical user flows
- User registration/login
- Donor creation
- Email generation
- Payment processing
```

### 2. Monitor First 24 Hours
- Error rates
- Response times
- Database performance
- AI token usage
- User activity

### 3. Performance Baseline
```bash
# Load testing
npm run test:load

# Establish baseline metrics
- Average response time: < 200ms
- 95th percentile: < 500ms
- Error rate: < 0.1%
- Uptime: > 99.9%
```

### 4. Documentation
- Update runbook with any deployment issues
- Document any custom configurations
- Update team on deployment status