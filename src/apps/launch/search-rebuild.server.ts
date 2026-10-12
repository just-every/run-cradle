export const launchSearchProjections=[
 "INSERT INTO launch_search(rowid,record_id,campaign_id,record_type,body) SELECT m.id,s.id,s.id,'Campaign',s.name||' '||s.code||' '||s.status_summary FROM campaigns s JOIN launch_search_rows m ON m.record_id=s.id AND m.record_type='Campaign';",
 "INSERT INTO launch_search(rowid,record_id,campaign_id,record_type,body) SELECT m.id,s.id,s.campaign_id,'Deliverable',s.title FROM deliverables s JOIN launch_search_rows m ON m.record_id=s.id AND m.record_type='Deliverable';",
 "INSERT INTO launch_search(rowid,record_id,campaign_id,record_type,body) SELECT m.id,s.id,s.campaign_id,'Risk',s.title FROM risks s JOIN launch_search_rows m ON m.record_id=s.id AND m.record_type='Risk';",
 "INSERT INTO launch_search(rowid,record_id,campaign_id,record_type,body) SELECT m.id,s.id,s.campaign_id,'Milestone',s.title FROM milestones s JOIN launch_search_rows m ON m.record_id=s.id AND m.record_type='Milestone';",
 "INSERT INTO launch_search(rowid,record_id,campaign_id,record_type,body) SELECT m.id,s.id,s.campaign_id,'Decision',s.title FROM decisions s JOIN launch_search_rows m ON m.record_id=s.id AND m.record_type='Decision';"
] as const
