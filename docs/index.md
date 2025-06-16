# Documentation Index

Welcome to the Nonprofit Webserver documentation! This comprehensive guide will help you understand, develop, and contribute to our donor management and email campaign platform.

## Quick Navigation

### Getting Started
- 📖 **[Main README](README.md)** - Complete onboarding guide and project overview
- 🚀 **[Development Guide](development-guide.md)** - Step-by-step setup and development workflow
- 🏗️ **[Architecture](architecture.md)** - System architecture and design patterns
- 🛠️ **[Technology Stack](tech-stack.md)** - Detailed tech stack documentation
- ✨ **[Features](features.md)** - Comprehensive feature documentation

## Documentation Overview

### 1. Project Introduction
The **[Main README](README.md)** provides:
- Business purpose and target users
- Quick start installation guide
- High-level architecture overview
- Key features summary
- Development workflow principles
- Code conventions and standards

### 2. Development Setup
The **[Development Guide](development-guide.md)** covers:
- Prerequisites and environment setup
- Detailed installation instructions
- Development workflow and task management
- Code structure and naming conventions
- Testing guidelines and best practices
- Debugging and troubleshooting tips

### 3. System Architecture
The **[Architecture Documentation](architecture.md)** explains:
- High-level system design
- Frontend and backend architecture
- Database design and relationships
- API structure and patterns
- Security implementation
- Performance optimizations
- Scalability considerations

### 4. Technology Details
The **[Technology Stack](tech-stack.md)** provides:
- Complete technology breakdown
- Frontend and backend technologies
- Third-party integrations
- Development tools and build process
- Security implementations
- Performance optimizations
- Future technology roadmap

### 5. Feature Documentation
The **[Features Documentation](features.md)** describes:
- Core feature set and capabilities
- AI-powered email campaigns
- Donor management system
- Analytics and tracking
- Staff management tools
- Technical features and integrations
- Upcoming features roadmap

## Project Structure Overview

```
nonprofit-webserver/
├── docs/                    # 📚 This documentation
│   ├── README.md           # Main onboarding guide
│   ├── architecture.md     # System architecture
│   ├── development-guide.md # Development setup & workflow
│   ├── tech-stack.md       # Technology documentation
│   ├── features.md         # Feature documentation
│   └── index.md           # This index file
├── src/                    # 💻 Application source code
│   ├── app/               # Next.js App Router
│   ├── components/        # Reusable UI components
│   ├── lib/               # Utilities and services
│   └── server/            # Server-side code
├── task.md                # 📋 Current development tasks
└── [config files]        # Various configuration files
```

## How to Use This Documentation

### For New Developers
1. Start with the **[Main README](README.md)** for project overview
2. Follow the **[Development Guide](development-guide.md)** for setup
3. Review **[Architecture](architecture.md)** to understand the system
4. Check **[Features](features.md)** to understand capabilities
5. Reference **[Technology Stack](tech-stack.md)** for technical details

### For Contributors
1. Review the **[Development Guide](development-guide.md)** for workflow
2. Check `task.md` for current development status
3. Follow code conventions outlined in documentation
4. Understand the architecture before making changes

### For Stakeholders
1. Read the **[Main README](README.md)** for business context
2. Review **[Features](features.md)** for capabilities
3. Check **[Architecture](architecture.md)** for technical overview

## Quick Reference

### Essential Commands
```bash
# Development
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm lint                   # Lint code

# Database
pnpm db:studio             # Open database studio
pnpm db:generate           # Generate migrations
pnpm db:push               # Push schema changes

# Background Jobs
pnpm trigger:dev           # Start Trigger.dev development
```

### Key Technologies
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js 22.4.0, tRPC, Drizzle ORM, PostgreSQL
- **Authentication**: Clerk
- **AI Integration**: Vercel AI SDK (Anthropic, OpenAI, Azure)
- **Background Jobs**: Trigger.dev
- **UI Components**: Radix UI, shadcn/ui

### Important Files
- `src/app/lib/db/schema.ts` - Database schema
- `src/app/api/trpc/` - API routes
- `task.md` - Current development tasks
- `.env` - Environment configuration
- `package.json` - Dependencies and scripts

## Development Status

The project is actively maintained and follows a structured development approach:

- **Current Phase**: Email generation system enhancements (see `task.md`)
- **Architecture**: Mature, well-documented system
- **Code Quality**: TypeScript strict mode, comprehensive linting
- **Testing**: Basic testing infrastructure (expansion planned)
- **Documentation**: Comprehensive and up-to-date

## Getting Help

### Internal Resources
- **Task File**: Check `task.md` for current development context
- **Code Comments**: Well-documented codebase with JSDoc comments
- **Type Definitions**: Complete TypeScript definitions for all components

### External Resources
- **Next.js Documentation**: https://nextjs.org/docs
- **tRPC Documentation**: https://trpc.io/docs
- **Drizzle ORM**: https://orm.drizzle.team/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Radix UI**: https://www.radix-ui.com/primitives

### Community
- Follow established code patterns and conventions
- Refer to existing implementations for guidance
- Maintain documentation when making changes
- Test thoroughly before committing changes

## Contributing Guidelines

1. **Follow the 4-Phase Development Process**:
   - Research: Understand requirements and existing code
   - Plan: Create detailed task breakdown
   - Execute: Implement following conventions
   - Review: Test and fix any issues

2. **Code Quality Standards**:
   - Use TypeScript strict mode
   - Follow established naming conventions
   - Write JSDoc comments for complex functions
   - Maintain component size limits (max 500 lines)

3. **Testing Requirements**:
   - Test all new functionality
   - Ensure builds pass without errors
   - Fix any linting issues
   - Verify type safety

4. **Documentation Maintenance**:
   - Update relevant documentation for significant changes
   - Keep README and guides current
   - Document any new patterns or conventions

## Roadmap

### Immediate Priorities
- Complete email generation system enhancements
- Implement comprehensive testing framework
- Enhance error handling and logging
- Optimize database queries and performance

### Medium-term Goals
- WhatsApp integration for donor communication
- Advanced analytics and reporting features
- Mobile application development
- Enhanced AI capabilities

### Long-term Vision
- Multi-language support
- Advanced automation workflows
- Comprehensive CRM integrations
- Scalable multi-tenant architecture

---

This documentation is actively maintained and updated. If you find any issues or have suggestions for improvement, please update the relevant files or reach out to the development team.

**Last Updated**: Current with project status as of latest commit
**Documentation Version**: 1.0
**Project Version**: 0.1.0 