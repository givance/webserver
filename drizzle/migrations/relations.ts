import { relations } from "drizzle-orm/relations";
import { users, posts, organizations, emailGenerationSessions, templates, donors, generatedEmails, communicationContent, staff, communicationThreads, donations, projects, emailTrackers, emailOpens, linkTrackers, linkClicks, gmailOauthTokens, donorLists, donorListMembers, staffGmailTokens, todos, staffWhatsappPhoneNumbers, microsoftOauthTokens, staffMicrosoftTokens, staffWhatsappActivityLog, personResearch, whatsappChatHistoryNew, communicationThreadDonors, communicationThreadStaff, organizationMemberships } from "./schema";

export const postsRelations = relations(posts, ({one}) => ({
	user: one(users, {
		fields: [posts.authorId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	posts: many(posts),
	emailGenerationSessions: many(emailGenerationSessions),
	gmailOauthTokens: many(gmailOauthTokens),
	donorLists: many(donorLists),
	donorListMembers: many(donorListMembers),
	microsoftOauthTokens: many(microsoftOauthTokens),
	personResearches: many(personResearch),
	organizationMemberships: many(organizationMemberships),
}));

export const emailGenerationSessionsRelations = relations(emailGenerationSessions, ({one, many}) => ({
	organization: one(organizations, {
		fields: [emailGenerationSessions.organizationId],
		references: [organizations.id]
	}),
	template: one(templates, {
		fields: [emailGenerationSessions.templateId],
		references: [templates.id]
	}),
	user: one(users, {
		fields: [emailGenerationSessions.userId],
		references: [users.id]
	}),
	generatedEmails: many(generatedEmails),
	emailTrackers: many(emailTrackers),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	emailGenerationSessions: many(emailGenerationSessions),
	projects: many(projects),
	templates: many(templates),
	staff: many(staff),
	emailTrackers: many(emailTrackers),
	donorLists: many(donorLists),
	donors: many(donors),
	todos: many(todos),
	staffWhatsappActivityLogs: many(staffWhatsappActivityLog),
	personResearches: many(personResearch),
	whatsappChatHistoryNews: many(whatsappChatHistoryNew),
	organizationMemberships: many(organizationMemberships),
}));

export const templatesRelations = relations(templates, ({one, many}) => ({
	emailGenerationSessions: many(emailGenerationSessions),
	organization: one(organizations, {
		fields: [templates.organizationId],
		references: [organizations.id]
	}),
}));

export const generatedEmailsRelations = relations(generatedEmails, ({one, many}) => ({
	donor: one(donors, {
		fields: [generatedEmails.donorId],
		references: [donors.id]
	}),
	emailGenerationSession: one(emailGenerationSessions, {
		fields: [generatedEmails.sessionId],
		references: [emailGenerationSessions.id]
	}),
	emailTrackers: many(emailTrackers),
}));

export const donorsRelations = relations(donors, ({one, many}) => ({
	generatedEmails: many(generatedEmails),
	communicationContents_fromDonorId: many(communicationContent, {
		relationName: "communicationContent_fromDonorId_donors_id"
	}),
	communicationContents_toDonorId: many(communicationContent, {
		relationName: "communicationContent_toDonorId_donors_id"
	}),
	donations: many(donations),
	emailTrackers: many(emailTrackers),
	donorListMembers: many(donorListMembers),
	staff: one(staff, {
		fields: [donors.assignedToStaffId],
		references: [staff.id]
	}),
	organization: one(organizations, {
		fields: [donors.organizationId],
		references: [organizations.id]
	}),
	todos: many(todos),
	personResearches: many(personResearch),
	communicationThreadDonors: many(communicationThreadDonors),
}));

export const communicationContentRelations = relations(communicationContent, ({one}) => ({
	donor_fromDonorId: one(donors, {
		fields: [communicationContent.fromDonorId],
		references: [donors.id],
		relationName: "communicationContent_fromDonorId_donors_id"
	}),
	staff_fromStaffId: one(staff, {
		fields: [communicationContent.fromStaffId],
		references: [staff.id],
		relationName: "communicationContent_fromStaffId_staff_id"
	}),
	communicationThread: one(communicationThreads, {
		fields: [communicationContent.threadId],
		references: [communicationThreads.id]
	}),
	donor_toDonorId: one(donors, {
		fields: [communicationContent.toDonorId],
		references: [donors.id],
		relationName: "communicationContent_toDonorId_donors_id"
	}),
	staff_toStaffId: one(staff, {
		fields: [communicationContent.toStaffId],
		references: [staff.id],
		relationName: "communicationContent_toStaffId_staff_id"
	}),
}));

export const staffRelations = relations(staff, ({one, many}) => ({
	communicationContents_fromStaffId: many(communicationContent, {
		relationName: "communicationContent_fromStaffId_staff_id"
	}),
	communicationContents_toStaffId: many(communicationContent, {
		relationName: "communicationContent_toStaffId_staff_id"
	}),
	organization: one(organizations, {
		fields: [staff.organizationId],
		references: [organizations.id]
	}),
	staffGmailTokens: many(staffGmailTokens),
	donors: many(donors),
	todos: many(todos),
	staffWhatsappPhoneNumbers: many(staffWhatsappPhoneNumbers),
	staffMicrosoftTokens: many(staffMicrosoftTokens),
	staffWhatsappActivityLogs: many(staffWhatsappActivityLog),
	whatsappChatHistoryNews: many(whatsappChatHistoryNew),
	communicationThreadStaffs: many(communicationThreadStaff),
}));

export const communicationThreadsRelations = relations(communicationThreads, ({many}) => ({
	communicationContents: many(communicationContent),
}));

export const donationsRelations = relations(donations, ({one}) => ({
	donor: one(donors, {
		fields: [donations.donorId],
		references: [donors.id]
	}),
	project: one(projects, {
		fields: [donations.projectId],
		references: [projects.id]
	}),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	donations: many(donations),
	organization: one(organizations, {
		fields: [projects.organizationId],
		references: [organizations.id]
	}),
}));

export const emailTrackersRelations = relations(emailTrackers, ({one, many}) => ({
	donor: one(donors, {
		fields: [emailTrackers.donorId],
		references: [donors.id]
	}),
	generatedEmail: one(generatedEmails, {
		fields: [emailTrackers.emailId],
		references: [generatedEmails.id]
	}),
	organization: one(organizations, {
		fields: [emailTrackers.organizationId],
		references: [organizations.id]
	}),
	emailGenerationSession: one(emailGenerationSessions, {
		fields: [emailTrackers.sessionId],
		references: [emailGenerationSessions.id]
	}),
	emailOpens: many(emailOpens),
	linkTrackers: many(linkTrackers),
}));

export const emailOpensRelations = relations(emailOpens, ({one}) => ({
	emailTracker: one(emailTrackers, {
		fields: [emailOpens.emailTrackerId],
		references: [emailTrackers.id]
	}),
}));

export const linkTrackersRelations = relations(linkTrackers, ({one, many}) => ({
	emailTracker: one(emailTrackers, {
		fields: [linkTrackers.emailTrackerId],
		references: [emailTrackers.id]
	}),
	linkClicks: many(linkClicks),
}));

export const linkClicksRelations = relations(linkClicks, ({one}) => ({
	linkTracker: one(linkTrackers, {
		fields: [linkClicks.linkTrackerId],
		references: [linkTrackers.id]
	}),
}));

export const gmailOauthTokensRelations = relations(gmailOauthTokens, ({one}) => ({
	user: one(users, {
		fields: [gmailOauthTokens.userId],
		references: [users.id]
	}),
}));

export const donorListsRelations = relations(donorLists, ({one, many}) => ({
	user: one(users, {
		fields: [donorLists.createdBy],
		references: [users.id]
	}),
	organization: one(organizations, {
		fields: [donorLists.organizationId],
		references: [organizations.id]
	}),
	donorListMembers: many(donorListMembers),
}));

export const donorListMembersRelations = relations(donorListMembers, ({one}) => ({
	user: one(users, {
		fields: [donorListMembers.addedBy],
		references: [users.id]
	}),
	donor: one(donors, {
		fields: [donorListMembers.donorId],
		references: [donors.id]
	}),
	donorList: one(donorLists, {
		fields: [donorListMembers.listId],
		references: [donorLists.id]
	}),
}));

export const staffGmailTokensRelations = relations(staffGmailTokens, ({one}) => ({
	staff: one(staff, {
		fields: [staffGmailTokens.staffId],
		references: [staff.id]
	}),
}));

export const todosRelations = relations(todos, ({one}) => ({
	donor: one(donors, {
		fields: [todos.donorId],
		references: [donors.id]
	}),
	organization: one(organizations, {
		fields: [todos.organizationId],
		references: [organizations.id]
	}),
	staff: one(staff, {
		fields: [todos.staffId],
		references: [staff.id]
	}),
}));

export const staffWhatsappPhoneNumbersRelations = relations(staffWhatsappPhoneNumbers, ({one}) => ({
	staff: one(staff, {
		fields: [staffWhatsappPhoneNumbers.staffId],
		references: [staff.id]
	}),
}));

export const microsoftOauthTokensRelations = relations(microsoftOauthTokens, ({one}) => ({
	user: one(users, {
		fields: [microsoftOauthTokens.userId],
		references: [users.id]
	}),
}));

export const staffMicrosoftTokensRelations = relations(staffMicrosoftTokens, ({one}) => ({
	staff: one(staff, {
		fields: [staffMicrosoftTokens.staffId],
		references: [staff.id]
	}),
}));

export const staffWhatsappActivityLogRelations = relations(staffWhatsappActivityLog, ({one}) => ({
	organization: one(organizations, {
		fields: [staffWhatsappActivityLog.organizationId],
		references: [organizations.id]
	}),
	staff: one(staff, {
		fields: [staffWhatsappActivityLog.staffId],
		references: [staff.id]
	}),
}));

export const personResearchRelations = relations(personResearch, ({one}) => ({
	donor: one(donors, {
		fields: [personResearch.donorId],
		references: [donors.id]
	}),
	organization: one(organizations, {
		fields: [personResearch.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [personResearch.userId],
		references: [users.id]
	}),
}));

export const whatsappChatHistoryNewRelations = relations(whatsappChatHistoryNew, ({one}) => ({
	organization: one(organizations, {
		fields: [whatsappChatHistoryNew.organizationId],
		references: [organizations.id]
	}),
	staff: one(staff, {
		fields: [whatsappChatHistoryNew.staffId],
		references: [staff.id]
	}),
}));

export const communicationThreadDonorsRelations = relations(communicationThreadDonors, ({one}) => ({
	donor: one(donors, {
		fields: [communicationThreadDonors.donorId],
		references: [donors.id]
	}),
}));

export const communicationThreadStaffRelations = relations(communicationThreadStaff, ({one}) => ({
	staff: one(staff, {
		fields: [communicationThreadStaff.staffId],
		references: [staff.id]
	}),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationMemberships.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [organizationMemberships.userId],
		references: [users.id]
	}),
}));