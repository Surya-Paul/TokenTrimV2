import { VerificationEngine } from './packages/verifier/src/verifier';
import { Tier0Compressor } from './packages/compressor/src/tier0-compressor';

async function main() {
  const text = "In my opinion, I personally think that, first and foremost, we need to plan in advance and take advance planning seriously, because the basic fundamentals of the past history of this project show that the end result and final outcome will be a complete and total success, and that's the honest truth.";
  
  const compressor = new Tier0Compressor('gpt-4');
  const verifier = new VerificationEngine({}, 'gpt-4');
  
  const candidate = await compressor.compress(text, { targetModel: 'gpt-4' });
  console.log("Candidate:", JSON.stringify(candidate, null, 2));
  
  if (candidate) {
    const result = await verifier.verify(text, candidate.compressedText, candidate.safetyScores);
    console.log("Verification Result:", JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
