import { db } from "@/app/lib/db";
import { staffWhatsappPhoneNumbers, staff } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/app/lib/logger";

export interface StaffWhatsAppPermission {
  staffId: number;
  organizationId: string;
  phoneNumber: string;
  isAllowed: boolean;
  staff: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    organizationId: string;
  };
}

export interface PermissionCheckResult {
  isAllowed: boolean;
  staffId?: number;
  organizationId?: string;
  staff?: StaffWhatsAppPermission["staff"];
  reason?: string;
}

/**
 * Service for managing WhatsApp phone number permissions for staff
 */
export class WhatsAppPermissionService {
  /**
   * Check if a phone number is allowed to send WhatsApp messages and get associated staff/org
   * @param phoneNumber - The phone number to check (should be normalized)
   * @returns Permission check result with staff and organization info
   */
  async checkPhonePermission(phoneNumber: string): Promise<PermissionCheckResult> {
    try {
      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      logger.info(`[WhatsApp Permission] Checking permission for phone number: ${normalizedPhone}`);

      // Find staff member with this phone number
      const result = await db
        .select({
          staffId: staffWhatsappPhoneNumbers.staffId,
          phoneNumber: staffWhatsappPhoneNumbers.phoneNumber,
          isAllowed: staffWhatsappPhoneNumbers.isAllowed,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
          staffEmail: staff.email,
          organizationId: staff.organizationId,
        })
        .from(staffWhatsappPhoneNumbers)
        .innerJoin(staff, eq(staffWhatsappPhoneNumbers.staffId, staff.id))
        .where(eq(staffWhatsappPhoneNumbers.phoneNumber, normalizedPhone))
        .limit(1);

      if (result.length === 0) {
        logger.warn(`[WhatsApp Permission] No staff found for phone number: ${normalizedPhone}`);
        return {
          isAllowed: false,
          reason: "Phone number not registered with any staff member",
        };
      }

      const permission = result[0];

      if (!permission.isAllowed) {
        logger.warn(
          `[WhatsApp Permission] Phone number ${normalizedPhone} is registered but not allowed for staff ID: ${permission.staffId}`
        );
        return {
          isAllowed: false,
          staffId: permission.staffId,
          organizationId: permission.organizationId,
          reason: "Phone number access is disabled for this staff member",
        };
      }

      logger.info(
        `[WhatsApp Permission] Permission granted for phone number ${normalizedPhone} to staff ID: ${permission.staffId} in organization: ${permission.organizationId}`
      );

      return {
        isAllowed: true,
        staffId: permission.staffId,
        organizationId: permission.organizationId,
        staff: {
          id: permission.staffId,
          firstName: permission.staffFirstName,
          lastName: permission.staffLastName,
          email: permission.staffEmail,
          organizationId: permission.organizationId,
        },
      };
    } catch (error) {
      logger.error(
        `[WhatsApp Permission] Error checking phone permission: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        isAllowed: false,
        reason: "Internal error checking permissions",
      };
    }
  }

  /**
   * Add a phone number to a staff member's allowed list
   * @param staffId - The staff member ID
   * @param phoneNumber - The phone number to add
   * @returns Success status
   */
  async addPhoneNumberToStaff(staffId: number, phoneNumber: string): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      logger.info(`[WhatsApp Permission] Adding phone number ${normalizedPhone} to staff ID: ${staffId}`);

      await db.insert(staffWhatsappPhoneNumbers).values({
        staffId,
        phoneNumber: normalizedPhone,
        isAllowed: true,
      });

      logger.info(`[WhatsApp Permission] Successfully added phone number ${normalizedPhone} to staff ID: ${staffId}`);
      return true;
    } catch (error) {
      logger.error(
        `[WhatsApp Permission] Error adding phone number: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Remove a phone number from a staff member's allowed list
   * @param staffId - The staff member ID
   * @param phoneNumber - The phone number to remove
   * @returns Success status
   */
  async removePhoneNumberFromStaff(staffId: number, phoneNumber: string): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      logger.info(`[WhatsApp Permission] Removing phone number ${normalizedPhone} from staff ID: ${staffId}`);

      await db
        .delete(staffWhatsappPhoneNumbers)
        .where(
          and(
            eq(staffWhatsappPhoneNumbers.staffId, staffId),
            eq(staffWhatsappPhoneNumbers.phoneNumber, normalizedPhone)
          )
        );

      logger.info(
        `[WhatsApp Permission] Successfully removed phone number ${normalizedPhone} from staff ID: ${staffId}`
      );
      return true;
    } catch (error) {
      logger.error(
        `[WhatsApp Permission] Error removing phone number: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Toggle phone number permission for a staff member
   * @param staffId - The staff member ID
   * @param phoneNumber - The phone number to toggle
   * @param isAllowed - Whether to allow or disallow
   * @returns Success status
   */
  async togglePhonePermission(staffId: number, phoneNumber: string, isAllowed: boolean): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      logger.info(
        `[WhatsApp Permission] ${
          isAllowed ? "Enabling" : "Disabling"
        } phone number ${normalizedPhone} for staff ID: ${staffId}`
      );

      await db
        .update(staffWhatsappPhoneNumbers)
        .set({
          isAllowed,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffWhatsappPhoneNumbers.staffId, staffId),
            eq(staffWhatsappPhoneNumbers.phoneNumber, normalizedPhone)
          )
        );

      logger.info(
        `[WhatsApp Permission] Successfully ${
          isAllowed ? "enabled" : "disabled"
        } phone number ${normalizedPhone} for staff ID: ${staffId}`
      );
      return true;
    } catch (error) {
      logger.error(
        `[WhatsApp Permission] Error toggling phone permission: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Get all phone numbers for a staff member
   * @param staffId - The staff member ID
   * @returns List of phone numbers with their permission status
   */
  async getStaffPhoneNumbers(
    staffId: number
  ): Promise<Array<{ phoneNumber: string; isAllowed: boolean; createdAt: Date; updatedAt: Date }>> {
    try {
      const result = await db
        .select({
          phoneNumber: staffWhatsappPhoneNumbers.phoneNumber,
          isAllowed: staffWhatsappPhoneNumbers.isAllowed,
          createdAt: staffWhatsappPhoneNumbers.createdAt,
          updatedAt: staffWhatsappPhoneNumbers.updatedAt,
        })
        .from(staffWhatsappPhoneNumbers)
        .where(eq(staffWhatsappPhoneNumbers.staffId, staffId));

      return result;
    } catch (error) {
      logger.error(
        `[WhatsApp Permission] Error getting staff phone numbers: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Normalize phone number format for consistent storage and lookup
   * @param phoneNumber - Raw phone number
   * @returns Normalized phone number
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters except + for international format
    let normalized = phoneNumber.replace(/[^\d+]/g, "");

    // If it starts with +, keep the +, otherwise assume it's a US number
    if (!normalized.startsWith("+")) {
      // If it's 10 digits, assume US number and add +1
      if (normalized.length === 10) {
        normalized = "+1" + normalized;
      }
      // If it's 11 digits and starts with 1, add +
      else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = "+" + normalized;
      }
    }

    return normalized;
  }
}
