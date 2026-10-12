import type {Snapshot} from './contracts';
import {exactOracle} from './oracle';
export function diagnoseFeasibility(snapshot:Snapshot,limit=1000000){
 const oracle=exactOracle(snapshot,limit);
 return{...oracle,state:oracle.kind==='infeasible'?'infeasible':oracle.kind==='exact'?'feasible':'unresolved',conflictingConstraints:oracle.kind==='infeasible'?[...snapshot.groups.map(id=>({id:`group:${id}`,description:'Select exactly one compatible unconditional option'})),...snapshot.constraints.map(c=>({id:c.id,description:c.label})),...snapshot.resources.map(r=>({id:`resource:${r.id}`,description:`Capacity ${r.capacity} ${r.unit}`})),...snapshot.budgets.map(b=>({id:`cash:${b.currency}`,description:`Cash ceiling ${b.minor} minor units at scale ${b.scale}`})),...snapshot.authority.map(a=>({id:`authority:${a.id}`,description:'Current exact action, expiry and aggregate grant ceiling'}))]:[],conflictKind:oracle.kind==='infeasible'?'joint_unsatisfiable_set_not_claimed_minimal':null,relaxedConstraints:[]};
}
