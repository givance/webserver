/**
 * Main schema export file - re-exports all tables and relations from the schema directory
 * This maintains backward compatibility with existing imports
 */

// Enums and types
export * from './schema/enums';
export * from './schema/types';

// Tables and relations
export * from './schema/auth';
export * from './schema/organizations';
export * from './schema/donors';
export * from './schema/projects';
export * from './schema/staff';
export * from './schema/communications';
export * from './schema/campaigns';
export * from './schema/scheduling';
export * from './schema/tracking';
export * from './schema/templates';
export * from './schema/whatsapp';
export * from './schema/research';
export * from './schema/todos';
export * from './schema/signatures';
export * from './schema/smart-email';
export * from './schema/posts';
export * from './schema/oauth';
