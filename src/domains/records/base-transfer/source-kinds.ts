/** Optional owner declarations describe source behavior; they do not select the
 * destination type or recreate that behavior. CSV itself carries no schema. */
export const sourceKinds = ['singleLineText','multilineText','richText','email','phoneNumber','url','barcode','singleCollaborator','multipleCollaborators','createdBy','lastModifiedBy','number','currency','percent','rating','duration','autoNumber','count','date','dateTime','createdTime','lastModifiedTime','checkbox','singleSelect','multipleSelects','multipleRecordLinks','multipleLookupValues','formula','rollup','multipleAttachments','button'] as const
export type SourceKind = typeof sourceKinds[number]
