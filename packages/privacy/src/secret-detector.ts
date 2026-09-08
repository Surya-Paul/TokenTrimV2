import {
  SecretDetectionResult,
  DetectedSecret,
  PrivacySettings
} from '@tokentrim/shared';

const SECRET_PATTERNS: Array<{
  type: DetectedSecret['type'];
  regex: RegExp;
  confidence: number;
  maskFn: (match: string) => string;
}> = [
  {
    type: 'api_key',
    regex: /\b(?:sk|pk|rk)_[a-zA-Z0-9]{24,}\b/g,
    confidence: 0.95,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4)
  },
  {
    type: 'api_key',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/g,
    confidence: 0.99,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4)
  },
  {
    type: 'api_key',
    regex: /\bsk-[a-zA-Z0-9]{48}\b/g,
    confidence: 0.95,
    maskFn: (m) => m.slice(0, 3) + '*'.repeat(m.length - 6) + m.slice(-3)
  },
  {
    type: 'api_key',
    regex: /\bapi[_-]?key["\s:=]+["\']?([a-zA-Z0-9_-]{20,})["\']?/gi,
    confidence: 0.85,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(Math.max(0, m.length - 8)) + m.slice(-4)
  },
  {
    type: 'aws_credentials',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    confidence: 0.99,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4)
  },
  {
    type: 'aws_credentials',
    regex: /\b(?:aws_secret_access_key|aws_access_key_id)["\s:=]+["\']?([a-zA-Z0-9/+=]{40})["\']?/gi,
    confidence: 0.9,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(Math.max(0, m.length - 8)) + m.slice(-4)
  },
  {
    type: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    confidence: 0.9,
    maskFn: (m) => {
      const parts = m.split('.');
      return parts[0]!.slice(0, 4) + '*'.repeat(10) + '.' + parts[1]!.slice(0, 4) + '*'.repeat(10) + '.' + parts[2]!.slice(0, 4) + '*'.repeat(10);
    }
  },
  {
    type: 'oauth_token',
    regex: /\b(?:ya29|ya30)\.[a-zA-Z0-9_-]+\b/g,
    confidence: 0.9,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4)
  },
  {
    type: 'oauth_token',
    regex: /\baccess_token["\s:=]+["\']?([a-zA-Z0-9_-]{20,})["\']?/gi,
    confidence: 0.8,
    maskFn: (m) => m.slice(0, 4) + '*'.repeat(Math.max(0, m.length - 8)) + m.slice(-4)
  },
  {
    type: 'private_key',
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    confidence: 1.0,
    maskFn: () => '[PRIVATE KEY REDACTED]'
  },
  {
    type: 'private_key',
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    confidence: 1.0,
    maskFn: () => '[SSH PRIVATE KEY REDACTED]'
  },
  {
    type: 'database_credentials',
    regex: /\b(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\/]+\/\w+/gi,
    confidence: 0.9,
    maskFn: (m) => m.replace(/:([^:@]+)@/, ':****@')
  },
  {
    type: 'database_credentials',
    regex: /\b(?:password|passwd|pwd)["\s:=]+["\']?([^"\'\s]{8,})["\']?/gi,
    confidence: 0.7,
    maskFn: (m) => m.replace(/["\']?[^"\'\s]{8,}["\']?/, '"******"')
  },
  {
    type: 'environment_variable',
    regex: /\b(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL)_[A-Z0-9_]+=["\']?([^"\'\s]{10,})["\']?/gi,
    confidence: 0.8,
    maskFn: (m) => m.replace(/=["\']?[^"\'\s]{10,}["\']?/, '="******"')
  },
  {
    type: 'generic_secret',
    regex: /\b(?:secret|token|key|password)["\s:=]+["\']?([a-zA-Z0-9+/=_-]{20,})["\']?/gi,
    confidence: 0.6,
    maskFn: (m) => m.replace(/["\']?[a-zA-Z0-9+/=_-]{20,}["\']?/, '"******"')
  }
];

export class SecretDetector {
  private settings: PrivacySettings;

  constructor(settings: PrivacySettings) {
    this.settings = settings;
  }

  updateSettings(settings: PrivacySettings): void {
    this.settings = settings;
  }

  scan(text: string): SecretDetectionResult {
    const secrets: DetectedSecret[] = [];
    
    for (const pattern of SECRET_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const fullMatch = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + fullMatch.length;
        
        const secret: DetectedSecret = {
          type: pattern.type,
          value: fullMatch,
          startIndex,
          endIndex,
          confidence: pattern.confidence,
          maskedValue: pattern.maskFn(fullMatch)
        };
        
        secrets.push(secret);
        
        if (!pattern.regex.global) break;
      }
    }

    // Sort by start index
    secrets.sort((a, b) => a.startIndex - b.startIndex);

    // Remove overlapping detections (keep higher confidence)
    const filteredSecrets = this.removeOverlapping(secrets);

    const hasSecrets = filteredSecrets.length > 0;
    const riskLevel = this.calculateRiskLevel(filteredSecrets);

    return {
      hasSecrets,
      secrets: filteredSecrets,
      riskLevel
    };
  }

  private removeOverlapping(secrets: DetectedSecret[]): DetectedSecret[] {
    const result: DetectedSecret[] = [];
    
    for (const secret of secrets) {
      let overlaps = false;
      
      for (const existing of result) {
        if (secret.startIndex < existing.endIndex && secret.endIndex > existing.startIndex) {
          if (secret.confidence > existing.confidence) {
            // Replace existing with higher confidence
            const idx = result.indexOf(existing);
            result[idx] = secret;
          }
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        result.push(secret);
      }
    }
    
    return result;
  }

  private calculateRiskLevel(secrets: DetectedSecret[]): SecretDetectionResult['riskLevel'] {
    if (secrets.length === 0) return 'none';
    
    const maxConfidence = Math.max(...secrets.map(s => s.confidence));
    const criticalTypes = ['private_key', 'aws_credentials'];
    const hasCritical = secrets.some(s => criticalTypes.includes(s.type));
    
    if (hasCritical || maxConfidence >= 0.95) return 'critical';
    if (maxConfidence >= 0.85) return 'high';
    if (maxConfidence >= 0.7) return 'medium';
    return 'low';
  }

  maskSecrets(text: string): string {
    const result = this.scan(text);
    let masked = text;
    let offset = 0;
    
    for (const secret of result.secrets) {
      const start = secret.startIndex + offset;
      const end = secret.endIndex + offset;
      const before = masked.slice(0, start);
      const after = masked.slice(end);
      masked = before + secret.maskedValue + after;
      offset += secret.maskedValue.length - (secret.endIndex - secret.startIndex);
    }
    
    return masked;
  }

  canSendToCloud(text: string): { allowed: boolean; reason?: string } {
    if (this.settings.localOnlyMode) {
      return { allowed: false, reason: 'Local-only mode enabled' };
    }
    
    const result = this.scan(text);
    
    if (result.hasSecrets && this.settings.neverSendSecrets) {
      return { allowed: false, reason: 'Secrets detected and cloud sending blocked' };
    }
    
    return { allowed: true };
  }
}

export function createDefaultPrivacySettings(): PrivacySettings {
  return {
    neverSendSecrets: true,
    allowCloudProcessing: false,
    requireCloudConfirmation: true,
    maskSecretsInLogs: true,
    localOnlyMode: false
  };
}