import {recordCommentsBrowser} from './records-comment-browser.mjs'
import {fieldBrowser} from './field-browser.mjs'
import {recordTrashBrowser} from './record-trash-browser.mjs'
import {baseRolesJourney} from './records-base-roles-journey.mjs'
import { collectionLookupsBrowser } from './records-collection-browser.mjs'
import { historyBrowserJourney } from './records-history-journey.mjs'
import { conditionalFormsJourney } from './records-forms-journey.mjs'

// One ordered stream; each helper owns its actual Worker, database and browser.
await fieldBrowser()
await recordTrashBrowser()
await baseRolesJourney()
await collectionLookupsBrowser()
await conditionalFormsJourney()
await historyBrowserJourney()
await recordCommentsBrowser()
