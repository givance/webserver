/**
 * Types for email tracking functionality
 */

export interface EmailTracker {
  id: string;
  emailId: number;
  donorId: number;
  organizationId: string;
  sessionId: number;
  sentAt: Date;
  createdAt: Date;
}

export interface LinkTracker {
  id: string;
  emailTrackerId: string;
  originalUrl: string;
  linkText: string | null;
  position: number;
  createdAt: Date;
}

export interface EmailOpen {
  id: number;
  emailTrackerId: string;
  openedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  createdAt: Date;
}

export interface LinkClick {
  id: number;
  linkTrackerId: string;
  clickedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  createdAt: Date;
}

export interface TrackingMetadata {
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
}

export interface EmailTrackingData {
  emailTracker: EmailTracker;
  linkTrackers: LinkTracker[];
  opens: EmailOpen[];
  clicks: LinkClick[];
}

export interface ProcessedEmailContent {
  htmlContent: string;
  textContent: string;
  linkTrackers: LinkTracker[];
}

export interface EmailTrackingStats {
  totalSent: number;
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

export interface DonorTrackingStats extends EmailTrackingStats {
  donorId: number;
  donorName: string;
  donorEmail: string;
  lastOpenedAt: Date | null;
  lastClickedAt: Date | null;
}

export interface SessionTrackingStats extends EmailTrackingStats {
  sessionId: number;
  jobName: string;
  donorStats: DonorTrackingStats[];
}
