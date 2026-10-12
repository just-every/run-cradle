import type { CandidateDetail, Evaluation } from '../construction/contracts';
export function assertEvaluationFloor(detail:CandidateDetail,evaluations:Evaluation[]) {
 if(detail.build?.state!=='succeeded'||detail.build.sourceHash!==detail.candidate.sourceHash||detail.source.sha256!==detail.candidate.sourceHash)throw new Error('candidate_build_not_verified');
 for(const mode of ['historical','held_out','shadow'] as const){
  const matches=evaluations.filter(e=>e.mode===mode&&e.sourceHash===detail.source.sha256);
  if(!matches.length||matches.some(e=>e.state!=='passed'||e.producerCanGrade!==false||e.evaluatorId===detail.source.producerId||e.eligible===0||e.evaluated!==e.eligible||e.passed!==e.evaluated||e.skipped.length>0||!e.artifactIds.length||!e.checkerHash||!e.datasetHash||(mode==='held_out'&&!e.sealedBeforeGeneration)))throw new Error(`incomplete_${mode}_evaluation`);
 }
}
