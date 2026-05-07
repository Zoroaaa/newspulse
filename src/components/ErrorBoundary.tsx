'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: 'var(--bg-page)', fontFamily: 'Georgia, serif', padding: '2rem',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>出了点问题</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>页面遇到了一个错误</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            style={{
              padding: '10px 24px', background: '#D85A30', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
