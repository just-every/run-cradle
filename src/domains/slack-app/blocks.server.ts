import {AuthorityError} from '../authority/errors'

/** Slack sections hold at most 3,000 characters. Keep every character and avoid
 * splitting a surrogate pair; the containing message still has a 50-block cap. */
export function slackTextBlocks(text:string){
 const blocks:{type:'section';text:{type:'plain_text';text:string}}[]=[]
 for(let start=0;start<text.length;){
  let end=Math.min(start+3000,text.length)
  if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--
  blocks.push({type:'section',text:{type:'plain_text',text:text.slice(start,end)}})
  start=end
 }
 return blocks
}

export function assertSlackBlockCount(blocks:readonly unknown[]){
 if(blocks.length>50)throw new AuthorityError('validation','The Slack message exceeds 50 blocks; reduce the included values. Nothing was sent.',400)
}
