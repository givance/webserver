import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { donors, emailOpens, emailTrackers, linkClicks, linkTrackers } from "../db/schema";
import type {
  DonorTrackingStats,
  EmailOpen,
  EmailTracker,
  LinkClick,
  LinkTracker,
  SessionTrackingStats,
  TrackingMetadata,
} from "../utils/email-tracking/types";

/**
 * Creates a new email tracker
 */
export async function createEmailTracker(data: {
  id: string;
  emailId: number;
  donorId: number;
  organizationId: string;
  sessionId: number;
}): Promise<EmailTracker> {
  const [tracker] = await db
    .insert(emailTrackers)
    .values({
      ...data,
      sentAt: new Date(),
      createdAt: new Date(),
    })
    .returning();

  return tracker;
}

/**
 * Creates multiple link trackers for an email
 */
export async function createLinkTrackers(trackers: Omit<LinkTracker, "createdAt">[]): Promise<LinkTracker[]> {
  if (trackers.length === 0) return [];

  const trackersWithTimestamp = trackers.map((tracker) => ({
    ...tracker,
    createdAt: new Date(),
  }));

  return await db.insert(linkTrackers).values(trackersWithTimestamp).returning();
}

/**
 * Records an email open event
 */
export async function recordEmailOpen(emailTrackerId: string, metadata: TrackingMetadata): Promise<EmailOpen> {
  const [emailOpen] = await db
    .insert(emailOpens)
    .values({
      emailTrackerId,
      openedAt: new Date(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      referer: metadata.referer,
      createdAt: new Date(),
    })
    .returning();

  return emailOpen;
}

/**
 * Records a link click event
 */
export async function recordLinkClick(linkTrackerId: string, metadata: TrackingMetadata): Promise<LinkClick> {
  const [linkClick] = await db
    .insert(linkClicks)
    .values({
      linkTrackerId,
      clickedAt: new Date(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      referer: metadata.referer,
      createdAt: new Date(),
    })
    .returning();

  return linkClick;
}

/**
 * Gets an email tracker by ID
 */
export async function getEmailTracker(id: string): Promise<EmailTracker | null> {
  const [tracker] = await db.select().from(emailTrackers).where(eq(emailTrackers.id, id)).limit(1);

  return tracker || null;
}

/**
 * Gets a link tracker by ID
 */
export async function getLinkTracker(id: string): Promise<LinkTracker | null> {
  const [tracker] = await db.select().from(linkTrackers).where(eq(linkTrackers.id, id)).limit(1);

  return tracker || null;
}

/**
 * Gets tracking stats for a specific email session
 */
export async function getSessionTrackingStats(sessionId: number): Promise<SessionTrackingStats | null> {
  // Get session info
  const sessionInfo = await db
    .select({
      id: emailTrackers.sessionId,
      jobName: sql<string>`'Communication Job'`, // We'll need to join with sessions table for actual job name
    })
    .from(emailTrackers)
    .where(eq(emailTrackers.sessionId, sessionId))
    .limit(1);

  if (sessionInfo.length === 0) return null;

  // Get overall stats
  const overallStats = await db
    .select({
      totalSent: count(emailTrackers.id),
      totalOpens: count(emailOpens.id),
      uniqueOpens: sql<number>`COUNT(DISTINCT ${emailOpens.emailTrackerId})`,
      totalClicks: count(linkClicks.id),
      uniqueClicks: sql<number>`COUNT(DISTINCT ${linkClicks.linkTrackerId})`,
    })
    .from(emailTrackers)
    .leftJoin(emailOpens, eq(emailTrackers.id, emailOpens.emailTrackerId))
    .leftJoin(linkTrackers, eq(emailTrackers.id, linkTrackers.emailTrackerId))
    .leftJoin(linkClicks, eq(linkTrackers.id, linkClicks.linkTrackerId))
    .where(eq(emailTrackers.sessionId, sessionId));

  const stats = overallStats[0];

  // Calculate rates
  const openRate = stats.totalSent > 0 ? (stats.uniqueOpens / stats.totalSent) * 100 : 0;
  const clickRate = stats.totalSent > 0 ? (stats.uniqueClicks / stats.totalSent) * 100 : 0;
  const clickToOpenRate = stats.uniqueOpens > 0 ? (stats.uniqueClicks / stats.uniqueOpens) * 100 : 0;

  // Get donor-level stats
  const donorStats = await getDonorTrackingStatsForSession(sessionId);

  return {
    sessionId,
    jobName: sessionInfo[0].jobName,
    totalSent: stats.totalSent,
    totalOpens: stats.totalOpens,
    uniqueOpens: stats.uniqueOpens,
    totalClicks: stats.totalClicks,
    uniqueClicks: stats.uniqueClicks,
    openRate,
    clickRate,
    clickToOpenRate,
    donorStats,
  };
}

/**
 * Gets tracking stats for all donors in a session
 */
export async function getDonorTrackingStatsForSession(sessionId: number): Promise<DonorTrackingStats[]> {
  const donorStats = await db
    .select({
      donorId: emailTrackers.donorId,
      donorName: sql<string>`CONCAT(${donors.firstName}, ' ', ${donors.lastName})`,
      donorEmail: donors.email,
      totalSent: count(emailTrackers.id),
      totalOpens: count(emailOpens.id),
      uniqueOpens: sql<number>`COUNT(DISTINCT ${emailOpens.emailTrackerId})`,
      totalClicks: count(linkClicks.id),
      uniqueClicks: sql<number>`COUNT(DISTINCT ${linkClicks.linkTrackerId})`,
      lastOpenedAt: sql<Date | null>`MAX(${emailOpens.openedAt})`,
      lastClickedAt: sql<Date | null>`MAX(${linkClicks.clickedAt})`,
    })
    .from(emailTrackers)
    .innerJoin(donors, eq(emailTrackers.donorId, donors.id))
    .leftJoin(emailOpens, eq(emailTrackers.id, emailOpens.emailTrackerId))
    .leftJoin(linkTrackers, eq(emailTrackers.id, linkTrackers.emailTrackerId))
    .leftJoin(linkClicks, eq(linkTrackers.id, linkClicks.linkTrackerId))
    .where(eq(emailTrackers.sessionId, sessionId))
    .groupBy(emailTrackers.donorId, donors.firstName, donors.lastName, donors.email);

  return donorStats.map((stats) => {
    const openRate = stats.totalSent > 0 ? (stats.uniqueOpens / stats.totalSent) * 100 : 0;
    const clickRate = stats.totalSent > 0 ? (stats.uniqueClicks / stats.totalSent) * 100 : 0;
    const clickToOpenRate = stats.uniqueOpens > 0 ? (stats.uniqueClicks / stats.uniqueOpens) * 100 : 0;

    return {
      donorId: stats.donorId,
      donorName: stats.donorName,
      donorEmail: stats.donorEmail,
      totalSent: stats.totalSent,
      totalOpens: stats.totalOpens,
      uniqueOpens: stats.uniqueOpens,
      totalClicks: stats.totalClicks,
      uniqueClicks: stats.uniqueClicks,
      openRate,
      clickRate,
      clickToOpenRate,
      lastOpenedAt: stats.lastOpenedAt,
      lastClickedAt: stats.lastClickedAt,
    };
  });
}

/**
 * Gets all email opens for a specific email tracker
 */
export async function getEmailOpens(emailTrackerId: string): Promise<EmailOpen[]> {
  return await db
    .select()
    .from(emailOpens)
    .where(eq(emailOpens.emailTrackerId, emailTrackerId))
    .orderBy(desc(emailOpens.openedAt));
}

/**
 * Gets all link clicks for a specific link tracker
 */
export async function getLinkClicks(linkTrackerId: string): Promise<LinkClick[]> {
  return await db
    .select()
    .from(linkClicks)
    .where(eq(linkClicks.linkTrackerId, linkTrackerId))
    .orderBy(desc(linkClicks.clickedAt));
}

/**
 * Checks if an email has been opened (at least once)
 */
export async function hasEmailBeenOpened(emailTrackerId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(emailOpens)
    .where(eq(emailOpens.emailTrackerId, emailTrackerId))
    .limit(1);

  return result.count > 0;
}

/**
 * Gets tracking data for a specific email
 */
export async function getEmailTrackingData(emailTrackerId: string) {
  const tracker = await getEmailTracker(emailTrackerId);
  if (!tracker) return null;

  const [linkTrackersData, opens] = await Promise.all([
    db.select().from(linkTrackers).where(eq(linkTrackers.emailTrackerId, emailTrackerId)),
    getEmailOpens(emailTrackerId),
  ]);

  // Get clicks for all link trackers
  const allClicks = await Promise.all(linkTrackersData.map((lt) => getLinkClicks(lt.id)));

  const clicks = allClicks.flat();

  return {
    emailTracker: tracker,
    linkTrackers: linkTrackersData,
    opens,
    clicks,
  };
}

/**
 * Gets an email tracker by email ID and donor ID
 */
export async function getEmailTrackerByEmailAndDonor(emailId: number, donorId: number): Promise<EmailTracker | null> {
  const [tracker] = await db
    .select()
    .from(emailTrackers)
    .where(and(eq(emailTrackers.emailId, emailId), eq(emailTrackers.donorId, donorId)))
    .limit(1);

  return tracker || null;
}

/**
 * Gets detailed tracking information for an email by email ID and donor ID
 */
export async function getEmailTrackingByEmailAndDonor(emailId: number, donorId: number) {
  const tracker = await getEmailTrackerByEmailAndDonor(emailId, donorId);
  if (!tracker) return null;

  const [linkTrackersData, opens] = await Promise.all([
    db.select().from(linkTrackers).where(eq(linkTrackers.emailTrackerId, tracker.id)),
    getEmailOpens(tracker.id),
  ]);

  // Get clicks for all link trackers
  const allClicks = await Promise.all(linkTrackersData.map((lt) => getLinkClicks(lt.id)));
  const clicks = allClicks.flat();

  return {
    emailTracker: tracker,
    linkTrackers: linkTrackersData,
    opens,
    clicks,
  };
}

/**
 * Gets an email tracker by session ID and donor ID (alternative approach)
 */
export async function getEmailTrackerBySessionAndDonor(
  sessionId: number,
  donorId: number
): Promise<EmailTracker | null> {
  console.log(`[getEmailTrackerBySessionAndDonor] Searching for sessionId: ${sessionId}, donorId: ${donorId}`);

  const [tracker] = await db
    .select()
    .from(emailTrackers)
    .where(and(eq(emailTrackers.sessionId, sessionId), eq(emailTrackers.donorId, donorId)))
    .limit(1);

  console.log(`[getEmailTrackerBySessionAndDonor] Query result:`, tracker);

  if (!tracker) {
    // Debug: let's see all trackers for this session
    const allTrackersForSession = await db.select().from(emailTrackers).where(eq(emailTrackers.sessionId, sessionId));

    console.log(`[getEmailTrackerBySessionAndDonor] All trackers for session ${sessionId}:`, allTrackersForSession);
  }

  return tracker || null;
}

/**
 * Gets detailed tracking information for an email by session ID and donor ID
 */
export async function getEmailTrackingBySessionAndDonor(sessionId: number, donorId: number) {
  console.log(`[getEmailTrackingBySessionAndDonor] Looking for sessionId: ${sessionId}, donorId: ${donorId}`);

  // Get ALL trackers for this session/donor combination (not just the first one)
  const allTrackers = await db
    .select()
    .from(emailTrackers)
    .where(and(eq(emailTrackers.sessionId, sessionId), eq(emailTrackers.donorId, donorId)));

  console.log(`[getEmailTrackingBySessionAndDonor] Found ${allTrackers.length} trackers:`, allTrackers);

  if (allTrackers.length === 0) return null;

  // Get opens and clicks for ALL trackers and combine them
  const allOpens = [];
  const allClicks = [];
  const allLinkTrackers = [];

  for (const tracker of allTrackers) {
    const [linkTrackersData, opens] = await Promise.all([
      db.select().from(linkTrackers).where(eq(linkTrackers.emailTrackerId, tracker.id)),
      getEmailOpens(tracker.id),
    ]);

    // Get clicks for all link trackers for this email tracker
    const trackerClicks = await Promise.all(linkTrackersData.map((lt) => getLinkClicks(lt.id)));
    const clicks = trackerClicks.flat();

    // Add to combined arrays
    allOpens.push(...opens);
    allClicks.push(...clicks);
    allLinkTrackers.push(...linkTrackersData);

    console.log(
      `[getEmailTrackingBySessionAndDonor] Tracker ${tracker.id}: ${opens.length} opens, ${clicks.length} clicks`
    );
  }

  console.log(
    `[getEmailTrackingBySessionAndDonor] Combined totals: ${allOpens.length} opens, ${allClicks.length} clicks`
  );

  // Return using the first tracker as the primary one, but with combined tracking data
  return {
    emailTracker: allTrackers[0],
    linkTrackers: allLinkTrackers,
    opens: allOpens,
    clicks: allClicks,
  };
}
