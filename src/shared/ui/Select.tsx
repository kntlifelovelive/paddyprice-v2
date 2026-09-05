/**
 * Custom Select component with square corners (border-radius: 0).
 * Replaces native <select> to ensure consistent square styling on Android WebView,
 * where the native dropdown popup's border-radius cannot be controlled via CSS.
 */
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from './cn'

export interface SelectOption {
  value: string
  label: ReactNode
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  placeholder?: string
  'aria-label'?: string
  disabled?: boolean
  'data-testid'?: string
}

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
  'aria-label': ariaLabel,
  disabled = false,
  'data-testid': dataTestId,
}: SelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      // Use click instead of mousedown to fix Android WebView issue where
      // mousedown fires before the option's click event
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedOption = options.find((opt) => opt.value === value)

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen(!isOpen)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        disabled={disabled}
        data-testid={dataTestId}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between border border-border bg-background px-2 py-1.5 text-left',
          className,
        )}
      >
        <span className={cn(!selectedOption && 'text-content-muted')}>
          {selectedOption ? selectedOption.label : placeholder || 'Select…'}
        </span>
        <svg
          className="ml-2 h-4 w-4 shrink-0 text-content-muted"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto border border-border bg-background shadow-lg"
        >
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-value={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'cursor-pointer px-2 py-2 hover:bg-surface-hover',
                option.value === value && 'bg-surface-hover',
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
