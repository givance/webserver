export * from './base/types';
export * from './base/crm-provider.interface';
export * from './base/crm-sync.service';
export * from './crm-manager.service';

// Singleton instance of CRM manager
import { CrmManagerService } from './crm-manager.service';
export const crmManager = CrmManagerService.getInstance();
