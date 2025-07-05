import { OrganizationsService } from './organizations.service';

/**
 * Creates and returns all service instances
 * This function is called once during context creation
 * to provide dependency injection for tRPC routers
 */
export const createServices = () => {
  return {
    organizations: new OrganizationsService(),
    // Add other services here as they are migrated to dependency injection
    // Examples:
    // communications: new CommunicationsService(),
    // todos: new TodoService(),
    // donors: new DonorsService(),
  };
};

/**
 * Type representing all available services
 * This is used to type the services in the tRPC context
 */
export type Services = ReturnType<typeof createServices>;

/**
 * Export individual service classes for direct use in tests
 * or other scenarios where dependency injection is not needed
 */
export { OrganizationsService } from './organizations.service';