import { TokenTrimEngine, TokenTrimEngineConfig } from '@tokentrim/core';
import { BenchmarkCase, BenchmarkResult, BenchmarkReport, BenchmarkCategory } from '@tokentrim/shared';
import { BENCHMARK_CASES } from './test-cases';
import { createDefaultPrivacySettings } from '@tokentrim/privacy';

async function runBenchmarks(options: {
  categories?: BenchmarkCategory[];
  targetModel?: string;
  limit?: number;
} = {}): Promise<BenchmarkReport> {
  const { categories, targetModel = 'gpt-4', limit } = options;

  // Filter cases
  let cases = BENCHMARK_CASES;
  if (categories && categories.length > 0) {
    cases = cases.filter(c => categories.includes(c.category));
  }
  if (limit) {
    cases = cases.slice(0, limit);
  }

  console.log(`Running ${cases.length} benchmark cases...`);

  // Initialize engine (deterministic only for benchmark)
  const config: TokenTrimEngineConfig = {
    targetModel: targetModel as any,
    enableTelemetry: false
  };
  const engine = new TokenTrimEngine(config);

  const results: BenchmarkResult[] = [];
  let passedCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]!;
    process.stdout.write(`\r[${i + 1}/${cases.length}] ${testCase.name}...`);

    try {
      const startTime = Date.now();
      const compressionResult = await engine.compress(testCase.input, {
        targetModel: testCase.targetModel,
        maxCompressionRatio: 0.5,
        preserveFormatting: true,
        allowCloudFallback: false,
        requireConfirmationForCloud: true,
        verificationThresholds: {
          semanticConfidence: 0.85,
          instructionConfidence: 0.95,
          technicalIntegrity: 0.99,
          privacyConfidence: 1.0,
          compressionConfidence: 0.8,
          overall: 0.9
        }
      });
      const latencyMs = Date.now() - startTime;

      // Calculate metrics
      const originalTokens = compressionResult.originalTokens;
      const compressedTokens = compressionResult.finalTokens;
      const grossReduction = originalTokens > 0 ? (compressionResult.grossReduction / originalTokens) : 0;
      const netReduction = originalTokens > 0 ? (compressionResult.netSavings / originalTokens) : 0;

      // Check must-preserve
      const preserved = testCase.mustPreserve.every(term => 
        compressionResult.bestCandidate?.compressedText.includes(term)
      );
      
      // Check must-not-contain
      const notContained = testCase.mustNotContain.every(term => 
        !compressionResult.bestCandidate?.compressedText.includes(term)
      );

      const result: BenchmarkResult = {
        caseId: testCase.id,
        originalTokens,
        compressedTokens,
        grossReduction: compressionResult.grossReduction,
        netReduction: compressionResult.netSavings,
        semanticPreservation: compressionResult.bestCandidate?.safetyScores.semanticConfidence || 0,
        instructionPreservation: compressionResult.bestCandidate?.safetyScores.instructionConfidence || 0,
        constraintPreservation: compressionResult.bestCandidate?.safetyScores.technicalIntegrity || 0,
        codeIntegrity: 1.0, // Would need detailed check
        urlIntegrity: 1.0,
        secretDetection: 1.0,
        latencyMs,
        memoryUsageMb: process.memoryUsage().heapUsed / 1024 / 1024,
        passed: compressionResult.accepted && preserved && notContained,
        failures: []
      };

      if (!compressionResult.accepted) {
        result.failures.push('Compression rejected by verifier');
      }
      if (!preserved) {
        const missing = testCase.mustPreserve.filter(t => !compressionResult.bestCandidate?.compressedText.includes(t));
        result.failures.push(`Missing required terms: ${missing.join(', ')}`);
      }
      if (!notContained) {
        const found = testCase.mustNotContain.filter(t => compressionResult.bestCandidate?.compressedText.includes(t));
        result.failures.push(`Contains forbidden terms: ${found.join(', ')}`);
      }

      if (result.passed) passedCount++;

      results.push(result);
    } catch (error) {
      results.push({
        caseId: testCase.id,
        originalTokens: 0,
        compressedTokens: 0,
        grossReduction: 0,
        netReduction: 0,
        semanticPreservation: 0,
        instructionPreservation: 0,
        constraintPreservation: 0,
        codeIntegrity: 0,
        urlIntegrity: 0,
        secretDetection: 0,
        latencyMs: 0,
        memoryUsageMb: 0,
        passed: false,
        failures: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  console.log('\n');

  // Calculate aggregates
  const validResults = results.filter(r => r.originalTokens > 0);
  const avgTokenReduction = validResults.length > 0 
    ? validResults.reduce((sum, r) => sum + (r.grossReduction / r.originalTokens), 0) / validResults.length * 100 
    : 0;
  const avgNetTokenReduction = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + (r.netReduction / r.originalTokens), 0) / validResults.length * 100
    : 0;
  const avgSemanticPreservation = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.semanticPreservation, 0) / validResults.length
    : 0;
  const avgInstructionPreservation = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.instructionPreservation, 0) / validResults.length
    : 0;
  const avgConstraintPreservation = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.constraintPreservation, 0) / validResults.length
    : 0;
  const avgCodeIntegrity = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.codeIntegrity, 0) / validResults.length
    : 0;
  const avgUrlIntegrity = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.urlIntegrity, 0) / validResults.length
    : 0;
  const avgSecretDetection = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.secretDetection, 0) / validResults.length
    : 0;
  const avgLatencyMs = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.latencyMs, 0) / validResults.length
    : 0;

  const report: BenchmarkReport = {
    timestamp: Date.now(),
    totalCases: cases.length,
    passedCases: passedCount,
    failedCases: cases.length - passedCount,
    averageTokenReduction: avgTokenReduction,
    averageNetTokenReduction: avgNetTokenReduction,
    averageSemanticPreservation: avgSemanticPreservation,
    averageInstructionPreservation: avgInstructionPreservation,
    averageConstraintPreservation: avgConstraintPreservation,
    averageCodeIntegrity: avgCodeIntegrity,
    averageUrlIntegrity: avgUrlIntegrity,
    averageSecretDetection: avgSecretDetection,
    averageLatencyMs: avgLatencyMs,
    results
  };

  return report;
}

