// Basic test to verify Jest is working correctly

describe('Basic Jest functionality', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2)
    expect('hello').toBe('hello')
    expect([1, 2, 3]).toHaveLength(3)
  })

  it('should handle async operations', async () => {
    const promise = Promise.resolve('test')
    await expect(promise).resolves.toBe('test')
  })

  it('should mock functions', () => {
    const mockFn = jest.fn()
    mockFn('test')
    
    expect(mockFn).toHaveBeenCalledWith('test')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should handle objects and arrays', () => {
    const obj = { name: 'John', age: 30 }
    const arr = [1, 2, 3]

    expect(obj).toHaveProperty('name', 'John')
    expect(arr).toContain(2)
    expect(obj).toEqual({ name: 'John', age: 30 })
  })
})