// The one place the site chrome and the docs pager name the public source. It equals `sourceRepository` in rer-project.json and
// the `repository` in package.json, which the docs build reads; tests/public-document-runtime.mjs fails if the three differ.
// A constant rather than an import of either file: the browser bundle takes no manifest, and the Worker dev server serves only src.

export const sourceUrl = 'https://github.com/just-every/run-cradle'
export const licenceUrl = `${sourceUrl}/blob/main/LICENSE`