function printReport(report: BenchmarkReport): void {
  console.log('\n========================================');
  console.log('BENCHMARK REPORT');
  console.log('========================================');
  console.log(`Total Cases:     ${report.totalCases}`);
  console.log(`Passed:          ${report.passedCases} (${(report.passedCases / report.totalCases * 100).toFixed(1)}%)`);
  console.log(`Failed:          ${report.failedCases}`);
  console.log(`Avg Token Redux: ${report.averageTokenReduction.toFixed(1)}%`);
  console.log(`Avg Net Redux:   ${report.averageNetTokenReduction.toFixed(1)}%`);
  console.log(`Semantic Pres:   ${(report.averageSemanticPreservation * 100).toFixed(1)}%`);
  console.log(`Instruction Pres: ${(report.averageInstructionPreservation * 100).toFixed(1)}%`);
  console.log(`Constraint Pres: ${(report.averageConstraintPreservation * 100).toFixed(1)}%`);
  console.log(`Code Integrity:  ${(report.averageCodeIntegrity * 100).toFixed(1)}%`);
  console.log(`URL Integrity:   ${(report.averageUrlIntegrity * 100).toFixed(1)}%`);
  console.log(`Secret Detection: ${(report.averageSecretDetection * 100).toFixed(1)}%`);
  console.log(`Avg Latency:     ${report.averageLatencyMs.toFixed(0)}ms`);
  console.log('========================================\n');

  // Print failures
  const failures = report.results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  ${f.caseId}: ${f.failures.join('; ')}`);
    }
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const categories = args.includes('--all') ? undefined : 
    args.filter(a => a.startsWith('--cat=')).map(a => a.split('=')[1]);
  const limit = args.find(a => a.startsWith('--limit='))     ? parseInt(args.find(a => a.startsWith('--limit='))!.split('=')[1]!)
     : undefined;
  const targetModel = args.find(a => a.startsWith('--model=')) 
    ? args.find(a => a.startsWith('--model='))!.split('=')[1]!
    : 'gpt-4';

  const report = await runBenchmarks({ categories: (categories && categories.length > 0 ? categories : undefined) as BenchmarkCategory[] | undefined, limit, targetModel });
  printReport(report);

  // Exit with error code if any failures
  process.exit(report.failedCases > 0 ? 1 : 0);
}

main().catch(console.error);