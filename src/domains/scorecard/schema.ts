import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const operationCohorts=sqliteTable('operation_cohorts',{id:text('id').primaryKey(),appId:text('app_id').notNull(),version:integer('version').notNull(),dataJson:text('data_json').notNull()});
export const operationObservations=sqliteTable('operation_observations',{id:text('id').primaryKey(),appId:text('app_id').notNull(),version:integer('version').notNull(),dataJson:text('data_json').notNull()});
