import { pgTable, foreignKey, serial, varchar, text, boolean, timestamp, unique, jsonb, integer, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const communicationChannel = pgEnum("communication_channel", ['email', 'phone', 'text'])
export const gender = pgEnum("gender", ['male', 'female'])
export const staffWhatsappActivityType = pgEnum("staff_whatsapp_activity_type", ['message_received', 'ai_response_generated', 'permission_denied', 'db_query_executed', 'voice_transcribed', 'error_occurred'])
export const whatsappMessageRole = pgEnum("whatsapp_message_role", ['user', 'assistant'])


export const posts = pgTable("posts", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text(),
	published: boolean().default(false).notNull(),
	authorId: text("author_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [users.id],
			name: "posts_author_id_users_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	email: varchar({ length: 255 }).notNull(),
	profileImageUrl: text("profile_image_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	memory: text().array(),
	dismissedMemories: text("dismissed_memories").array(),
	stages: text().array(),
	emailSignature: text("email_signature"),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const emailGenerationSessions = pgTable("email_generation_sessions", {
	id: serial().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	userId: text("user_id").notNull(),
	instruction: text().notNull(),
	refinedInstruction: text("refined_instruction"),
	chatHistory: jsonb("chat_history").notNull(),
	selectedDonorIds: jsonb("selected_donor_ids").notNull(),
	previewDonorIds: jsonb("preview_donor_ids").notNull(),
	status: text().default('PENDING').notNull(),
	triggerJobId: text("trigger_job_id"),
	totalDonors: integer("total_donors").notNull(),
	completedDonors: integer("completed_donors").default(0).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	jobName: varchar("job_name", { length: 255 }).notNull(),
	templateId: integer("template_id"),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "email_generation_sessions_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [templates.id],
			name: "email_generation_sessions_template_id_templates_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_generation_sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const generatedEmails = pgTable("generated_emails", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	donorId: integer("donor_id").notNull(),
	subject: text().notNull(),
	structuredContent: jsonb("structured_content").notNull(),
	referenceContexts: jsonb("reference_contexts").notNull(),
	isPreview: boolean("is_preview").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	isSent: boolean("is_sent").default(false).notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "generated_emails_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [emailGenerationSessions.id],
			name: "generated_emails_session_id_email_generation_sessions_id_fk"
		}).onDelete("cascade"),
]);

export const communicationThreads = pgTable("communication_threads", {
	id: serial().primaryKey().notNull(),
	channel: communicationChannel().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const communicationContent = pgTable("communication_content", {
	id: serial().primaryKey().notNull(),
	threadId: integer("thread_id").notNull(),
	content: text().notNull(),
	datetime: timestamp({ mode: 'string' }).defaultNow().notNull(),
	fromStaffId: integer("from_staff_id"),
	fromDonorId: integer("from_donor_id"),
	toStaffId: integer("to_staff_id"),
	toDonorId: integer("to_donor_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.fromDonorId],
			foreignColumns: [donors.id],
			name: "communication_content_from_donor_id_donors_id_fk"
		}),
	foreignKey({
			columns: [table.fromStaffId],
			foreignColumns: [staff.id],
			name: "communication_content_from_staff_id_staff_id_fk"
		}),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [communicationThreads.id],
			name: "communication_content_thread_id_communication_threads_id_fk"
		}),
	foreignKey({
			columns: [table.toDonorId],
			foreignColumns: [donors.id],
			name: "communication_content_to_donor_id_donors_id_fk"
		}),
	foreignKey({
			columns: [table.toStaffId],
			foreignColumns: [staff.id],
			name: "communication_content_to_staff_id_staff_id_fk"
		}),
]);

export const donations = pgTable("donations", {
	id: serial().primaryKey().notNull(),
	donorId: integer("donor_id").notNull(),
	projectId: integer("project_id").notNull(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	amount: integer().notNull(),
	currency: varchar({ length: 3 }).default('USD').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "donations_donor_id_donors_id_fk"
		}),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "donations_project_id_projects_id_fk"
		}),
]);

export const projects = pgTable("projects", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	organizationId: text("organization_id").notNull(),
	goal: integer(),
	tags: text().array(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "projects_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
]);

export const templates = pgTable("templates", {
	id: serial().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	prompt: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "templates_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
]);

