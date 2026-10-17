import type { Id, Instant, Versioned, Ref, Cell, CellValue, AllowedAction, Page, PageQuery } from '../../contracts/primitives';
export type RecordRow = Versioned & {
    ref: Ref;
    schemaVersion: number;
    lifecycle: string;
    fields: {
        [fieldId: string]: Cell;
    };
    allowedActions: AllowedAction[];
};
export type Sort = {
    fieldId: Id;
    direction: 'asc' | 'desc';
};
export type Filter = {
    kind: 'all' | 'any';
    conditions: Filter[];
} | {
    kind: 'condition';
    fieldId: Id;
    op: 'eq' | 'ne' | 'in' | 'contains' | 'empty' | 'not_empty' | 'before' | 'after' | 'next_days';
    value?: CellValue;
};
export type Query = PageQuery & {
    filter?: Filter;
    sort?: Sort[];
    groupBy?: Id[];
    fields?: Id[];
    includeArchived?: boolean;
};
export type Expr = {
    kind: 'field';
    fieldId: Id;
} | {
    kind: 'literal';
    value: CellValue;
    valueType?: 'number';
} | {
    kind: 'call';
    fn: string;
    args: Expr[];
} | {
    kind: 'rollup';
    relationFieldId: Id;
    valueFieldId: Id;
    aggregate: 'sum' | 'count' | 'counta' | 'countall' | 'min' | 'max' | 'average' | 'lookup' | 'arrayjoin' | 'arrayunique' | 'and' | 'or';
    separator?: string;
    filter?: Filter;
};
export type Field = {
    readOnly?: boolean;
    id: Id;
    label: string;
    type: 'text' | 'number' | 'date' | 'instant' | 'money' | 'boolean' | 'select' | 'multi_select' | 'url' | 'person' | 'relation' | 'attachment' | 'computed';
    required: boolean;
    unique: boolean;
    options?: {
        id: Id;
        label: string;
    }[];
    relation?: {
        ownerAppId: Id;
        entityId: Id;
        cardinality: 'one' | 'many';
        onDelete: 'restrict' | 'unlink' | 'cascade';
    };
    expression?: Expr;
    resultType?: Field['type'] | 'array';
};
export type EntitySchema = Versioned & {
    primaryFieldId?: Id;
    incomingRelations?: { id: Id; label: string; sourceEntityId: Id; sourceFieldId: Id }[];
    appId: Id;
    label: string;
    fields: Field[];
    lifecycle: {
        states: string[];
        initial: string;
        transitions: {
            action: string;
            from: string[];
            to: string;
        }[];
    };
    physicalRevision: string;
};
export type View = Versioned & {
    appId: Id;
    entityId: Id;
    name: string;
    display: 'grid' | 'cards' | 'board' | 'calendar' | 'timeline' | 'agenda';
    fields: Id[];
    filter: Filter;
    sort: Sort[];
    groupBy: Id[];
    layout: {
        titleFieldId: Id;
        startFieldId?: Id;
        endFieldId?: Id;
        boardFieldId?: Id;
    };
    visibility: 'private' | 'app';
    shipped: boolean;
};
export type Form = Versioned & {
    appId: Id;
    entityId: Id;
    title: string;
    fields: {
        fieldId: Id;
        label: string;
        help: string;
        required: boolean;
    }[];
    submitAction: string;
    authenticated: true;
};
export type ViewResult = {
    view: View;
    schema: EntitySchema;
    records: Page<RecordRow>;
    groups: {
        key: CellValue;
        count: number;
    }[];
};
export type RecordDetail = {
    incomingRelations?: {id:string;label:string;sourceEntityId:string;sourceFieldId:string;page:Page<RecordRow>}[];
    record: RecordRow;
    relations: {
        fieldId: Id;
        page: Page<RecordRow>;
    }[];
    evidenceIds: Id[];
    historyUrl: string;
    commentCount: number;
    activeCaseIds: Id[];
};
export const RECORD_SCHEMA_ENTITY_ID = '00000000000000000000000001';
export const RECORD_VIEW_ENTITY_ID = '00000000000000000000000002';
export const RECORD_FORM_ENTITY_ID = '00000000000000000000000003';
