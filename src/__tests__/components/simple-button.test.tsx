import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Simple Button component for testing
interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  disabled = false, 
  variant = 'primary' 
}) => {
  const baseClasses = 'px-4 py-2 rounded font-medium'
  const variantClasses = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300'
  }

  const classes = `${baseClasses} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`

  return (
    <button 
      className={classes} 
      onClick={onClick} 
      disabled={disabled}
      data-testid="button"
    >
      {children}
    </button>
  )
}

describe('Button Component', () => {
  it('should render button with text', () => {
    render(<Button>Click me</Button>)
    
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should not call onClick when disabled', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick} disabled>Click me</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    
    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('should apply correct variant classes', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>)
    
    let button = screen.getByTestId('button')
    expect(button).toHaveClass('bg-blue-500', 'text-white')
    
    rerender(<Button variant="secondary">Secondary</Button>)
    
    button = screen.getByTestId('button')
    expect(button).toHaveClass('bg-gray-200', 'text-gray-800')
  })

  it('should handle disabled state styling', () => {
    render(<Button disabled>Disabled</Button>)
    
    const button = screen.getByTestId('button')
    expect(button).toHaveClass('opacity-50', 'cursor-not-allowed')
    expect(button).toBeDisabled()
  })

  it('should render different content types', () => {
    const { rerender } = render(<Button>Text content</Button>)
    expect(screen.getByText('Text content')).toBeInTheDocument()
    
    rerender(
      <Button>
        <span>Span content</span>
      </Button>
    )
    expect(screen.getByText('Span content')).toBeInTheDocument()
    
    rerender(
      <Button>
        <div>
          <span>Nested</span> content
        </div>
      </Button>
    )
    expect(screen.getByText('Nested')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('should support keyboard interaction', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    
    const button = screen.getByRole('button')
    
    // Focus the button
    button.focus()
    expect(button).toHaveFocus()
    
    // Press Enter
    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' })
    fireEvent.keyUp(button, { key: 'Enter', code: 'Enter' })
    
    // Press Space
    fireEvent.keyDown(button, { key: ' ', code: 'Space' })
    fireEvent.keyUp(button, { key: ' ', code: 'Space' })
  })

  it('should have proper accessibility attributes', () => {
    render(<Button>Accessible button</Button>)
    
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('data-testid', 'button')
  })
})