export const staff = pgTable("staff", {
	id: serial().primaryKey().notNull(),
	firstName: varchar("first_name", { length: 255 }).notNull(),
	lastName: varchar("last_name", { length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	isRealPerson: boolean("is_real_person").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	organizationId: text("organization_id").notNull(),
	signature: text(),
	isPrimary: boolean("is_primary").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "staff_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	unique("staff_email_unique").on(table.email),
]);

export const organizations = pgTable("organizations", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text(),
	imageUrl: text("image_url"),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	websiteUrl: text("website_url"),
	websiteSummary: text("website_summary"),
	description: text(),
	writingInstructions: text("writing_instructions"),
	memory: text().array().default([""]),
	donorJourney: jsonb("donor_journey").default({"edges":[],"nodes":[]}),
	donorJourneyText: text("donor_journey_text"),
	shortDescription: text("short_description"),
});

export const emailTrackers = pgTable("email_trackers", {
	id: text().primaryKey().notNull(),
	emailId: integer("email_id").notNull(),
	donorId: integer("donor_id").notNull(),
	organizationId: text("organization_id").notNull(),
	sessionId: integer("session_id").notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "email_trackers_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.emailId],
			foreignColumns: [generatedEmails.id],
			name: "email_trackers_email_id_generated_emails_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "email_trackers_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [emailGenerationSessions.id],
			name: "email_trackers_session_id_email_generation_sessions_id_fk"
		}).onDelete("cascade"),
]);

export const emailOpens = pgTable("email_opens", {
	id: serial().primaryKey().notNull(),
	emailTrackerId: text("email_tracker_id").notNull(),
	openedAt: timestamp("opened_at", { mode: 'string' }).defaultNow().notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	referer: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.emailTrackerId],
			foreignColumns: [emailTrackers.id],
			name: "email_opens_email_tracker_id_email_trackers_id_fk"
		}).onDelete("cascade"),
]);

export const linkTrackers = pgTable("link_trackers", {
	id: text().primaryKey().notNull(),
	emailTrackerId: text("email_tracker_id").notNull(),
	originalUrl: text("original_url").notNull(),
	linkText: text("link_text"),
	position: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.emailTrackerId],
			foreignColumns: [emailTrackers.id],
			name: "link_trackers_email_tracker_id_email_trackers_id_fk"
		}).onDelete("cascade"),
]);

export const linkClicks = pgTable("link_clicks", {
	id: serial().primaryKey().notNull(),
	linkTrackerId: text("link_tracker_id").notNull(),
	clickedAt: timestamp("clicked_at", { mode: 'string' }).defaultNow().notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	referer: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.linkTrackerId],
			foreignColumns: [linkTrackers.id],
			name: "link_clicks_link_tracker_id_link_trackers_id_fk"
		}).onDelete("cascade"),
]);

export const gmailOauthTokens = pgTable("gmail_oauth_tokens", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	scope: text(),
	tokenType: varchar("token_type", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "gmail_oauth_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("gmail_oauth_tokens_user_id_unique").on(table.userId),
]);

export const donorLists = pgTable("donor_lists", {
	id: serial().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "donor_lists_created_by_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "donor_lists_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
]);

export const donorListMembers = pgTable("donor_list_members", {
	id: serial().primaryKey().notNull(),
	listId: integer("list_id").notNull(),
	donorId: integer("donor_id").notNull(),
	addedBy: text("added_by"),
	addedAt: timestamp("added_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.addedBy],
			foreignColumns: [users.id],
			name: "donor_list_members_added_by_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "donor_list_members_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [donorLists.id],
			name: "donor_list_members_list_id_donor_lists_id_fk"
		}).onDelete("cascade"),
	unique("donor_list_members_donor_list_unique").on(table.listId, table.donorId),
]);

export const staffGmailTokens = pgTable("staff_gmail_tokens", {
	id: serial().primaryKey().notNull(),
	staffId: integer("staff_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	scope: text(),
	tokenType: varchar("token_type", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "staff_gmail_tokens_staff_id_staff_id_fk"
		}).onDelete("cascade"),
	unique("staff_gmail_tokens_staff_id_unique").on(table.staffId),
]);

