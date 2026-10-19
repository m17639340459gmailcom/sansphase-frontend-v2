/** Native dialog adapter: sample content never enters the production Reader/cache. */
import { esc } from './util';
import { lang } from './i18n';
import { icon } from './icons';
export type SampleDetail = { title: string; summary: string; sections: {title:string;body:string}[]; sourceURL:string;sourceLabel:string;license:string };
export function openSample(root: HTMLElement, detail: SampleDetail, trigger?: HTMLElement | null) {
  const en = lang() === 'en', dialog = root.ownerDocument.createElement('dialog'), view=root.ownerDocument.defaultView!;
  dialog.className='sample-dialog';dialog.setAttribute('aria-labelledby','sample-title');dialog.setAttribute('data-lenis-prevent','');
  dialog.innerHTML=`<div class="sample-top"><span>${en?'LOCAL SAMPLE / OPEN SOURCE':'本地演示 / 开源参考'}</span><button type="button" data-sample-close aria-label="${en?'Close sample':'关闭演示详情'}">${icon('x')}</button></div><div class="sample-body"><p class="sample-label">SANSPHASE / ${en?'A RESOURCE TO EXPLORE':'值得探索的资料'}</p><h2 id="sample-title">${esc(detail.title)}</h2><p class="sample-summary">${esc(detail.summary)}</p>${detail.sections.map(section=>`<section><h3>${esc(section.title)}</h3><p>${esc(section.body)}</p></section>`).join('')}<footer><p>${en?'Source':'来源'} · ${esc(detail.sourceLabel)}<br>${en?'License':'许可证'} · ${esc(detail.license)}</p><a class="btn primary" href="${esc(detail.sourceURL)}" target="_blank" rel="noopener noreferrer">${en?'Open official source':'查看官方来源'}${icon('arrow-up-right')}</a></footer></div>`;
  root.append(dialog);
  const path=view.location.pathname;
  let disposed=false;
  function dispose() {
    if(disposed)return;disposed=true;
    if(dialog.open)dialog.close();dialog.remove();
    if(view.location.pathname===path){const url=new URL(view.location.href);url.searchParams.delete('sample');view.history.replaceState(view.history.state,'',url);}
    if(trigger?.isConnected&&!trigger.closest('[hidden],[inert],[aria-hidden="true"]'))trigger.focus({preventScroll:true});
  }
  dialog.addEventListener('close',dispose,{once:true});
  dialog.querySelector('[data-sample-close]')!.addEventListener('click',dispose);
  // Match the existing Reader's first/last focus guard. Native modality owns
  // inertness and Escape; this keeps Tab from moving into browser chrome.
  dialog.addEventListener('keydown',event=>{
    if(!dialog.open||event.key!=='Tab'||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey)return;
    const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href]')).filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[hidden],[inert]'));
    const first=controls[0],last=controls[controls.length-1],active=dialog.ownerDocument.activeElement;
    if(event.shiftKey?active===first:active===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();const pointer=event as MouseEvent;if(pointer.clientX<box.left||pointer.clientX>box.right||pointer.clientY<box.top||pointer.clientY>box.bottom)dispose();}});
  dialog.showModal();
  return {dispose};
}
