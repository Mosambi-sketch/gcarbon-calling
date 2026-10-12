import React, { Component, type ReactNode } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#EFEFEF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 24,
            padding: 36,
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
            }}>
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B0B0B', marginBottom: 8 }}>
              Something unexpected happened
            </h2>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 24 }}>
              The application encountered a temporary issue. You can try recovering or reloading the page.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReset}
                className="btn btn-secondary"
                style={{
                  height: 40,
                  padding: '0 18px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid #E5E7EB',
                  background: '#F9FAFB',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{
                  height: 40,
                  padding: '0 18px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#0B0B0B',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <RefreshCw size={14} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
