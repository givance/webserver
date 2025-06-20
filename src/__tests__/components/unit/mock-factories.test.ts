import { 
  donorFactory, 
  projectFactory, 
  campaignFactory, 
  staffFactory, 
  listFactory,
  communicationFactory,
  templateFactory,
  organizationFactory,
  sessionFactory
} from "@/__tests__/mocks/data";

describe("Mock Data Factories", () => {
  describe("donorFactory", () => {
    it("should create a valid donor", () => {
      const donor = donorFactory.create();
      
      expect(donor).toHaveProperty("id");
      expect(donor).toHaveProperty("name");
      expect(donor).toHaveProperty("email");
      expect(donor).toHaveProperty("phone");
      expect(donor).toHaveProperty("organizationId");
      expect(donor).toHaveProperty("createdAt");
      expect(donor).toHaveProperty("updatedAt");
    });

    it("should create multiple donors", () => {
      const donors = donorFactory.createMany(5);
      
      expect(donors).toHaveLength(5);
      donors.forEach(donor => {
        expect(donor).toHaveProperty("id");
        expect(donor).toHaveProperty("name");
      });
    });

    it("should accept overrides", () => {
      const donor = donorFactory.create({
        name: "Custom Name",
        email: "custom@example.com",
      });
      
      expect(donor.name).toBe("Custom Name");
      expect(donor.email).toBe("custom@example.com");
    });
  });

  describe("projectFactory", () => {
    it("should create a valid project", () => {
      const project = projectFactory.create();
      
      expect(project).toHaveProperty("id");
      expect(project).toHaveProperty("name");
      expect(project).toHaveProperty("description");
      expect(project).toHaveProperty("goal");
      expect(project).toHaveProperty("raised");
      expect(project).toHaveProperty("status");
    });

    it("should create project with valid status", () => {
      const project = projectFactory.create();
      
      expect(["active", "completed", "cancelled"]).toContain(project.status);
    });
  });

  describe("campaignFactory", () => {
    it("should create a valid campaign", () => {
      const campaign = campaignFactory.create();
      
      expect(campaign).toHaveProperty("id");
      expect(campaign).toHaveProperty("name");
      expect(campaign).toHaveProperty("description");
      expect(campaign).toHaveProperty("status");
      expect(campaign).toHaveProperty("projectId");
      expect(campaign).toHaveProperty("listId");
    });

    it("should create campaign with valid status", () => {
      const campaign = campaignFactory.create();
      
      expect(["draft", "scheduled", "sent", "completed"]).toContain(campaign.status);
    });
  });

  describe("staffFactory", () => {
    it("should create a valid staff member", () => {
      const staff = staffFactory.create();
      
      expect(staff).toHaveProperty("id");
      expect(staff).toHaveProperty("name");
      expect(staff).toHaveProperty("email");
      expect(staff).toHaveProperty("role");
      expect(staff).toHaveProperty("clerkUserId");
      expect(staff).toHaveProperty("isActive");
    });

    it("should create staff with valid role", () => {
      const staff = staffFactory.create();
      
      expect(["admin", "fundraiser", "volunteer", "accountant"]).toContain(staff.role);
    });
  });

  describe("listFactory", () => {
    it("should create a valid list", () => {
      const list = listFactory.create();
      
      expect(list).toHaveProperty("id");
      expect(list).toHaveProperty("name");
      expect(list).toHaveProperty("description");
      expect(list).toHaveProperty("donorCount");
      expect(list).toHaveProperty("tags");
    });
  });

  describe("communicationFactory", () => {
    it("should create a valid communication", () => {
      const communication = communicationFactory.create();
      
      expect(communication).toHaveProperty("id");
      expect(communication).toHaveProperty("type");
      expect(communication).toHaveProperty("subject");
      expect(communication).toHaveProperty("content");
      expect(communication).toHaveProperty("status");
      expect(communication).toHaveProperty("direction");
    });

    it("should create communication with valid type", () => {
      const communication = communicationFactory.create();
      
      expect(["email", "phone", "meeting", "letter"]).toContain(communication.type);
    });
  });

  describe("templateFactory", () => {
    it("should create a valid template", () => {
      const template = templateFactory.create();
      
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("subject");
      expect(template).toHaveProperty("content");
      expect(template).toHaveProperty("type");
    });
  });

  describe("organizationFactory", () => {
    it("should create a valid organization", () => {
      const org = organizationFactory.create();
      
      expect(org).toHaveProperty("id");
      expect(org).toHaveProperty("name");
      expect(org).toHaveProperty("clerkOrganizationId");
      expect(org).toHaveProperty("settings");
    });
  });

  describe("sessionFactory", () => {
    it("should create a valid session", () => {
      const session = sessionFactory.create();
      
      expect(session).toHaveProperty("id");
      expect(session).toHaveProperty("campaignId");
      expect(session).toHaveProperty("status");
      expect(session).toHaveProperty("progress");
      expect(session).toHaveProperty("totalEmails");
    });
  });
});