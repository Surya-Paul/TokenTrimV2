import { Card, CardHeader, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';

export function AboutPanel() {
  return (
    <div className="about-panel" style={{ maxWidth: 700, margin: '0 auto' }}>
      <Card>
        <CardContent style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✂️</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 600 }}>TokenTrim</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 16 }}>
            Web-based LLM input optimization engine
          </p>
          <div style={{ marginTop: 16 }}>
            <Badge variant="success">v1.0.0 (Web)</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Architecture" />
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
              <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Tier 0 Deterministic</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Fast, rule-based compression</p>
            </div>
            <div style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>☁️</div>
              <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Groq Cloud</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>High-speed AI semantic compression</p>
            </div>
            <div style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🛡️</div>
              <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Verification</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Multi-layer safety checks</p>
            </div>
            <div style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🚀</div>
              <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Fastify API</h4>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Secure backend REST API</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
