import type { Ref } from '../../contracts/primitives';
import type { AuditFact } from './ports';
export function resultSubjects(result: unknown, audit: readonly AuditFact[],explicit:readonly {ref:Ref;fieldIds:readonly string[]}[]=[]): {
    ref: Ref;
    fieldIds: string[];
}[] {
    const subjects = new Map<string, {
        ref: Ref;
        fieldIds: Set<string>;
    }>();
    const add = (ref: Ref, ids: string[]) => { const key = ref.appId + ':' + ref.entityId + ':' + ref.recordId; const old = subjects.get(key) ?? { ref, fieldIds: new Set<string>() }; ids.forEach(id => old.fieldIds.add(id)); subjects.set(key, old); };
    const isRef = (v: unknown): v is Ref => !!v && typeof v === 'object' && ['appId', 'entityId', 'recordId'].every(k => typeof (v as Record<string, unknown>)[k] === 'string');
    const seen = new WeakSet<object>();
    function visit(value: unknown, depth = 0) { if (depth > 100)
        throw new Error('Result provenance depth exceeds 100'); if (!value || typeof value !== 'object')
        return; if (seen.has(value))
        throw new Error('Cyclic result'); seen.add(value); if (isRef(value))
        add(value, []); const item = value as Record<string, unknown>; if (isRef(item.ref)) {
        const fields = item.fields;
        add(item.ref, Array.isArray(fields) ? fields.flatMap(f => f && typeof f.fieldId === 'string' ? [f.fieldId] : []) : fields && typeof fields === 'object' ? Object.keys(fields) : []);
    } for (const child of Object.values(value))
        visit(child, depth + 1); seen.delete(value); }
    visit(result);
    for (const item of audit)
        if (item.subject)
            add(item.subject, item.changes.map(c => c.fieldId));
    for(const subject of explicit)add(subject.ref,[...subject.fieldIds]);
    return [...subjects.values()].map(s => ({ ref: s.ref, fieldIds: [...s.fieldIds] }));
}
