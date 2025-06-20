import { parseJsonFromAiResponse, validateParsedJson, type ParseJsonOptions } from '@/app/lib/utils/json-parser';

describe('json-parser', () => {
  describe('parseJsonFromAiResponse', () => {
    it('should parse valid JSON directly', () => {
      const response = '{"name": "John", "age": 30}';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should parse JSON arrays', () => {
      const response = '[1, 2, 3, 4, 5]';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle whitespace around JSON', () => {
      const response = '  \n  {"key": "value"}  \n  ';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ key: 'value' });
    });

    it('should extract JSON object from text with prefix', () => {
      const response = 'Here is the JSON response: {"status": "success", "data": [1, 2, 3]}';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ status: 'success', data: [1, 2, 3] });
    });

    it('should extract JSON object from text with suffix', () => {
      const response = '{"items": ["a", "b", "c"]} That\'s all the items.';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ items: ['a', 'b', 'c'] });
    });

    it('should extract JSON array from surrounding text', () => {
      const response = 'The array is: [{"id": 1}, {"id": 2}] as requested.';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should handle markdown code blocks', () => {
      const response = '```json\n{"formatted": true, "type": "markdown"}\n```';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ formatted: true, type: 'markdown' });
    });

    it('should handle code blocks without json language specifier', () => {
      const response = '```\n{"value": 42}\n```';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({ value: 42 });
    });

    it('should remove common prefixes', () => {
      const testCases = [
        'JSON: {"test": true}',
        'Response: {"test": true}',
        'Output: {"test": true}',
        'Here\'s the response: {"test": true}',
      ];

      testCases.forEach(response => {
        const result = parseJsonFromAiResponse(response);
        expect(result).toEqual({ test: true });
      });
    });

    it('should handle nested JSON objects', () => {
      const response = '{"user": {"name": "Alice", "settings": {"theme": "dark"}}}';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({
        user: {
          name: 'Alice',
          settings: {
            theme: 'dark'
          }
        }
      });
    });

    it('should handle JSON with special characters', () => {
      const response = '{"message": "Hello\\nWorld", "emoji": "🎉", "escaped": "\\"quoted\\""}';
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({
        message: 'Hello\nWorld',
        emoji: '🎉',
        escaped: '"quoted"'
      });
    });

    it('should throw error for invalid input types', () => {
      expect(() => parseJsonFromAiResponse(null as any)).toThrow('Invalid response: expected string, got object');
      expect(() => parseJsonFromAiResponse(undefined as any)).toThrow('Invalid response: expected string, got undefined');
      expect(() => parseJsonFromAiResponse(123 as any)).toThrow('Invalid response: expected string, got number');
    });

    it('should throw error for empty string', () => {
      expect(() => parseJsonFromAiResponse('')).toThrow('Invalid response: expected string, got string');
    });

    it('should throw error when no valid JSON found', () => {
      const response = 'This is just plain text with no JSON';
      expect(() => parseJsonFromAiResponse(response)).toThrow('Failed to parse JSON from AI response');
    });

    it('should include preview in error message', () => {
      const response = 'This is a very long response that contains no JSON whatsoever and should fail to parse. ' +
        'It has a lot of text to ensure we test the preview functionality in the error message.';
      
      try {
        parseJsonFromAiResponse(response);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Preview:');
        expect((error as Error).message).toContain('This is a very long response');
      }
    });

    it('should handle malformed JSON gracefully', () => {
      const response = '{"incomplete": "json"';
      expect(() => parseJsonFromAiResponse(response)).toThrow('Failed to parse JSON from AI response');
    });

    it('should log debug information when debug option is true', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const response = '{"debug": true}';
      
      parseJsonFromAiResponse(response, { debug: true, context: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[test] Parsing JSON response:',
        expect.objectContaining({
          length: expect.any(Number),
          preview: expect.any(String)
        })
      );
      
      consoleSpy.mockRestore();
    });

    it('should extract deeply nested JSON from complex text', () => {
      const response = `
        Sure, here's the JSON response you requested:
        
        \`\`\`json
        {
          "users": [
            {"id": 1, "name": "User 1"},
            {"id": 2, "name": "User 2"}
          ],
          "metadata": {
            "total": 2,
            "page": 1
          }
        }
        \`\`\`
        
        That's all the data.
      `;
      
      const result = parseJsonFromAiResponse(response);
      expect(result).toEqual({
        users: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' }
        ],
        metadata: {
          total: 2,
          page: 1
        }
      });
    });
  });

  describe('validateParsedJson', () => {
    interface TestUser {
      name: string;
      age: number;
    }

    const isTestUser = (obj: any): obj is TestUser => {
      return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof obj.name === 'string' &&
        typeof obj.age === 'number'
      );
    };

    it('should return object when validation passes', () => {
      const obj = { name: 'John', age: 30 };
      const result = validateParsedJson(obj, isTestUser);
      expect(result).toEqual(obj);
    });

    it('should throw error when validation fails', () => {
      const obj = { name: 'John' }; // Missing age
      expect(() => validateParsedJson(obj, isTestUser)).toThrow('Object does not match expected structure');
    });

    it('should use custom error message', () => {
      const obj = { invalid: true };
      expect(() => validateParsedJson(obj, isTestUser, 'Invalid user object')).toThrow('Invalid user object');
    });

    it('should include object preview in error message', () => {
      const obj = { name: 'John', invalidField: 'value' };
      
      try {
        validateParsedJson(obj, isTestUser);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Got:');
        expect((error as Error).message).toContain('"name":"John"');
      }
    });

    it('should handle array validation', () => {
      const isNumberArray = (obj: any): obj is number[] => {
        return Array.isArray(obj) && obj.every(item => typeof item === 'number');
      };

      const validArray = [1, 2, 3, 4, 5];
      const result = validateParsedJson(validArray, isNumberArray);
      expect(result).toEqual(validArray);

      const invalidArray = [1, 2, 'three', 4];
      expect(() => validateParsedJson(invalidArray, isNumberArray)).toThrow();
    });

    it('should handle null and undefined', () => {
      const isNullOrString = (obj: any): obj is null | string => {
        return obj === null || typeof obj === 'string';
      };

      expect(validateParsedJson(null, isNullOrString)).toBeNull();
      expect(validateParsedJson('test', isNullOrString)).toBe('test');
      expect(() => validateParsedJson(undefined, isNullOrString)).toThrow();
    });
  });
});