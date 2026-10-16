export const product={name:'Cradle',slugPrefix:'cradle'};
export const branding=product;
export const features={hosting:true,artwork:false,github:false,localTrialWithoutEmail:true};
export const readySummary=()=> 'Create your records workspace on this computer; rer dev then opens it signed in as the owner. You can choose hosting in your own Cloudflare account.';

// Cradle's installer layout, beyond the colour and font tokens of public/rer-theme.css: the forest "Manual setup" card with a
// ribbon at its foot beside the white step card, the public pages' ribbon valley across the lower third (background.svg, served
// as /ocean.png) and their footer. Base's installer serves this module to the browser and also imports it in Node, where there
// is no document. It only adds a stylesheet and decorative nodes; every control, label and step stays Base's.
const layout = `
html.rer-themed .scene{position:relative;display:flex;flex-direction:column;min-height:100dvh;padding:32px 48px 28px;background:#f3f3ee url('/ocean.png') left 0 bottom 92px/100% 170px no-repeat}
html.rer-themed .layout{flex:1;display:grid;grid-template-columns:minmax(0,372px) minmax(0,812px);justify-content:center;align-content:center;align-items:center;gap:0;width:100%;max-width:none;margin:0;padding:72px 0 210px}
html.rer-themed .brand{position:absolute;top:32px;left:48px;gap:14px;padding:0;font-size:34px;font-weight:600;letter-spacing:-.01em}
html.rer-themed .brand::before{width:46px;height:46px}
html.rer-themed .sidebar{position:relative;z-index:1;align-self:center;margin-right:-24px;padding:0;overflow:hidden;border-radius:24px;background:#0d302c;box-shadow:0 14px 36px rgba(18,55,46,.14)}
html.rer-themed .layout:has(#activity[hidden]){grid-template-columns:minmax(0,812px)}
html.rer-themed .sidebar:has(#activity[hidden]){display:none}
html.rer-themed .sidebar .agent-activity.known-group{min-height:400px;margin:0;padding:44px 64px 150px 40px;border-radius:0;background:transparent;color:#fff;box-shadow:none}
html.rer-themed .sidebar .known-group-header{display:block;padding:0}
html.rer-themed .sidebar .known-group-title{margin:0 0 24px;color:#fff;font:500 30px/1.15 var(--rer-font-heading);letter-spacing:-.02em}
html.rer-themed .sidebar .agent-connect{display:inline-flex;align-items:center;margin:0;min-height:52px;padding:0 28px;border:1.5px solid #ffffffd0;border-radius:999px;background:transparent;color:#fff;font:600 17px/1.2 var(--rer-font-body)}
html.rer-themed .sidebar .agent-connect:hover{background:#ffffff14}
html.rer-themed .sidebar .agent-working,html.rer-themed .sidebar .agent-activity-history{color:#d6e4d5}
html.rer-themed .sidebar .agent-activity-message{margin:24px 0 0;color:#d6e4d5;font-size:17px;line-height:1.6}
html.rer-themed .sidebar .cr-installer-ribbon{position:absolute;left:0;bottom:0;width:100%;height:120px;pointer-events:none}
html.rer-themed .panel{position:relative;z-index:2;padding:52px 48px 44px;border-radius:24px;box-shadow:0 1px 2px rgba(18,55,46,.05),0 24px 60px rgba(18,55,46,.12)}
html.rer-themed .step-progress{margin:0 0 8px;color:#52695f;font-size:16px}
html.rer-themed .panel h1{margin:0 0 32px;color:#0d302c;font:500 44px/1.1 var(--rer-font-heading);letter-spacing:-.025em}
html.rer-themed .panel .fields{gap:24px}
html.rer-themed .panel .field{padding:0;border:0;background:transparent}
html.rer-themed .panel .field label,html.rer-themed .panel .field-title,html.rer-themed .panel .target-choices legend{margin-bottom:10px;font-size:17px;font-weight:600}
html.rer-themed .panel .input{min-height:52px;padding:12px 16px;border-color:#12372e38;border-radius:12px;font-size:16px}
html.rer-themed .panel .help{color:#52695f;font-size:15px}
html.rer-themed .panel label.target-choice{padding:16px 18px;border:1px solid #12372e2e;border-radius:16px;background:#fffefd;font-size:16px}
html.rer-themed .panel .target-choice:has(input:checked){background:#fffefd;border-color:#0d302c;box-shadow:inset 0 0 0 1px #0d302c}
html.rer-themed .panel .choice-copy .help{font-size:14px}
html.rer-themed .ready-summary{padding:20px 24px;border-radius:16px;background:#e9f1e6;font-size:16px;line-height:1.6}
html.rer-themed .actions{margin-top:36px}
html.rer-themed .primary{min-height:52px;padding:0 32px;font-size:17px;box-shadow:0 8px 24px rgba(160,190,40,.28)}
html.rer-themed .secondary{min-height:52px;padding:0 28px;border-color:#12372e38;font-size:16px}
html.rer-themed .known-summary>summary{display:inline-flex;align-items:center;gap:12px;padding:8px 2px;border:0;background:transparent;color:#52695f;font-size:16px;font-weight:500;list-style:none}
html.rer-themed .known-summary>summary::-webkit-details-marker{display:none}
html.rer-themed .known-summary>summary::before{content:"";width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
html.rer-themed .known-summary[open]>summary::before{transform:rotate(45deg)}
html.rer-themed #form:not([hidden]):has(#back[hidden])+.known-summary{margin-top:-46px}
html.rer-themed .cr-installer-footer{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 8px;padding-top:24px;border-top:1px solid #12372e1a;color:#52695f;font-size:14px}
html.rer-themed .cr-installer-footer a{color:inherit;text-decoration:underline;text-decoration-color:#12372e40;text-underline-offset:4px}
@media(max-width:1000px){html.rer-themed .layout{grid-template-columns:minmax(0,320px) minmax(0,1fr)}html.rer-themed .sidebar .agent-activity.known-group{padding-right:56px}}
@media(max-width:700px){
html.rer-themed .scene{padding:20px 16px 24px;background-position:left 0 bottom 64px;background-size:100% 84px}
html.rer-themed .brand{position:static;margin:0 0 24px;font-size:26px}
html.rer-themed .brand::before{width:36px;height:36px}
html.rer-themed .layout{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;padding:0 0 128px}
html.rer-themed .sidebar{grid-row:2;margin:0 0 16px;border-radius:20px}
html.rer-themed .sidebar .agent-activity.known-group{min-height:0;padding:20px}
html.rer-themed .sidebar .known-group-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
html.rer-themed .sidebar .known-group-title{margin:0;font-size:20px}
html.rer-themed .sidebar .agent-connect{min-height:44px;padding:0 16px;font-size:14px}
html.rer-themed .sidebar .agent-activity-message{margin-top:8px;font-size:15px}
html.rer-themed .sidebar .cr-installer-ribbon{display:none}
html.rer-themed .panel{grid-row:3;padding:32px 24px 28px;border-radius:20px}
html.rer-themed #form{padding-bottom:0}
html.rer-themed .panel h1{margin-bottom:24px;font-size:34px}
html.rer-themed .actions{position:static;flex-wrap:wrap;margin:28px 0 0;padding:0;border:0;background:transparent;box-shadow:none}
html.rer-themed .actions .primary{flex:1 1 100%}
html.rer-themed .actions .secondary{flex:1 1 100%;order:1}
html.rer-themed #form:not([hidden]):has(#back[hidden])+.known-summary{margin-top:16px}
}`;

