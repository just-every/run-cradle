import {portableFixture,id} from './base-exit-fixture.mjs'
export const paddedMetadataCases=[
 ['base name',s=>s.base.name=' Portable business '],
 ['table label',s=>s.base.tables[0].label='\tCompanies'],
 ['field label',s=>s.base.tables[0].fields[0].label='Status\n'],
 ['view name',s=>s.base.views[0].name='\u00a0Grid'],
 ['BOM boundary',s=>s.base.name='Portable business\ufeff'],
 ['blank name',s=>s.base.name=' \t '],
 ['padded field collision',s=>s.base.tables[0].fields[0].label=' Company ']
]
export const invalidMetadataCases=[...paddedMetadataCases,
 ['canonical duplicate fields',s=>s.base.tables[0].fields[0].label='Company'],
 ['reserved field label',s=>s.base.tables[0].fields[0].label='_record_id'],
 ['empty option label',s=>s.base.tables[0].fields[0].options[0].label=''],
 ['duplicate option labels',s=>s.base.tables[0].fields[0].options[1].label='Current'],
 ['empty incoming label',s=>s.base.tables[0].incomingRelations[0].label=''],
 ['oversized incoming label',s=>s.base.tables[0].incomingRelations[0].label='x'.repeat(201)]
]
export const invalidMetadataOverrides=[
 ['padded base override',{name:' Renamed '}],
 ['blank base override',{name:'\n'}],
 ['padded table override',{name:'Renamed',tables:{[id(2)]:{label:' Companies '}}}],
 ['padded field override',{name:'Renamed',tables:{[id(2)]:{columns:{[id(3)]:{label:' Company '}}}}}],
 ['colliding field override',{name:'Renamed',tables:{[id(2)]:{columns:{[id(3)]:{label:'Status'}}}}}],
 ['reserved field override',{name:'Renamed',tables:{[id(2)]:{columns:{[id(3)]:{label:'_record_id'}}}}}]
]
/** Whitespace native contracts preserve must not be confused with trimmed names. */
export function whitespaceMetadataFixture(){
 const s=portableFixture();s.base.name='Portable  business';s.base.tables[0].label='Company  records';s.base.tables[0].fields[1].label='Company  name';s.base.views[0].name='Grid  view'
 for(const table of s.base.tables)for(const field of table.fields)if(field.options)field.options[0].label=' Current '
 s.base.tables[0].incomingRelations[0].label=' Contacts '
 s.base.forms[0].title=' Create company ';s.base.forms[0].fields[0].label=' Company prompt ';s.base.forms[0].fields[0].help='\tKeep this help\n'
 s.base.tables[0].records[0].values[id(3)]=' \tTwin\r\n ';s.base.tables[0].records[0].values[id(7)]='  customer@example.test  '
 return s
}
