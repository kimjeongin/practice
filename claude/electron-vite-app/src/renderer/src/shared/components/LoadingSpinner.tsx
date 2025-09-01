import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
  color?: 'blue' | 'gray' | 'green' | 'yellow' | 'red'
}

export function LoadingSpinner({
  size = 'md',
  className = '',
  text,
  color = 'blue',
}: LoadingSpinnerProps): React.JSX.Element {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  const colorClasses = {
    blue: 'border-blue-600',
    gray: 'border-gray-600',
    green: 'border-green-600',
    yellow: 'border-yellow-600',
    red: 'border-red-600',
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`
          animate-spin rounded-full border-2 border-t-transparent 
          ${sizeClasses[size]} 
          ${colorClasses[color]}
        `}
      />
      {text && <p className={`mt-2 text-gray-600 ${textSizeClasses[size]}`}>{text}</p>}
    </div>
  )
}

interface LoadingOverlayProps {
  isLoading: boolean
  children: React.ReactNode
  text?: string
  className?: string
}

export function LoadingOverlay({
  isLoading,
  children,
  text = 'Loading...',
  className = '',
}: LoadingOverlayProps): React.JSX.Element {
  if (!isLoading) {
    return <>{children}</>
  }

  return (
    <div className={`relative ${className}`}>
      {children}
      <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
        <LoadingSpinner text={text} />
      </div>
    </div>
  )
}

export default LoadingSpinner
