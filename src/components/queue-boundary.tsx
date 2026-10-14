"use client"

import { Component, type ReactNode } from "react"

export class QueueBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : "Something went wrong." }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app">
        <div className="state">
          <h2>The queue hit an unexpected error</h2>
          <p>{this.state.error}</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