export const donors = pgTable("donors", {
	id: serial().primaryKey().notNull(),
	firstName: varchar("first_name", { length: 255 }).notNull(),
	lastName: varchar("last_name", { length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 20 }),
	address: text(),
	state: varchar({ length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	organizationId: text("organization_id").notNull(),
	notes: text(),
	assignedToStaffId: integer("assigned_to_staff_id"),
	currentStageName: varchar("current_stage_name", { length: 255 }),
	classificationReasoning: text("classification_reasoning"),
	predictedActions: jsonb("predicted_actions"),
	gender: gender(),
	hisTitle: varchar("his_title", { length: 50 }),
	hisFirstName: varchar("his_first_name", { length: 255 }),
	hisInitial: varchar("his_initial", { length: 10 }),
	herTitle: varchar("her_title", { length: 50 }),
	herFirstName: varchar("her_first_name", { length: 255 }),
	herInitial: varchar("her_initial", { length: 10 }),
	isCouple: boolean("is_couple").default(false).notNull(),
	hisLastName: varchar("his_last_name", { length: 255 }),
	herLastName: varchar("her_last_name", { length: 255 }),
	displayName: varchar("display_name", { length: 500 }),
	externalId: varchar("external_id", { length: 255 }),
	highPotentialDonor: boolean("high_potential_donor").default(false),
}, (table) => [
	foreignKey({
			columns: [table.assignedToStaffId],
			foreignColumns: [staff.id],
			name: "donors_assigned_to_staff_id_staff_id_fk"
		}),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "donors_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	unique("donors_email_organization_unique").on(table.email, table.organizationId),
]);

export const todos = pgTable("todos", {
	id: serial().primaryKey().notNull(),
	title: text().notNull(),
	description: text().notNull(),
	type: text().notNull(),
	status: text().default('PENDING').notNull(),
	priority: text().default('MEDIUM').notNull(),
	dueDate: timestamp("due_date", { mode: 'string' }),
	scheduledDate: timestamp("scheduled_date", { mode: 'string' }),
	completedDate: timestamp("completed_date", { mode: 'string' }),
	donorId: integer("donor_id"),
	staffId: integer("staff_id"),
	organizationId: text("organization_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	explanation: text(),
	instruction: text(),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "todos_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "todos_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "todos_staff_id_staff_id_fk"
		}).onDelete("set null"),
]);

export const staffWhatsappPhoneNumbers = pgTable("staff_whatsapp_phone_numbers", {
	id: serial().primaryKey().notNull(),
	staffId: integer("staff_id").notNull(),
	phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
	isAllowed: boolean("is_allowed").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "staff_whatsapp_phone_numbers_staff_id_staff_id_fk"
		}).onDelete("cascade"),
	unique("staff_whatsapp_phone_numbers_phone_unique").on(table.phoneNumber),
]);

export const microsoftOauthTokens = pgTable("microsoft_oauth_tokens", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	scope: text(),
	tokenType: varchar("token_type", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "microsoft_oauth_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("microsoft_oauth_tokens_user_id_unique").on(table.userId),
]);

export const staffMicrosoftTokens = pgTable("staff_microsoft_tokens", {
	id: serial().primaryKey().notNull(),
	staffId: integer("staff_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	scope: text(),
	tokenType: varchar("token_type", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "staff_microsoft_tokens_staff_id_staff_id_fk"
		}).onDelete("cascade"),
	unique("staff_microsoft_tokens_staff_id_unique").on(table.staffId),
]);

export const staffWhatsappActivityLog = pgTable("staff_whatsapp_activity_log", {
	id: serial().primaryKey().notNull(),
	staffId: integer("staff_id").notNull(),
	organizationId: text("organization_id").notNull(),
	activityType: text("activity_type").notNull(),
	phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
	summary: text().notNull(),
	data: jsonb(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "staff_whatsapp_activity_log_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "staff_whatsapp_activity_log_staff_id_staff_id_fk"
		}).onDelete("cascade"),
]);

export const personResearch = pgTable("person_research", {
	id: serial().primaryKey().notNull(),
	donorId: integer("donor_id").notNull(),
	organizationId: text("organization_id").notNull(),
	userId: text("user_id"),
	researchTopic: text("research_topic").notNull(),
	isLive: boolean("is_live").default(false).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	researchData: jsonb("research_data").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "person_research_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "person_research_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "person_research_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const whatsappChatHistoryNew = pgTable("whatsapp_chat_history_new", {
	id: serial().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	fromPhoneNumber: varchar("from_phone_number", { length: 20 }).notNull(),
	messageId: varchar("message_id", { length: 255 }),
	role: whatsappMessageRole().notNull(),
	content: text().notNull(),
	toolCalls: jsonb("tool_calls"),
	toolResults: jsonb("tool_results"),
	tokensUsed: jsonb("tokens_used"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	staffId: integer("staff_id"),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "whatsapp_chat_history_new_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "whatsapp_chat_history_new_staff_id_staff_id_fk"
		}).onDelete("cascade"),
]);

export const communicationThreadDonors = pgTable("communication_thread_donors", {
	threadId: integer("thread_id").notNull(),
	donorId: integer("donor_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.donorId],
			foreignColumns: [donors.id],
			name: "communication_thread_donors_donor_id_donors_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.threadId, table.donorId], name: "communication_thread_donors_thread_id_donor_id_pk"}),
]);

export const communicationThreadStaff = pgTable("communication_thread_staff", {
	threadId: integer("thread_id").notNull(),
	staffId: integer("staff_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.staffId],
			foreignColumns: [staff.id],
			name: "communication_thread_staff_staff_id_staff_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.threadId, table.staffId], name: "communication_thread_staff_thread_id_staff_id_pk"}),
]);

export const organizationMemberships = pgTable("organization_memberships", {
	organizationId: text("organization_id").notNull(),
	userId: text("user_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "organization_memberships_organization_id_organizations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "organization_memberships_user_id_users_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.organizationId, table.userId], name: "organization_memberships_organization_id_user_id_pk"}),
]);
