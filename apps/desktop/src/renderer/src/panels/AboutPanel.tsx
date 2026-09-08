import React from 'react';
import { Card, CardHeader, CardContent } from '../components/Card';
import { Button } from '../components/Button';

export function AboutPanel() {
  return (
    <div className="about-panel" style={{ maxWidth: 700, margin: '0 auto' }}>
      <Card>
        <CardContent style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✂️</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 600 }}>TokenTrim</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 16 }}>
            Model-aware, local-first LLM input optimization engine
          </p>
          <div style={{ marginTop: 16 }}>
            <Badge variant="success">v1.0.0</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Philosophy" />
        <CardContent>
          <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
            <strong>SAFE compression is more important than maximum compression.</strong>
          </p>
          <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
            TokenTrim never sacrifices correctness for token reduction. Every compression candidate 
            undergoes rigorous verification to ensure instructions, constraints, technical details, 
            and semantic meaning are preserved.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Preserves explicit instructions (must, should, never, exactly, only)</li>
            <li>Preserves constraints (counts, formats, versions, file names)</li>
            <li>Preserves technical integrity (code, URLs, identifiers, numbers)</li>
            <li>Blocks cloud processing when secrets detected</li>
            <li>Calculates NET token savings (accounting for AI overhead)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Architecture" />
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <FeatureCard 
              title="Tier 0 Deterministic" 
              description="Fast, rule-based compression with zero AI overhead"
              icon="⚡"
            />
            <FeatureCard 
              title="Phi-4-mini Local" 
              description="Microsoft's Phi-4-mini via Ollama for semantic compression"
              icon="🧠"
            />
            <FeatureCard 
              title="Groq Cloud Fallback" 
              description="High-speed cloud inference when local isn't enough"
              icon="☁️"
            />
            <FeatureCard 
              title="Verification Engine" 
              description="Multi-layer safety checks before accepting any compression"
              icon="🛡️"
            />
            <FeatureCard 
              title="Target-Aware Tokenization" 
              description="GPT, Claude, Gemini, Llama, Qwen, Phi tokenizers"
              icon="🔢"
            />
            <FeatureCard 
              title="Privacy First" 
              description="Secrets never leave your machine without consent"
              icon="🔒"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Quick Start" />
        <CardContent>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            <li><strong>Install Ollama:</strong> <code>brew install ollama</code> or download from <a href="https://ollama.ai" target="_blank" rel="noopener">ollama.ai</a></li>
            <li><strong>Pull Phi-4-mini:</strong> <code>ollama pull phi4-mini</code></li>
            <li><strong>Start Ollama:</strong> <code>ollama serve</code> (runs on localhost:11434)</li>
            <li><strong>Configure TokenTrim:</strong> Settings → Local AI → Enable + verify connection</li>
            <li><strong>(Optional) Add Groq:</strong> Get API key from <a href="https://console.groq.com" target="_blank" rel="noopener">Groq Console</a> for cloud fallback</li>
            <li><strong>Use:</strong> Press <kbd>Cmd+Shift+T</kbd> (Mac) / <kbd>Ctrl+Shift+T</kbd> (Win/Linux) to compress clipboard</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Links" />
        <CardContent>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Button variant="secondary" onClick={() => window.open('https://github.com/tokentrim/tokentrim', '_blank')}>
              GitHub Repository
            </Button>
            <Button variant="secondary" onClick={() => window.open('https://tokentrim.dev/docs', '_blank')}>
              Documentation
            </Button>
            <Button variant="secondary" onClick={() => window.open('https://github.com/tokentrim/tokentrim/issues', '_blank')}>
              Report Issue
            </Button>
            <Button variant="secondary" onClick={() => window.open('https://github.com/tokentrim/tokentrim/blob/main/SECURITY.md', '_blank')}>
              Security Policy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="License & Credits" />
        <CardContent>
          <p style={{ margin: '0 0 12px' }}>
            TokenTrim is released under the MIT License.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Built with: Electron, React, TypeScript, Tiktoken, Ollama, Groq
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Thanks to Microsoft for Phi-4-mini, and the Ollama & Groq teams for their excellent platforms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div style={{ 
      padding: 20, 
      background: 'var(--color-bg)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)'
    }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
      <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{title}</h4>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}