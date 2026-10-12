import './helpers/typescript-loader.mjs'
import {contract} from './contract.mjs'
import {prepareFixture} from './helpers/records-import-fixture.mjs'
import {assertFixtureReport} from './helpers/records-import-report.mjs'
for(const name of ['crm-example','project-tracker','edges'])for(const format of ['csv','api'])contract('RECORDS-005',`${name} ${format} compares every handwritten report count and reference coordinate`,async()=>{
 const fixture=await prepareFixture(name,format)
 assertFixtureReport(fixture,fixture.preview.report,format)
})