const ribbon = `<svg class="cr-installer-ribbon" viewBox="0 0 372 120" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 46 C90 40 170 96 372 70 L372 92 C180 120 96 76 0 84 Z" fill="#2f5c4c" opacity=".85"/><path d="M0 78 C110 72 190 120 372 86 L372 100 C196 136 110 92 0 98 Z" fill="#d7f25b"/><path d="M0 20 C120 18 210 70 372 52 L372 62 C214 84 118 36 0 40 Z" fill="#d6e4d5" opacity=".28"/></svg>`;

function dress(document) {
  const style = document.createElement('style');
  style.textContent = layout;
  document.head.append(style);
  document.querySelector('.sidebar')?.insertAdjacentHTML('beforeend', ribbon);
  const footer = document.createElement('footer');
  footer.className = 'cr-installer-footer';
  footer.innerHTML = '<span>Powered by Cradle</span><span aria-hidden="true">·</span><a href="https://runeditrun.com">runeditrun.com</a>';
  document.querySelector('.scene')?.append(footer);
}
// Base's own page keeps the Manual setup card hidden until the first answer exists. The 2-setup pick shows it from the first step, so
// while a step form is on screen and Base has hidden the card, it is filled with Base's manual wording and shown again; once an agent
// connects or an answer exists, Base's own updates take over the same card.
function showManualCardFromStart(document) {
  const card = document.querySelector('#activity'), form = document.querySelector('#form');
  if (!card || !form) return;
  const show = () => {
    if (!card.hidden || form.hidden) return;
    card.querySelector('.known-group-title').textContent = 'Manual setup';
    card.setAttribute('aria-label', 'Manual setup');
    card.querySelector('.agent-connect').hidden = false;
    const message = card.querySelector('.agent-activity-message');
    message.textContent = 'Complete the setup steps to get started.';
    message.hidden = false;
    card.hidden = false;
  };
  for (const element of [card, form]) new MutationObserver(show).observe(element, { attributes: true, attributeFilter: ['hidden'] });
}
if (typeof document !== 'undefined' && document.documentElement.classList.contains('rer-themed')) { dress(document); showManualCardFromStart(document); }
