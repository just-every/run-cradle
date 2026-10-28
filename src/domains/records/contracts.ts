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
    sort?: Sort[];
    limit?: number;
};
export type Field = {
    validation?: { min?: string; max?: string; minLength?: number; maxLength?: number; pattern?: string };
    defaultValue?: CellValue;
    readOnly?: boolean;
    id: Id;
    label: string;
    type: 'email' | 'rating' | 'duration' | 'phone' | 'text' | 'number' | 'date' | 'instant' | 'money' | 'boolean' | 'select' | 'multi_select' | 'url' | 'person' | 'relation' | 'attachment' | 'computed';
    required: boolean;
    unique: boolean;
    options?: {
        id: Id;
        label: string;
        /** Extra choice recovered from retained storage; never a native field configuration. */
        retainedValue?: string;
    }[];
    relation?: {
        ownerAppId: Id;
        entityId: Id;
        cardinality: 'one' | 'many';
        onDelete: 'restrict' | 'unlink' | 'cascade';
    };
    linkPicker?: { searchFieldIds: Id[]; displayFieldIds: Id[]; viewId?: Id };
    /** A number is a fraction (0.49 means 49%); storage adapters preserve their physical representation. */
    numberFormat?: 'percent';
    expression?: Expr;
    resultType?: Field['type'] | 'array';
    resultElementType?: 'email' | 'rating' | 'duration' | 'phone' | 'text' | 'url' | 'number' | 'date' | 'instant' | 'money' | 'boolean' | 'select' | 'person' | 'relation' | 'attachment';
};
export type RuleCondition = { kind: 'all' | 'any'; conditions: RuleCondition[] } | {
    kind: 'condition'; fieldId: Id; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty'; value?: CellValue;
};
export type ValidationRule = { id: Id; name: string; message: string; when: RuleCondition; require: RuleCondition };
export type EntitySchema = Versioned & {
    validationRules?: ValidationRule[];
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
export type TimelineZoom = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type TimelineBaseline = {
    capturedAt: string;
    startFieldId: Id;
    endFieldId?: Id;
    records: { recordId: Id; start: string | null; end?: string | null }[];
};
export type View = Versioned & {
    timelineZoom?: TimelineZoom;
    timelineBaseline?: TimelineBaseline;
    locked?: boolean;
    summaries?: import('./view-presentation').ViewSummaryChoice[];
    formatting?: import('./view-presentation').ViewColorRule[];
    access?: {canEdit:boolean;canLock:boolean};
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
        coverFieldId?: Id;
        dependencyFieldId?: Id;
    };
    coverFit?: 'cover' | 'contain';
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
        showWhen?: RuleCondition;
        page?: string;
        section?: string;
    }[];
    submitAction: string;
    authenticated: true;
};
export type ViewResult = {
    timelineDependenciesComplete?: boolean;
    timezone?: string;
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
