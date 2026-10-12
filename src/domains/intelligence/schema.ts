import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
const columns=()=>({id:text('id').primaryKey(),appId:text('app_id').notNull(),ownerId:text('owner_id').notNull(),version:integer('version').notNull(),state:text('state').notNull(),dataJson:text('data_json').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()});
export const intelligenceSnapshots=sqliteTable('intelligence_snapshots',columns());
export const intelligenceProblems=sqliteTable('intelligence_problems',columns());
export const intelligenceStrategies=sqliteTable('intelligence_strategies',{...columns(),problemId:text('problem_id').notNull().references(()=>intelligenceProblems.id)},t=>[index('intelligence_strategy_problem').on(t.problemId,t.state)]);
export const intelligenceInvestigations=sqliteTable('intelligence_investigations',columns());
export const intelligenceExplorations=sqliteTable('intelligence_explorations',columns());
