import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {companyWorkbookRuntime as recordsImportBrowserRuntime} from '../tests/helpers/company-workbook-runtime.mjs'
import {recordsJourney} from '../tests/helpers/records-browser-journey.mjs'
import {companyWorkbookBrowser} from '../tests/helpers/company-workbook-browser.mjs'
import {browserCookies} from '../tests/helpers/session-cookies.mjs'
import {freePort} from '../tests/helpers/free-port.mjs'
const output=path.resolve(process.env.CRADLE_IMPORT_OUTPUT??'.private/company-workbooks');await mkdir(output,{recursive:true});let h,browser
try{h=await recordsImportBrowserRuntime(await freePort());browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});console.log('Owned browser driver PID',process.pid)
 for(const width of [1440,390]){const context=await browser.newContext({viewport:{width,height:width===390?844:900}});try{await context.addCookies(browserCookies(h.cookie,h.origin));const page=await context.newPage(),j=recordsJourney(page,h.origin,output,width,{allAxe:true});await companyWorkbookBrowser(page,{...j,companyOutput:name=>path.join(output,`${name}-${width}.png`)},h,width);console.log('Changed screens and axe passed',width)}finally{await context.close()}}
}finally{await browser?.close();await h?.close()}
