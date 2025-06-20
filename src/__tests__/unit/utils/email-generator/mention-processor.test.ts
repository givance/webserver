import { processProjectMentions, extractProjectContext } from '@/app/lib/utils/email-generator/mention-processor';
import { getProjectById } from '@/app/lib/data/projects';

// Mock the data layer
jest.mock('@/app/lib/data/projects');

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe('mention-processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processProjectMentions', () => {
    it('should return original instruction when no mentions', async () => {
      const instruction = 'Please donate to our cause';
      const result = await processProjectMentions(instruction, 'org123');
      
      expect(result).toBe(instruction);
      expect(getProjectById).not.toHaveBeenCalled();
    });

    it('should process single project mention', async () => {
      const instruction = 'Please support @[School Building](123) this year';
      const mockProject = {
        id: 123,
        name: 'School Building',
        description: 'Building a new school',
        organizationId: 'org123',
        goal: 1000000, // $10,000
        tags: ['education', 'community'],
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await processProjectMentions(instruction, 'org123');

      expect(getProjectById).toHaveBeenCalledWith(123);
      expect(result).toBe(
        'Please support the "School Building" project (Building a new school) with a goal of $10,000.00 (tags: education, community) this year'
      );
    });

    it('should process multiple project mentions', async () => {
      const instruction = 'Support both @[Project A](1) and @[Project B](2)';
      
      (getProjectById as jest.Mock)
        .mockResolvedValueOnce({
          id: 1,
          name: 'Project A',
          organizationId: 'org123',
        })
        .mockResolvedValueOnce({
          id: 2,
          name: 'Project B',
          description: 'Second project',
          organizationId: 'org123',
        });

      const result = await processProjectMentions(instruction, 'org123');

      expect(getProjectById).toHaveBeenCalledTimes(2);
      expect(result).toBe('Support both the "Project A" project and the "Project B" project (Second project)');
    });

    it('should handle project without optional fields', async () => {
      const instruction = 'Donate to @[Simple Project](456)';
      const mockProject = {
        id: 456,
        name: 'Simple Project',
        organizationId: 'org123',
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await processProjectMentions(instruction, 'org123');

      expect(result).toBe('Donate to the "Simple Project" project');
    });

    it('should handle project from different organization', async () => {
      const instruction = 'Support @[Other Org Project](789)';
      const mockProject = {
        id: 789,
        name: 'Other Org Project',
        organizationId: 'different-org',
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await processProjectMentions(instruction, 'org123');

      // Should use fallback since org doesn't match
      expect(result).toBe('Support the "Other Org Project" project');
    });

    it('should handle project not found', async () => {
      const instruction = 'Support @[Non-existent Project](999)';
      
      (getProjectById as jest.Mock).mockResolvedValue(null);

      const result = await processProjectMentions(instruction, 'org123');

      expect(result).toBe('Support the "Non-existent Project" project');
    });

    it('should handle database error gracefully', async () => {
      const instruction = 'Support @[Error Project](500)';
      
      (getProjectById as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await processProjectMentions(instruction, 'org123');

      expect(result).toBe('Support the "Error Project" project');
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching project 500:',
        expect.any(Error)
      );
    });

    it('should handle goal formatting correctly', async () => {
      const instruction = 'Support @[Big Goal Project](111)';
      const mockProject = {
        id: 111,
        name: 'Big Goal Project',
        organizationId: 'org123',
        goal: 12345678, // $123,456.78
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await processProjectMentions(instruction, 'org123');

      expect(result).toContain('$123,456.78');
    });

    it('should handle empty tags array', async () => {
      const instruction = 'Support @[No Tags Project](222)';
      const mockProject = {
        id: 222,
        name: 'No Tags Project',
        organizationId: 'org123',
        tags: [],
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await processProjectMentions(instruction, 'org123');

      expect(result).toBe('Support the "No Tags Project" project');
      expect(result).not.toContain('tags:');
    });
  });

  describe('extractProjectContext', () => {
    it('should return empty context when no mentions', async () => {
      const instruction = 'Please donate generously';
      const result = await extractProjectContext(instruction, 'org123');

      expect(result.originalInstruction).toBe(instruction);
      expect(result.processedInstruction).toBe(instruction);
      expect(result.projectContext).toBe('');
    });

    it('should extract context for single project', async () => {
      const instruction = 'Support @[School Project](123)';
      const mockProject = {
        id: 123,
        name: 'School Project',
        description: 'Building schools',
        organizationId: 'org123',
        goal: 500000, // $5,000
        tags: ['education'],
        active: true,
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await extractProjectContext(instruction, 'org123');

      expect(result.originalInstruction).toBe(instruction);
      expect(result.processedInstruction).toContain('the "School Project" project');
      expect(result.projectContext).toContain('Mentioned Projects:');
      expect(result.projectContext).toContain('School Project: Building schools');
      expect(result.projectContext).toContain('Goal: $5,000.00');
      expect(result.projectContext).toContain('[Tags: education]');
    });

    it('should mark inactive projects as completed', async () => {
      const instruction = 'Remember @[Completed Project](333)';
      const mockProject = {
        id: 333,
        name: 'Completed Project',
        organizationId: 'org123',
        active: false,
      };

      (getProjectById as jest.Mock).mockResolvedValue(mockProject);

      const result = await extractProjectContext(instruction, 'org123');

      expect(result.projectContext).toContain('(Completed)');
    });

    it('should handle multiple projects in context', async () => {
      const instruction = 'Choose between @[Project A](1) or @[Project B](2)';
      
      // Mock implementation that handles being called multiple times
      (getProjectById as jest.Mock).mockImplementation((id) => {
        if (id === 1) {
          return Promise.resolve({
            id: 1,
            name: 'Project A',
            organizationId: 'org123',
          });
        } else if (id === 2) {
          return Promise.resolve({
            id: 2,
            name: 'Project B',
            organizationId: 'org123',
          });
        }
        return Promise.resolve(null);
      });

      const result = await extractProjectContext(instruction, 'org123');

      expect(result.projectContext).toContain('Mentioned Projects:');
      expect(result.projectContext).toContain('- Project A');
      expect(result.projectContext).toContain('- Project B');
    });

    it('should handle errors without including in context', async () => {
      const instruction = 'Support @[Error Project](404)';
      
      (getProjectById as jest.Mock).mockRejectedValue(new Error('Not found'));

      const result = await extractProjectContext(instruction, 'org123');

      expect(result.projectContext).toBe('');
      expect(console.error).toHaveBeenCalled();
    });

    it('should exclude projects from other organizations', async () => {
      const instruction = 'Support @[Other Org](555)';
      
      (getProjectById as jest.Mock).mockResolvedValue({
        id: 555,
        name: 'Other Org',
        organizationId: 'different-org',
      });

      const result = await extractProjectContext(instruction, 'org123');

      expect(result.projectContext).toBe('');
    });
  });
});